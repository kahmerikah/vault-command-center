import { useEffect, useState, useCallback } from "react";
import api, { setAuthToken } from "../lib/api";
import { useVaultStore } from "../store/useVaultStore";
import GlassPanel from "../components/GlassPanel";
import MetricCard from "../components/MetricCard";

const weatherIcon = (condition = "") => {
  const c = condition.toLowerCase();
  if (c.includes("sun") || c.includes("clear")) return "☀️";
  if (c.includes("cloud")) return "☁️";
  if (c.includes("rain")) return "🌧️";
  if (c.includes("snow")) return "❄️";
  if (c.includes("storm") || c.includes("thunder")) return "⛈️";
  return "🌡️";
};

export default function BriefingPage() {
  const { accessToken, clearAuth } = useVaultStore();
  const [morning, setMorning] = useState(null);
  const [night, setNight] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("morning");
  const [zip, setZip] = useState("90001");

  const loadBriefings = useCallback(async () => {
    if (!accessToken) return;
    setAuthToken(accessToken);
    setLoading(true);
    try {
      const [morningRes, nightRes, histRes] = await Promise.all([
        api.get(`/briefing/morning?zip=${zip}`),
        api.get("/briefing/night"),
        api.get("/briefing/history?limit=10"),
      ]);
      setMorning(morningRes.status === 'fulfilled' ? morningRes.value.data?.data : null);
      setNight(nightRes.status === 'fulfilled' ? nightRes.value.data?.data : null);
      setHistory(histRes.status === 'fulfilled' ? histRes.value.data?.data?.items || [] : []);
    } catch (err) {
      if (err?.response?.status === 401) clearAuth();
    } finally {
      setLoading(false);
    }
  }, [accessToken, clearAuth, zip]);

  useEffect(() => { loadBriefings(); }, [loadBriefings]);

  const current = activeTab === "morning" ? morning : night;

  if (loading) return <div className="flex items-center justify-center h-64 font-mono text-slate-400 text-xs tracking-widest">generating briefing...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg tracking-widest text-white uppercase">Daily Briefings</h1>
        <div className="flex items-center gap-2">
          <input type="text" value={zip} onChange={e => setZip(e.target.value)} placeholder="Zip"
            className="w-24 bg-black/30 border border-white/10 rounded px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-emerald-500/50" />
          <button type="button" onClick={loadBriefings} className="px-3 py-1.5 rounded-lg border border-white/10 text-white font-mono text-xs hover:bg-white/5 transition">
            Refresh
          </button>
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 border-b border-white/10">
        {["morning", "night", "history"].map(tab => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-mono text-xs tracking-widest uppercase transition ${activeTab === tab ? "text-white border-b-2 border-emerald-500" : "text-slate-500 hover:text-slate-300"}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Morning / Night briefing */}
      {(activeTab === "morning" || activeTab === "night") && current && (
        <div className="space-y-4">
          {/* Weather (morning only) */}
          {activeTab === "morning" && current.weather && !current.weather.error && (
            <GlassPanel>
              <div className="flex items-center gap-4">
                <span className="text-4xl">{weatherIcon(current.weather.condition)}</span>
                <div>
                  <p className="font-mono text-lg text-white">{current.weather.temp_f ? `${current.weather.temp_f}°F` : "—"}</p>
                  <p className="font-mono text-xs text-slate-400 capitalize">{current.weather.condition} · {current.weather.location}</p>
                  {current.weather.humidity && <p className="font-mono text-xs text-slate-500">Humidity: {current.weather.humidity}%</p>}
                </div>
              </div>
            </GlassPanel>
          )}

          {/* KPIs */}
          {activeTab === "morning" && current.system && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard label="Active Users" value={current.system.active_users ?? "—"} status="ok" />
              <MetricCard label="Unread Notifications" value={current.system.notifications_unread ?? 0} status={current.system.notifications_unread > 0 ? "warn" : "ok"} />
              <MetricCard label="API Calls" value={current.system.api_calls ?? "—"} status="ok" />
              <MetricCard label="Events Today" value={current.calendar?.length ?? 0} status={current.calendar?.length > 0 ? "ok" : "info"} />
            </div>
          )}
          {activeTab === "night" && current.spending_summary && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <MetricCard label="Revenue Today" value={`$${parseFloat(current.spending_summary.revenue_today || 0).toFixed(2)}`} status="ok" />
              <MetricCard label="Payments Today" value={current.spending_summary.total_payments_today ?? 0} status="ok" />
            </div>
          )}

          {/* Calendar (morning) */}
          {activeTab === "morning" && current.calendar?.length > 0 && (
            <GlassPanel>
              <p className="font-mono text-xs text-slate-500 mb-3 uppercase tracking-widest">Upcoming</p>
              <div className="divide-y divide-white/5">
                {current.calendar.map((ev, i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-mono text-xs text-white">{ev.module}</p>
                      <p className="font-mono text-xs text-slate-500">{new Date(ev.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <span className={`font-mono text-xs ${ev.status === "confirmed" ? "text-emerald-400" : "text-yellow-400"}`}>{ev.status}</span>
                  </div>
                ))}
              </div>
            </GlassPanel>
          )}

          {/* Priorities */}
          {current.priorities?.length > 0 && (
            <GlassPanel>
              <p className="font-mono text-xs text-slate-500 mb-3 uppercase tracking-widest">Priorities</p>
              <ul className="space-y-2">
                {current.priorities.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 font-mono text-xs text-slate-300">
                    <span className="text-emerald-500 mt-0.5">→</span> {p}
                  </li>
                ))}
              </ul>
            </GlassPanel>
          )}

          {/* Night: notifications */}
          {activeTab === "night" && current.notifications_today?.length > 0 && (
            <GlassPanel>
              <p className="font-mono text-xs text-slate-500 mb-3 uppercase tracking-widest">Today's Notifications</p>
              <div className="divide-y divide-white/5">
                {current.notifications_today.map((n, i) => (
                  <div key={i} className="py-2">
                    <p className="font-mono text-xs text-white">{n.title}</p>
                    <p className="font-mono text-xs text-slate-500">{n.body}</p>
                  </div>
                ))}
              </div>
            </GlassPanel>
          )}
        </div>
      )}

      {/* History */}
      {activeTab === "history" && (
        <GlassPanel>
          {history.length === 0 ? (
            <p className="text-center py-8 font-mono text-xs text-slate-500">No briefing history yet.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {history.map(log => (
                <div key={log.id} className="py-3">
                  <div className="flex justify-between items-center">
                    <span className={`font-mono text-xs uppercase tracking-widest ${log.kind === "morning" ? "text-yellow-400" : "text-slate-400"}`}>
                      {log.kind} briefing
                    </span>
                    <span className="font-mono text-xs text-slate-500">{log.created_at?.slice(0, 16)}</span>
                  </div>
                  <p className="font-mono text-xs text-slate-500 mt-1">Date: {log.payload?.date}</p>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      )}
    </div>
  );
}
