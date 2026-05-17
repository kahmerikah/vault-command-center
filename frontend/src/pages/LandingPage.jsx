import { motion } from "framer-motion";

export default function LandingPage({ onEnter }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-vault-bg px-6 py-10 text-vault-text">
      <div className="pointer-events-none absolute -top-20 left-1/3 h-64 w-64 rounded-full bg-vault-accent/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" aria-hidden="true" />

      <div className="mx-auto max-w-6xl">
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="font-display text-4xl leading-tight md:text-6xl">
          The SOMB Vault
          <span className="block text-vault-accent">Jarvis for SOMB Operations</span>
        </motion.h1>
        <p className="mt-5 max-w-3xl text-lg text-vault-textDim">
          A modular, self-hosted command center for authentication, payments, notifications, booking,
          blockchain telemetry, and analytics across every SOMB product.
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <button type="button" onClick={onEnter} className="rounded-xl border border-vault-accent bg-vault-accent/15 px-5 py-3 font-semibold text-vault-text">
            Enter Command Center
          </button>
          <a href="#architecture" className="rounded-xl border border-slate-700 px-5 py-3 text-vault-textDim">
            View Architecture
          </a>
        </div>

        <section id="architecture" className="mt-16 grid gap-4 md:grid-cols-3">
          {["Central Auth", "API Gateway", "Module OS"].map((item) => (
            <article key={item} className="rounded-2xl border border-vault-accent/20 bg-vault-glass/70 p-5 backdrop-blur-md">
              <h2 className="font-display text-xl text-vault-text">{item}</h2>
              <p className="mt-2 text-sm text-vault-textDim">
                Production-ready foundation with secure defaults and extension points.
              </p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
