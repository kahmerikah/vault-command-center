import GlassPanel from "./GlassPanel";

export default function ActivityFeed({ items = [] }) {
  return (
    <GlassPanel title="Activity Feed">
      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-vault-textDim">No activity yet.</p>}
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-700/70 bg-vault-bg/50 px-3 py-2">
            <div className="text-sm text-vault-text">{item.message}</div>
            <div className="text-xs text-vault-textDim">{new Date(item.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}
