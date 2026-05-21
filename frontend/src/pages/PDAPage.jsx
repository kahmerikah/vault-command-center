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

function metricTone(value, threshold = 1) {
  return Number(value || 0) >= threshold ? "text-amber-300" : "text-emerald-300";
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

  const [zip, setZip] = useState("90001");
  const [quickCapture, setQuickCapture] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionNotice, setActionNotice] = useState("");

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
      ] = await Promise.allSettled([
        api.get("/bookings", { params: { limit: 300 } }),
        api.get(`/briefing/morning?zip=${zip}`),
        api.get("/briefing/night"),
        api.get("/briefing/history", { params: { limit: 12 } }),
        api.get("/knowledge", { params: { category: "todo", limit: 200 } }),
        api.get("/gateway/activity", { params: { limit: 50 } }),
        api.get("/health/system"),
      ]);

      setBookings(bookingsRes.status === "fulfilled" ? bookingsRes.value.data?.data?.items || [] : []);
      setMorning(morningRes.status === "fulfilled" ? morningRes.value.data?.data || null : null);
      setNight(nightRes.status === "fulfilled" ? nightRes.value.data?.data || null : null);
      setHistory(historyRes.status === "fulfilled" ? historyRes.value.data?.data?.items || [] : []);
      setTodos(todosRes.status === "fulfilled" ? (todosRes.value.data?.data?.items || []).map(parseTodoItem) : []);
      setActivity(activityRes.status === "fulfilled" ? activityRes.value.data?.data?.items || [] : []);
      setHealth(healthRes.status === "fulfilled" ? healthRes.value.data?.data || null : null);

      if (
        [bookingsRes, morningRes, nightRes, historyRes, todosRes, activityRes, healthRes].some(
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
  const unfinishedTasks = todos.filter((todo) => !todo.is_archived);
  const unfinishedBookings = bookings.filter((booking) => booking.status !== "completed");

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
    setQueueOrder(operationalQueue.map((item) => `${item.type}-${item.id}`));
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
        <GlassPanel className="p-3 lg:p-4" title="Daily Operational Brief">
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
              <p className="text-xs uppercase tracking-[0.18em] text-vault-textDim">Focus Queue</p>
              <ul className="mt-2 space-y-1">
                {(morning?.priorities || []).slice(0, 4).map((priority, index) => (
                  <li key={`${priority}-${index}`} className="rounded border border-vault-accent/15 bg-black/20 px-2 py-1 text-vault-text">
                    {priority}
                  </li>
                ))}
                {(morning?.priorities || []).length === 0 ? (
                  <li className="text-vault-textDim">No generated priorities yet. Capture work to seed briefing context.</li>
                ) : null}
              </ul>
              <div className="mt-3 rounded border border-vault-accent/15 bg-black/20 px-2 py-2 text-xs text-vault-textDim">
                Upcoming deadlines and unfinished operations are now merged into one queue below.
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
              placeholder="> add task review property leads | schedule deployment tomorrow 9pm | reminder mortgage due friday"
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

        <div className="grid gap-4 xl:grid-cols-[1.1fr_1.4fr_1fr]">
          <div className="space-y-4">
            <GlassPanel title="Operational Task Queue" className="p-3">
              <form onSubmit={handleAddTask} className="grid gap-2">
                <input
                  value={taskForm.title}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Capture next action"
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
                    placeholder="Module"
                    className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                  />
                  <input
                    value={taskForm.category}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, category: event.target.value }))}
                    placeholder="Category"
                    className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={taskForm.recurring}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, recurring: event.target.value }))}
                    className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                  >
                    <option value="none">No recurrence</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  <select
                    value={taskForm.reminders}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, reminders: event.target.value }))}
                    className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                  >
                    <option value="none">No reminder</option>
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
                  <div className="somb-empty-state text-xs text-vault-textDim">No active tasks or bookings. Capture the next operation to start continuity tracking.</div>
                ) : null}
              </div>
            </GlassPanel>
          </div>

          <div className="space-y-4">
            <GlassPanel title="Timeline + Schedule Command Center" className="p-3">
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
                  {showBookingComposer ? "Hide" : "New Block"}
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
                  <p className="text-xs uppercase tracking-[0.16em] text-vault-textDim">Agenda {selectedDay}</p>
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
                      <div className="somb-empty-state text-xs text-vault-textDim">No scheduled blocks on this day. Select a date and create one in the composer.</div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded border border-vault-accent/20 bg-black/20 p-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-vault-textDim">Continuity Memory</p>
                  <div className="mt-2 max-h-60 space-y-2 overflow-auto text-xs">
                    {history.slice(0, 8).map((entry) => (
                      <div key={entry.id} className="rounded border border-vault-accent/20 px-2 py-1.5">
                        <p className="uppercase tracking-[0.14em] text-vault-text">{entry.kind} briefing</p>
                        <p className="text-vault-textDim">{new Date(entry.created_at).toLocaleString()}</p>
                      </div>
                    ))}
                    {history.length === 0 ? (
                      <div className="somb-empty-state text-vault-textDim">Briefing memory will build as morning/night snapshots are generated.</div>
                    ) : null}
                  </div>
                </div>
              </div>

              {showBookingComposer ? (
                <form onSubmit={createBooking} className="mt-3 grid gap-2 rounded border border-vault-accent/20 bg-vault-bg/50 p-2 md:grid-cols-2">
                  <input
                    value={bookingForm.module_key}
                    onChange={(event) => setBookingForm((prev) => ({ ...prev, module_key: event.target.value }))}
                    placeholder="module"
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
                    placeholder="notes"
                    className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                  />
                  <button type="submit" className="h-9 rounded border border-vault-accent/40 px-2 text-xs uppercase tracking-[0.16em] md:col-span-2">
                    Create Booking
                  </button>
                </form>
              ) : null}
            </GlassPanel>
          </div>

          <div className="space-y-4">
            <GlassPanel title="Night Briefing Snapshot" className="p-3">
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
          </div>
        </div>

        {loading ? <div className="rounded border border-vault-accent/20 bg-vault-bg/50 px-3 py-2 text-xs text-vault-textDim">Syncing operational workspace...</div> : null}
      </div>
    </AppShell>
  );
}