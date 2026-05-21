import GlassPanel from "./GlassPanel";

export default function NotificationPanel({ items = [], unreadCount = 0, onRead, onArchive }) {
  return (
    <GlassPanel title={`Live Notifications (${unreadCount})`}>
      <div className="space-y-3">
        {items.length === 0 && (
          <div className="somb-empty-state">
            <p className="text-sm text-vault-text">No notifications yet.</p>
            <p className="mt-1 text-xs text-vault-textDim">Alerts will appear here when payments fail, modules change status, or system checks degrade.</p>
          </div>
        )}
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-700/70 bg-vault-bg/50 px-3 py-2">
            <div className="text-sm font-semibold text-vault-text">{item.title}</div>
            <div className="text-sm text-vault-textDim">{item.body}</div>
            <div className="mt-2 flex gap-2 text-xs">
              {!item.is_read && (
                <button type="button" onClick={() => onRead?.(item.id)} className="h-9 rounded border border-vault-accent/30 px-3 py-1">
                  Mark read
                </button>
              )}
              {item.status !== "archived" && (
                <button type="button" onClick={() => onArchive?.(item.id)} className="h-9 rounded border border-vault-accent/30 px-3 py-1">
                  Archive
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}