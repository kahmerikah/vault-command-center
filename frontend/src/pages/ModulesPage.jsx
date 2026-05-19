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
      const res = await api.get("/modules");
      setModules(res.data?.data?.items || []);
    };

    if (accessToken) {
      load();
    }
  }, [accessToken]);

  return (
    <AppShell user={user} onLogout={handleLogout} title="modules">
      <ModuleLauncher
        modules={modules}
        onLaunch={async (module) => {
          const res = await api.post(`/modules/${module.key}/launch`);
          setLastLaunch(res.data?.data?.module || null);
        }}
      />
      <GlassPanel title="Registry" className="mt-4">
        <div className="space-y-2 text-sm">
          {modules.map((module) => (
            <div key={module.key} className="grid grid-cols-4 gap-2 rounded border border-vault-accent/20 px-3 py-2">
              <span>{module.name}</span>
              <span>{module.key}</span>
              <span>{module.route_prefix}</span>
              <span>{module.is_enabled ? "enabled" : "disabled"}</span>
            </div>
          ))}
          {modules.length === 0 && <div className="text-vault-textDim">No registered modules.</div>}
        </div>
      </GlassPanel>
      {lastLaunch && (
        <GlassPanel title="Last Launch" className="mt-4">
          <div className="text-sm text-vault-text">{lastLaunch.name} launched via {lastLaunch.route_prefix}</div>
        </GlassPanel>
      )}
    </AppShell>
  );
}
