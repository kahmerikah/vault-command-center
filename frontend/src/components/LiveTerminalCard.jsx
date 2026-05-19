import GlassPanel from "./GlassPanel";
import { useState } from "react";

export default function LiveTerminalCard({ lines = [], commands = [], onDispatch }) {
  const [command, setCommand] = useState("");

  return (
    <GlassPanel title="Vault Terminal">
      <div className="mb-2 flex gap-2">
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="type command (e.g. status)"
          className="w-full rounded border border-vault-accent/30 bg-black/50 px-2 py-1 text-xs text-vault-text"
        />
        <button
          type="button"
          onClick={() => {
            const trimmed = command.trim();
            if (!trimmed) {
              return;
            }
            onDispatch?.(trimmed);
            setCommand("");
          }}
          className="rounded border border-vault-accent/30 px-2 py-1 text-xs"
        >
          Run
        </button>
      </div>
      {commands.length > 0 && (
        <div className="mb-2 text-[11px] text-vault-textDim">Available: {commands.join(", ")}</div>
      )}
      <pre className="overflow-x-auto rounded-lg border border-slate-700/80 bg-black/60 p-3 text-xs text-emerald-300">
{(lines.length ? lines : ["[info] awaiting operational events..."]).join("\n")}
      </pre>
    </GlassPanel>
  );
}
