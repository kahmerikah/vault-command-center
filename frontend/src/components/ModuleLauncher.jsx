import GlassPanel from "./GlassPanel";

export default function ModuleLauncher({ modules = [], onLaunch }) {
  return (
    <GlassPanel title="Module Quick Launch">
      <p className="mb-3 text-xs text-vault-textDim">Launches trigger backend module hooks and route handoff.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {modules.map((module) => (
          <button
            key={module.key}
            type="button"
            onClick={() => onLaunch?.(module)}
            className="somb-action rounded-xl border border-vault-accent/30 bg-vault-bg/50 p-3 text-left transition hover:-translate-y-0.5 hover:border-vault-accent hover:bg-vault-bg/80"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-vault-text">{module.name}</div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-vault-textDim">Launch</span>
            </div>
            <div className="mt-1 text-xs text-vault-textDim">{module.description || "No description"}</div>
          </button>
        ))}
      </div>
    </GlassPanel>
  );
}
