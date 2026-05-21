import { useEffect, useState } from "react";
import api, { setAuthToken } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import { useVaultStore } from "../store/useVaultStore";
import AppShell from "../components/AppShell";
import GlassPanel from "../components/GlassPanel";

export default function PaymentsPage() {
  const { accessToken, refreshToken, user, clearAuth } = useVaultStore();
  const [summary, setSummary] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const handleLogout = async () => {
    try {
      if (refreshToken) {
        await api.post("/auth/logout", {}, { headers: { Authorization: `Bearer ${refreshToken}` } });
      }
    } catch {
      // Keep logout reliable.
    } finally {
      clearAuth();
      setAuthToken("");
      disconnectSocket();
      window.location.assign("/login");
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError("");
      setAuthToken(accessToken);
      const [summaryRes, paymentsRes] = await Promise.allSettled([api.get("/payments/summary"), api.get("/payments", { params: { limit: 50 } })]);
      setSummary(summaryRes.status === 'fulfilled' ? summaryRes.value.data?.data || null : null);
      setPayments(paymentsRes.status === 'fulfilled' ? paymentsRes.value.data?.data?.items || [] : []);
      if (summaryRes.status === "rejected" || paymentsRes.status === "rejected") {
        setLoadError("Payments service partially unavailable. Try refresh after webhook sync.");
      }
      setLoading(false);
    };

    if (accessToken) {
      load();
    }
  }, [accessToken]);

  return (
    <AppShell user={user} onLogout={handleLogout} title="payments">
      {loadError ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{loadError}</div> : null}
      <div className="grid gap-4 md:grid-cols-5">
        <GlassPanel title="Transactions"><div className="text-2xl">{summary?.payments_total ?? "--"}</div></GlassPanel>
        <GlassPanel title="Revenue"><div className="text-2xl">${summary?.revenue_total ?? "--"}</div></GlassPanel>
        <GlassPanel title="Succeeded"><div className="text-2xl">{summary?.succeeded_total ?? "--"}</div></GlassPanel>
        <GlassPanel title="Refunded"><div className="text-2xl">{summary?.refunded_total ?? "--"}</div></GlassPanel>
        <GlassPanel title="Disputed"><div className="text-2xl">{summary?.disputed_total ?? "--"}</div></GlassPanel>
      </div>
      <GlassPanel title="Recent Payments" className="mt-4">
        <div className="space-y-2 text-sm">
          {loading ? <div className="text-vault-textDim">Loading payments stream...</div> : null}
          {payments.map((payment) => (
            <div key={payment.id} className="grid grid-cols-5 gap-2 rounded border border-vault-accent/20 px-3 py-2">
              <span>{payment.provider_payment_id}</span>
              <span>{payment.status}</span>
              <span>{payment.amount}</span>
              <span>{payment.currency}</span>
              <span>{new Date(payment.created_at).toLocaleString()}</span>
            </div>
          ))}
          {!loading && payments.length === 0 && (
            <div className="somb-empty-state text-vault-textDim">
              <p className="text-vault-text">No Stripe transactions detected yet.</p>
              <p className="mt-1 text-xs">Suggested next steps: connect Stripe credentials, enable webhook endpoint, run a sandbox payment.</p>
            </div>
          )}
        </div>
      </GlassPanel>
    </AppShell>
  );
}
