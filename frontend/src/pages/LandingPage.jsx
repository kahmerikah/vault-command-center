import { motion } from "framer-motion";

export default function LandingPage({ onEnter }) {
  const systemBlocks = [
    { label: "AUTH", value: "LIVE", tone: "text-emerald-300" },
    { label: "CHAIN", value: "SYNCED", tone: "text-cyan-300" },
    { label: "PAYMENTS", value: "ROUTED", tone: "text-amber-300" },
    { label: "NOTIFY", value: "ARMED", tone: "text-rose-300" },
  ];

  const navItems = ["Vault OS", "Modules", "Telemetry", "Access"];

  return (
    <main className="somb-landing relative min-h-screen overflow-hidden bg-[#07090d] px-4 py-5 text-vault-text sm:px-6 lg:px-8 lg:py-8">
      <div className="somb-landing__ambient somb-landing__ambient--left" aria-hidden="true" />
      <div className="somb-landing__ambient somb-landing__ambient--right" aria-hidden="true" />
      <div className="overlay" aria-hidden="true" />
      <div className="scanline" aria-hidden="true" />

      <div className="wrapper mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-7xl items-center">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="content somb-terminal relative w-full overflow-hidden rounded-[28px] border border-emerald-400/15 bg-[#050608]/90 px-5 py-6 shadow-[0_0_0_1px_rgba(126,201,160,0.06),0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:px-8 sm:py-8 lg:px-10 lg:py-10"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,148,0.12),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(45,212,191,0.08),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_18%,rgba(255,255,255,0.01))]" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/40 to-transparent" aria-hidden="true" />

          <header className="site clearfix relative z-10 flex flex-col gap-6 border-b border-white/5 pb-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="col one flex items-center gap-4">
              <div className="somb-logo flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-300/20 bg-white/[0.03] shadow-[0_0_30px_rgba(52,211,153,0.12)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/20 bg-[#081015] text-[10px] font-semibold tracking-[0.32em] text-emerald-200">
                  SV
                </div>
              </div>
              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.48em] text-emerald-300/70">The SOMB Vault OS</p>
                <h1 className="max-w-3xl font-display text-3xl leading-none text-white sm:text-4xl lg:text-6xl">
                  A luxury command center for SOMB operations.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  Centralized analytics, blockchain telemetry, bookings, notifications, payments, and module control in a cinematic, terminal-grade workspace.
                </p>
              </div>
            </div>

            <div className="col two rounded-2xl border border-emerald-300/10 bg-black/20 px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.35em] text-slate-400">
              <p className="text-emerald-300/70">HEROS-derived visual shell</p>
              <p className="mt-1 text-slate-300">Vault OS v1.0.0</p>
              <p className="mt-1 text-slate-500">(c)2026 SOMB Infrastructure</p>
            </div>
          </header>

          <nav className="site clear relative z-10 mt-6">
            <ul className="flex flex-wrap gap-3 p-0">
              {navItems.map((item) => (
                <li key={item} className="min-w-[160px] md:min-w-[190px]">
                  <a
                    href="#vault-access"
                    className="somb-nav-link inline-flex w-full items-center justify-between rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-sm text-slate-200 transition hover:border-emerald-300/30 hover:bg-emerald-300/8 hover:text-white"
                  >
                    <span>{item}</span>
                    <span className="text-xs text-emerald-300/60">[ open ]</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <section className="relative z-10 mt-8 grid gap-6 lg:grid-cols-[1.25fr_0.85fr] lg:items-start">
            <div className="space-y-6">
              <div className="rounded-[26px] border border-emerald-300/12 bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-8">
                <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-emerald-300/60">System Administrator Integrated Message System</p>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08, duration: 0.45 }}
                  className="mt-4 max-w-3xl text-balance text-lg leading-8 text-slate-200 sm:text-xl"
                >
                  Enter the SOMB Vault and control every live surface from one premium operating layer. The interface is tuned for fast scanning, high-density operations, and future module expansion.
                </motion.p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {systemBlocks.map((block, index) => (
                    <motion.article
                      key={block.label}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + index * 0.06, duration: 0.4 }}
                      className="rounded-2xl border border-white/5 bg-black/25 p-4 backdrop-blur-md"
                    >
                      <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">{block.label}</p>
                      <p className={`mt-3 text-xl font-semibold tracking-[0.18em] ${block.tone}`}>{block.value}</p>
                      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-amber-200" style={{ width: `${70 + index * 7}%` }} />
                      </div>
                    </motion.article>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={onEnter}
                    className="inline-flex items-center gap-3 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-5 py-3 font-semibold text-emerald-100 shadow-[0_0_0_1px_rgba(52,211,153,0.08)] transition hover:-translate-y-0.5 hover:bg-emerald-300/15 hover:shadow-[0_18px_40px_rgba(52,211,153,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40"
                  >
                    Enter Command Center
                    <span className="text-emerald-200/60">→</span>
                  </button>
                  <a
                    href="#vault-access"
                    className="inline-flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-3 text-sm text-slate-300 transition hover:border-cyan-300/25 hover:bg-cyan-300/8 hover:text-white"
                  >
                    Review Access Panel
                    <span className="text-cyan-200/60">⌁</span>
                  </a>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ["Analytics", "Live operating signals and cross-module telemetry."],
                  ["Modules", "Drop-in surfaces for SOMB apps and future services."],
                  ["Security", "JWT, RBAC, audit, and event-aware access control."],
                ].map(([title, copy]) => (
                  <article key={title} className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.45em] text-emerald-300/50">{title}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{copy}</p>
                  </article>
                ))}
              </div>
            </div>

            <aside id="vault-access" className="relative overflow-hidden rounded-[28px] border border-emerald-300/14 bg-black/35 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-6">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-emerald-400/10 to-transparent" aria-hidden="true" />

              <div className="clearfix relative z-10">
                <div className="mb-6 flex items-center justify-between gap-4 border-b border-white/5 pb-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.45em] text-emerald-300/60">SAIMS Access Terminal</p>
                    <h2 className="mt-2 text-2xl font-display text-white">Secure operator entry</h2>
                  </div>
                  <div className="rounded-2xl border border-emerald-300/10 bg-white/[0.03] px-3 py-2 text-right font-mono text-[10px] uppercase tracking-[0.32em] text-slate-400">
                    <p className="text-emerald-300/60">Session</p>
                    <p className="mt-1 text-slate-200">Ready</p>
                  </div>
                </div>

                <p className="text-sm leading-6 text-slate-300">
                  This interface is styled as a CRT-era operator console, but it routes directly into the SOMB Vault dashboard. The surface below is intentionally minimal so the visual language stays premium and fast.
                </p>

                <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); onEnter(); }}>
                  <label className="block space-y-2 text-sm text-slate-200">
                    <span className="font-mono text-[10px] uppercase tracking-[0.45em] text-emerald-300/65">Name &gt;&gt;</span>
                    <input
                      type="text"
                      placeholder="Operator designation"
                      className="somb-input w-full rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-emerald-300/35 focus:outline-none"
                    />
                  </label>

                  <label className="block space-y-2 text-sm text-slate-200">
                    <span className="font-mono text-[10px] uppercase tracking-[0.45em] text-emerald-300/65">Email &gt;&gt;</span>
                    <input
                      type="email"
                      placeholder="operator@sombvault.io"
                      className="somb-input w-full rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-300/35 focus:outline-none"
                    />
                  </label>

                  <label className="block space-y-2 text-sm text-slate-200">
                    <span className="font-mono text-[10px] uppercase tracking-[0.45em] text-emerald-300/65">Subject &gt;&gt;</span>
                    <input
                      type="text"
                      placeholder="Access request / system inquiry"
                      className="somb-input w-full rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-300/35 focus:outline-none"
                    />
                  </label>

                  <label className="block space-y-2 text-sm text-slate-200">
                    <span className="font-mono text-[10px] uppercase tracking-[0.45em] text-emerald-300/65">Message &gt;&gt;</span>
                    <textarea
                      rows={5}
                      placeholder="Request vault access, describe a module, or leave a command note..."
                      className="somb-textarea w-full resize-none rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-emerald-300/35 focus:outline-none"
                    />
                  </label>

                  <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                    <button
                      type="submit"
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-5 py-3 font-semibold text-emerald-100 transition hover:-translate-y-0.5 hover:bg-emerald-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40"
                    >
                      Submit / Enter Vault
                    </button>
                    <a
                      href="#"
                      onClick={(event) => event.preventDefault()}
                      className="inline-flex items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-3 text-sm text-slate-300 transition hover:border-white/15 hover:text-white"
                    >
                      Cancel
                    </a>
                  </div>
                </form>
              </div>
            </aside>
          </section>

          <footer className="clear relative z-10 mt-8 flex flex-col gap-3 border-t border-white/5 pt-5 text-[10px] uppercase tracking-[0.3em] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>Vault OS v1.0.0</span>
            <span>Memory: OK // Disk: OK // Signals: Online</span>
          </footer>
        </motion.div>
      </div>
    </main>
  );
}
