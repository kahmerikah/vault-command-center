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
  const [terminalCommands, setTerminalCommands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [opsNotice, setOpsNotice] = useState("");
  const [opsError, setOpsError] = useState("");

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
      const [overviewRes, modulesRes, healthRes, activityRes, terminalRes, commandRes] = await Promise.allSettled([
        api.get("/dashboard/overview"),
        api.get("/modules"),
        api.get("/health/system"),
        api.get("/gateway/activity", {
          params: {
            page: activityPage,
            limit: 10,
            level: activityLevel || undefined,
          },
        }),
        api.get("/ops/terminal/history", { params: { limit: 20 } }),
        api.get("/ops/terminal/commands"),
      ]);

      const overview = overviewRes.status === 'fulfilled' ? overviewRes.value.data?.data || {} : {};
      overview.activity = activityRes.status === 'fulfilled' ? activityRes.value.data?.data?.items || overview.activity || [] : overview.activity || [];
      overview.activity_pagination = activityRes.status === 'fulfilled' ? activityRes.value.data?.data?.pagination || null : null;

      setDashboard(overview);
      setModules(modulesRes.status === 'fulfilled' ? modulesRes.value.data?.data?.items || [] : []);
      setHealth(healthRes.status === 'fulfilled' ? healthRes.value.data?.data || null : null);

      setTerminalLines((terminalRes.status === 'fulfilled' ? terminalRes.value.data?.data?.items || [] : []).slice(0, 12).map((item) => {
        const stamp = new Date(item.created_at).toLocaleTimeString();
        return `[${item.level}] ${stamp} ${item.message}`;
      }));
      setTerminalCommands(commandRes.status === 'fulfilled' ? commandRes.value.data?.data?.items || [] : []);
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

    const useRealtime = import.meta.env.PROD;
    if (useRealtime) {
      connectSocket(accessToken);
      socket.emit("dashboard:subscribe", { stream: "main" });
    }

    const reload = () => load();
    const onActivity = (payload) => {
      setTerminalLines((prev) => [`[${payload.level || "info"}] ${payload.message}`, ...prev].slice(0, 10));
      reload();
    };
    const onTerminalLine = (payload) => {
      if (!payload?.line) {
        return;
      }
      setTerminalLines((prev) => [String(payload.line), ...prev].slice(0, 20));
    };

    if (useRealtime) {
      socket.on("notification:new", reload);
      socket.on("chain:transaction", reload);
      socket.on("booking:updated", reload);
      socket.on("activity:new", onActivity);
      socket.on("terminal:line", onTerminalLine);
    }

    const healthTimer = window.setInterval(async () => {
      try {
        const healthRes = await api.get("/health/system");
        setHealth(healthRes.data?.data || null);
      } catch {
        // Poll fallback should never crash the page.
      }
    }, 15000);

    return () => {
      if (useRealtime) {
        socket.off("notification:new", reload);
        socket.off("chain:transaction", reload);
        socket.off("booking:updated", reload);
        socket.off("activity:new", onActivity);
        socket.off("terminal:line", onTerminalLine);
      }
      window.clearInterval(healthTimer);
      if (useRealtime) {
        disconnectSocket();
      }
    };
  }, [accessToken, load]);

  const metrics = dashboard?.metrics || {};

  const metricCards = useMemo(
    () => [
      { label: "Uptime", value: `${Math.floor((metrics.uptime_seconds || 0) / 60)}m`, hint: "Backend runtime", to: "/dashboard", priority: "critical" },
      { label: "Notifications", value: metrics.notifications_unread, hint: "Unread alerts", tone: "danger", to: "/notifications", priority: "critical" },
      { label: "Payments", value: metrics.payments_total, hint: "Stripe transactions", to: "/payments", priority: "critical" },
      { label: "WS Clients", value: metrics.connected_clients, hint: "Realtime clients", to: "/dashboard", priority: "critical" },
      { label: "Sessions", value: metrics.sessions_total, hint: "Authenticated sessions", to: "/auth", priority: "operational" },
      { label: "Active Users", value: metrics.users_total, hint: "Active account count", to: "/auth", priority: "operational" },
      { label: "API Calls", value: metrics.api_calls_total, hint: "Captured traffic", to: "/analytics", priority: "operational" },
      { label: "PDA", value: metrics.bookings_total, hint: "Personal assistant layer", to: "/pda", priority: "operational" },
      { label: "Chain TX", value: metrics.chain_tx_total, hint: "Blockchain rail", tone: "warning", to: "/blockchain", priority: "reference" },
      { label: "Modules", value: metrics.module_count, hint: "Enabled modules", to: "/modules", priority: "reference" },
    ],
    [metrics]
  );

  const criticalCards = metricCards.filter((card) => card.priority === "critical");
  const operationalCards = metricCards.filter((card) => card.priority === "operational");
  const referenceCards = metricCards.filter((card) => card.priority === "reference");

  return (
    <AppShell user={user} onLogout={handleLogout} title="dashboard">
      {opsNotice ? <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{opsNotice}</div> : null}
      {opsError ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{opsError}</div> : null}

      <section>
        <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-vault-textDim">Tier 1 · Critical</div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {criticalCards.map((card) => (
            <button key={card.label} type="button" className="somb-action" onClick={() => navigate(card.to)}>
              <MetricCard label={card.label} value={loading ? "..." : card.value ?? "--"} hint={card.hint} tone={card.tone} priority={card.priority} />
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-vault-textDim">Tier 2 · Operational</div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {operationalCards.map((card) => (
            <button key={card.label} type="button" className="somb-action" onClick={() => navigate(card.to)}>
              <MetricCard label={card.label} value={loading ? "..." : card.value ?? "--"} hint={card.hint} tone={card.tone} priority={card.priority} />
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-vault-textDim">Tier 3 · Reference</div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
          {referenceCards.map((card) => (
            <button key={card.label} type="button" className="somb-action" onClick={() => navigate(card.to)}>
              <MetricCard label={card.label} value={loading ? "..." : card.value ?? "--"} hint={card.hint} tone={card.tone} priority={card.priority} />
            </button>
          ))}
        </div>
      </section>

      <RevenueChart data={dashboard?.revenue_trend || []} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ServerHealthCard status={health?.status || "degraded"} checks={health?.checks || {}} />
        <LiveTerminalCard
          lines={terminalLines}
          commands={terminalCommands}
          onDispatch={async (command) => {
            try {
              setOpsError("");
              const response = await api.post("/ops/terminal/dispatch", { command });
              const lines = response.data?.data?.lines || [];
              if (lines.length) {
                setTerminalLines((prev) => [...lines.map((line) => String(line)), ...prev].slice(0, 20));
              }
              setOpsNotice(`Command executed: ${command}`);
            } catch (error) {
              setOpsError(error?.response?.data?.error || "Terminal dispatch failed.");
            }
          }}
        />
      </div>

      <ModuleLauncher
        modules={modules}
        onLaunch={async (module) => {
          try {
            setOpsError("");
            await api.post(`/modules/${module.key}/launch`);
            setOpsNotice(`Module launched: ${module.name}`);
            const path = module.key === "blockchain" ? "/blockchain" : `/${module.key}`;
            navigate(path);
          } catch (error) {
            setOpsError(error?.response?.data?.error || "Module launch failed.");
          }
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
