import GlassPanel from "./GlassPanel";

export default function ModuleLauncher({ modules = [] }) {
  return (
    <GlassPanel title="Module Quick Launch">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {modules.map((module) => (
          <button key={module.key} type="button" className="rounded-xl border border-vault-accent/30 bg-vault-bg/50 p-3 text-left transition hover:-translate-y-0.5 hover:border-vault-accent">
            <div className="text-sm font-semibold text-vault-text">{module.name}</div>
            <div className="mt-1 text-xs text-vault-textDim">{module.description || "No description"}</div>
          </button>
        ))}
      </div>
    </GlassPanel>
  );
}
