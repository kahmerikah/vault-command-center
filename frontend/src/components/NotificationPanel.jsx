import GlassPanel from "./GlassPanel";

export default function NotificationPanel({ items = [] }) {
  return (
    <GlassPanel title="Live Notifications">
      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-vault-textDim">No notifications yet.</p>}
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-700/70 bg-vault-bg/50 px-3 py-2">
            <div className="text-sm font-semibold text-vault-text">{item.title}</div>
            <div className="text-sm text-vault-textDim">{item.body}</div>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}