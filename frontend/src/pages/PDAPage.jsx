import { useEffect, useMemo, useState } from "react";
import api, { setAuthToken } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import { useVaultStore } from "../store/useVaultStore";
import AppShell from "../components/AppShell";
import GlassPanel from "../components/GlassPanel";

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
  for (let i = 0; i < firstWeekday; i += 1) {
    days.push(null);
  }

  for (let day = 1; day <= end.getDate(); day += 1) {
    days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

const tabs = ["agenda", "briefings", "todos", "new booking"];

export default function PDAPage() {
  const { accessToken, refreshToken, user, clearAuth } = useVaultStore();

  const [bookings, setBookings] = useState([]);
  const [morning, setMorning] = useState(null);
  const [night, setNight] = useState(null);
  const [history, setHistory] = useState([]);
  const [todos, setTodos] = useState([]);

  const [zip, setZip] = useState("90001");
  const [tab, setTab] = useState("agenda");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionNotice, setActionNotice] = useState("");

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(dayKey(new Date()));

  const [todoText, setTodoText] = useState("");
  const [formState, setFormState] = useState({
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
      const [bookingsRes, morningRes, nightRes, historyRes, todosRes] = await Promise.allSettled([
        api.get("/bookings", { params: { limit: 200 } }),
        api.get(`/briefing/morning?zip=${zip}`),
        api.get("/briefing/night"),
        api.get("/briefing/history?limit=12"),
        api.get("/knowledge", { params: { category: "todo", limit: 100 } }),
      ]);

      setBookings(bookingsRes.status === "fulfilled" ? (bookingsRes.value.data?.data?.items || []) : []);
      setMorning(morningRes.status === "fulfilled" ? (morningRes.value.data?.data || null) : null);
      setNight(nightRes.status === "fulfilled" ? (nightRes.value.data?.data || null) : null);
      setHistory(historyRes.status === "fulfilled" ? (historyRes.value.data?.data?.items || []) : []);
      setTodos(todosRes.status === "fulfilled" ? (todosRes.value.data?.data?.items || []) : []);

      if ([bookingsRes, morningRes, nightRes, historyRes, todosRes].some((r) => r.status === "rejected")) {
        setLoadError("Some PDA panels could not load. Retry after backend sync.");
      }
    } catch (error) {
      setLoadError(error?.response?.data?.error || "Unable to load PDA data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    setAuthToken(accessToken);
    load();
  }, [accessToken]);

  const grouped = useMemo(() => {
    const map = new Map();
    bookings.forEach((booking) => {
      const key = dayKey(booking.starts_at);
      map.set(key, [...(map.get(key) || []), booking]);
    });
    return map;
  }, [bookings]);

  const selectedBookings = grouped.get(selectedDay) || [];
  const calendarDays = useMemo(() => monthGrid(currentMonth), [currentMonth]);

  const addTodo = async (event) => {
    event.preventDefault();
    const title = todoText.trim();
    if (!title) return;
    setActionNotice("");
    await api.post("/knowledge", {
      title,
      body: title,
      kind: "note",
      category: "todo",
      tags: "todo,pda",
      source: "pda",
    });
    setTodoText("");
    setActionNotice("Task added to PDA queue.");
    load();
  };

  const completeTodo = async (id) => {
    setActionNotice("");
    await api.delete(`/knowledge/${id}`);
    setActionNotice("Task marked complete.");
    load();
  };

  const completeBooking = async (id) => {
    setActionNotice("");
    await api.patch(`/bookings/${id}/status`, { status: "completed" });
    setActionNotice("Booking marked completed.");
    load();
  };

  const createBooking = async (event) => {
    event.preventDefault();
    setActionNotice("");
    await api.post("/bookings", formState);
    setFormState({ module_key: "booking", starts_at: "", ends_at: "", notes: "" });
    setTab("agenda");
    setActionNotice("Booking created successfully.");
    load();
  };

  return (
    <AppShell user={user} onLogout={handleLogout} title="pda">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex gap-1 border-b border-vault-accent/20">
          {tabs.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setTab(name)}
              className={`px-3 py-2 text-xs uppercase tracking-[0.2em] ${tab === name ? "border-b-2 border-vault-accent text-vault-text" : "text-vault-textDim"}`}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={zip}
            onChange={(event) => setZip(event.target.value)}
            placeholder="zip"
            className="w-28 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 py-1 text-sm"
          />
          <button type="button" onClick={load} className="rounded border border-vault-accent/30 px-3 py-1 text-xs uppercase tracking-[0.18em]">
            Refresh
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="mb-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{loadError}</div>
      ) : null}
      {actionNotice ? (
        <div className="mb-3 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{actionNotice}</div>
      ) : null}

      {tab === "agenda" && (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <GlassPanel title="Calendar">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                className="rounded border border-vault-accent/30 px-2 py-1 text-xs"
              >
                Prev
              </button>
              <div className="font-display text-sm uppercase tracking-[0.2em] text-vault-text">
                {currentMonth.toLocaleString(undefined, { month: "long", year: "numeric" })}
              </div>
              <button
                type="button"
                onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                className="rounded border border-vault-accent/30 px-2 py-1 text-xs"
              >
                Next
              </button>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-2 text-center text-[11px] uppercase tracking-[0.18em] text-vault-textDim">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                <div key={label}>{label}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} className="h-20 rounded border border-transparent" />;
                }

                const key = dayKey(date);
                const count = (grouped.get(key) || []).length;
                const isSelected = key === selectedDay;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDay(key)}
                    className={`h-20 rounded border p-2 text-left ${
                      isSelected ? "border-vault-accent bg-vault-accent/10" : "border-vault-accent/20 bg-vault-bg/50"
                    }`}
                  >
                    <div className="text-xs text-vault-text">{date.getDate()}</div>
                    <div className="mt-2 text-[11px] text-vault-textDim">{count} item(s)</div>
                  </button>
                );
              })}
            </div>
          </GlassPanel>

          <GlassPanel title={`Agenda: ${selectedDay}`}>
            {loading ? <div className="text-vault-textDim">Loading...</div> : null}
            <div className="space-y-2 text-sm">
              {selectedBookings.map((booking) => (
                <div key={booking.id} className="rounded border border-vault-accent/20 px-3 py-2">
                  <div>{booking.module_key}</div>
                  <div className="text-vault-textDim">
                    {new Date(booking.starts_at).toLocaleString()} - {new Date(booking.ends_at).toLocaleString()}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-vault-accent">{booking.status}</span>
                    {booking.status !== "completed" && (
                      <button
                        type="button"
                        onClick={() => completeBooking(booking.id)}
                        className="h-9 rounded border border-vault-accent/30 px-3 py-1 text-xs"
                      >
                        Complete
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {selectedBookings.length === 0 ? (
                <div className="somb-empty-state text-vault-textDim">
                  <p className="text-vault-text">No agenda items for this day.</p>
                  <p className="mt-1 text-xs">Create a booking in the New Booking tab or choose another date with scheduled work.</p>
                </div>
              ) : null}
            </div>
          </GlassPanel>
        </div>
      )}

      {tab === "briefings" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassPanel title="Morning Briefing">
            <div className="space-y-3 text-sm">
              <div className="text-vault-textDim">Weather: {morning?.weather?.condition || "n/a"}</div>
              <div className="text-vault-textDim">Upcoming: {(morning?.calendar || []).length} event(s)</div>
              <div>
                <div className="mb-1 text-xs uppercase tracking-[0.18em] text-vault-textDim">Priorities</div>
                <ul className="space-y-1">
                  {(morning?.priorities || []).map((item, index) => (
                    <li key={index} className="text-vault-text">• {item}</li>
                  ))}
                  {(morning?.priorities || []).length === 0 ? <li className="text-vault-textDim">No priorities generated. Refresh with an updated ZIP or create bookings to seed priorities.</li> : null}
                </ul>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel title="Night + History">
            <div className="space-y-3 text-sm">
              <div className="text-vault-textDim">Revenue Today: ${Number(night?.spending_summary?.revenue_today || 0).toFixed(2)}</div>
              <div className="text-vault-textDim">Payments Today: {night?.spending_summary?.total_payments_today || 0}</div>
              <div>
                <div className="mb-1 text-xs uppercase tracking-[0.18em] text-vault-textDim">Recent Briefings</div>
                <div className="space-y-1 max-h-40 overflow-auto">
                  {history.map((row) => (
                    <div key={row.id} className="rounded border border-vault-accent/20 px-2 py-1 text-xs text-vault-textDim">
                      {row.kind} · {row.created_at?.slice(0, 16)}
                    </div>
                  ))}
                  {history.length === 0 ? <div className="text-vault-textDim text-xs">No briefing history yet. Run morning/night briefings to build operational memory.</div> : null}
                </div>
              </div>
            </div>
          </GlassPanel>
        </div>
      )}

      {tab === "todos" && (
        <GlassPanel title="To-Do List">
          <form onSubmit={addTodo} className="mb-3 flex gap-2">
            <input
              value={todoText}
              onChange={(event) => setTodoText(event.target.value)}
              placeholder="Add a task"
              className="flex-1 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 py-1 text-sm"
            />
            <button type="submit" className="h-9 rounded border border-vault-accent/30 px-3 py-1 text-xs uppercase tracking-[0.18em]">
              Add
            </button>
          </form>

          <div className="space-y-2">
            {todos.map((todo) => (
              <div key={todo.id} className="flex items-center justify-between rounded border border-vault-accent/20 px-3 py-2 text-sm">
                <span>{todo.title}</span>
                <button type="button" onClick={() => completeTodo(todo.id)} className="h-8 rounded border border-vault-accent/30 px-3 text-xs text-vault-textDim hover:text-white">
                  Done
                </button>
              </div>
            ))}
            {todos.length === 0 ? <div className="somb-empty-state text-vault-textDim text-sm">No to-dos yet. Add your next operational task to keep the queue alive.</div> : null}
          </div>
        </GlassPanel>
      )}

      {tab === "new booking" && (
        <GlassPanel title="Create Booking">
          <form className="grid gap-3 md:grid-cols-2" onSubmit={createBooking}>
            <label className="text-xs text-vault-textDim">
              Module
              <input
                value={formState.module_key}
                onChange={(event) => setFormState((prev) => ({ ...prev, module_key: event.target.value }))}
                className="mt-1 w-full rounded border border-vault-accent/30 bg-vault-bg/60 px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs text-vault-textDim">
              Start
              <input
                type="datetime-local"
                value={formState.starts_at}
                onChange={(event) => setFormState((prev) => ({ ...prev, starts_at: event.target.value }))}
                className="mt-1 w-full rounded border border-vault-accent/30 bg-vault-bg/60 px-2 py-1 text-sm"
                required
              />
            </label>
            <label className="text-xs text-vault-textDim">
              End
              <input
                type="datetime-local"
                value={formState.ends_at}
                onChange={(event) => setFormState((prev) => ({ ...prev, ends_at: event.target.value }))}
                className="mt-1 w-full rounded border border-vault-accent/30 bg-vault-bg/60 px-2 py-1 text-sm"
                required
              />
            </label>
            <label className="text-xs text-vault-textDim md:col-span-2">
              Notes
              <textarea
                value={formState.notes}
                onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
                className="mt-1 w-full rounded border border-vault-accent/30 bg-vault-bg/60 px-2 py-1 text-sm"
                rows={3}
              />
            </label>
            <div className="md:col-span-2">
              <button type="submit" className="h-10 rounded border border-vault-accent/30 px-4 py-2 text-xs uppercase tracking-[0.2em]">
                Create Booking
              </button>
            </div>
          </form>
        </GlassPanel>
      )}
    </AppShell>
  );
}