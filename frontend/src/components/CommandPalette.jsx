/**
 * CommandPalette — Global Cmd/Ctrl+K command overlay
 * Bloomberg-terminal OS feel: dark, monospace, fast.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import api from "../lib/api";
import { useOperationalStore } from "../store/useOperationalStore";

const STATIC_ACTIONS = [
  { kind: "action", id: "nav-dashboard",  title: "Go → Dashboard",       subtitle: "Core overview",            url: "/dashboard",   icon: "⌂" },
  { kind: "action", id: "nav-financial",  title: "Go → Financial OS",     subtitle: "Treasury & cashflow",      url: "/financial",   icon: "₿" },
  { kind: "action", id: "nav-pda",        title: "Go → PDA Mission Ctrl", subtitle: "Events, calendar, intel",  url: "/pda",         icon: "◈" },
  { kind: "action", id: "nav-property",   title: "Go → Property Intel",   subtitle: "Deal flow & analysis",     url: "/property",    icon: "⬡" },
  { kind: "action", id: "nav-knowledge",  title: "Go → Knowledge OS",     subtitle: "Notes, memory, research",  url: "/knowledge",   icon: "◎" },
  { kind: "action", id: "nav-blockchain", title: "Go → Blockchain",       subtitle: "Wallet & chain activity",  url: "/blockchain",  icon: "⛓" },
  { kind: "action", id: "nav-engine",     title: "Go → Engine Layer",     subtitle: "Shared runtime control",   url: "/engine",      icon: "⚙" },
  { kind: "action", id: "nav-analytics",  title: "Go → Analytics",        subtitle: "Metrics & performance",    url: "/analytics",   icon: "▲" },
  { kind: "action", id: "nav-bookings",   title: "Go → Bookings",         subtitle: "Events & schedule",        url: "/pda",         icon: "◷" },
  { kind: "action", id: "nav-modules",    title: "Go → Modules",          subtitle: "Infrastructure & modules", url: "/modules",     icon: "⊞" },
];

const KIND_COLORS = {
  action:      "text-vault-accent",
  property:    "text-emerald-400",
  knowledge:   "text-sky-400",
  contact:     "text-violet-400",
  transaction: "text-amber-400",
  event:       "text-rose-400",
};

const KIND_ICONS = {
  action:      "⚡",
  property:    "⬡",
  knowledge:   "◎",
  contact:     "◉",
  transaction: "₿",
  event:       "◷",
};

export default function CommandPalette() {
  const navigate = useNavigate();
  const { commandOpen, closeCommand, pushRecentlyViewed } = useOperationalStore();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Focus input when opened
  useEffect(() => {
    if (commandOpen) {
      setQuery("");
      setResults([]);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [commandOpen]);

  // Live search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get(`/os/search?q=${encodeURIComponent(query)}`);
        setResults(res.data?.data?.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
  }, [query]);

  const displayedItems = query.trim().length >= 2 ? results : STATIC_ACTIONS;

  const activate = useCallback(
    (item) => {
      if (!item) return;
      pushRecentlyViewed({ kind: item.kind, id: item.id, title: item.title, url: item.url });
      navigate(item.url);
      closeCommand();
    },
    [navigate, closeCommand, pushRecentlyViewed]
  );

  // Keyboard navigation
  useEffect(() => {
    if (!commandOpen) return;
    const onKey = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, displayedItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        activate(displayedItems[activeIdx]);
      } else if (e.key === "Escape") {
        closeCommand();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen, displayedItems, activeIdx, activate, closeCommand]);

  // Reset activeIdx when results change
  useEffect(() => setActiveIdx(0), [results]);

  return (
    <AnimatePresence>
      {commandOpen && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-start justify-center pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.target === e.currentTarget && closeCommand()}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

          {/* Panel */}
          <motion.div
            className="relative z-10 w-full max-w-2xl mx-4 rounded-2xl border border-vault-accent/30 bg-vault-panel/95 shadow-[0_0_60px_rgba(0,200,200,0.12)] backdrop-blur-xl overflow-hidden"
            initial={{ scale: 0.97, y: -12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.97, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-vault-accent/15">
              <span className="text-vault-accent font-mono text-sm select-none">⌘</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search everything — or press ↑↓ to navigate actions..."
                className="flex-1 bg-transparent font-mono text-sm text-vault-text placeholder-vault-textDim focus:outline-none"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              {loading && (
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-vault-textDim animate-pulse">
                  searching
                </span>
              )}
              <kbd className="hidden sm:inline-flex items-center rounded border border-vault-accent/20 bg-vault-bg/60 px-2 py-0.5 font-mono text-[10px] text-vault-textDim uppercase tracking-[0.14em]">
                ESC
              </kbd>
            </div>

            {/* Results list */}
            <ul className="max-h-[400px] overflow-y-auto py-2">
              {displayedItems.length === 0 && query.trim().length >= 2 && !loading && (
                <li className="px-5 py-8 text-center font-mono text-xs text-vault-textDim uppercase tracking-[0.2em]">
                  No results for "{query}"
                </li>
              )}
              {displayedItems.length === 0 && query.trim().length < 2 && (
                <li className="px-5 py-2 font-mono text-[10px] uppercase tracking-[0.24em] text-vault-textDim">
                  Quick actions
                </li>
              )}
              {displayedItems.map((item, idx) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => activate(item)}
                    className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                      idx === activeIdx
                        ? "bg-vault-accent/10 border-l-2 border-vault-accent"
                        : "border-l-2 border-transparent hover:bg-vault-bg/40"
                    }`}
                  >
                    <span
                      className={`w-7 h-7 flex items-center justify-center rounded-lg border border-vault-accent/20 bg-vault-bg/60 text-sm flex-shrink-0 ${KIND_COLORS[item.kind] || "text-vault-text"}`}
                    >
                      {KIND_ICONS[item.kind] || "·"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-vault-text truncate">{item.title}</p>
                      {item.subtitle && (
                        <p className="text-[11px] text-vault-textDim font-mono truncate mt-0.5">{item.subtitle}</p>
                      )}
                    </div>
                    <span className={`text-[10px] font-mono uppercase tracking-[0.18em] flex-shrink-0 ${KIND_COLORS[item.kind] || "text-vault-textDim"}`}>
                      {item.kind}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {/* Footer hint */}
            <div className="px-5 py-2.5 border-t border-vault-accent/10 flex items-center gap-4 bg-vault-bg/30">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-vault-textDim">
                <kbd className="border border-vault-accent/20 rounded px-1 mr-1">↑↓</kbd>navigate
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-vault-textDim">
                <kbd className="border border-vault-accent/20 rounded px-1 mr-1">↵</kbd>open
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-vault-textDim">
                <kbd className="border border-vault-accent/20 rounded px-1 mr-1">esc</kbd>close
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
