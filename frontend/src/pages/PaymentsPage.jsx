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
      setAuthToken(accessToken);
      const [summaryRes, paymentsRes] = await Promise.all([api.get("/payments/summary"), api.get("/payments", { params: { limit: 50 } })]);
      setSummary(summaryRes.data?.data || null);
      setPayments(paymentsRes.data?.data?.items || []);
    };

    if (accessToken) {
      load();
    }
  }, [accessToken]);

  return (
    <AppShell user={user} onLogout={handleLogout} title="payments">
      <div className="grid gap-4 md:grid-cols-5">
        <GlassPanel title="Transactions"><div className="text-2xl">{summary?.payments_total ?? "--"}</div></GlassPanel>
        <GlassPanel title="Revenue"><div className="text-2xl">${summary?.revenue_total ?? "--"}</div></GlassPanel>
        <GlassPanel title="Succeeded"><div className="text-2xl">{summary?.succeeded_total ?? "--"}</div></GlassPanel>
        <GlassPanel title="Refunded"><div className="text-2xl">{summary?.refunded_total ?? "--"}</div></GlassPanel>
        <GlassPanel title="Disputed"><div className="text-2xl">{summary?.disputed_total ?? "--"}</div></GlassPanel>
      </div>
      <GlassPanel title="Recent Payments" className="mt-4">
        <div className="space-y-2 text-sm">
          {payments.map((payment) => (
            <div key={payment.id} className="grid grid-cols-5 gap-2 rounded border border-vault-accent/20 px-3 py-2">
              <span>{payment.provider_payment_id}</span>
              <span>{payment.status}</span>
              <span>{payment.amount}</span>
              <span>{payment.currency}</span>
              <span>{new Date(payment.created_at).toLocaleString()}</span>
            </div>
          ))}
          {payments.length === 0 && <div className="text-vault-textDim">No payments found.</div>}
        </div>
      </GlassPanel>
    </AppShell>
  );
}
