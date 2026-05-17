export default function Topbar({ user }) {
  return (
    <header className="flex flex-col justify-between gap-3 rounded-2xl border border-vault-accent/20 bg-vault-panel/50 p-4 backdrop-blur-sm md:flex-row md:items-center">
      <div>
        <p className="font-display text-xs uppercase tracking-[0.22em] text-vault-accent">The SOMB Vault</p>
        <h1 className="mt-1 text-2xl font-display text-vault-text">Luxury Hacker Command Center</h1>
      </div>
      <div className="rounded-xl border border-vault-accent/30 bg-vault-bg/60 px-3 py-2 text-sm text-vault-textDim">
        Operator: <span className="text-vault-text">{user?.username || "Guest"}</span>
      </div>
    </header>
  );
}
