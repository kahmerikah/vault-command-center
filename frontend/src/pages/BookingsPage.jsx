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

export default function BookingsPage() {
  const { accessToken, refreshToken, user, clearAuth } = useVaultStore();
  const [bookings, setBookings] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(dayKey(new Date()));
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
    const res = await api.get("/bookings", { params: { limit: 200 } });
    setBookings(res.data?.data?.items || []);
  };

  useEffect(() => {
    if (accessToken) {
      setAuthToken(accessToken);
      load();
    }
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

  return (
    <AppShell user={user} onLogout={handleLogout} title="bookings">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <GlassPanel title="Booking Calendar">
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
                  <div className="mt-2 text-[11px] text-vault-textDim">{count} booking(s)</div>
                </button>
              );
            })}
          </div>
        </GlassPanel>

        <GlassPanel title="Day Details">
          <div className="mb-3 text-xs uppercase tracking-[0.18em] text-vault-textDim">{selectedDay}</div>
          <div className="space-y-2 text-sm">
            {selectedBookings.map((booking) => (
              <div key={booking.id} className="rounded border border-vault-accent/20 px-3 py-2">
                <div>{booking.module_key}</div>
                <div className="text-vault-textDim">
                  {new Date(booking.starts_at).toLocaleString()} - {new Date(booking.ends_at).toLocaleString()}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-vault-accent">{booking.status}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await api.patch(`/bookings/${booking.id}/status`, { status: "completed" });
                      load();
                    }}
                    className="rounded border border-vault-accent/30 px-2 py-1 text-xs"
                  >
                    Complete
                  </button>
                </div>
              </div>
            ))}
            {selectedBookings.length === 0 && <div className="text-vault-textDim">No bookings for this date.</div>}
          </div>
        </GlassPanel>
      </div>

      <GlassPanel title="Create Booking" className="mt-4">
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            await api.post("/bookings", formState);
            setFormState({ module_key: "booking", starts_at: "", ends_at: "", notes: "" });
            load();
          }}
        >
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
            <button type="submit" className="rounded border border-vault-accent/30 px-3 py-2 text-xs uppercase tracking-[0.2em]">
              Create booking
            </button>
          </div>
        </form>
      </GlassPanel>
    </AppShell>
  );
}
