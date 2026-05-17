import GlassPanel from "./GlassPanel";

export default function ServerHealthCard({ status = "Operational" }) {
  return (
    <GlassPanel title="Server Health">
      <div className="flex items-center justify-between">
        <span className="text-sm text-vault-textDim">Core systems</span>
        <span className="rounded-full border border-vault-signal/40 bg-vault-signal/10 px-3 py-1 text-xs text-vault-signal">
          {status}
        </span>
      </div>
    </GlassPanel>
  );
}
