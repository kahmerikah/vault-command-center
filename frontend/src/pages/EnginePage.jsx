import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import GlassPanel from "../components/GlassPanel";
import api, { setAuthToken } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import { useVaultStore } from "../store/useVaultStore";

export default function EnginePage() {
  const navigate = useNavigate();
  const { user, refreshToken, clearAuth } = useVaultStore();
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState(null);
  const [modules, setModules] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [events, setEvents] = useState([]);
  const [context, setContext] = useState(null);

  const handleLogout = async () => {
    try {
      if (refreshToken) {
        await api.post("/auth/logout", {}, { headers: { Authorization: `Bearer ${refreshToken}` } });
      }
    } catch {
      // Keep logout resilient.
    } finally {
      clearAuth();
      setAuthToken("");
      disconnectSocket();
      navigate("/login");
    }
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const [healthRes, modulesRes, workflowsRes, eventsRes, contextRes] = await Promise.all([
          api.get("/engine/health"),
          api.get("/engine/modules"),
          api.get("/engine/workflows"),
          api.get("/engine/events?limit=20"),
          api.get("/engine/context"),
        ]);

        if (!mounted) return;
        setHealth(healthRes.data?.data || null);
        setModules(modulesRes.data?.data?.items || []);
        setWorkflows(workflowsRes.data?.data?.items || []);
        setEvents(eventsRes.data?.data?.items || []);
        setContext(contextRes.data?.data || null);
      } catch {
        if (mounted) {
          setHealth({ engine: "offline" });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <AppShell user={user} onLogout={handleLogout} title="engine">
      <div className="grid gap-4 xl:grid-cols-3">
        <GlassPanel title="Runtime Health">
          <div className="space-y-2 text-sm">
            <p>Status: <span className="text-vault-accent">{health?.engine || (loading ? "loading" : "offline")}</span></p>
            <p>Modules: <span className="text-white">{health?.registered_modules ?? modules.length}</span></p>
            <p>Events: <span className="text-white">{health?.engine_events ?? events.length}</span></p>
            <p>Workflows: <span className="text-white">{health?.workflow_definitions ?? workflows.length}</span></p>
            <p>Runs: <span className="text-white">{health?.workflow_runs ?? 0}</span></p>
          </div>
        </GlassPanel>

        <GlassPanel title="Shared Context">
          {context ? (
            <div className="space-y-2 text-sm">
              <p className="text-vault-textDim">Active user</p>
              <p>{context.active_user?.username || "Guest"}</p>
              <p className="text-vault-textDim">Membership</p>
              <p>{context.active_membership?.tier || "free"}</p>
              <p className="text-vault-textDim">Tasks</p>
              <p>{context.active_tasks?.length || 0}</p>
              <p className="text-vault-textDim">Notifications</p>
              <p>{context.notifications?.length || 0}</p>
            </div>
          ) : (
            <div className="text-sm text-vault-textDim">Loading shared context...</div>
          )}
        </GlassPanel>

        <GlassPanel title="Module Registry">
          <div className="space-y-2 text-sm max-h-[260px] overflow-y-auto pr-1">
            {modules.map((module) => (
              <div key={module.key} className="rounded border border-vault-accent/15 bg-vault-bg/30 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span>{module.name}</span>
                  <span className="text-xs text-vault-textDim">{module.route_prefix}</span>
                </div>
                <div className="mt-1 text-xs text-vault-textDim">{module.description}</div>
              </div>
            ))}
            {!loading && modules.length === 0 && <p className="text-vault-textDim">No modules registered.</p>}
          </div>
        </GlassPanel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <GlassPanel title="Workflows">
          <div className="space-y-2 text-sm max-h-[280px] overflow-y-auto pr-1">
            {workflows.map((workflow) => (
              <div key={workflow.id} className="rounded border border-vault-accent/15 bg-vault-bg/30 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span>{workflow.name}</span>
                  <span className="text-xs text-vault-textDim">{workflow.trigger_event}</span>
                </div>
                <div className="mt-1 text-xs text-vault-textDim">{workflow.description || workflow.key}</div>
              </div>
            ))}
            {!loading && workflows.length === 0 && <p className="text-vault-textDim">No workflows registered yet.</p>}
          </div>
        </GlassPanel>

        <GlassPanel title="Recent Engine Events">
          <div className="space-y-2 text-sm max-h-[280px] overflow-y-auto pr-1 font-mono">
            {events.map((event) => (
              <div key={event.id} className="rounded border border-vault-accent/15 bg-vault-bg/30 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-[0.18em] text-vault-textDim">
                  <span>{event.event_name}</span>
                  <span>{event.source_module || "engine"}</span>
                </div>
                <div className="mt-1 text-xs text-vault-textDim break-all">{event.correlation_id}</div>
              </div>
            ))}
            {!loading && events.length === 0 && <p className="text-vault-textDim">No engine events recorded.</p>}
          </div>
        </GlassPanel>
      </div>
    </AppShell>
  );
}