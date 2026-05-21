import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api, { setAuthToken } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import { useVaultStore } from "../store/useVaultStore";
import AppShell from "../components/AppShell";
import GlassPanel from "../components/GlassPanel";

export default function AnalyticsPage() {
  const { accessToken, refreshToken, user, clearAuth } = useVaultStore();
  const [summary, setSummary] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [activity, setActivity] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

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

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    setAuthToken(accessToken);
    const [summaryRes, timelineRes, activityRes, healthRes] = await Promise.allSettled([
      api.get("/analytics/summary"),
      api.get("/analytics/timeline"),
      api.get("/gateway/activity", { params: { limit: 40 } }),
      api.get("/health/system"),
    ]);

    setSummary(summaryRes.status === "fulfilled" ? summaryRes.value.data?.data || null : null);
    setTimeline(timelineRes.status === "fulfilled" ? timelineRes.value.data?.data?.points || [] : []);
    setActivity(activityRes.status === "fulfilled" ? activityRes.value.data?.data?.items || [] : []);
    setHealth(healthRes.status === "fulfilled" ? healthRes.value.data?.data || null : null);

    if ([summaryRes, timelineRes, activityRes, healthRes].some((res) => res.status === "rejected")) {
      setError("Some telemetry streams are unavailable. Showing partial command context.");
    }

    setLoading(false);
    setLastUpdated(new Date());
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!accessToken) return undefined;
    const timer = window.setInterval(load, 45000);
    return () => window.clearInterval(timer);
  }, [accessToken, load]);

  const chartData = useMemo(() => timeline.map((point) => ({ date: point.date, amount: point.count })), [timeline]);
  const recent = chartData[chartData.length - 1]?.amount || 0;
  const previous = chartData[chartData.length - 2]?.amount || 0;
  const deltaPct = previous > 0 ? Math.round(((recent - previous) / previous) * 100) : 0;

  const anomalies = useMemo(() => {
    const next = [];
    if ((summary?.failed_auth_total || 0) > 0) {
      next.push(`Failed authentication events detected: ${summary.failed_auth_total}`);
    }
    if (health?.status && health.status !== "ok") {
      next.push(`System health degraded: ${health.status}`);
    }
    if (Math.abs(deltaPct) >= 50 && chartData.length > 1) {
      next.push(`API activity shifted ${deltaPct > 0 ? "+" : ""}${deltaPct}% compared to previous interval.`);
    }
    return next;
  }, [summary, health, deltaPct, chartData.length]);

  return (
    <AppShell user={user} onLogout={handleLogout} title="analytics">
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          <GlassPanel title="Events"><div className="text-2xl">{summary?.events_total ?? "--"}</div></GlassPanel>
          <GlassPanel title="API Calls"><div className="text-2xl">{summary?.api_calls_total ?? "--"}</div></GlassPanel>
          <GlassPanel title="Active Sessions"><div className="text-2xl">{summary?.active_sessions ?? "--"}</div></GlassPanel>
          <GlassPanel title="Failed Auth"><div className="text-2xl">{summary?.failed_auth_total ?? "--"}</div></GlassPanel>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <GlassPanel title="API Usage Timeline">
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="text-vault-textDim">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "No refresh yet"}</span>
              <button type="button" onClick={load} className="rounded border border-vault-accent/30 px-2 py-1 uppercase tracking-[0.16em]">
                Refresh
              </button>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="usage" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                  <Area type="monotone" dataKey="amount" stroke="#34d399" fill="url(#usage)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-xs text-vault-textDim">
              Recent interval: {recent} calls ({deltaPct > 0 ? "+" : ""}{deltaPct}% vs prior)
            </div>
          </GlassPanel>

          <div className="space-y-4">
            <GlassPanel title="Operational State">
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-vault-textDim">System</span>
                  <span className={health?.status === "ok" ? "text-emerald-300" : "text-amber-300"}>{health?.status || "unknown"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-vault-textDim">Redis</span>
                  <span className={health?.checks?.redis ? "text-emerald-300" : "text-amber-300"}>{health?.checks?.redis ? "online" : "offline"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-vault-textDim">Database</span>
                  <span className={health?.checks?.database ? "text-emerald-300" : "text-amber-300"}>{health?.checks?.database ? "online" : "offline"}</span>
                </div>
              </div>
            </GlassPanel>

            <GlassPanel title="Anomaly Queue">
              <div className="space-y-1 text-xs">
                {anomalies.map((item) => (
                  <div key={item} className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-200">{item}</div>
                ))}
                {anomalies.length === 0 ? <div className="somb-empty-state text-vault-textDim">No anomaly signals detected.</div> : null}
              </div>
            </GlassPanel>
          </div>
        </div>

        <GlassPanel title="Recent Gateway Activity">
          <div className="max-h-64 space-y-1.5 overflow-auto text-xs">
            {activity.slice(0, 16).map((item) => (
              <div key={item.id} className="rounded border border-vault-accent/20 bg-black/20 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-vault-text">{item.message || item.route || "activity"}</span>
                  <span className="text-vault-textDim">{item.level || item.status || "info"}</span>
                </div>
                <p className="text-[10px] text-vault-textDim">{item.created_at ? new Date(item.created_at).toLocaleString() : "just now"}</p>
              </div>
            ))}
            {activity.length === 0 ? <div className="somb-empty-state text-vault-textDim">No recent gateway events.</div> : null}
          </div>
        </GlassPanel>

        {loading ? <div className="rounded border border-vault-accent/20 bg-vault-bg/50 px-3 py-2 text-xs text-vault-textDim">Refreshing operational telemetry...</div> : null}
        {error ? <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{error}</div> : null}
      </div>
    </AppShell>
  );
}
