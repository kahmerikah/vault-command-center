import { useEffect, useMemo, useState } from "react";
import api, { setAuthToken } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import { useVaultStore } from "../store/useVaultStore";
import AppShell from "../components/AppShell";
import GlassPanel from "../components/GlassPanel";

const TODO_META_MARKER = "PDA_META::";
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function dayKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthGrid(currentMonth) {
  const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
  const firstWeekday = start.getDay();
  const days = [];

  for (let i = 0; i < firstWeekday; i += 1) days.push(null);
  for (let day = 1; day <= end.getDate(); day += 1) {
    days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day));
  }
  while (days.length % 7 !== 0) days.push(null);

  return days;
}

function toLocalDatetimeInput(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function parseTodoItem(entry) {
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  const parsed = {
    priority: tags.includes("p-high") ? "high" : tags.includes("p-low") ? "low" : "medium",
    dueAt: null,
    moduleKey: "operations",
    category: "workflow",
    recurring: "none",
    reminders: "none",
  };

  if (String(entry.body || "").includes(TODO_META_MARKER)) {
    try {
      const markerIndex = String(entry.body).indexOf(TODO_META_MARKER);
      const jsonPart = String(entry.body).slice(markerIndex + TODO_META_MARKER.length).trim();
      const meta = JSON.parse(jsonPart);
      parsed.priority = meta.priority || parsed.priority;
      parsed.dueAt = meta.dueAt || null;
      parsed.moduleKey = meta.moduleKey || parsed.moduleKey;
      parsed.category = meta.category || parsed.category;
      parsed.recurring = meta.recurring || parsed.recurring;
      parsed.reminders = meta.reminders || parsed.reminders;
    } catch {
      // Keep legacy todo items readable even without structured metadata.
    }
  }

  return {
    ...entry,
    parsed,
  };
}

function normalizePriority(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "high" || v === "low") return v;
  return "medium";
}

function parseDateHint(text, defaultHour = 9) {
  const now = new Date();
  const lowered = String(text || "").toLowerCase();
  const result = new Date(now);

  if (lowered.includes("tomorrow")) {
    result.setDate(now.getDate() + 1);
  } else if (lowered.includes("today")) {
    result.setDate(now.getDate());
  } else {
    const weekdayIndex = WEEKDAYS.findIndex((name) => lowered.includes(name));
    if (weekdayIndex >= 0) {
      const delta = (weekdayIndex - now.getDay() + 7) % 7 || 7;
      result.setDate(now.getDate() + delta);
    }
  }

  const timeMatch = lowered.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    let hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2] || 0);
    const period = String(timeMatch[3] || "").toLowerCase();
    if (period === "pm" && hours < 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    result.setHours(hours, minutes, 0, 0);
  } else {
    result.setHours(defaultHour, 0, 0, 0);
  }

  return result;
}

function buildTodoPayload(taskForm) {
  const priority = normalizePriority(taskForm.priority);
  const meta = {
    priority,
    dueAt: taskForm.dueAt || null,
    moduleKey: taskForm.moduleKey || "operations",
    category: taskForm.category || "workflow",
    recurring: taskForm.recurring || "none",
    reminders: taskForm.reminders || "none",
  };

  const compactTags = [
    "todo",
    "pda",
    `p-${priority}`,
    meta.moduleKey,
    meta.category,
    meta.recurring !== "none" ? `r-${meta.recurring}` : null,
  ].filter(Boolean);

  return {
    title: taskForm.title.trim(),
    body: `${taskForm.title.trim()}\n${TODO_META_MARKER}${JSON.stringify(meta)}`,
    kind: "note",
    category: "todo",
    tags: compactTags.join(","),
    source: "pda",
  };
}

