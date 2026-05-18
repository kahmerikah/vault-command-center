import { useState } from "react";
import api from "../lib/api";

export default function ResetPasswordPage() {
  const [identity, setIdentity] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const requestToken = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("");
    if (!identity.trim()) {
      setError("identity required");
      return;
    }

    setIsBusy(true);
    try {
      const response = await api.post("/auth/forgot-password", { identity: identity.trim() });
      const token = response.data?.data?.reset_token;
      if (token) {
        setResetToken(token);
        setStatus("reset token issued");
      } else {
        setStatus("if account exists, token issued");
      }
    } catch {
      setError("request failed");
    } finally {
      setIsBusy(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("");

    if (newPassword.length < 12) {
      setError("password must be at least 12 characters");
      return;
    }

    if (!resetToken.trim()) {
      setError("reset token required");
      return;
    }

    setIsBusy(true);
    try {
      await api.post("/auth/reset-password", {
        reset_token: resetToken.trim(),
        new_password: newPassword,
      });
      setStatus("password updated");
      setNewPassword("");
    } catch (err) {
      setError(err?.response?.data?.error || "reset failed");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="somb-login-screen relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      <div className="somb-login-bg-noise" aria-hidden="true" />
      <div className="overlay" aria-hidden="true" />
      <div className="scanline" aria-hidden="true" />

      <section className="somb-login-terminal relative w-full max-w-xl rounded-3xl border border-emerald-400/20 bg-[#05070b]/82 p-5 backdrop-blur-xl sm:p-7">
        <header className="mb-6 border-b border-white/10 pb-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.42em] text-emerald-300/70">SOMB VAULT</p>
          <h1 className="mt-2 text-xl font-semibold text-slate-100">reset password</h1>
        </header>

        <form className="space-y-3" onSubmit={requestToken}>
          <label className="block space-y-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.34em] text-emerald-300/70">username / email</span>
            <input
              type="text"
              value={identity}
              onChange={(event) => setIdentity(event.target.value)}
              className="terminal-input w-full rounded-xl border border-emerald-300/18 bg-black/25 px-3 py-2.5 font-mono text-sm text-emerald-100 focus:outline-none"
              placeholder="enter identity"
            />
          </label>
          <button
            type="submit"
            disabled={isBusy}
            className="terminal-button inline-flex items-center justify-center rounded-xl border border-emerald-300/28 bg-emerald-300/12 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.28em] text-emerald-100 disabled:opacity-60"
          >
            request token
          </button>
        </form>

        <form className="mt-6 space-y-3 border-t border-white/10 pt-5" onSubmit={resetPassword}>
          <label className="block space-y-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.34em] text-emerald-300/70">reset token</span>
            <input
              type="text"
              value={resetToken}
              onChange={(event) => setResetToken(event.target.value)}
              className="terminal-input w-full rounded-xl border border-emerald-300/18 bg-black/25 px-3 py-2.5 font-mono text-sm text-emerald-100 focus:outline-none"
              placeholder="paste reset token"
            />
          </label>
          <label className="block space-y-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.34em] text-emerald-300/70">new password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="terminal-input w-full rounded-xl border border-emerald-300/18 bg-black/25 px-3 py-2.5 font-mono text-sm text-emerald-100 focus:outline-none"
              placeholder="minimum 12 characters"
            />
          </label>

          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-slate-500">
            <p className="min-h-5 text-emerald-300/70">{status || "session pending"}</p>
            <p className="min-h-5 text-rose-300/70">{error}</p>
          </div>

          <button
            type="submit"
            disabled={isBusy}
            className="terminal-button inline-flex items-center justify-center rounded-xl border border-emerald-300/28 bg-emerald-300/12 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.28em] text-emerald-100 disabled:opacity-60"
          >
            update password
          </button>
        </form>
      </section>
    </main>
  );
}
