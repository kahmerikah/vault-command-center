import { useEffect, useState } from "react";
import api, { setAuthToken } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import { useVaultStore } from "../store/useVaultStore";
import AppShell from "../components/AppShell";
import GlassPanel from "../components/GlassPanel";

export default function BlockchainPage() {
  const { accessToken, refreshToken, user, clearAuth } = useVaultStore();
  const [metrics, setMetrics] = useState(null);
  const [transactions, setTransactions] = useState([]);

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
      const [metricsRes, txRes] = await Promise.all([api.get("/blockchain/metrics"), api.get("/blockchain/transactions", { params: { limit: 50 } })]);
      setMetrics(metricsRes.data?.data || null);
      setTransactions(txRes.data?.data?.items || []);
    };

    if (accessToken) {
      load();
    }
  }, [accessToken]);

  return (
    <AppShell user={user} onLogout={handleLogout} title="blockchain">
      <div className="grid gap-4 md:grid-cols-4">
        <GlassPanel title="Wallets"><div className="text-2xl">{metrics?.wallets_total ?? "--"}</div></GlassPanel>
        <GlassPanel title="Transactions"><div className="text-2xl">{metrics?.tx_total ?? "--"}</div></GlassPanel>
        <GlassPanel title="Confirmed"><div className="text-2xl">{metrics?.confirmed_total ?? "--"}</div></GlassPanel>
        <GlassPanel title="Mint Ops"><div className="text-2xl">{metrics?.mint_total ?? "--"}</div></GlassPanel>
      </div>
      <GlassPanel title="Live Transaction Feed" className="mt-4">
        <div className="space-y-2 text-sm">
          {transactions.map((tx) => (
            <div key={tx.id} className="grid grid-cols-5 gap-2 rounded border border-vault-accent/20 px-3 py-2">
              <span>{tx.tx_hash}</span>
              <span>{tx.tx_type}</span>
              <span>{tx.amount}</span>
              <span>{tx.status}</span>
              <span>{new Date(tx.created_at).toLocaleString()}</span>
            </div>
          ))}
          {transactions.length === 0 && <div className="text-vault-textDim">No chain transactions available.</div>}
        </div>
      </GlassPanel>
    </AppShell>
  );
}
