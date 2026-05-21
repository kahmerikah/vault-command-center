import { useEffect, useState } from "react";
import api, { setAuthToken } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import { useVaultStore } from "../store/useVaultStore";
import AppShell from "../components/AppShell";
import NotificationPanel from "../components/NotificationPanel";

export default function NotificationsPage() {
  const { accessToken, refreshToken, user, clearAuth } = useVaultStore();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

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
    setLoading(true);
    setLoadError("");
    try {
      const res = await api.get("/notifications", { params: { limit: 100 } });
      setItems(res.data?.data?.items || []);
      setUnreadCount(res.data?.data?.unread_count || 0);
    } catch (error) {
      setLoadError(error?.response?.data?.error || "Unable to load notification stream.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      setAuthToken(accessToken);
      load();
    }
  }, [accessToken]);

  return (
    <AppShell user={user} onLogout={handleLogout} title="notifications">
      {loadError ? <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{loadError}</div> : null}
      {loading ? <div className="mb-4 rounded-lg border border-vault-accent/20 bg-vault-bg/50 px-3 py-2 text-xs text-vault-textDim">Syncing notification stream...</div> : null}
      <NotificationPanel
        items={items}
        unreadCount={unreadCount}
        onRead={async (id) => {
          await api.post(`/notifications/${id}/read`);
          load();
        }}
        onArchive={async (id) => {
          await api.post(`/notifications/${id}/archive`);
          load();
        }}
      />
    </AppShell>
  );
}
