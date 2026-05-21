import GlassPanel from "./GlassPanel";
import { useState } from "react";

export default function LiveTerminalCard({ lines = [], commands = [], onDispatch }) {
  const [command, setCommand] = useState("");
  const [status, setStatus] = useState("");
  const [dispatching, setDispatching] = useState(false);

  const runCommand = async () => {
    const trimmed = command.trim();
    if (!trimmed || dispatching) {
      return;
    }
    try {
      setDispatching(true);
      setStatus("dispatching command...");
      await onDispatch?.(trimmed);
      setStatus("command complete");
      setCommand("");
    } catch {
      setStatus("command failed");
    } finally {
      setDispatching(false);
    }
  };

  return (
    <GlassPanel title="Vault Terminal">
      <div className="mb-2 flex gap-2">
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="type command (e.g. status)"
          className="h-9 w-full rounded border border-vault-accent/30 bg-black/50 px-3 py-1 text-xs text-vault-text"
        />
        <button
          type="button"
          onClick={runCommand}
          disabled={dispatching}
          className="h-9 rounded border border-vault-accent/30 px-3 py-1 text-xs disabled:opacity-50"
        >
          {dispatching ? "Running..." : "Run"}
        </button>
      </div>
      {status ? <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-vault-textDim">{status}</div> : null}
      {commands.length > 0 && (
        <div className="mb-2 text-[11px] text-vault-textDim">Available: {commands.join(", ")}</div>
      )}
      <pre className="overflow-x-auto rounded-lg border border-slate-700/80 bg-black/60 p-3 text-xs text-emerald-300">
{(lines.length ? lines : ["[info] awaiting operational events..."]).join("\n")}
      </pre>
    </GlassPanel>
  );
}
