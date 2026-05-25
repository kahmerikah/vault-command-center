import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import AppShell from "../components/AppShell";
import GlassPanel from "../components/GlassPanel";
import api, { setAuthToken } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import { useVaultStore } from "../store/useVaultStore";

export default function FinancialPage() {
  const { accessToken, refreshToken, user, clearAuth } = useVaultStore();

  const currencySymbols = useMemo(
    () => ({ USD: "$", INR: "₹", EUR: "€" }),
    []
  );

  const [accounts, setAccounts] = useState([]);
  const [rules, setRules] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [routing, setRouting] = useState([]);

  const [loading, setLoading] = useState(true);
  const [showAddRule, setShowAddRule] = useState(false);

  const [ruleForm, setRuleForm] = useState({
    name: "",
    destination_tag: "",
    destination_account_id: "",
    allocation_pct: "20",
    trigger: "income_received",
    priority: 50,
  });
  const [routeForm, setRouteForm] = useState({
    income_amount: "",
    trigger: "income_received",
    source_account_id: "",
  });

  const [routeResult, setRouteResult] = useState(null);

  const [plaidStatus, setPlaidStatus] = useState("");
  const [plaidError, setPlaidError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [actionError, setActionError] = useState("");

  const [linkToken, setLinkToken] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [exchangingToken, setExchangingToken] = useState(false);

  const [txSearch, setTxSearch] = useState("");
  const [txFilter, setTxFilter] = useState("all");
  const [txSort, setTxSort] = useState("date_desc");

  const [fxFrom, setFxFrom] = useState("USD");
  const [fxTo, setFxTo] = useState("INR");
  const [fxAmount, setFxAmount] = useState("1");
  const [fxConverted, setFxConverted] = useState(0);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState("");

  const searchRef = useRef(null);
  const routeRef = useRef(null);
  const fxAnimationRef = useRef(null);

  const handleLogout = useCallback(async () => {
    try {
      if (refreshToken) {
        await api.post("/auth/logout", {}, { headers: { Authorization: `Bearer ${refreshToken}` } });
      }
    } catch {
      // Keep local logout deterministic even if API logout fails.
    } finally {
      clearAuth();
      setAuthToken("");
      disconnectSocket();
      window.location.assign("/login");
    }
  }, [clearAuth, refreshToken]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setAuthToken(accessToken);
    setLoading(true);

    try {
      const [accountsRes, rulesRes, txRes, routingRes] = await Promise.allSettled([
        api.get("/financial/accounts"),
        api.get("/financial/allocation-rules"),
        api.get("/financial/transactions?limit=200"),
        api.get("/financial/routing-history?limit=40"),
      ]);

      setAccounts(accountsRes.status === "fulfilled" ? accountsRes.value.data?.data?.items || [] : []);
      setRules(rulesRes.status === "fulfilled" ? rulesRes.value.data?.data?.items || [] : []);
      setTransactions(txRes.status === "fulfilled" ? txRes.value.data?.data?.items || [] : []);
      setRouting(routingRes.status === "fulfilled" ? routingRes.value.data?.data?.items || [] : []);
    } catch (err) {
      if (err?.response?.status === 401) {
        clearAuth();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, clearAuth]);

  useEffect(() => {
    load();
  }, [load]);

  const syncPlaid = useCallback(async () => {
    setPlaidStatus("");
    setPlaidError("");
    setActionNotice("");
    setActionError("");
    try {
      await api.post("/financial/plaid/sync");
      setPlaidStatus("Plaid transactions synced.");
      await load();
    } catch (err) {
      setPlaidError(err?.response?.data?.error || "Plaid sync failed.");
    }
  }, [load]);

  const linkBank = useCallback(async () => {
    setPlaidStatus("");
    setPlaidError("");
    setLinkLoading(true);
    try {
      const response = await api.get("/financial/plaid/link-token");
      setLinkToken(response.data?.data?.link_token || "");
    } catch (err) {
      setPlaidError(err?.response?.data?.error || "Failed to create link token.");
    } finally {
      setLinkLoading(false);
    }
  }, []);

  const exchangePublicToken = useCallback(
    async (publicToken) => {
      setExchangingToken(true);
      setPlaidError("");
      setPlaidStatus("");
      try {
        await api.post("/financial/plaid/exchange", { public_token: publicToken });
        setPlaidStatus("Bank account linked.");
        await load();
      } catch (err) {
        setPlaidError(err?.response?.data?.error || "Token exchange failed.");
      } finally {
        setExchangingToken(false);
        setLinkToken("");
      }
    },
    [load]
  );

  const { open: openPlaid, ready: plaidReady } = usePlaidLink({
    token: linkToken || null,
    onSuccess: (publicToken) => exchangePublicToken(publicToken),
    onExit: (_, metadata) => {
      if (metadata?.status === "requires_questions") {
        setPlaidError("Plaid requires additional user verification.");
      }
      setLinkToken("");
    },
  });

  useEffect(() => {
    if (linkToken && plaidReady && !linkLoading && !exchangingToken) {
      openPlaid();
    }
  }, [linkToken, plaidReady, linkLoading, exchangingToken, openPlaid]);

  const addRule = useCallback(
    async (event) => {
      event.preventDefault();
      setActionError("");
      setActionNotice("");
      try {
        await api.post("/financial/allocation-rules", {
          ...ruleForm,
          allocation_pct: Number(ruleForm.allocation_pct || 0),
          priority: Number(ruleForm.priority || 50),
          destination_account_id: ruleForm.destination_account_id || null,
        });
        setActionNotice("Allocation rule saved.");
        setRuleForm((prev) => ({ ...prev, name: "", destination_tag: "", destination_account_id: "" }));
        setShowAddRule(false);
        await load();
      } catch (err) {
        setActionError(err?.response?.data?.error || "Could not save rule.");
      }
    },
    [load, ruleForm]
  );

  const toggleRule = useCallback(
    async (rule) => {
      setActionError("");
      setActionNotice("");
      try {
        await api.patch(`/financial/allocation-rules/${rule.id}`, { is_active: !rule.is_active });
        setActionNotice(rule.is_active ? "Rule paused." : "Rule activated.");
        await load();
      } catch (err) {
        setActionError(err?.response?.data?.error || "Could not update rule state.");
      }
    },
    [load]
  );

  const deleteRule = useCallback(
    async (rule) => {
      if (!window.confirm(`Delete routing rule "${rule.name}"? This cannot be undone.`)) return;
      setActionError("");
      setActionNotice("");
      try {
        await api.delete(`/financial/allocation-rules/${rule.id}`);
        setActionNotice(`Rule "${rule.name}" deleted.`);
        await load();
      } catch (err) {
        setActionError(err?.response?.data?.error || "Could not delete rule.");
      }
    },
    [load]
  );

  const runRouter = useCallback(
    async (event) => {
      event.preventDefault();
      setActionError("");
      setActionNotice("");
      setRouteResult(null);

      try {
        const response = await api.post("/financial/route", {
          income_amount: Number(routeForm.income_amount || 0),
          trigger: routeForm.trigger,
          source_account_id: routeForm.source_account_id || null,
        });
        setRouteResult(response.data?.data || null);
        setActionNotice("Routing simulation completed.");
        await load();
      } catch (err) {
        setActionError(err?.response?.data?.error || "Routing simulation failed.");
      }
    },
    [load, routeForm]
  );

  useEffect(() => {
    const handleKeys = (event) => {
      if (event.key === "/" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.altKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        routeRef.current?.focus();
      }
      if (event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        syncPlaid();
      }
    };
    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  }, [syncPlaid]);

  const accountById = useMemo(() => {
    const map = {};
    accounts.forEach((account) => {
      map[account.id] = account;
    });
    return map;
  }, [accounts]);

  const parsedTransactions = useMemo(
    () =>
      transactions.map((tx) => {
        const when = tx.transaction_date ? new Date(tx.transaction_date) : new Date(tx.created_at || Date.now());
        return {
          ...tx,
          numericAmount: Number(tx.amount || 0),
          when,
        };
      }),
    [transactions]
  );

  const filteredTransactions = useMemo(() => {
    const search = txSearch.trim().toLowerCase();
    let list = [...parsedTransactions];

    if (search) {
      list = list.filter((tx) => {
        const haystack = `${tx.name || ""} ${tx.merchant_name || ""} ${tx.category || ""}`.toLowerCase();
        return haystack.includes(search);
      });
    }

    if (txFilter === "income") list = list.filter((tx) => tx.numericAmount > 0);
    if (txFilter === "expense") list = list.filter((tx) => tx.numericAmount < 0);
    if (txFilter === "recurring") list = list.filter((tx) => tx.is_recurring);

    if (txSort === "amount_desc") list.sort((a, b) => Math.abs(b.numericAmount) - Math.abs(a.numericAmount));
    if (txSort === "amount_asc") list.sort((a, b) => Math.abs(a.numericAmount) - Math.abs(b.numericAmount));
    if (txSort === "date_desc") list.sort((a, b) => b.when.getTime() - a.when.getTime());

    return list;
  }, [parsedTransactions, txSearch, txFilter, txSort]);

  const metrics = useMemo(() => {
    const availableCash = accounts
      .filter((account) => account.account_type !== "credit")
      .reduce((sum, account) => sum + Number(account.balance_available || 0), 0);

    const totalLiquidity = accounts.reduce((sum, account) => sum + Number(account.balance_current || 0), 0);
    const debtExposure = accounts
      .filter((account) => account.account_type === "credit")
      .reduce((sum, account) => sum + Math.max(Number(account.balance_current || 0), 0), 0);

    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const upcomingBills = parsedTransactions
      .filter((tx) => tx.when >= now && tx.when <= in7Days && tx.numericAmount < 0)
      .reduce((sum, tx) => sum + Math.abs(tx.numericAmount), 0);

    const incomingSoon = parsedTransactions
      .filter((tx) => tx.when >= now && tx.when <= in7Days && tx.numericAmount > 0)
      .reduce((sum, tx) => sum + tx.numericAmount, 0);

    const reserveTarget = Math.max(availableCash * 0.2, 1000);
    const reservePct = availableCash > 0 ? Math.round((reserveTarget / availableCash) * 100) : 0;
    const safeToSpend = Math.max(availableCash - upcomingBills - reserveTarget, 0);

    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const previousWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const currentWeekNet = parsedTransactions.filter((tx) => tx.when >= weekStart).reduce((sum, tx) => sum + tx.numericAmount, 0);
    const previousWeekNet = parsedTransactions
      .filter((tx) => tx.when >= previousWeekStart && tx.when < weekStart)
      .reduce((sum, tx) => sum + tx.numericAmount, 0);

    const burnTrendPct = previousWeekNet === 0 ? 0 : Math.round(((currentWeekNet - previousWeekNet) / Math.abs(previousWeekNet)) * 100);

    const savingsRulePct = rules
      .filter((rule) => rule.is_active && ["savings", "invest", "reserve"].some((needle) => String(rule.destination_tag || "").toLowerCase().includes(needle)))
      .reduce((sum, rule) => sum + Number(rule.allocation_pct || 0), 0);

    // Runway: months of available cash at current monthly burn rate.
    const last30DaysBurn = parsedTransactions
      .filter((tx) => tx.numericAmount < 0 && tx.when >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))
      .reduce((sum, tx) => sum + Math.abs(tx.numericAmount), 0);
    const runwayMonths = last30DaysBurn > 0 ? (availableCash / last30DaysBurn).toFixed(1) : null;

    return {
      totalLiquidity,
      availableCash,
      debtExposure,
      upcomingBills,
      incomingSoon,
      reservePct,
      safeToSpend,
      burnTrendPct,
      savingsRulePct,
      runwayMonths,
      monthlyBurn: last30DaysBurn,
    };
  }, [accounts, parsedTransactions, rules]);

  const flowMap = useMemo(() => {
    const active = rules.filter((rule) => rule.is_active);
    const total = active.reduce((sum, rule) => sum + Number(rule.allocation_pct || 0), 0) || 1;
    return active.map((rule) => ({
      ...rule,
      pct: Number(rule.allocation_pct || 0),
      width: Math.max(8, Math.round((Number(rule.allocation_pct || 0) / total) * 100)),
    }));
  }, [rules]);

  const billsDue = useMemo(() => {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    // Prefer genuinely upcoming (future-dated) scheduled expenses.
    const upcoming = parsedTransactions
      .filter((tx) => tx.numericAmount < 0 && tx.when > now && tx.when <= in30Days)
      .sort((a, b) => a.when.getTime() - b.when.getTime())
      .slice(0, 6);
    if (upcoming.length > 0) return upcoming;
    // Fallback: show most recent recurring expenses as a proxy for what recurs.
    return parsedTransactions
      .filter((tx) => tx.numericAmount < 0 && tx.is_recurring)
      .sort((a, b) => b.when.getTime() - a.when.getTime())
      .slice(0, 6);
  }, [parsedTransactions]);

  const unusualSpending = useMemo(() => {
    const expenses = parsedTransactions.filter((tx) => tx.numericAmount < 0).map((tx) => Math.abs(tx.numericAmount));
    if (!expenses.length) return [];

    const avg = expenses.reduce((sum, amount) => sum + amount, 0) / expenses.length;
    return parsedTransactions
      .filter((tx) => tx.numericAmount < 0 && Math.abs(tx.numericAmount) > avg * 2)
      .slice(0, 4);
  }, [parsedTransactions]);

  const hostingExpenses = useMemo(
    () =>
      parsedTransactions
        .filter((tx) => {
          const text = `${tx.name || ""} ${tx.merchant_name || ""}`.toLowerCase();
          return text.includes("aws") || text.includes("vercel") || text.includes("digitalocean") || text.includes("cloudflare") || text.includes("github");
        })
        .slice(0, 4),
    [parsedTransactions]
  );

  const financeTimeline = useMemo(() => {
    const txEvents = filteredTransactions.slice(0, 10).map((tx) => ({
      id: `tx-${tx.id}`,
      title: tx.name,
      detail: `${tx.numericAmount < 0 ? "-" : "+"}$${Math.abs(tx.numericAmount).toFixed(2)} · ${tx.category || "uncategorized"}`,
      when: tx.when,
      tone: tx.numericAmount < 0 ? "text-red-300" : "text-emerald-300",
    }));

    const routingEvents = routing.slice(0, 8).map((event) => ({
      id: `rt-${event.id}`,
      title: `Routing ${event.destination_tag}`,
      detail: `$${Number(event.amount_routed || 0).toFixed(2)} · ${event.status}`,
      when: new Date(event.created_at || Date.now()),
      tone: event.status === "failed" ? "text-red-300" : event.status === "queued" ? "text-amber-300" : "text-emerald-300",
    }));

    return [...txEvents, ...routingEvents]
      .sort((a, b) => b.when.getTime() - a.when.getTime())
      .slice(0, 14);
  }, [filteredTransactions, routing]);

  const animateFxValue = useCallback((start, end, duration = 500) => {
    if (fxAnimationRef.current) {
      window.cancelAnimationFrame(fxAnimationRef.current);
      fxAnimationRef.current = null;
    }

    const startedAt = performance.now();
    const step = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const next = start + (end - start) * progress;
      setFxConverted(next);
      if (progress < 1) {
        fxAnimationRef.current = window.requestAnimationFrame(step);
      }
    };

    fxAnimationRef.current = window.requestAnimationFrame(step);
  }, []);

  const convertCurrency = useCallback(async () => {
    const amount = Number.parseFloat(fxAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setFxError("Enter a valid amount.");
      return;
    }

    setFxLoading(true);
    setFxError("");

    try {
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${fxFrom}`);
      if (!response.ok) {
        throw new Error("Rate API unavailable");
      }
      const data = await response.json();
      const rate = data?.rates?.[fxTo];
      if (!Number.isFinite(rate)) {
        throw new Error("Missing conversion rate");
      }
      const result = amount * rate;
      animateFxValue(fxConverted, result, 500);
    } catch {
      setFxError("Currency conversion failed.");
    } finally {
      setFxLoading(false);
    }
  }, [animateFxValue, fxAmount, fxConverted, fxFrom, fxTo]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      convertCurrency();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [convertCurrency]);

  useEffect(
    () => () => {
      if (fxAnimationRef.current) {
        window.cancelAnimationFrame(fxAnimationRef.current);
      }
    },
    []
  );

  if (loading) {
    return (
      <AppShell user={user} onLogout={handleLogout} title="financial os">
        <div className="flex h-64 items-center justify-center font-mono text-xs tracking-widest text-slate-400">loading financial os...</div>
      </AppShell>
    );
  }

  return (
    <AppShell user={user} onLogout={handleLogout} title="financial os">
      <div className="space-y-4">
        <GlassPanel title="Treasury Control" className="p-3">
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <Metric label="Liquidity" value={`$${metrics.totalLiquidity.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} tone="text-vault-text" />
            <Metric label="Safe to Spend" value={`$${metrics.safeToSpend.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} tone="text-emerald-300" />
            <Metric label="Monthly Burn" value={`$${metrics.monthlyBurn.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} tone={metrics.monthlyBurn > metrics.availableCash * 0.5 ? "text-red-300" : "text-amber-300"} />
            <Metric label="Runway" value={metrics.runwayMonths ? `${metrics.runwayMonths}mo` : "—"} tone={metrics.runwayMonths && Number(metrics.runwayMonths) < 3 ? "text-red-300" : "text-cyan-300"} />
            <Metric label="Savings Routing" value={`${metrics.savingsRulePct.toFixed(0)}%`} tone="text-vault-text" />
            <Metric
              label="Burn Trend (7d)"
              value={`${metrics.burnTrendPct > 0 ? "+" : ""}${metrics.burnTrendPct}%`}
              tone={metrics.burnTrendPct <= 0 ? "text-emerald-300" : "text-amber-300"}
            />
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
            <input
              ref={searchRef}
              value={txSearch}
              onChange={(event) => setTxSearch(event.target.value)}
              placeholder="/ search ledger, merchant, or category"
              className="h-9 rounded border border-vault-accent/30 bg-vault-bg/60 px-3 text-xs"
            />
            <button
              type="button"
              onClick={syncPlaid}
              className="h-9 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs uppercase tracking-[0.14em] text-emerald-300"
            >
              Sync bank data (Alt+S)
            </button>
            <button
              type="button"
              onClick={linkBank}
              disabled={linkLoading || exchangingToken}
              className="h-9 rounded border border-blue-500/30 bg-blue-500/10 px-3 text-xs uppercase tracking-[0.14em] text-blue-300 disabled:opacity-50"
            >
              {linkLoading ? "Preparing" : exchangingToken ? "Connecting" : "Connect bank"}
            </button>
          </div>
        </GlassPanel>

        {plaidStatus ? <Notice tone="success" text={plaidStatus} /> : null}
        {plaidError ? <Notice tone="error" text={plaidError} /> : null}
        {actionNotice ? <Notice tone="success" text={actionNotice} /> : null}
        {actionError ? <Notice tone="error" text={actionError} /> : null}

        <div className="grid gap-4 xl:grid-cols-[1fr_1.35fr_1fr]">
          <div className="space-y-4">
            <GlassPanel title="Routing Controls" className="p-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <SmallStat label="Connected accounts" value={String(accounts.length)} />
                <SmallStat label="Active rules" value={String(rules.filter((rule) => rule.is_active).length)} />
                <SmallStat label="Reserve target" value={`${metrics.reservePct}%`} />
                <SmallStat label="Debt exposure" value={`$${metrics.debtExposure.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} tone="text-amber-300" />
              </div>

              <div className="mt-3 rounded border border-vault-accent/20 bg-black/20 p-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.14em] text-vault-textDim">Cash routing lanes</p>
                  <button type="button" onClick={() => setShowAddRule((prev) => !prev)} className="text-xs text-vault-textDim hover:text-white">
                    {showAddRule ? "Hide" : "Add rule"}
                  </button>
                </div>

                <div className="space-y-1.5">
                  {flowMap.map((rule) => (
                    <div key={rule.id} className="rounded border border-vault-accent/20 bg-vault-bg/50 p-1.5">
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className="text-vault-text">{rule.name}</span>
                        <span className="text-vault-textDim">{rule.pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 rounded bg-black/40">
                        <div className="h-2 rounded bg-emerald-500/60" style={{ width: `${rule.width}%` }} />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-vault-textDim">
                        <span>{rule.destination_tag}</span>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => toggleRule(rule)} className="rounded border border-vault-accent/25 px-1.5 py-0.5">
                            {rule.is_active ? "Pause" : "Resume"}
                          </button>
                          <button type="button" onClick={() => deleteRule(rule)} className="rounded border border-red-500/25 px-1.5 py-0.5 text-red-400 hover:bg-red-500/10">
                            ×
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!flowMap.length ? <div className="somb-empty-state text-xs text-vault-textDim">No routing lanes yet. Add one to direct income automatically.</div> : null}
                </div>

                {showAddRule ? (
                  <form onSubmit={addRule} className="mt-2 grid gap-2 md:grid-cols-2">
                    <input
                      value={ruleForm.name}
                      onChange={(event) => setRuleForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Rule name"
                      className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                      required
                    />
                    <input
                      value={ruleForm.destination_tag}
                      onChange={(event) => setRuleForm((prev) => ({ ...prev, destination_tag: event.target.value }))}
                      placeholder="Destination lane"
                      className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                      required
                    />
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={ruleForm.allocation_pct}
                      onChange={(event) => setRuleForm((prev) => ({ ...prev, allocation_pct: event.target.value }))}
                      placeholder="Allocation %"
                      className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                      required
                    />
                    <select
                      value={ruleForm.destination_account_id}
                      onChange={(event) => setRuleForm((prev) => ({ ...prev, destination_account_id: event.target.value }))}
                      className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                    >
                      <option value="">No account mapping</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.account_name} ({account.routing_tag || "no tag"})
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="h-8 rounded border border-vault-accent/35 px-2 text-xs uppercase tracking-[0.14em] md:col-span-2">
                      Save routing rule
                    </button>
                  </form>
                ) : null}
              </div>

              <div className="mt-3 rounded border border-vault-accent/20 bg-black/20 p-2">
                <p className="mb-2 text-xs uppercase tracking-[0.14em] text-vault-textDim">Paycheck routing simulation</p>
                <form onSubmit={runRouter} className="grid gap-2">
                  <input
                    ref={routeRef}
                    type="number"
                    value={routeForm.income_amount}
                    onChange={(event) => setRouteForm((prev) => ({ ...prev, income_amount: event.target.value }))}
                    placeholder="Income amount"
                    className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                  />
                  <select
                    value={routeForm.source_account_id}
                    onChange={(event) => setRouteForm((prev) => ({ ...prev, source_account_id: event.target.value }))}
                    className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs"
                  >
                    <option value="">Use amount only</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.account_name} · avail ${Number(account.balance_available || 0).toFixed(2)}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="h-8 rounded border border-vault-accent/35 px-2 text-xs uppercase tracking-[0.14em]">
                    Simulate routing (Alt+R)
                  </button>
                </form>
              </div>
            </GlassPanel>
          </div>

          <div className="space-y-4">
            <GlassPanel title="Ledger + Activity" className="p-3">
              <div className="mb-2 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                <select value={txFilter} onChange={(event) => setTxFilter(event.target.value)} className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs">
                  <option value="all">All entries</option>
                  <option value="income">Money in</option>
                  <option value="expense">Money out</option>
                  <option value="recurring">Recurring</option>
                </select>
                <select value={txSort} onChange={(event) => setTxSort(event.target.value)} className="h-8 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 text-xs">
                  <option value="date_desc">Newest first</option>
                  <option value="amount_desc">Largest first</option>
                  <option value="amount_asc">Smallest first</option>
                </select>
                <div className="rounded border border-vault-accent/20 bg-black/20 px-2 py-1 text-[11px] text-vault-textDim">{filteredTransactions.length} rows</div>
              </div>

              <div className="max-h-96 overflow-auto rounded border border-vault-accent/20">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 bg-vault-panel/95">
                    <tr className="text-left text-vault-textDim">
                      <th className="px-2 py-1">Category</th>
                      <th className="px-2 py-1">Merchant</th>
                      <th className="px-2 py-1">Date</th>
                      <th className="px-2 py-1 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.slice(0, 120).map((tx) => (
                      <tr key={tx.id} className="border-t border-vault-accent/10">
                        <td className="px-2 py-1 text-vault-textDim">[{(tx.category || "other").slice(0, 10)}]</td>
                        <td className="px-2 py-1 text-vault-text">{tx.name}</td>
                        <td className="px-2 py-1 text-vault-textDim">{tx.transaction_date}</td>
                        <td className={`px-2 py-1 text-right ${tx.numericAmount < 0 ? "text-red-300" : "text-emerald-300"}`}>
                          {tx.numericAmount < 0 ? "-" : "+"}${Math.abs(tx.numericAmount).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!filteredTransactions.length ? <div className="mt-2 somb-empty-state text-xs text-vault-textDim">No ledger rows match these filters.</div> : null}
            </GlassPanel>

            <GlassPanel title="Cashflow timeline" className="p-3">
              <div className="max-h-56 space-y-1.5 overflow-auto text-xs">
                {financeTimeline.map((event) => (
                  <div key={event.id} className="rounded border border-vault-accent/20 bg-black/20 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-vault-text">{event.title}</span>
                      <span className={event.tone}>{event.detail}</span>
                    </div>
                    <p className="text-[10px] text-vault-textDim">{event.when.toLocaleString()}</p>
                  </div>
                ))}
                {!financeTimeline.length ? <div className="somb-empty-state text-vault-textDim">No activity yet.</div> : null}
              </div>
            </GlassPanel>
          </div>

          <div className="space-y-4">
            <GlassPanel title="What needs attention" className="p-3">
              <div className="space-y-2 text-xs">
                <div className="rounded border border-vault-accent/20 bg-black/20 p-2">
                  <p className="text-vault-textDim">Spendable cash</p>
                  <p className="text-lg text-emerald-300">${metrics.safeToSpend.toFixed(2)}</p>
                  <p className="text-[10px] text-vault-textDim">after bills and reserve target</p>
                </div>

                <InsightList
                  title={billsDue.some((tx) => tx.when > new Date()) ? "Bills due soon" : "Recurring expenses"}
                  items={billsDue}
                  amountTone="text-amber-300"
                />
                <InsightList title="Unusual spending" items={unusualSpending} amountTone="text-red-300" />
                <InsightList title="Ops spend" items={hostingExpenses} amountTone="text-vault-textDim" />
              </div>
            </GlassPanel>

            <GlassPanel title="Routing log" className="p-3">
              <div className="max-h-48 space-y-1.5 overflow-auto text-xs">
                {routing.slice(0, 10).map((event) => (
                  <div key={event.id} className="rounded border border-vault-accent/20 bg-black/20 px-2 py-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-vault-text">{event.destination_tag}</span>
                      <span className="text-emerald-300">${Number(event.amount_routed || 0).toFixed(2)}</span>
                    </div>
                    <p className="text-[10px] text-vault-textDim">{event.status} · {String(event.created_at || "").slice(0, 16)}</p>
                  </div>
                ))}
                {!routing.length ? <div className="somb-empty-state text-vault-textDim">No routing activity yet.</div> : null}
              </div>

              {routeResult?.routing_events?.length ? (
                <div className="mt-2 rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-200 space-y-1">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-400">
                    Simulation — {routeResult.routing_events.length} moves
                  </p>
                  {routeResult.routing_events.map((ev, i) => (
                    <div key={i} className="flex items-center justify-between text-emerald-100">
                      <span>{ev.destination_tag || ev.rule_name || "lane"}</span>
                      <span>${Number(ev.amount_routed || ev.amount || 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </GlassPanel>

            <GlassPanel title="Currency Converter" className="p-3">
              <div className="rounded-lg border-2 border-cyan-300/80 bg-[#111] p-4 text-center shadow-[0_0_24px_rgba(34,211,238,0.35)]">
                <h2 className="mb-2 text-sm uppercase tracking-[0.14em] text-cyan-300">Currency Converter</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    value={fxFrom}
                    onChange={(event) => setFxFrom(event.target.value)}
                    className="h-10 rounded border border-cyan-400/20 bg-[#222] px-3 text-sm text-cyan-300 outline-none"
                  >
                    <option value="USD">USD</option>
                    <option value="INR">INR</option>
                    <option value="EUR">EUR</option>
                  </select>
                  <select
                    value={fxTo}
                    onChange={(event) => setFxTo(event.target.value)}
                    className="h-10 rounded border border-cyan-400/20 bg-[#222] px-3 text-sm text-cyan-300 outline-none"
                  >
                    <option value="INR">INR</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
                <input
                  type="number"
                  min="0"
                  value={fxAmount}
                  onChange={(event) => setFxAmount(event.target.value)}
                  className="mt-2 h-10 w-full rounded border border-cyan-400/20 bg-[#222] px-3 text-sm text-cyan-300 outline-none"
                />
                <div className="mt-3 text-xl text-cyan-200">
                  Converted: {currencySymbols[fxTo] || ""} <span>{fxConverted.toFixed(2)}</span>
                </div>
                {fxLoading ? <p className="mt-1 text-[11px] text-cyan-400">Updating rate...</p> : null}
                {fxError ? <p className="mt-1 text-[11px] text-red-300">{fxError}</p> : null}
              </div>
            </GlassPanel>
          </div>
        </div>

        {!accounts.length && !plaidStatus && !plaidError ? (
          <div className="somb-empty-state text-xs text-vault-textDim">
            No bank accounts connected yet. Connect one to see cash position, routing, and spendable cash.
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function Metric({ label, value, tone }) {
  return (
    <div className="rounded border border-vault-accent/25 bg-black/25 p-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-vault-textDim">{label}</p>
      <p className={`font-display text-lg ${tone}`}>{value}</p>
    </div>
  );
}

function SmallStat({ label, value, tone = "text-vault-text" }) {
  return (
    <div className="rounded border border-vault-accent/20 bg-black/20 p-2">
      <p className="text-vault-textDim">{label}</p>
      <p className={`text-base ${tone}`}>{value}</p>
    </div>
  );
}

function Notice({ tone, text }) {
  const classes =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : "border-red-500/30 bg-red-500/10 text-red-200";

  return <div className={`rounded px-3 py-2 text-xs ${classes}`}>{text}</div>;
}

function InsightList({ title, items, amountTone }) {
  return (
    <div className="rounded border border-vault-accent/20 bg-black/20 p-2">
      <p className="mb-1 text-vault-textDim">{title}</p>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between">
            <span className="text-vault-text">{item.name}</span>
            <span className={amountTone}>${Math.abs(Number(item.numericAmount || 0)).toFixed(2)}</span>
          </div>
        ))}
        {!items.length ? <p className="text-vault-textDim">Nothing urgent.</p> : null}
      </div>
    </div>
  );
}
