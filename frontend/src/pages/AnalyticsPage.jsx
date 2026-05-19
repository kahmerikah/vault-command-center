import { useEffect, useMemo, useState } from "react";
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
      const [summaryRes, timelineRes] = await Promise.all([api.get("/analytics/summary"), api.get("/analytics/timeline")]);
      setSummary(summaryRes.data?.data || null);
      setTimeline(timelineRes.data?.data?.points || []);
    };

    if (accessToken) {
      load();
    }
  }, [accessToken]);

  const chartData = useMemo(() => timeline.map((point) => ({ date: point.date, amount: point.count })), [timeline]);

  return (
    <AppShell user={user} onLogout={handleLogout} title="analytics">
      <div className="grid gap-4 md:grid-cols-4">
        <GlassPanel title="Events"><div className="text-2xl">{summary?.events_total ?? "--"}</div></GlassPanel>
        <GlassPanel title="API Calls"><div className="text-2xl">{summary?.api_calls_total ?? "--"}</div></GlassPanel>
        <GlassPanel title="Active Sessions"><div className="text-2xl">{summary?.active_sessions ?? "--"}</div></GlassPanel>
        <GlassPanel title="Failed Auth"><div className="text-2xl">{summary?.failed_auth_total ?? "--"}</div></GlassPanel>
      </div>
      <GlassPanel title="API Usage Timeline" className="mt-4">
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
      </GlassPanel>
    </AppShell>
  );
}
