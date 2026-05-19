import { useState } from "react";
import api from "../lib/api";

export default function SettingsModal({ open, onClose }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  if (!open) return null;

  const runPullAndSync = async () => {
    setRunning(true);
    setError("");
    try {
      const res = await api.post("/ops/system/pull-and-sync", {});
      setResult(res.data?.data || null);
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to pull and sync system settings");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-vault-accent/30 bg-vault-panel p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg text-white tracking-[0.15em] uppercase">System Settings</h2>
          <button type="button" onClick={onClose} className="text-vault-textDim hover:text-white text-sm">Close</button>
        </div>

        <div className="rounded-xl border border-vault-accent/20 bg-vault-bg/50 p-4 space-y-3">
          <p className="text-sm text-vault-textDim">
            Pull latest code from GitHub, then sync .env keys from .env.example while preserving existing server values.
          </p>
          <button
            type="button"
            onClick={runPullAndSync}
            disabled={running}
            className="rounded-lg border border-vault-accent/40 bg-vault-accent/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-vault-text disabled:opacity-50"
          >
            {running ? "Running..." : "Pull From GitHub + Sync Env Keys"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {result && (
            <div className="space-y-2 text-xs text-vault-textDim">
              <p>Head: <span className="text-vault-text">{result.git?.head || "unknown"}</span></p>
              <p>Git pull: <span className="text-vault-text">{result.git?.pull_ok ? "ok" : "failed"}</span></p>
              <p>Added env keys: <span className="text-vault-text">{(result.env_sync?.added_keys || []).join(", ") || "none"}</span></p>
              <p>Preserved extra keys: <span className="text-vault-text">{(result.env_sync?.preserved_extra_keys || []).length}</span></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
