import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import api from "../lib/api";

const statusLines = ["checking session...", "secure connection", "system ready", "awaiting credentials"];

export default function LandingPage({ onAuthenticated }) {
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const terminalLine = useMemo(() => statusLines[new Date().getSeconds() % statusLines.length], []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!identity.trim() || !password) {
      setError("access required");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const response = await api.post("/auth/login", {
        identity: identity.trim(),
        password,
      });
      const payload = response.data?.data;
      onAuthenticated?.({
        accessToken: payload?.access_token,
        refreshToken: payload?.refresh_token,
        user: payload?.user,
      });
      setPassword("");
    } catch {
      setError("session invalid");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClear = () => {
    setIdentity("");
    setPassword("");
    setError("");
  };

  return (
    <main className="somb-login-screen relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      <div className="somb-login-bg-noise" aria-hidden="true" />
      <div className="overlay" aria-hidden="true" />
      <div className="scanline" aria-hidden="true" />

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="somb-login-terminal relative w-full max-w-xl rounded-3xl border border-emerald-400/20 bg-[#05070b]/82 p-5 backdrop-blur-xl sm:p-7"
      >
        <div className="terminal-corner terminal-corner--tl" aria-hidden="true" />
        <div className="terminal-corner terminal-corner--tr" aria-hidden="true" />
        <div className="terminal-corner terminal-corner--bl" aria-hidden="true" />
        <div className="terminal-corner terminal-corner--br" aria-hidden="true" />

        <header className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.42em] text-emerald-300/70">SOMB VAULT</p>
            <h1 className="mt-2 text-xl font-semibold text-slate-100">vault login</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="terminal-dot bg-rose-400/45" />
            <span className="terminal-dot bg-amber-300/45" />
            <span className="terminal-dot bg-emerald-300/45" />
          </div>
        </header>

        <div className="mb-5 font-mono text-xs uppercase tracking-[0.25em] text-slate-400">
          <span className="terminal-typing">{terminalLine}</span>
          <span className="terminal-cursor" aria-hidden="true" />
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.34em] text-emerald-300/70">username / email</span>
            <input
              type="text"
              autoComplete="username"
              value={identity}
              onChange={(event) => setIdentity(event.target.value)}
              className="terminal-input w-full rounded-xl border border-emerald-300/18 bg-black/25 px-3 py-2.5 font-mono text-sm text-emerald-100 placeholder:text-emerald-200/35 focus:outline-none"
              placeholder="enter credentials"
            />
          </label>

          <label className="block space-y-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.34em] text-emerald-300/70">password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="terminal-input w-full rounded-xl border border-emerald-300/18 bg-black/25 px-3 py-2.5 font-mono text-sm text-emerald-100 placeholder:text-emerald-200/35 focus:outline-none"
              placeholder="access required"
            />
          </label>

          <div className="pt-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-slate-500">authorized users only</p>
            <p className="mt-1 min-h-5 font-mono text-[11px] uppercase tracking-[0.25em] text-rose-300/70">{error || "session pending"}</p>
          </div>

          <div className="flex flex-col gap-3 pt-1 sm:flex-row">
            <button
              type="submit"
              disabled={isSubmitting}
              className="terminal-button inline-flex flex-1 items-center justify-center rounded-xl border border-emerald-300/28 bg-emerald-300/12 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.28em] text-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "entering" : "enter"}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="terminal-button inline-flex items-center justify-center rounded-xl border border-white/14 bg-white/[0.03] px-4 py-2.5 font-mono text-xs uppercase tracking-[0.28em] text-slate-300"
            >
              clear
            </button>
          </div>
          <div className="pt-1 text-right">
            <Link to="/reset-password" className="font-mono text-[11px] uppercase tracking-[0.24em] text-emerald-300/65 hover:text-emerald-200">
              forgot password
            </Link>
          </div>
        </form>

        <footer className="mt-6 border-t border-white/8 pt-4 font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500">
          <div className="flex items-center justify-between">
            <span>secure</span>
            <span>v1.0.0</span>
          </div>
        </footer>
      </motion.section>
    </main>
  );
}
