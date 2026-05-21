import { useEffect, useState } from "react";
import api, { setAuthToken } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import { useVaultStore } from "../store/useVaultStore";
import AppShell from "../components/AppShell";
import ModuleLauncher from "../components/ModuleLauncher";
import GlassPanel from "../components/GlassPanel";

export default function ModulesPage() {
  const { accessToken, refreshToken, user, clearAuth } = useVaultStore();
  const [modules, setModules] = useState([]);
  const [lastLaunch, setLastLaunch] = useState(null);
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

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError("");
      setAuthToken(accessToken);
      try {
        const res = await api.get("/modules");
        setModules(res.data?.data?.items || []);
      } catch (error) {
        setLoadError(error?.response?.data?.error || "Unable to load module registry.");
      } finally {
        setLoading(false);
      }
    };

    if (accessToken) {
      load();
    }
  }, [accessToken]);

  return (
    <AppShell user={user} onLogout={handleLogout} title="modules">
      {loadError ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{loadError}</div> : null}
      <ModuleLauncher
        modules={modules}
        onLaunch={async (module) => {
          try {
            const res = await api.post(`/modules/${module.key}/launch`);
            setLastLaunch(res.data?.data?.module || null);
          } catch (error) {
            setLoadError(error?.response?.data?.error || "Module launch failed.");
          }
        }}
      />
      <GlassPanel title="Registry" className="mt-4">
        <div className="space-y-2 text-sm">
          {loading ? <div className="text-vault-textDim">Loading module registry...</div> : null}
          {modules.map((module) => (
            <div key={module.key} className="grid grid-cols-4 gap-2 rounded border border-vault-accent/20 px-3 py-2">
              <span>{module.name}</span>
              <span>{module.key}</span>
              <span>{module.route_prefix}</span>
              <span>{module.is_enabled ? "enabled" : "disabled"}</span>
            </div>
          ))}
          {!loading && modules.length === 0 && (
            <div className="somb-empty-state text-vault-textDim">
              <p className="text-vault-text">No registered modules.</p>
              <p className="mt-1 text-xs">Module registry service is reachable but no modules are enabled for this environment.</p>
            </div>
          )}
        </div>
      </GlassPanel>
      {lastLaunch && (
        <GlassPanel title="Last Launch" className="mt-4">
          <div className="text-sm text-vault-text">{lastLaunch.name} launched via {lastLaunch.route_prefix}</div>
          <div className="mt-1 text-xs text-vault-textDim">Operational acknowledgement recorded. Continue in the module workspace.</div>
        </GlassPanel>
      )}
    </AppShell>
  );
}
