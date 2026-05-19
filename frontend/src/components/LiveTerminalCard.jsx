import GlassPanel from "./GlassPanel";

export default function LiveTerminalCard({ lines = [] }) {
  return (
    <GlassPanel title="Vault Terminal">
      <pre className="overflow-x-auto rounded-lg border border-slate-700/80 bg-black/60 p-3 text-xs text-emerald-300">
{(lines.length ? lines : ["[info] awaiting operational events..."]).join("\n")}
      </pre>
    </GlassPanel>
  );
}
