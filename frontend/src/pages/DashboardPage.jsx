import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { setAuthToken } from "../lib/api";
import socket, { connectSocket, disconnectSocket } from "../lib/socket";
import { useVaultStore } from "../store/useVaultStore";
import ActivityFeed from "../components/ActivityFeed";
import MetricCard from "../components/MetricCard";
import ModuleLauncher from "../components/ModuleLauncher";
import NotificationPanel from "../components/NotificationPanel";
import RevenueChart from "../components/RevenueChart";
import LiveTerminalCard from "../components/LiveTerminalCard";
import ServerHealthCard from "../components/ServerHealthCard";
import AppShell from "../components/AppShell";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { dashboard, setDashboard, modules, setModules, accessToken, refreshToken, user, clearAuth } = useVaultStore();
  const [health, setHealth] = useState(null);
  const [activityPage, setActivityPage] = useState(1);
  const [activityLevel, setActivityLevel] = useState("");
  const [terminalLines, setTerminalLines] = useState([]);
  const [loading, setLoading] = useState(true);

  const handleLogout = async () => {
    try {
      if (refreshToken) {
        await api.post(
          "/auth/logout",
          {},
          {
            headers: {
              Authorization: `Bearer ${refreshToken}`,
            },
          }
        );
      }
    } catch {
      // Keep logout resilient.
    } finally {
      clearAuth();
      setAuthToken("");
      disconnectSocket();
      window.location.assign("/login");
    }
  };

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setAuthToken(accessToken);
    setLoading(true);

    try {
      const [overviewRes, modulesRes, healthRes, activityRes] = await Promise.all([
        api.get("/dashboard/overview"),
        api.get("/modules"),
        api.get("/health/health/system"),
        api.get("/gateway/activity", {
          params: {
            page: activityPage,
            limit: 10,
            level: activityLevel || undefined,
          },
        }),
      ]);

      const overview = overviewRes.data?.data || {};
      overview.activity = activityRes.data?.data?.items || overview.activity || [];
      overview.activity_pagination = activityRes.data?.data?.pagination || null;

      setDashboard(overview);
      setModules(modulesRes.data?.data?.items || []);
      setHealth(healthRes.data?.data || null);

      setTerminalLines((activityRes.data?.data?.items || []).slice(0, 8).map((item) => {
        const stamp = new Date(item.created_at).toLocaleTimeString();
        return `[${item.level}] ${stamp} ${item.message}`;
      }));
    } catch (error) {
      if (error?.response?.status === 401) {
        clearAuth();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, activityLevel, activityPage, clearAuth, setDashboard, setModules]);

  useEffect(() => {
    if (!accessToken) {
      return undefined;
    }

    load();

    connectSocket(accessToken);
    socket.emit("dashboard:subscribe", { stream: "main" });

    const reload = () => load();
    const onActivity = (payload) => {
      setTerminalLines((prev) => [`[${payload.level || "info"}] ${payload.message}`, ...prev].slice(0, 10));
      reload();
    };

    socket.on("notification:new", reload);
    socket.on("chain:transaction", reload);
    socket.on("booking:updated", reload);
    socket.on("activity:new", onActivity);

    const healthTimer = window.setInterval(async () => {
      try {
        const healthRes = await api.get("/health/health/system");
        setHealth(healthRes.data?.data || null);
      } catch {
        // Poll fallback should never crash the page.
      }
    }, 15000);

    return () => {
      socket.off("notification:new", reload);
      socket.off("chain:transaction", reload);
      socket.off("booking:updated", reload);
      socket.off("activity:new", onActivity);
      window.clearInterval(healthTimer);
      disconnectSocket();
    };
  }, [accessToken, load]);

  const metrics = dashboard?.metrics || {};

  const metricCards = useMemo(
    () => [
      { label: "Active Users", value: metrics.users_total, hint: "Active account count", to: "/auth" },
      { label: "Sessions", value: metrics.sessions_total, hint: "Authenticated sessions", to: "/auth" },
      { label: "Payments", value: metrics.payments_total, hint: "Stripe transactions", to: "/payments" },
      { label: "Bookings", value: metrics.bookings_total, hint: "Scheduling layer", to: "/bookings" },
      { label: "Chain TX", value: metrics.chain_tx_total, hint: "Blockchain rail", tone: "warning", to: "/blockchain" },
      { label: "Notifications", value: metrics.notifications_unread, hint: "Unread alerts", tone: "danger", to: "/notifications" },
      { label: "Modules", value: metrics.module_count, hint: "Enabled modules", to: "/modules" },
      { label: "API Calls", value: metrics.api_calls_total, hint: "Captured traffic", to: "/analytics" },
      { label: "WS Clients", value: metrics.connected_clients, hint: "Realtime clients", to: "/dashboard" },
      { label: "Uptime", value: `${Math.floor((metrics.uptime_seconds || 0) / 60)}m`, hint: "Backend runtime", to: "/dashboard" },
    ],
    [metrics]
  );

  return (
    <AppShell user={user} onLogout={handleLogout} title="dashboard">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metricCards.map((card) => (
          <button key={card.label} type="button" onClick={() => navigate(card.to)}>
            <MetricCard label={card.label} value={loading ? "..." : card.value ?? "--"} hint={card.hint} tone={card.tone} />
          </button>
        ))}
      </section>

      <RevenueChart data={dashboard?.revenue_trend || []} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ServerHealthCard status={health?.status || "degraded"} checks={health?.checks || {}} />
        <LiveTerminalCard lines={terminalLines} />
      </div>

      <ModuleLauncher
        modules={modules}
        onLaunch={async (module) => {
          await api.post(`/modules/${module.key}/launch`);
          const path = module.key === "blockchain" ? "/blockchain" : `/${module.key}`;
          navigate(path);
        }}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <NotificationPanel
          items={dashboard?.notifications || []}
          unreadCount={metrics.notifications_unread || 0}
          onRead={async (id) => {
            await api.post(`/notifications/${id}/read`);
            load();
          }}
          onArchive={async (id) => {
            await api.post(`/notifications/${id}/archive`);
            load();
          }}
        />
        <ActivityFeed
          items={dashboard?.activity || []}
          level={activityLevel}
          onLevelChange={(value) => {
            setActivityPage(1);
            setActivityLevel(value);
          }}
          hasPrev={(dashboard?.activity_pagination?.page || 1) > 1}
          hasNext={(dashboard?.activity_pagination?.page || 1) < (dashboard?.activity_pagination?.pages || 1)}
          onPrevPage={() => setActivityPage((prev) => Math.max(prev - 1, 1))}
          onNextPage={() => setActivityPage((prev) => prev + 1)}
        />
      </div>
    </AppShell>
  );
}
