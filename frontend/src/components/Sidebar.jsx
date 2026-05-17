const links = [
  "Dashboard",
  "Auth",
  "Payments",
  "Bookings",
  "Blockchain",
  "Notifications",
  "Analytics",
  "Modules",
];

export default function Sidebar() {
  return (
    <aside className="w-full rounded-2xl border border-vault-accent/20 bg-vault-panel/70 p-4 backdrop-blur-sm lg:w-64">
      <h2 className="font-display text-lg tracking-[0.24em] text-vault-accent">SOMB OS</h2>
      <p className="mt-1 text-xs text-vault-textDim">Command Center</p>
      <nav className="mt-6 grid gap-2">
        {links.map((link) => (
          <button key={link} type="button" className="rounded-lg border border-transparent bg-vault-bg/40 px-3 py-2 text-left text-sm text-vault-text hover:border-vault-accent/40 hover:text-white">
            {link}
          </button>
        ))}
      </nav>
    </aside>
  );
}
