import { useEffect, useState, useCallback } from "react";
import api, { setAuthToken } from "../lib/api";
import { useVaultStore } from "../store/useVaultStore";
import GlassPanel from "../components/GlassPanel";
import MetricCard from "../components/MetricCard";

export default function FinancialPage() {
  const { accessToken, clearAuth } = useVaultStore();
  const [accounts, setAccounts] = useState([]);
  const [rules, setRules] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [routing, setRouting] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("accounts");
  const [showAddRule, setShowAddRule] = useState(false);
  const [ruleForm, setRuleForm] = useState({ name: "", destination_tag: "", allocation_pct: "", trigger: "income_received", priority: 50 });
  const [routeForm, setRouteForm] = useState({ income_amount: "", trigger: "income_received" });
  const [routeResult, setRouteResult] = useState(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setAuthToken(accessToken);
    setLoading(true);
    try {
      const [accRes, rulesRes, txRes, routingRes] = await Promise.all([
        api.get("/financial/accounts"),
        api.get("/financial/allocation-rules"),
        api.get("/financial/transactions?limit=30"),
        api.get("/financial/routing-history?limit=20"),
      ]);
      setAccounts(accRes.data?.data?.items || []);
      setRules(rulesRes.data?.data?.items || []);
      setTransactions(txRes.data?.data?.items || []);
      setRouting(routingRes.data?.data?.items || []);
    } catch (err) {
      if (err?.response?.status === 401) clearAuth();
    } finally {
      setLoading(false);
    }
  }, [accessToken, clearAuth]);

  useEffect(() => { load(); }, [load]);

  const addRule = async (e) => {
    e.preventDefault();
    try {
      await api.post("/financial/allocation-rules", ruleForm);
      setShowAddRule(false);
      setRuleForm({ name: "", destination_tag: "", allocation_pct: "", trigger: "income_received", priority: 50 });
      load();
    } catch {}
  };

  const toggleRule = async (rule) => {
    await api.patch(`/financial/allocation-rules/${rule.id}`, { is_active: !rule.is_active });
    load();
  };

  const runRouter = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post("/financial/route", routeForm);
      setRouteResult(res.data?.data);
      load();
    } catch {}
  };

  const syncPlaid = async () => {
    try {
      await api.post("/financial/plaid/sync", { days: 30 });
      load();
    } catch {}
  };

  const linkBank = async () => {
    try {
      const res = await api.get("/financial/plaid/link-token");
      const token = res?.data?.data?.link_token;
      if (token) {
        window.prompt("Plaid link token", token);
      }
    } catch {}
  };

  const totalBalance = accounts.reduce((s, a) => s + parseFloat(a.balance_current || 0), 0);

  if (loading) return <div className="flex items-center justify-center h-64 font-mono text-slate-400 text-xs tracking-widest">loading financial os...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg tracking-widest text-white uppercase">Financial OS</h1>
        <div className="flex gap-2">
          <button type="button" onClick={syncPlaid} className="px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-xs tracking-wider hover:bg-emerald-500/20 transition">
            Sync Plaid
          </button>
          <button type="button" onClick={linkBank} className="px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 font-mono text-xs tracking-wider hover:bg-blue-500/20 transition">
            Link Bank
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Balance" value={`$${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} status="ok" />
        <MetricCard label="Accounts" value={accounts.length} status="ok" />
        <MetricCard label="Routing Rules" value={rules.filter(r => r.is_active).length} status={rules.length > 0 ? "ok" : "warn"} />
        <MetricCard label="Transactions" value={transactions.length} status="ok" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        {["accounts", "rules", "transactions", "routing"].map(tab => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-mono text-xs tracking-widest uppercase transition ${activeTab === tab ? "text-white border-b-2 border-emerald-500" : "text-slate-500 hover:text-slate-300"}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Accounts Tab */}
      {activeTab === "accounts" && (
        <GlassPanel>
          {accounts.length === 0 ? (
            <div className="text-center py-12 text-slate-500 font-mono text-xs">
              No accounts linked. Connect Plaid or add manually.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {accounts.map(a => (
                <div key={a.id} className="flex items-center justify-between py-3 px-1">
                  <div>
                    <p className="font-mono text-sm text-white">{a.account_name}</p>
                    <p className="font-mono text-xs text-slate-500">{a.institution_name} · {a.account_type} {a.mask ? `••${a.mask}` : ""}</p>
                    {a.routing_tag && <span className="text-xs text-emerald-400/70">→ {a.routing_tag}</span>}
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm text-white">${parseFloat(a.balance_current || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                    <p className="font-mono text-xs text-slate-500">avail: ${parseFloat(a.balance_available || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      )}

      {/* Rules Tab */}
      {activeTab === "rules" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="font-mono text-xs text-slate-400">Allocation rules run when a trigger fires and route a percentage of income.</p>
            <button type="button" onClick={() => setShowAddRule(!showAddRule)} className="px-3 py-1.5 rounded-lg border border-white/10 text-white font-mono text-xs hover:bg-white/5 transition">
              + Add Rule
            </button>
          </div>
          {showAddRule && (
            <GlassPanel>
              <form onSubmit={addRule} className="grid grid-cols-2 gap-3">
                {[["name", "Rule Name"], ["destination_tag", "Destination Tag (e.g. bills)"], ["allocation_pct", "% Allocation"]].map(([field, label]) => (
                  <div key={field} className="flex flex-col gap-1">
                    <label className="font-mono text-xs text-slate-400">{label}</label>
                    <input type={field === "allocation_pct" ? "number" : "text"} value={ruleForm[field]}
                      onChange={e => setRuleForm(p => ({ ...p, [field]: e.target.value }))}
                      className="bg-black/30 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white outline-none focus:border-emerald-500/50"
                      required />
                  </div>
                ))}
                <div className="col-span-2 flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowAddRule(false)} className="px-3 py-1.5 font-mono text-xs text-slate-400 hover:text-white transition">Cancel</button>
                  <button type="submit" className="px-4 py-1.5 rounded-lg bg-emerald-600/80 text-white font-mono text-xs hover:bg-emerald-600 transition">Save Rule</button>
                </div>
              </form>
            </GlassPanel>
          )}
          <GlassPanel>
            {rules.length === 0 ? <p className="text-center py-8 text-slate-500 font-mono text-xs">No rules yet. Add one above.</p> : (
              <div className="divide-y divide-white/5">
                {rules.map(r => (
                  <div key={r.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-mono text-sm text-white">{r.name}</p>
                      <p className="font-mono text-xs text-slate-500">{r.allocation_pct}% → {r.destination_tag} · trigger: {r.trigger}</p>
                    </div>
                    <button type="button" onClick={() => toggleRule(r)}
                      className={`px-2 py-1 rounded font-mono text-xs ${r.is_active ? "text-emerald-400 border border-emerald-500/30" : "text-slate-500 border border-white/10"}`}>
                      {r.is_active ? "active" : "paused"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>

          {/* Run router */}
          <GlassPanel>
            <p className="font-mono text-xs text-slate-400 mb-3">Simulate money routing for an income amount:</p>
            <form onSubmit={runRouter} className="flex gap-3 items-end">
              <div className="flex-1 flex flex-col gap-1">
                <label className="font-mono text-xs text-slate-400">Income Amount ($)</label>
                <input type="number" value={routeForm.income_amount}
                  onChange={e => setRouteForm(p => ({ ...p, income_amount: e.target.value }))}
                  className="bg-black/30 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white outline-none focus:border-emerald-500/50" />
              </div>
              <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600/80 text-white font-mono text-xs hover:bg-emerald-600 transition">Run</button>
            </form>
            {routeResult && (
              <div className="mt-4 space-y-2">
                {(routeResult.routing_events || []).map((ev, i) => (
                  <div key={i} className="flex justify-between font-mono text-xs border border-white/5 rounded px-3 py-2 bg-black/20">
                    <span className="text-slate-300">{ev.rule} → {ev.destination}</span>
                    <span className="text-emerald-400">${parseFloat(ev.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                    <span className="text-slate-500">{ev.status}</span>
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>
        </div>
      )}

      {/* Transactions Tab */}
      {activeTab === "transactions" && (
        <GlassPanel>
          {transactions.length === 0 ? <p className="text-center py-8 text-slate-500 font-mono text-xs">No transactions. Sync Plaid to import.</p> : (
            <div className="divide-y divide-white/5">
              {transactions.map(t => (
                <div key={t.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-mono text-sm text-white">{t.name}</p>
                    <p className="font-mono text-xs text-slate-500">{t.category} · {t.transaction_date}</p>
                  </div>
                  <span className={`font-mono text-sm ${parseFloat(t.amount) < 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {parseFloat(t.amount) < 0 ? "-" : "+"}${Math.abs(parseFloat(t.amount)).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      )}

      {/* Routing History Tab */}
      {activeTab === "routing" && (
        <GlassPanel>
          {routing.length === 0 ? <p className="text-center py-8 text-slate-500 font-mono text-xs">No routing events yet.</p> : (
            <div className="divide-y divide-white/5">
              {routing.map(ev => (
                <div key={ev.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-mono text-xs text-slate-300">{ev.trigger} → {ev.destination_tag}</p>
                    <p className="font-mono text-xs text-slate-500">{ev.created_at?.slice(0, 16)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm text-emerald-400">${parseFloat(ev.amount_routed).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                    <p className={`font-mono text-xs ${ev.status === "simulated" ? "text-slate-500" : ev.status === "queued" ? "text-yellow-400" : "text-emerald-400"}`}>{ev.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      )}
    </div>
  );
}
