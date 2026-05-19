import GlassPanel from "./GlassPanel";

export default function ServerHealthCard({ status = "Operational", checks = {} }) {
  return (
    <GlassPanel title="Server Health">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-vault-textDim">Core systems</span>
        <span className={`rounded-full border px-3 py-1 text-xs ${status === "ok" ? "border-vault-signal/40 bg-vault-signal/10 text-vault-signal" : "border-vault-warning/40 bg-vault-warning/10 text-vault-warning"}`}>
          {status}
        </span>
      </div>
      <div className="space-y-1 text-xs text-vault-textDim">
        <div>DB: {checks.database ? "ok" : "down"}</div>
        <div>Redis: {checks.redis ? "ok" : "down"}</div>
        <div>WS clients: {checks.websocket?.connected_clients ?? 0}</div>
      </div>
    </GlassPanel>
  );
}
