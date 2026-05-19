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
    const res = await api.get("/notifications", { params: { limit: 100 } });
    setItems(res.data?.data?.items || []);
    setUnreadCount(res.data?.data?.unread_count || 0);
  };

  useEffect(() => {
    if (accessToken) {
      setAuthToken(accessToken);
      load();
    }
  }, [accessToken]);

  return (
    <AppShell user={user} onLogout={handleLogout} title="notifications">
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
