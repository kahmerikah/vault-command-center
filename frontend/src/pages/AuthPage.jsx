import { useEffect, useState } from "react";
import api, { setAuthToken } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import { useVaultStore } from "../store/useVaultStore";
import AppShell from "../components/AppShell";
import GlassPanel from "../components/GlassPanel";

export default function AuthPage() {
  const { accessToken, refreshToken, user, clearAuth } = useVaultStore();
  const [sessions, setSessions] = useState([]);
  const [failedAuth, setFailedAuth] = useState([]);

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

  useEffect(() => {
    const load = async () => {
      setAuthToken(accessToken);
      const [sessionsRes, activityRes] = await Promise.all([
        api.get("/auth/sessions"),
        api.get("/gateway/activity", { params: { level: "warning", limit: 20 } }),
      ]);
      setSessions(sessionsRes.data?.data?.items || []);
      setFailedAuth(
        (activityRes.data?.data?.items || []).filter((item) =>
          String(item.message || "").toLowerCase().includes("failed login")
        )
      );
    };

    if (accessToken) {
      load();
    }
  }, [accessToken]);

  return (
    <AppShell user={user} onLogout={handleLogout} title="auth">
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassPanel title="Active Sessions">
          <div className="space-y-2 text-sm">
            {sessions.map((session) => (
              <div key={session.id} className="rounded border border-vault-accent/20 px-3 py-2">
                <div>{session.ip_address || "unknown ip"}</div>
                <div className="text-vault-textDim">{session.user_agent || "n/a"}</div>
                <div className="text-xs text-vault-textDim">{new Date(session.created_at).toLocaleString()}</div>
              </div>
            ))}
            {sessions.length === 0 && <div className="text-vault-textDim">No active sessions found.</div>}
          </div>
        </GlassPanel>
        <GlassPanel title="Failed Auth Attempts">
          <div className="space-y-2 text-sm">
            {failedAuth.map((event) => (
              <div key={event.id} className="rounded border border-vault-warning/20 px-3 py-2">
                <div>{event.message}</div>
                <div className="text-xs text-vault-textDim">{new Date(event.created_at).toLocaleString()}</div>
              </div>
            ))}
            {failedAuth.length === 0 && <div className="text-vault-textDim">No failed auth events.</div>}
          </div>
        </GlassPanel>
      </div>
    </AppShell>
  );
}
