import GlassPanel from "./GlassPanel";

export default function ActivityFeed({ items = [], level = "", onLevelChange, onNextPage, onPrevPage, hasNext, hasPrev }) {
  return (
    <GlassPanel title="Activity Feed">
      <div className="mb-3 flex items-center gap-2">
        <select
          value={level}
          onChange={(event) => onLevelChange?.(event.target.value)}
          className="h-9 rounded-md border border-vault-accent/30 bg-vault-bg/60 px-3 py-1 text-xs text-vault-text"
        >
          <option value="">All levels</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
        </select>
        <button
          type="button"
          onClick={onPrevPage}
          disabled={!hasPrev}
          className="h-9 rounded-md border border-vault-accent/30 px-3 py-1 text-xs disabled:opacity-40"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={onNextPage}
          disabled={!hasNext}
          className="h-9 rounded-md border border-vault-accent/30 px-3 py-1 text-xs disabled:opacity-40"
        >
          Next
        </button>
      </div>
      <div className="space-y-3">
        {items.length === 0 && (
          <div className="somb-empty-state">
            <p className="text-sm text-vault-text">No activity captured yet.</p>
            <p className="mt-1 text-xs text-vault-textDim">Run a terminal command, launch a module, or refresh system checks to generate operational events.</p>
          </div>
        )}
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
