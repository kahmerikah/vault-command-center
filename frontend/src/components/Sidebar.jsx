import { NavLink, useNavigate } from "react-router-dom";
import { useOperationalStore } from "../store/useOperationalStore";

const NAV_GROUPS = [
  {
    group: "Core",
    links: [
      { label: "Dashboard",      to: "/dashboard",   hotkey: "D",  icon: "⌂" },
      { label: "Financial OS",   to: "/financial",   hotkey: "F",  icon: "₿" },
      { label: "PDA",            to: "/pda",         hotkey: "P",  icon: "◈" },
    ],
  },
  {
    group: "Operations",
    links: [
      { label: "Property Intel", to: "/property",    hotkey: "R",  icon: "⬡" },
      { label: "Knowledge OS",   to: "/knowledge",   hotkey: "K",  icon: "◎" },
      { label: "Analytics",      to: "/analytics",   hotkey: "A",  icon: "▲" },
      { label: "Notifications",  to: "/notifications", hotkey: null, icon: "◯" },
      { label: "Payments",       to: "/payments",    hotkey: null, icon: "⊕" },
    ],
  },
  {
    group: "Infrastructure",
    links: [
      { label: "Blockchain",     to: "/blockchain",  hotkey: "B",  icon: "⛓" },
      { label: "Modules",        to: "/modules",     hotkey: "M",  icon: "⊞" },
    ],
  },
];

const TIER_STYLES = {
  free:      "border-vault-accent/20 text-vault-textDim",
  founder:   "border-sky-500/40 text-sky-400",
  operator:  "border-emerald-500/40 text-emerald-400",
  executive: "border-amber-400/50 text-amber-300",
};

export default function Sidebar({ onNavigate }) {
  const navigate = useNavigate();
  const { openCommand, membership, context } = useOperationalStore();

  const tier = membership?.tier || "free";
  const tierStyle = TIER_STYLES[tier] || TIER_STYLES.free;

  return (
    <aside className="w-full rounded-2xl border border-vault-accent/20 bg-vault-panel/70 p-4 backdrop-blur-sm lg:w-64 flex flex-col gap-4">
      {/* OS Identity */}
      <div>
        <h2 className="font-display text-lg tracking-[0.24em] text-vault-accent">SOMB OS</h2>
        <p className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-vault-textDim">Command Center</p>
      </div>

      {/* Membership badge */}
      <div className={`flex items-center justify-between rounded-xl border px-3 py-2 ${tierStyle} bg-vault-bg/30`}>
        <span className="font-mono text-[10px] uppercase tracking-[0.24em]">
          {membership?.display_name || "Operator"}
        </span>
        <span className={`font-mono text-[9px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-md border ${tierStyle} bg-vault-bg/40`}>
          {tier}
        </span>
      </div>

      {/* Command search shortcut */}
      <button
        type="button"
        onClick={openCommand}
        className="flex items-center gap-2 rounded-xl border border-vault-accent/20 bg-vault-bg/40 px-3 py-2.5 text-left text-xs text-vault-textDim hover:text-white hover:border-vault-accent/50 transition-colors"
      >
        <span className="text-vault-accent">⌘</span>
        <span className="flex-1 font-mono uppercase tracking-[0.16em]">Command</span>
        <kbd className="font-mono text-[9px] border border-vault-accent/20 rounded px-1 uppercase tracking-[0.1em] text-vault-textDim">
          ⌘K
        </kbd>
      </button>

      {/* Navigation */}
      <nav className="space-y-4">
        {NAV_GROUPS.map((section) => (
          <div key={section.group}>
            <p className="mb-2 text-[9px] uppercase tracking-[0.28em] text-vault-textDim">{section.group}</p>
            <div className="grid gap-1">
              {section.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `somb-nav-link flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                      isActive
                        ? "border-vault-accent/60 bg-vault-accent/10 text-white"
                        : "border-transparent bg-vault-bg/30 text-vault-text hover:border-vault-accent/30 hover:bg-vault-bg/60 hover:text-white"
                    }`
                  }
                >
                  <span className="text-vault-accent/60 text-sm w-4 flex-shrink-0">{link.icon}</span>
                  <span className="flex-1">{link.label}</span>
                  {link.to === "/notifications" && (context.unread_notifications ?? 0) > 0 && (
                    <span className="rounded-full bg-vault-accent/80 px-1.5 py-0.5 font-mono text-[9px] text-vault-bg font-bold">
                      {context.unread_notifications}
                    </span>
                  )}
                  {link.hotkey && (
                    <kbd className="hidden lg:inline font-mono text-[8px] uppercase border border-vault-accent/15 rounded px-1 text-vault-textDim">
                      g+{link.hotkey.toLowerCase()}
                    </kbd>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Recent activity micro-feed */}
      {(context.recent_activity?.length ?? 0) > 0 && (
        <div className="mt-auto pt-3 border-t border-vault-accent/10">
          <p className="mb-2 text-[9px] uppercase tracking-[0.28em] text-vault-textDim">Recent</p>
          <div className="space-y-1.5">
            {context.recent_activity.slice(0, 3).map((a) => (
              <p key={a.id} className="text-[10px] text-vault-textDim font-mono truncate leading-relaxed">
                · {a.message}
              </p>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

