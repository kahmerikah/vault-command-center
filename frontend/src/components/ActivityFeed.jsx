import GlassPanel from "./GlassPanel";

export default function ActivityFeed({ items = [], level = "", onLevelChange, onNextPage, onPrevPage, hasNext, hasPrev }) {
  return (
    <GlassPanel title="Activity Feed">
      <div className="mb-3 flex items-center gap-2">
        <select
          value={level}
          onChange={(event) => onLevelChange?.(event.target.value)}
          className="rounded-md border border-vault-accent/30 bg-vault-bg/60 px-2 py-1 text-xs text-vault-text"
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
          className="rounded-md border border-vault-accent/30 px-2 py-1 text-xs disabled:opacity-40"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={onNextPage}
          disabled={!hasNext}
          className="rounded-md border border-vault-accent/30 px-2 py-1 text-xs disabled:opacity-40"
        >
          Next
        </button>
      </div>
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
