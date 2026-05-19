export default function Topbar({ user, onLogout, title = "dashboard", onToggleSidebar }) {
  return (
    <header className="flex flex-col justify-between gap-3 rounded-2xl border border-vault-accent/20 bg-vault-panel/50 p-4 backdrop-blur-sm md:flex-row md:items-center">
      <div>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="mb-2 rounded-lg border border-vault-accent/30 bg-vault-bg/60 px-2 py-1 text-xs uppercase tracking-[0.2em] text-vault-textDim lg:hidden"
        >
          Menu
        </button>
        <p className="font-display text-xs uppercase tracking-[0.22em] text-vault-accent">SOMB Vault</p>
        <h1 className="mt-1 text-2xl font-display text-vault-text">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-vault-accent/30 bg-vault-bg/60 px-3 py-2 text-sm text-vault-textDim">
          User: <span className="text-vault-text">{user?.username || "Guest"}</span>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-xl border border-vault-accent/30 bg-vault-bg/60 px-3 py-2 text-xs uppercase tracking-[0.2em] text-vault-textDim hover:text-white"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
