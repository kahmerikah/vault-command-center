import { useEffect, useState } from "react";
import api, { setAuthToken } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import { useVaultStore } from "../store/useVaultStore";
import AppShell from "../components/AppShell";
import GlassPanel from "../components/GlassPanel";

export default function BookingsPage() {
  const { accessToken, refreshToken, user, clearAuth } = useVaultStore();
  const [bookings, setBookings] = useState([]);

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
    const res = await api.get("/bookings", { params: { limit: 100 } });
    setBookings(res.data?.data?.items || []);
  };

  useEffect(() => {
    if (accessToken) {
      setAuthToken(accessToken);
      load();
    }
  }, [accessToken]);

  return (
    <AppShell user={user} onLogout={handleLogout} title="bookings">
      <GlassPanel title="Upcoming Bookings">
        <div className="space-y-2 text-sm">
          {bookings.map((booking) => (
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
                  Mark completed
                </button>
              </div>
            </div>
          ))}
          {bookings.length === 0 && <div className="text-vault-textDim">No bookings available.</div>}
        </div>
      </GlassPanel>
    </AppShell>
  );
}
