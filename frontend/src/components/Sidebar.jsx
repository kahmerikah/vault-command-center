import { NavLink } from "react-router-dom";

const links = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Financial OS", to: "/financial" },
  { label: "Property Intel", to: "/property" },
  { label: "PDA", to: "/pda" },
  { label: "Knowledge OS", to: "/knowledge" },
  { label: "Payments", to: "/payments" },
  { label: "Blockchain", to: "/blockchain" },
  { label: "Notifications", to: "/notifications" },
  { label: "Analytics", to: "/analytics" },
  { label: "Modules", to: "/modules" },
  { label: "Auth", to: "/auth" },
];

export default function Sidebar({ onNavigate }) {
  return (
    <aside className="w-full rounded-2xl border border-vault-accent/20 bg-vault-panel/70 p-4 backdrop-blur-sm lg:w-64">
      <h2 className="font-display text-lg tracking-[0.24em] text-vault-accent">SOMB OS</h2>
      <p className="mt-1 text-xs text-vault-textDim">Command Center</p>
      <nav className="mt-6 grid gap-2">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `rounded-lg border px-3 py-2 text-left text-sm transition ${
                isActive
                  ? "border-vault-accent/70 bg-vault-accent/10 text-white"
                  : "border-transparent bg-vault-bg/40 text-vault-text hover:border-vault-accent/40 hover:text-white"
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