function formatIcsDate(value) {
  const date = new Date(value);
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function buildCalendarEventIcs({ title, notes, startsAt, endsAt }) {
  const uid = `${Date.now()}@somb-vault`;
  const stamp = formatIcsDate(new Date());
  const summary = String(title || "SOMB Vault event").replace(/\n/g, " ");
  const description = String(notes || "").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SOMB Vault//PDA//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatIcsDate(startsAt)}`,
    `DTEND:${formatIcsDate(endsAt)}`,
    `SUMMARY:${summary}`,
    description ? `DESCRIPTION:${description}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function metricTone(value, threshold = 1) {
  return Number(value || 0) >= threshold ? "text-amber-300" : "text-emerald-300";
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildContactLabelValueList(lines, fallbackLabel = "main") {
  return lines
    .map((line) => {
      if (typeof line !== "string") return null;
      const trimmed = line.trim();
      if (!trimmed) return null;
      const dividerIndex = trimmed.indexOf(":");
      if (dividerIndex > 0) {
        const label = trimmed.slice(0, dividerIndex).trim();
        const value = trimmed.slice(dividerIndex + 1).trim();
        if (!value) return null;
        return { label: label || fallbackLabel, value };
      }
      return { label: fallbackLabel, value: trimmed };
    })
    .filter(Boolean);
}

function contactDisplayName(contact) {
  const parts = [contact?.prefix, contact?.first_name, contact?.middle_name, contact?.last_name, contact?.suffix].filter(Boolean);
  if (parts.length) return parts.join(" ");
  if (contact?.nickname) return contact.nickname;
  if (contact?.company) return contact.company;
  return "Unnamed contact";
}

function contactToForm(contact = null) {
  if (!contact) {
    return {
      prefix: "",
      first_name: "",
      middle_name: "",
      last_name: "",
      suffix: "",
      nickname: "",
      company: "",
      job_title: "",
      department: "",
      photo_url: "",
      linked_contact_ids: [],
      phones: [{ label: "mobile", value: "" }],
      emails: [{ label: "main", value: "" }],
      addresses: [{ label: "home", street: "", city: "", state: "", postal_code: "", country: "", formatted: "" }],
      urls: [{ label: "website", value: "" }],
      social_profiles: [{ label: "profile", value: "" }],
      birthday: "",
      anniversary: "",
      notes: "",
      groups: "",
      is_favorite: false,
    };
  }

  return {
    prefix: contact.prefix || "",
    first_name: contact.first_name || "",
    middle_name: contact.middle_name || "",
    last_name: contact.last_name || "",
    suffix: contact.suffix || "",
    nickname: contact.nickname || "",
    company: contact.company || "",
    job_title: contact.job_title || "",
    department: contact.department || "",
    photo_url: contact.photo_url || "",
    linked_contact_ids: contact.linked_contact_ids || [],
    phones: (contact.phones?.length ? contact.phones : [{ label: "mobile", value: "" }]).map((item) => ({
      label: item.label || "main",
      value: item.value || "",
    })),
    emails: (contact.emails?.length ? contact.emails : [{ label: "main", value: "" }]).map((item) => ({
      label: item.label || "main",
      value: item.value || "",
    })),
    addresses: (contact.addresses?.length ? contact.addresses : [{ label: "home", street: "", city: "", state: "", postal_code: "", country: "", formatted: "" }]).map((item) => ({
      label: item.label || "home",
      street: item.street || "",
      city: item.city || "",
      state: item.state || "",
      postal_code: item.postal_code || "",
      country: item.country || "",
      formatted: item.formatted || "",
    })),
    urls: (contact.urls?.length ? contact.urls : [{ label: "website", value: "" }]).map((item) => ({
      label: item.label || "website",
      value: item.value || "",
    })),
    social_profiles: (contact.social_profiles?.length ? contact.social_profiles : [{ label: "profile", value: "" }]).map((item) => ({
      label: item.label || "profile",
      value: item.value || "",
    })),
    birthday: contact.birthday || "",
    anniversary: contact.anniversary || "",
    notes: contact.notes || "",
    groups: Array.isArray(contact.groups) ? contact.groups.join(", ") : contact.groups || "",
    is_favorite: Boolean(contact.is_favorite),
  };
}

function contactFormToPayload(form) {
  return {
    prefix: form.prefix,
    first_name: form.first_name,
    middle_name: form.middle_name,
    last_name: form.last_name,
    suffix: form.suffix,
    nickname: form.nickname,
    company: form.company,
    job_title: form.job_title,
    department: form.department,
    photo_url: form.photo_url,
    linked_contact_ids: form.linked_contact_ids,
    phones: form.phones.filter((item) => item.value.trim()).map((item) => ({ label: item.label.trim() || "main", value: item.value.trim() })),
    emails: form.emails.filter((item) => item.value.trim()).map((item) => ({ label: item.label.trim() || "main", value: item.value.trim() })),
    addresses: form.addresses
      .filter((item) => [item.street, item.city, item.state, item.postal_code, item.country, item.formatted].some((value) => String(value || "").trim()))
      .map((item) => ({
        label: item.label.trim() || "home",
        street: item.street.trim(),
        city: item.city.trim(),
        state: item.state.trim(),
        postal_code: item.postal_code.trim(),
        country: item.country.trim(),
        formatted: item.formatted.trim(),
      })),
    urls: form.urls.filter((item) => item.value.trim()).map((item) => ({ label: item.label.trim() || "website", value: item.value.trim() })),
    social_profiles: form.social_profiles.filter((item) => item.value.trim()).map((item) => ({ label: item.label.trim() || "profile", value: item.value.trim() })),
    birthday: form.birthday,
    anniversary: form.anniversary,
    notes: form.notes,
    groups: splitLines(form.groups).join(", "),
    is_favorite: Boolean(form.is_favorite),
    source: "pda",
  };
}

function ContactRowsEditor({ title, rows, fields, addLabel, onAdd, onRemove, onChange }) {
  return (
    <div className="rounded border border-vault-accent/20 bg-black/20 p-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.16em] text-vault-textDim">{title}</p>
        <button
          type="button"
          onClick={onAdd}
          className="h-7 rounded border border-vault-accent/30 px-2 text-[10px] uppercase tracking-[0.14em]"
        >
          {addLabel}
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={`${title}-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto] xl:grid-cols-[repeat(6,minmax(0,1fr))_auto]">
            {fields.map((field) => (
              <input
                key={`${title}-${field.key}-${index}`}
                value={row[field.key] || ""}
                onChange={(event) => onChange(index, field.key, event.target.value)}
                placeholder={field.placeholder}
                className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
              />
            ))}
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="h-8 rounded border border-red-500/30 px-2 text-[10px] uppercase tracking-[0.14em] text-red-200"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PDAPage() {
  const { accessToken, refreshToken, user, clearAuth } = useVaultStore();

  const [bookings, setBookings] = useState([]);
  const [todos, setTodos] = useState([]);
  const [morning, setMorning] = useState(null);
  const [night, setNight] = useState(null);
  const [history, setHistory] = useState([]);
  const [activity, setActivity] = useState([]);
  const [health, setHealth] = useState(null);
  const [contacts, setContacts] = useState([]);

  const [zip, setZip] = useState("90001");
  const [quickCapture, setQuickCapture] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [contactGroupFilter, setContactGroupFilter] = useState("all");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [contactsInitialized, setContactsInitialized] = useState(false);
  const [contactForm, setContactForm] = useState(() => contactToForm());
  const [contactImportText, setContactImportText] = useState("");
  const [contactNote, setContactNote] = useState("");
  const [linkCandidateId, setLinkCandidateId] = useState("");

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(dayKey(new Date()));
  const [showBookingComposer, setShowBookingComposer] = useState(false);
  const [queueOrder, setQueueOrder] = useState([]);

  const [taskForm, setTaskForm] = useState({
    title: "",
    priority: "medium",
    dueAt: "",
    moduleKey: "operations",
    category: "workflow",
    recurring: "none",
    reminders: "none",
  });

  const [bookingForm, setBookingForm] = useState({
    module_key: "booking",
    starts_at: "",
    ends_at: "",
    notes: "",
  });
  const [calendarCopyNotice, setCalendarCopyNotice] = useState("");

  const handleLogout = async () => {
    try {
      if (refreshToken) {
        await api.post("/auth/logout", {}, { headers: { Authorization: `Bearer ${refreshToken}` } });
      }
    } catch {
      // Keep logout reliable.
    } finally {
      clearAuth();
      setAuthToken("");
      disconnectSocket();
      window.location.assign("/login");
    }
  };

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setLoadError("");

    try {
      const [
        bookingsRes,
        morningRes,
        nightRes,
        historyRes,
        todosRes,
        activityRes,
        healthRes,
        contactsRes,
      ] = await Promise.allSettled([
        api.get("/bookings", { params: { limit: 300 } }),
        api.get(`/briefing/morning?zip=${zip}`),
        api.get("/briefing/night"),
        api.get("/briefing/history", { params: { limit: 12 } }),
        api.get("/knowledge", { params: { category: "todo", limit: 200 } }),
        api.get("/gateway/activity", { params: { limit: 50 } }),
        api.get("/health/system"),
        api.get("/contacts", { params: { limit: 500 } }),
      ]);

      setBookings(bookingsRes.status === "fulfilled" ? bookingsRes.value.data?.data?.items || [] : []);
      setMorning(morningRes.status === "fulfilled" ? morningRes.value.data?.data || null : null);
      setNight(nightRes.status === "fulfilled" ? nightRes.value.data?.data || null : null);
      setHistory(historyRes.status === "fulfilled" ? historyRes.value.data?.data?.items || [] : []);
      setTodos(todosRes.status === "fulfilled" ? (todosRes.value.data?.data?.items || []).map(parseTodoItem) : []);
      setActivity(activityRes.status === "fulfilled" ? activityRes.value.data?.data?.items || [] : []);
      setHealth(healthRes.status === "fulfilled" ? healthRes.value.data?.data || null : null);
      setContacts(contactsRes.status === "fulfilled" ? contactsRes.value.data?.data?.items || [] : []);

      if (
        [bookingsRes, morningRes, nightRes, historyRes, todosRes, activityRes, healthRes, contactsRes].some(
          (r) => r.status === "rejected"
        )
      ) {
        setLoadError("Some operational streams could not sync. Workspace still running with partial context.");
      }
    } catch (error) {
      setLoadError(error?.response?.data?.error || "Unable to load PDA operational workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    setAuthToken(accessToken);
    load();
  }, [accessToken]);

  const bookingsByDay = useMemo(() => {
    const map = new Map();
    bookings.forEach((booking) => {
      const key = dayKey(booking.starts_at);
      map.set(key, [...(map.get(key) || []), booking]);
    });
    return map;
  }, [bookings]);

  const tasksByDay = useMemo(() => {
    const map = new Map();
    todos.forEach((todo) => {
      if (!todo.parsed?.dueAt) return;
      const key = dayKey(todo.parsed.dueAt);
      map.set(key, [...(map.get(key) || []), todo]);
    });
    return map;
  }, [todos]);

  const selectedBookings = bookingsByDay.get(selectedDay) || [];
  const selectedTasks = tasksByDay.get(selectedDay) || [];
  const calendarDays = useMemo(() => monthGrid(currentMonth), [currentMonth]);

  const now = new Date();
  const todayKey = dayKey(now);
  const todayBookings = bookingsByDay.get(todayKey) || [];
  const unfinishedTasks = useMemo(() => todos.filter((todo) => !todo.is_archived), [todos]);
  const unfinishedBookings = useMemo(
    () => bookings.filter((booking) => booking.status !== "completed"),
    [bookings]
  );

  const deploymentSignals = useMemo(
    () =>
      activity.filter((item) => {
        const text = `${item.message || ""}`.toLowerCase();
        return text.includes("deploy") || text.includes("release") || text.includes("build");
      }),
    [activity]
  );

  const operationalQueue = useMemo(() => {
    const queueTasks = unfinishedTasks.map((todo) => ({
      id: todo.id,
      type: "task",
      title: todo.title,
      subtitle: todo.parsed?.moduleKey || "operations",
      priority: normalizePriority(todo.parsed?.priority),
      dueAt: todo.parsed?.dueAt || todo.created_at,
      status: "open",
      raw: todo,
    }));

    const queueBookings = unfinishedBookings.map((booking) => ({
      id: booking.id,
      type: "booking",
      title: booking.module_key,
      subtitle: booking.notes || "Scheduled operation",
      priority: "medium",
      dueAt: booking.starts_at,
      status: booking.status,
      raw: booking,
    }));

    return [...queueTasks, ...queueBookings].sort((a, b) => {
      const pA = PRIORITY_ORDER[a.priority] ?? 1;
      const pB = PRIORITY_ORDER[b.priority] ?? 1;
      if (pA !== pB) return pA - pB;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });
  }, [unfinishedTasks, unfinishedBookings]);

  useEffect(() => {
    const nextKeys = operationalQueue.map((item) => `${item.type}-${item.id}`);
    setQueueOrder((prev) => {
      const retained = prev.filter((key) => nextKeys.includes(key));
      const appended = nextKeys.filter((key) => !retained.includes(key));
      const merged = [...retained, ...appended];
      if (merged.length === prev.length && merged.every((key, index) => key === prev[index])) {
        return prev;
      }
      return merged;
    });
  }, [operationalQueue]);

  const orderedQueue = useMemo(() => {
    const lookup = new Map(operationalQueue.map((item) => [`${item.type}-${item.id}`, item]));
    const ordered = [];
    queueOrder.forEach((key) => {
      if (lookup.has(key)) {
        ordered.push(lookup.get(key));
        lookup.delete(key);
      }
    });
    return [...ordered, ...lookup.values()];
  }, [operationalQueue, queueOrder]);

  const availableContactGroups = useMemo(() => {
    const groups = new Set();
    contacts.forEach((contact) => {
      (contact.groups || []).forEach((group) => {
        if (group) groups.add(group);
      });
    });
    return Array.from(groups).sort((a, b) => a.localeCompare(b));
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    const search = contactQuery.trim().toLowerCase();
    return contacts
      .filter((contact) => {
        if (contactGroupFilter === "favorites" && !contact.is_favorite) return false;
        if (contactGroupFilter !== "all" && contactGroupFilter !== "favorites") {
          const groupMatch = (contact.groups || []).some((group) => group.toLowerCase() === contactGroupFilter.toLowerCase());
          if (!groupMatch) return false;
        }
        if (!search) return true;
        const haystack = [
          contact.display_name,
          contact.company,
          contact.job_title,
          contact.department,
          contact.notes,
          ...(contact.groups || []),
          ...(contact.phones || []).map((item) => item.value),
          ...(contact.emails || []).map((item) => item.value),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      })
      .sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
        return (a.display_name || "").localeCompare(b.display_name || "");
      });
  }, [contacts, contactQuery, contactGroupFilter]);

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === selectedContactId) || null,
    [contacts, selectedContactId]
  );

  useEffect(() => {
    if (!contactsInitialized && filteredContacts.length) {
      setSelectedContactId(filteredContacts[0].id);
      setContactsInitialized(true);
    }
  }, [filteredContacts, contactsInitialized]);

  useEffect(() => {
    if (selectedContact) {
      setContactForm(contactToForm(selectedContact));
      return;
    }
    setContactForm(contactToForm());
  }, [selectedContact?.id]);

  const contactStats = useMemo(() => ({
    total: contacts.length,
    favorites: contacts.filter((contact) => contact.is_favorite).length,
    groups: availableContactGroups.length,
  }), [contacts, availableContactGroups.length]);

  const linkedContacts = useMemo(
    () => contacts.filter((contact) => (selectedContact?.linked_contact_ids || []).includes(contact.id)),
    [contacts, selectedContact?.linked_contact_ids, selectedContact?.id]
  );

  const linkableContacts = useMemo(
    () => contacts.filter((contact) => contact.id !== selectedContact?.id && !(selectedContact?.linked_contact_ids || []).includes(contact.id)),
    [contacts, selectedContact?.id, selectedContact?.linked_contact_ids]
  );

  const handleQueueDrop = (dragKey, dropKey) => {
    if (!dragKey || !dropKey || dragKey === dropKey) return;
    setQueueOrder((prev) => {
      const arr = [...prev];
      const dragIndex = arr.indexOf(dragKey);
      const dropIndex = arr.indexOf(dropKey);
      if (dragIndex < 0 || dropIndex < 0) return prev;
      arr.splice(dragIndex, 1);
      arr.splice(dropIndex, 0, dragKey);
      return arr;
    });
  };

  const handleDaySelect = (key) => {
    setSelectedDay(key);
    const base = new Date(`${key}T09:00:00`);
    const end = new Date(base.getTime() + 60 * 60 * 1000);
    setBookingForm((prev) => ({
      ...prev,
      starts_at: toLocalDatetimeInput(base),
      ends_at: toLocalDatetimeInput(end),
    }));
  };

  const handleAddTask = async (event) => {
    event.preventDefault();
    if (!taskForm.title.trim()) return;

    setActionNotice("");
    await api.post("/knowledge", buildTodoPayload(taskForm));
    setTaskForm((prev) => ({
      ...prev,
      title: "",
      dueAt: "",
    }));
    setActionNotice("Task captured in operational queue.");
    await load();
  };

  const completeTodo = async (id) => {
    setActionNotice("");
    await api.delete(`/knowledge/${id}`);
    setActionNotice("Task completed and archived.");
    await load();
  };

  const completeBooking = async (id) => {
    setActionNotice("");
    await api.patch(`/bookings/${id}/status`, { status: "completed" });
    setActionNotice("Schedule block completed.");
    await load();
  };

  const createBooking = async (event) => {
    event.preventDefault();
    setActionNotice("");
    await api.post("/bookings", bookingForm);
    setShowBookingComposer(false);
    setBookingForm({ module_key: "booking", starts_at: "", ends_at: "", notes: "" });
    setActionNotice("Booking created and added to timeline.");
    await load();
  };

  const saveContact = async (event) => {
    event.preventDefault();
    const payload = contactFormToPayload(contactForm);
    const hasName = [payload.first_name, payload.last_name, payload.company, payload.nickname].some((value) => String(value || "").trim());
    if (!hasName) {
      setContactNote("Add at least a name or company.");
      return;
    }

    setContactNote("");
    if (selectedContactId) {
      await api.patch(`/contacts/${selectedContactId}`, payload);
      setContactNote("Contact updated.");
    } else {
      const response = await api.post("/contacts", payload);
      const createdId = response.data?.data?.id;
      if (createdId) {
        setSelectedContactId(createdId);
      }
      setContactNote("Contact created.");
    }
    await load();
  };

  const toggleFavoriteContact = async (contact) => {
    if (!contact?.id) return;
    setContactNote("");
    await api.post(`/contacts/${contact.id}/favorite`, { is_favorite: !contact.is_favorite });
    setContactNote(contact.is_favorite ? "Removed from favorites." : "Added to favorites.");
    await load();
  };

  const archiveContact = async (contactId) => {
    if (!contactId) return;
    setContactNote("");
    await api.delete(`/contacts/${contactId}`);
    setSelectedContactId("");
    setContactForm(contactToForm());
    setContactNote("Contact archived.");
    await load();
  };

  const mergeContactDuplicates = async () => {
    setContactNote("");
    const response = await api.post("/contacts/merge-duplicates", {});
    const mergedGroups = response.data?.data?.merged_groups || 0;
    setContactNote(mergedGroups ? `Merged ${mergedGroups} duplicate contact groups.` : "No duplicates found.");
    await load();
  };

  const linkContactCard = async () => {
    if (!selectedContact?.id || !linkCandidateId) {
      setContactNote("Pick a contact to link.");
      return;
    }
    await api.post(`/contacts/${selectedContact.id}/link`, { linked_contact_id: linkCandidateId });
    setLinkCandidateId("");
    setContactNote("Contact linked.");
    await load();
  };

  const unlinkContactCard = async (linkedContactId) => {
    if (!selectedContact?.id || !linkedContactId) return;
    await api.post(`/contacts/${selectedContact.id}/unlink`, { linked_contact_id: linkedContactId });
    setContactNote("Linked card removed.");
    await load();
  };

  const launchContactAction = (kind, value) => {
    const target = String(value || "").trim();
    if (!target) {
      setContactNote(`No ${kind} target available.`);
      return;
    }
    const href = kind === "call" ? `tel:${target}` : kind === "message" ? `sms:${target}` : `mailto:${target}`;
    window.open(href, "_self");
  };

  const exportContactsVcard = async (onlySelected = false) => {
    const ids = onlySelected && selectedContact?.id ? `?ids=${encodeURIComponent(selectedContact.id)}` : "";
    const response = await api.get(`/contacts/export/vcard${ids}`);
    const vcard = response.data?.data?.vcard || "";
    if (!vcard) {
      setContactNote("No contacts to export.");
      return;
    }

    try {
      await navigator.clipboard.writeText(vcard);
      setContactNote("vCard copied. Import it into Outlook, Google Contacts, or Apple Contacts.");
    } catch {
      const blob = new Blob([vcard], { type: "text/vcard;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "somb-contacts.vcf";
      anchor.click();
      URL.revokeObjectURL(url);
      setContactNote("vCard downloaded.");
    }
  };

  const importContactsVcard = async () => {
    if (!contactImportText.trim()) {
      setContactNote("Paste a vCard first.");
      return;
    }
    setContactNote("");
    await api.post("/contacts/import/vcard", { vcard: contactImportText, merge: true });
    setContactImportText("");
    setContactNote("vCard imported.");
    await load();
  };

  const startNewContact = () => {
    setSelectedContactId("");
    setContactForm(contactToForm());
    setContactNote("Creating a new contact.");
  };

  const resetContactForm = () => {
    if (selectedContact) {
      setContactForm(contactToForm(selectedContact));
      setContactNote("Reverted to saved contact.");
      return;
    }
    setContactForm(contactToForm());
    setContactNote("");
  };

  const exportCalendarEvent = async () => {
    const startsAt = bookingForm.starts_at || toLocalDatetimeInput(parseDateHint(selectedDay, 9));
    const endsAt = bookingForm.ends_at || toLocalDatetimeInput(new Date(new Date(startsAt).getTime() + 60 * 60 * 1000));
    const ics = buildCalendarEventIcs({
      title: bookingForm.notes || bookingForm.module_key || "SOMB Vault event",
      notes: `Source: PDA\nModule: ${bookingForm.module_key || "booking"}\n${bookingForm.notes || ""}`,
      startsAt,
      endsAt,
    });

    try {
      await navigator.clipboard.writeText(ics);
      setCalendarCopyNotice("Calendar event copied as .ics. Import it into Outlook, Google Calendar, or Apple Calendar.");
    } catch {
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `somb-pda-${selectedDay}.ics`;
      anchor.click();
      URL.revokeObjectURL(url);
      setCalendarCopyNotice("Calendar file downloaded. Open it in Outlook, Google Calendar, or Apple Calendar.");
    }
  };

  const runQuickCapture = async (event) => {
    event.preventDefault();
    const command = quickCapture.trim();
    if (!command) return;

    const lowered = command.toLowerCase();
    setActionNotice("");

    if (lowered.startsWith("schedule ")) {
      const intent = command.slice(9).trim();
      const start = parseDateHint(intent, 9);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      await api.post("/bookings", {
        module_key: "operations",
        starts_at: toLocalDatetimeInput(start),
        ends_at: toLocalDatetimeInput(end),
        notes: intent,
      });
      setActionNotice("Schedule block created from quick capture.");
    } else if (lowered.startsWith("reminder ")) {
      const intent = command.slice(9).trim();
      const due = parseDateHint(intent, 17);
      await api.post(
        "/knowledge",
        buildTodoPayload({
          ...taskForm,
          title: intent,
          priority: "high",
          dueAt: toLocalDatetimeInput(due),
          category: "reminder",
        })
      );
      setActionNotice("Reminder captured.");
    } else if (lowered.startsWith("add property ")) {
      const intent = command.slice(13).trim();
      await api.post("/knowledge", {
        title: intent,
        body: intent,
        kind: "idea",
        category: "property",
        tags: "property,lead,quick-capture",
        source: "pda",
      });
      setActionNotice("Property opportunity captured.");
    } else {
      const intent = lowered.startsWith("add task ") ? command.slice(9).trim() : command;
      await api.post(
        "/knowledge",
        buildTodoPayload({
          ...taskForm,
          title: intent,
        })
      );
      setActionNotice("Task captured from command input.");
    }

    setQuickCapture("");
    await load();
  };

  return (
    <AppShell user={user} onLogout={handleLogout} title="pda operations hub">
      <div className="space-y-4">
        <GlassPanel className="p-3 lg:p-4" title="Daily Command Brief">
          <div className="grid gap-3 lg:grid-cols-[1.4fr_1.2fr_1fr]">
            <div className="rounded-xl border border-vault-accent/20 bg-vault-bg/50 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-vault-textDim">Operator</p>
              <p className="mt-1 font-display text-lg text-vault-text">Good day, {user?.username || "Operator"}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-vault-accent/20 bg-black/20 p-2">
                  <p className="text-vault-textDim">Meetings Today</p>
                  <p className="text-base text-vault-text">{todayBookings.length}</p>
                </div>
                <div className="rounded border border-vault-accent/20 bg-black/20 p-2">
                  <p className="text-vault-textDim">Unfinished Tasks</p>
                  <p className="text-base text-vault-text">{unfinishedTasks.length}</p>
                </div>
                <div className="rounded border border-vault-accent/20 bg-black/20 p-2">
                  <p className="text-vault-textDim">Pending Deployments</p>
                  <p className={`text-base ${metricTone(deploymentSignals.length)}`}>{deploymentSignals.length}</p>
                </div>
                <div className="rounded border border-vault-accent/20 bg-black/20 p-2">
                  <p className="text-vault-textDim">Revenue Today</p>
                  <p className="text-base text-emerald-300">+${Number(night?.spending_summary?.revenue_today || 0).toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-vault-accent/20 bg-vault-bg/50 p-3 text-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-vault-textDim">Priority queue</p>
              <ul className="mt-2 space-y-1">
                {(morning?.priorities || []).slice(0, 4).map((priority, index) => (
                  <li key={`${priority}-${index}`} className="rounded border border-vault-accent/15 bg-black/20 px-2 py-1 text-vault-text">
                    {priority}
                  </li>
                ))}
                {(morning?.priorities || []).length === 0 ? (
                  <li className="text-vault-textDim">No priorities yet. Capture work to seed the brief.</li>
                ) : null}
              </ul>
              <div className="mt-3 rounded border border-vault-accent/15 bg-black/20 px-2 py-2 text-xs text-vault-textDim">
                Upcoming deadlines and unfinished work are merged into one queue below.
              </div>
            </div>

            <div className="rounded-xl border border-vault-accent/20 bg-vault-bg/50 p-3 text-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-vault-textDim">System Health</p>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-vault-textDim">Infrastructure</span>
                  <span className={health?.status === "ok" ? "text-emerald-300" : "text-amber-300"}>{health?.status || "degraded"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-vault-textDim">Redis</span>
                  <span className={health?.checks?.redis ? "text-emerald-300" : "text-amber-300"}>{health?.checks?.redis ? "online" : "offline"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-vault-textDim">Database</span>
                  <span className={health?.checks?.database ? "text-emerald-300" : "text-amber-300"}>{health?.checks?.database ? "online" : "offline"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-vault-textDim">API Calls</span>
                  <span className="text-vault-text">{health?.api_calls_total ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={runQuickCapture} className="mt-3 flex flex-col gap-2 lg:flex-row">
            <input
              value={quickCapture}
              onChange={(event) => setQuickCapture(event.target.value)}
              placeholder="> add task review property leads | schedule event tomorrow 9pm | reminder mortgage due friday"
              className="h-10 flex-1 rounded border border-vault-accent/30 bg-vault-bg/60 px-3 text-sm"
            />
            <div className="flex gap-2">
              <button type="submit" className="h-10 rounded border border-vault-accent/40 px-3 text-xs uppercase tracking-[0.18em]">
                Capture
              </button>
              <button type="button" onClick={load} className="h-10 rounded border border-vault-accent/30 px-3 text-xs uppercase tracking-[0.18em]">
                Refresh
              </button>
              <input
                value={zip}
                onChange={(event) => setZip(event.target.value)}
                placeholder="zip"
                className="h-10 w-24 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-sm"
              />
            </div>
          </form>
        </GlassPanel>

        {loadError ? <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{loadError}</div> : null}
        {actionNotice ? <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{actionNotice}</div> : null}
        {calendarCopyNotice ? <div className="rounded border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">{calendarCopyNotice}</div> : null}

        <div className="grid gap-4 xl:grid-cols-[1.1fr_1.4fr_1fr]">
          <div className="space-y-4">
            <GlassPanel title="Today’s work" className="p-3">
              <form onSubmit={handleAddTask} className="grid gap-2">
                <input
                  value={taskForm.title}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Add task or next action"
                  className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={taskForm.priority}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, priority: event.target.value }))}
                    className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs uppercase"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <input
                    type="datetime-local"
                    value={taskForm.dueAt}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, dueAt: event.target.value }))}
                    className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={taskForm.moduleKey}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, moduleKey: event.target.value }))}
                    placeholder="Source"
                    className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                  />
                  <input
                    value={taskForm.category}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, category: event.target.value }))}
                    placeholder="Type"
                    className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={taskForm.recurring}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, recurring: event.target.value }))}
                    className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                  >
                    <option value="none">One time</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  <select
                    value={taskForm.reminders}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, reminders: event.target.value }))}
                    className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                  >
                    <option value="none">No alert</option>
                    <option value="15m">15m before</option>
                    <option value="1h">1h before</option>
                    <option value="1d">1 day before</option>
                  </select>
                </div>
                <button type="submit" className="h-9 rounded border border-vault-accent/40 px-2 text-xs uppercase tracking-[0.18em]">
                  Add Task
                </button>
              </form>

              <div className="mt-3 space-y-2 text-sm">
                {orderedQueue.slice(0, 12).map((item) => {
                  const queueKey = `${item.type}-${item.id}`;
                  return (
                  <div
                    key={queueKey}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", queueKey);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const dragKey = event.dataTransfer.getData("text/plain");
                      handleQueueDrop(dragKey, queueKey);
                    }}
                    className="rounded border border-vault-accent/20 bg-black/20 px-2 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-vault-text">{item.title}</p>
                        <p className="text-xs text-vault-textDim">{item.subtitle}</p>
                      </div>
                      <span className="rounded border border-vault-accent/30 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-vault-textDim">
                        {item.type}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className={item.priority === "high" ? "text-amber-300" : item.priority === "low" ? "text-cyan-300" : "text-vault-textDim"}>
                        {item.priority}
                      </span>
                      <span className="text-vault-textDim">{new Date(item.dueAt).toLocaleString()}</span>
                    </div>
                    <div className="mt-2">
                      {item.type === "task" ? (
                        <button
                          type="button"
                          onClick={() => completeTodo(item.id)}
                          className="h-8 rounded border border-vault-accent/30 px-2 text-[11px] uppercase tracking-[0.16em]"
                        >
                          Complete
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => completeBooking(item.id)}
                          className="h-8 rounded border border-vault-accent/30 px-2 text-[11px] uppercase tracking-[0.16em]"
                        >
                          Complete
                        </button>
                      )}
                    </div>
                  </div>
                );})}
                {operationalQueue.length === 0 ? (
                  <div className="somb-empty-state text-xs text-vault-textDim">No active work yet. Add a task or event to start continuity tracking.</div>
                ) : null}
              </div>
            </GlassPanel>
          </div>

          <div className="space-y-4">
            <GlassPanel title="Calendar" className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                    className="h-8 rounded border border-vault-accent/30 px-2 text-xs"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                    className="h-8 rounded border border-vault-accent/30 px-2 text-xs"
                  >
                    Next
                  </button>
                </div>
                <p className="font-display text-sm uppercase tracking-[0.2em] text-vault-text">
                  {currentMonth.toLocaleString(undefined, { month: "long", year: "numeric" })}
                </p>
                  <button
                    type="button"
                    onClick={() => setShowBookingComposer((prev) => !prev)}
                    className="h-8 rounded border border-vault-accent/30 px-2 text-xs uppercase tracking-[0.16em]"
                  >
                    {showBookingComposer ? "Hide" : "New calendar event"}
                  </button>
              </div>

              <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-[0.16em] text-vault-textDim">
                {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
                  <div key={`${label}-${index}`}>{label}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((date, index) => {
                  if (!date) return <div key={`empty-${index}`} className="h-14 rounded border border-transparent" />;

                  const key = dayKey(date);
                  const bookingCount = (bookingsByDay.get(key) || []).length;
                  const taskCount = (tasksByDay.get(key) || []).length;
                  const isSelected = key === selectedDay;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleDaySelect(key)}
                      className={`h-14 rounded border px-1 py-1 text-left ${isSelected ? "border-vault-accent bg-vault-accent/10" : "border-vault-accent/20 bg-vault-bg/40"}`}
                    >
                      <p className="text-xs text-vault-text">{date.getDate()}</p>
                      <p className="text-[10px] text-vault-textDim">{bookingCount}B {taskCount}T</p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                <div className="rounded border border-vault-accent/20 bg-black/20 p-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-vault-textDim">Day plan {selectedDay}</p>
                  <div className="mt-2 max-h-60 space-y-2 overflow-auto text-sm">
                    {selectedBookings.map((booking) => (
                      <div key={booking.id} className="rounded border border-vault-accent/20 px-2 py-1.5">
                        <p className="text-vault-text">{booking.module_key}</p>
                        <p className="text-xs text-vault-textDim">
                          {new Date(booking.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - {new Date(booking.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <button
                          type="button"
                          onClick={() => completeBooking(booking.id)}
                          className="mt-1 h-7 rounded border border-vault-accent/30 px-2 text-[11px] uppercase tracking-[0.14em]"
                        >
                          Complete
                        </button>
                      </div>
                    ))}
                    {selectedTasks.map((task) => (
                      <div key={task.id} className="rounded border border-vault-accent/20 px-2 py-1.5">
                        <p className="text-vault-text">{task.title}</p>
                        <p className="text-xs text-vault-textDim">Due {new Date(task.parsed?.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                        <button
                          type="button"
                          onClick={() => completeTodo(task.id)}
                          className="mt-1 h-7 rounded border border-vault-accent/30 px-2 text-[11px] uppercase tracking-[0.14em]"
                        >
                          Complete
                        </button>
                      </div>
                    ))}
                    {selectedBookings.length === 0 && selectedTasks.length === 0 ? (
                      <div className="somb-empty-state text-xs text-vault-textDim">No events on this day. Select a date and create one below.</div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded border border-vault-accent/20 bg-black/20 p-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-vault-textDim">Briefing memory</p>
                  <div className="mt-2 max-h-60 space-y-2 overflow-auto text-xs">
                    {history.slice(0, 8).map((entry) => (
                      <div key={entry.id} className="rounded border border-vault-accent/20 px-2 py-1.5">
                        <p className="uppercase tracking-[0.14em] text-vault-text">{entry.kind} briefing</p>
                        <p className="text-vault-textDim">{new Date(entry.created_at).toLocaleString()}</p>
                      </div>
                    ))}
                    {history.length === 0 ? (
                      <div className="somb-empty-state text-vault-textDim">Briefing memory will build as morning and night snapshots are generated.</div>
                    ) : null}
                  </div>
                </div>
              </div>

              {showBookingComposer ? (
                <form onSubmit={createBooking} className="mt-3 grid gap-2 rounded border border-vault-accent/20 bg-vault-bg/50 p-2 md:grid-cols-2">
                  <input
                    value={bookingForm.module_key}
                    onChange={(event) => setBookingForm((prev) => ({ ...prev, module_key: event.target.value }))}
                    placeholder="Event name"
                    className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                  />
                  <input
                    type="datetime-local"
                    value={bookingForm.starts_at}
                    onChange={(event) => setBookingForm((prev) => ({ ...prev, starts_at: event.target.value }))}
                    className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                    required
                  />
                  <input
                    type="datetime-local"
                    value={bookingForm.ends_at}
                    onChange={(event) => setBookingForm((prev) => ({ ...prev, ends_at: event.target.value }))}
                    className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                    required
                  />
                  <input
                    value={bookingForm.notes}
                    onChange={(event) => setBookingForm((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Notes for Outlook, Google Calendar, or iCal"
                    className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                  />
                  <div className="flex gap-2 md:col-span-2">
                    <button type="submit" className="h-9 rounded border border-vault-accent/40 px-2 text-xs uppercase tracking-[0.16em]">
                      Create event
                    </button>
                    <button type="button" onClick={exportCalendarEvent} className="h-9 rounded border border-cyan-500/35 px-2 text-xs uppercase tracking-[0.16em] text-cyan-200">
                      Copy .ics for Outlook / Google / iCal
                    </button>
                  </div>
                </form>
              ) : null}
            </GlassPanel>
          </div>

          <div className="space-y-4">
            <GlassPanel title="End-of-day brief" className="p-3">
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-vault-textDim">Revenue Today</span>
                  <span className="text-emerald-300">${Number(night?.spending_summary?.revenue_today || 0).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-vault-textDim">Payments Today</span>
                  <span className="text-vault-text">{night?.spending_summary?.total_payments_today || 0}</span>
                </div>
                <div className="mt-2 rounded border border-vault-accent/15 bg-black/20 p-2 text-vault-textDim">
                  {(night?.tomorrow_prep?.hint || "No nightly prep hint yet.")}
                </div>
              </div>
            </GlassPanel>

            <GlassPanel title="Calendar bridge" className="p-3">
              <div className="space-y-2 text-xs text-vault-textDim">
                <p>Use one event format for Outlook, Google Calendar, and Apple Calendar.</p>
                <p>Create the event here, then copy the .ics payload or download it as a file.</p>
              </div>
            </GlassPanel>
          </div>
        </div>

        <GlassPanel title="Contacts" className="p-3">
          <div className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
              <div className="grid gap-2 md:grid-cols-3">
                <div className="rounded border border-vault-accent/20 bg-black/20 p-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-vault-textDim">Contacts</p>
                  <p className="text-lg text-vault-text">{contactStats.total}</p>
                </div>
                <div className="rounded border border-vault-accent/20 bg-black/20 p-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-vault-textDim">Favorites</p>
                  <p className="text-lg text-amber-300">{contactStats.favorites}</p>
                </div>
                <div className="rounded border border-vault-accent/20 bg-black/20 p-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-vault-textDim">Groups</p>
                  <p className="text-lg text-vault-text">{contactStats.groups}</p>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <input
                  value={contactQuery}
                  onChange={(event) => setContactQuery(event.target.value)}
                  placeholder="Search contacts"
                  className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-3 text-sm"
                />
                <select
                  value={contactGroupFilter}
                  onChange={(event) => setContactGroupFilter(event.target.value)}
                  className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                >
                  <option value="all">All contacts</option>
                  <option value="favorites">Favorites</option>
                  {availableContactGroups.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <button type="button" onClick={startNewContact} className="rounded border border-vault-accent/30 px-2 py-1 uppercase tracking-[0.14em]">
                  New contact
                </button>
                <button type="button" onClick={() => exportContactsVcard(false)} className="rounded border border-cyan-500/30 px-2 py-1 uppercase tracking-[0.14em] text-cyan-200">
                  Export .vcf
                </button>
                <button type="button" onClick={mergeContactDuplicates} className="rounded border border-vault-accent/30 px-2 py-1 uppercase tracking-[0.14em]">
                  Merge duplicates
                </button>
                <button type="button" onClick={() => exportContactsVcard(true)} className="rounded border border-vault-accent/30 px-2 py-1 uppercase tracking-[0.14em]">
                  Export selected
                </button>
              </div>

              <div className="max-h-[34rem] space-y-2 overflow-auto pr-1">
                {filteredContacts.map((contact) => {
                  const isSelected = contact.id === selectedContact?.id;
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => setSelectedContactId(contact.id)}
                      className={`w-full rounded border px-3 py-2 text-left ${isSelected ? "border-vault-accent bg-vault-accent/10" : "border-vault-accent/20 bg-black/20"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {contact.photo_url ? (
                            <img src={contact.photo_url} alt={contact.display_name} className="h-12 w-12 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-vault-accent/20 bg-vault-bg/50 text-sm text-vault-textDim">
                              {contact.initials}
                            </div>
                          )}
                          <div>
                          <p className="text-sm text-vault-text">{contact.display_name}</p>
                          <p className="text-xs text-vault-textDim">{contact.company || contact.job_title || contact.primary_email || contact.primary_phone || "No details yet"}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(contact.groups || []).slice(0, 3).map((group) => (
                              <span key={`${contact.id}-${group}`} className="rounded border border-vault-accent/20 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-vault-textDim">
                                {group}
                              </span>
                            ))}
                          </div>
                        </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleFavoriteContact(contact);
                            }}
                            className="rounded border border-vault-accent/25 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-vault-textDim"
                          >
                            {contact.is_favorite ? "Starred" : "Star"}
                          </button>
                          <span className="text-[10px] uppercase tracking-[0.12em] text-vault-textDim">{contact.initials}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {filteredContacts.length === 0 ? (
                  <div className="somb-empty-state text-xs text-vault-textDim">No contacts yet. Create one to start your address book.</div>
                ) : null}
              </div>

              <div className="space-y-2 rounded border border-vault-accent/20 bg-black/20 p-2">
                <p className="text-xs uppercase tracking-[0.16em] text-vault-textDim">Import vCard</p>
                <textarea
                  value={contactImportText}
                  onChange={(event) => setContactImportText(event.target.value)}
                  placeholder="Paste a .vcf payload here"
                  className="min-h-28 w-full rounded border border-vault-accent/30 bg-vault-bg/60 px-3 py-2 text-xs"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={importContactsVcard} className="h-8 rounded border border-vault-accent/30 px-2 text-xs uppercase tracking-[0.14em]">
                    Import vCard
                  </button>
                  <button type="button" onClick={() => setContactImportText("")} className="h-8 rounded border border-vault-accent/30 px-2 text-xs uppercase tracking-[0.14em]">
                    Clear
                  </button>
                </div>
              </div>
            </div>

            <form onSubmit={saveContact} className="space-y-3">
              <div className="rounded border border-vault-accent/20 bg-black/20 p-2">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-vault-textDim">Contact profile</p>
                    <p className="text-sm text-vault-text">{selectedContact ? selectedContact.display_name : "New contact"}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={resetContactForm} className="rounded border border-vault-accent/30 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-vault-textDim">
                      Reset
                    </button>
                    {selectedContact ? (
                      <button type="button" onClick={() => archiveContact(selectedContact.id)} className="rounded border border-red-500/30 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-red-200">
                        Archive
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  <input value={contactForm.prefix} onChange={(event) => setContactForm((prev) => ({ ...prev, prefix: event.target.value }))} placeholder="Prefix" className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs" />
                  <input value={contactForm.first_name} onChange={(event) => setContactForm((prev) => ({ ...prev, first_name: event.target.value }))} placeholder="First name" className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs" />
                  <input value={contactForm.middle_name} onChange={(event) => setContactForm((prev) => ({ ...prev, middle_name: event.target.value }))} placeholder="Middle name" className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs" />
                  <input value={contactForm.last_name} onChange={(event) => setContactForm((prev) => ({ ...prev, last_name: event.target.value }))} placeholder="Last name" className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs" />
                  <input value={contactForm.suffix} onChange={(event) => setContactForm((prev) => ({ ...prev, suffix: event.target.value }))} placeholder="Suffix" className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs" />
                  <input value={contactForm.nickname} onChange={(event) => setContactForm((prev) => ({ ...prev, nickname: event.target.value }))} placeholder="Nickname" className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs" />
                  <input value={contactForm.company} onChange={(event) => setContactForm((prev) => ({ ...prev, company: event.target.value }))} placeholder="Company" className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs" />
                  <input value={contactForm.job_title} onChange={(event) => setContactForm((prev) => ({ ...prev, job_title: event.target.value }))} placeholder="Job title" className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs" />
                  <input value={contactForm.department} onChange={(event) => setContactForm((prev) => ({ ...prev, department: event.target.value }))} placeholder="Department" className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs" />
                  <input value={contactForm.photo_url} onChange={(event) => setContactForm((prev) => ({ ...prev, photo_url: event.target.value }))} placeholder="Photo URL" className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs md:col-span-2 xl:col-span-3" />
                  <input type="date" value={contactForm.birthday} onChange={(event) => setContactForm((prev) => ({ ...prev, birthday: event.target.value }))} className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs" />
                  <input type="date" value={contactForm.anniversary} onChange={(event) => setContactForm((prev) => ({ ...prev, anniversary: event.target.value }))} className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs" />
                  <input
                    value={contactForm.groups}
                    onChange={(event) => setContactForm((prev) => ({ ...prev, groups: event.target.value }))}
                    placeholder="Groups, comma separated"
                    className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs md:col-span-2 xl:col-span-3"
                  />
                </div>

                <label className="mt-2 flex items-center gap-2 text-xs text-vault-textDim">
                  <input
                    type="checkbox"
                    checked={contactForm.is_favorite}
                    onChange={(event) => setContactForm((prev) => ({ ...prev, is_favorite: event.target.checked }))}
                  />
                  Favorite contact
                </label>
              </div>

              <ContactRowsEditor
                title="Phones"
                rows={contactForm.phones}
                fields={[{ key: "label", placeholder: "Label" }, { key: "value", placeholder: "Phone number" }]}
                addLabel="Add phone"
                onAdd={() => setContactForm((prev) => ({ ...prev, phones: [...prev.phones, { label: "mobile", value: "" }] }))}
                onRemove={(index) => setContactForm((prev) => ({ ...prev, phones: prev.phones.filter((_, rowIndex) => rowIndex !== index) }))}
                onChange={(index, key, value) => setContactForm((prev) => ({ ...prev, phones: prev.phones.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)) }))}
              />

              <ContactRowsEditor
                title="Emails"
                rows={contactForm.emails}
                fields={[{ key: "label", placeholder: "Label" }, { key: "value", placeholder: "Email address" }]}
                addLabel="Add email"
                onAdd={() => setContactForm((prev) => ({ ...prev, emails: [...prev.emails, { label: "main", value: "" }] }))}
                onRemove={(index) => setContactForm((prev) => ({ ...prev, emails: prev.emails.filter((_, rowIndex) => rowIndex !== index) }))}
                onChange={(index, key, value) => setContactForm((prev) => ({ ...prev, emails: prev.emails.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)) }))}
              />

              <ContactRowsEditor
                title="Addresses"
                rows={contactForm.addresses}
                fields={[
                  { key: "label", placeholder: "Label" },
                  { key: "street", placeholder: "Street" },
                  { key: "city", placeholder: "City" },
                  { key: "state", placeholder: "State" },
                  { key: "postal_code", placeholder: "Postal code" },
                  { key: "country", placeholder: "Country" },
                  { key: "formatted", placeholder: "Full address" },
                ]}
                addLabel="Add address"
                onAdd={() => setContactForm((prev) => ({ ...prev, addresses: [...prev.addresses, { label: "home", street: "", city: "", state: "", postal_code: "", country: "", formatted: "" }] }))}
                onRemove={(index) => setContactForm((prev) => ({ ...prev, addresses: prev.addresses.filter((_, rowIndex) => rowIndex !== index) }))}
                onChange={(index, key, value) => setContactForm((prev) => ({ ...prev, addresses: prev.addresses.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)) }))}
              />

              <ContactRowsEditor
                title="Web links"
                rows={contactForm.urls}
                fields={[{ key: "label", placeholder: "Label" }, { key: "value", placeholder: "Website or profile" }]}
                addLabel="Add link"
                onAdd={() => setContactForm((prev) => ({ ...prev, urls: [...prev.urls, { label: "website", value: "" }] }))}
                onRemove={(index) => setContactForm((prev) => ({ ...prev, urls: prev.urls.filter((_, rowIndex) => rowIndex !== index) }))}
                onChange={(index, key, value) => setContactForm((prev) => ({ ...prev, urls: prev.urls.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)) }))}
              />

              <ContactRowsEditor
                title="Social profiles"
                rows={contactForm.social_profiles}
                fields={[{ key: "label", placeholder: "Label" }, { key: "value", placeholder: "Profile URL or handle" }]}
                addLabel="Add profile"
                onAdd={() => setContactForm((prev) => ({ ...prev, social_profiles: [...prev.social_profiles, { label: "profile", value: "" }] }))}
                onRemove={(index) => setContactForm((prev) => ({ ...prev, social_profiles: prev.social_profiles.filter((_, rowIndex) => rowIndex !== index) }))}
                onChange={(index, key, value) => setContactForm((prev) => ({ ...prev, social_profiles: prev.social_profiles.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)) }))}
              />

              <div className="rounded border border-vault-accent/20 bg-black/20 p-2">
                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-vault-textDim">Notes</p>
                <textarea
                  value={contactForm.notes}
                  onChange={(event) => setContactForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Notes, reminders, context"
                  className="min-h-28 w-full rounded border border-vault-accent/30 bg-vault-bg/60 px-3 py-2 text-xs"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="submit" className="h-9 rounded border border-vault-accent/40 px-3 text-xs uppercase tracking-[0.16em]">
                  {selectedContact ? "Save contact" : "Create contact"}
                </button>
                {selectedContact ? (
                  <button type="button" onClick={() => toggleFavoriteContact(selectedContact)} className="h-9 rounded border border-vault-accent/30 px-3 text-xs uppercase tracking-[0.16em]">
                    {selectedContact.is_favorite ? "Unstar" : "Star"}
                  </button>
                ) : null}
                {selectedContact ? (
                  <button type="button" onClick={() => exportContactsVcard(true)} className="h-9 rounded border border-cyan-500/35 px-3 text-xs uppercase tracking-[0.16em] text-cyan-200">
                    Export this contact
                  </button>
                ) : null}
                {selectedContact?.primary_phone ? (
                  <button type="button" onClick={() => launchContactAction("call", selectedContact.primary_phone)} className="h-9 rounded border border-emerald-500/35 px-3 text-xs uppercase tracking-[0.16em] text-emerald-200">
                    Call
                  </button>
                ) : null}
                {selectedContact?.primary_phone ? (
                  <button type="button" onClick={() => launchContactAction("message", selectedContact.primary_phone)} className="h-9 rounded border border-cyan-500/35 px-3 text-xs uppercase tracking-[0.16em] text-cyan-200">
                    Message
                  </button>
                ) : null}
                {selectedContact?.primary_email ? (
                  <button type="button" onClick={() => launchContactAction("email", selectedContact.primary_email)} className="h-9 rounded border border-vault-accent/30 px-3 text-xs uppercase tracking-[0.16em]">
                    Email
                  </button>
                ) : null}
              </div>

              {selectedContact ? (
                <div className="rounded border border-vault-accent/20 bg-black/20 p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.16em] text-vault-textDim">Linked cards</p>
                    <div className="flex gap-2">
                      <select value={linkCandidateId} onChange={(event) => setLinkCandidateId(event.target.value)} className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs">
                        <option value="">Select contact</option>
                        {linkableContacts.map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {contact.display_name}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={linkContactCard} className="h-8 rounded border border-vault-accent/30 px-2 text-[10px] uppercase tracking-[0.14em]">
                        Link
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs">
                    {linkedContacts.map((contact) => (
                      <div key={contact.id} className="flex items-center justify-between rounded border border-vault-accent/15 px-2 py-1.5">
                        <div>
                          <p className="text-vault-text">{contact.display_name}</p>
                          <p className="text-vault-textDim">{contact.company || contact.primary_email || contact.primary_phone || "Linked card"}</p>
                        </div>
                        <button type="button" onClick={() => unlinkContactCard(contact.id)} className="rounded border border-red-500/30 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-red-200">
                          Unlink
                        </button>
                      </div>
                    ))}
                    {!linkedContacts.length ? <p className="text-vault-textDim">No linked cards yet.</p> : null}
                  </div>
                </div>
              ) : null}

              <div className="rounded border border-vault-accent/20 bg-black/20 p-2 text-xs text-vault-textDim">
                <p>{contactNote || "Create, favorite, merge, import, and export contacts from one place."}</p>
                {selectedContact ? (
                  <div className="mt-2 space-y-1">
                    {selectedContact.primary_phone ? <p>Call: {selectedContact.primary_phone}</p> : null}
                    {selectedContact.primary_email ? <p>Email: {selectedContact.primary_email}</p> : null}
                    {selectedContact.primary_address ? <p>Address: {selectedContact.primary_address}</p> : null}
                  </div>
                ) : null}
              </div>
            </form>
          </div>
        </GlassPanel>

        {loading ? <div className="rounded border border-vault-accent/20 bg-vault-bg/50 px-3 py-2 text-xs text-vault-textDim">Syncing operational workspace...</div> : null}
      </div>
    </AppShell>
  );
}