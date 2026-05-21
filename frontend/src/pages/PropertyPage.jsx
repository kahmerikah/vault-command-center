import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api, { setAuthToken } from "../lib/api";
import { useVaultStore } from "../store/useVaultStore";
import GlassPanel from "../components/GlassPanel";
import MetricCard from "../components/MetricCard";

const PROPERTY_TYPES = ["single_family", "condo", "multi_family", "land", "commercial"];
const STATUSES = ["watching", "interested", "acquired", "archived", "passed"];
const ANALYSIS_STAGES = [
  "Fetching property metadata...",
  "Pulling comp activity...",
  "Analyzing neighborhood signals...",
  "Estimating valuation and cash flow...",
  "Scoring opportunity confidence...",
];

const verdictTone = {
  good_deal: "text-emerald-400",
  fair: "text-amber-300",
  overpriced: "text-red-400",
  unknown: "text-slate-500",
};

const statusTone = {
  watching: "text-cyan-300 border-cyan-400/40 bg-cyan-500/10",
  interested: "text-emerald-300 border-emerald-400/40 bg-emerald-500/10",
  acquired: "text-purple-300 border-purple-400/40 bg-purple-500/10",
  archived: "text-slate-300 border-slate-400/30 bg-slate-500/10",
  passed: "text-slate-400 border-slate-500/30 bg-slate-600/10",
};

function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "-";
  }
  return `$${num.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatPercent(value, digits = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "-";
  }
  return `${num.toFixed(digits)}%`;
}

function numericOrNull(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function deriveUndervaluationPct(listingPrice, estimatedValue) {
  const listing = Number(listingPrice);
  const estimate = Number(estimatedValue);
  if (!Number.isFinite(listing) || !Number.isFinite(estimate) || estimate <= 0) {
    return null;
  }
  return ((estimate - listing) / estimate) * 100;
}

function deriveCashFlow(property) {
  const rent = Number(property.estimated_rent);
  const mortgage = Number(property.monthly_mortgage_est);
  const listing = Number(property.listing_price || property.estimated_value);
  if (!Number.isFinite(rent)) {
    return null;
  }
  const taxes = Number.isFinite(listing) ? (listing * 0.012) / 12 : 0;
  const ops = rent * 0.35;
  return rent - ops - (Number.isFinite(mortgage) ? mortgage : 0) - taxes;
}

function deriveConfidence(property) {
  const score = Number(property.deal_score);
  if (Number.isFinite(score)) {
    if (score >= 75) {
      return "HIGH";
    }
    if (score >= 50) {
      return "MEDIUM";
    }
    return "LOW";
  }
  return "LOW";
}

function extractTags(text) {
  const source = String(text || "");
  const matches = source.match(/#[a-zA-Z0-9_-]+/g) || [];
  return matches.map((m) => m.toLowerCase());
}

export default function PropertyPage() {
  const { accessToken, clearAuth } = useVaultStore();

  const [properties, setProperties] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const [analyzing, setAnalyzing] = useState(false);
  const [stageMessage, setStageMessage] = useState(ANALYSIS_STAGES[0]);
  const stageTimerRef = useRef(null);

  const [analysis, setAnalysis] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [analysisForm, setAnalysisForm] = useState({
    address: "",
    listing_price: "",
    property_type: "single_family",
    sqft: "",
    zip_code: "",
    city: "",
    state: "",
    lot_size_sqft: "",
    year_built: "",
    bedrooms: "",
    bathrooms: "",
    rehab_estimate: "",
    target_roi_pct: "",
    down_payment_pct: "20",
    interest_rate_pct: "7",
    loan_years: "30",
    expense_ratio_pct: "35",
    status: "watching",
    notes: "",
  });

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("");
  const [sortKey, setSortKey] = useState("score");
  const [sortDir, setSortDir] = useState("desc");

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadProperties = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setAuthToken(accessToken);
    setLoading(true);
    try {
      const res = await api.get("/property?limit=100");
      const items = res.data?.data?.items || [];
      setProperties(items);
      if (selectedId) {
        const exists = items.find((p) => p.id === selectedId);
        if (!exists) {
          setSelectedId(null);
          setSelected(null);
        }
      }
    } catch (err) {
      if (err?.response?.status === 401) {
        clearAuth();
      }
      setError(err?.response?.data?.error || "Unable to load property intelligence data.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, clearAuth, selectedId]);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadProperties();
    }, 45000);
    return () => window.clearInterval(timer);
  }, [loadProperties]);

  const openProperty = async (id) => {
    setSelectedId(id);
    setError("");
    try {
      const res = await api.get(`/property/${id}`);
      setSelected(res.data?.data || null);
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to open property insights.");
    }
  };

  const cycleStages = () => {
    let idx = 0;
    setStageMessage(ANALYSIS_STAGES[idx]);
    stageTimerRef.current = window.setInterval(() => {
      idx = (idx + 1) % ANALYSIS_STAGES.length;
      setStageMessage(ANALYSIS_STAGES[idx]);
    }, 900);
  };

  const stopStageCycle = () => {
    if (stageTimerRef.current) {
      window.clearInterval(stageTimerRef.current);
      stageTimerRef.current = null;
    }
  };

  const runAnalysis = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setAnalyzing(true);
    cycleStages();

    const payload = {
      address: analysisForm.address,
      property_type: analysisForm.property_type,
      notes: analysisForm.notes,
      status: analysisForm.status,
      down_payment_pct: numericOrNull(analysisForm.down_payment_pct),
      interest_rate_pct: numericOrNull(analysisForm.interest_rate_pct),
      loan_years: numericOrNull(analysisForm.loan_years),
      expense_ratio_pct: numericOrNull(analysisForm.expense_ratio_pct),
      target_roi_pct: numericOrNull(analysisForm.target_roi_pct),
      rehab_estimate: numericOrNull(analysisForm.rehab_estimate),
      listing_price: numericOrNull(analysisForm.listing_price),
      sqft: numericOrNull(analysisForm.sqft),
      zip_code: analysisForm.zip_code || undefined,
      city: analysisForm.city || undefined,
      state: analysisForm.state || undefined,
      lot_size_sqft: numericOrNull(analysisForm.lot_size_sqft),
      year_built: numericOrNull(analysisForm.year_built),
      bedrooms: numericOrNull(analysisForm.bedrooms),
      bathrooms: numericOrNull(analysisForm.bathrooms),
    };

    try {
      const res = await api.post("/property/estimate", payload);
      const estimate = res.data?.data || null;
      setAnalysis(estimate);
      setNotice("Analysis complete. Review and track if the opportunity is viable.");
      setAnalysisForm((prev) => ({
        ...prev,
        zip_code: prev.zip_code || estimate?.zip_code || "",
        city: prev.city || estimate?.city || "",
        state: prev.state || estimate?.state || "",
        sqft: prev.sqft || (estimate?.sqft ? String(estimate.sqft) : ""),
        lot_size_sqft: prev.lot_size_sqft || (estimate?.lot_size_sqft ? String(estimate.lot_size_sqft) : ""),
        year_built: prev.year_built || (estimate?.year_built ? String(estimate.year_built) : ""),
        bedrooms: prev.bedrooms || (estimate?.bedrooms ? String(estimate.bedrooms) : ""),
        bathrooms: prev.bathrooms || (estimate?.bathrooms ? String(estimate.bathrooms) : ""),
      }));
    } catch (err) {
      setError(err?.response?.data?.error || "Analysis failed. Add zip code in advanced inputs and retry.");
      setAnalysis(null);
    } finally {
      stopStageCycle();
      setAnalyzing(false);
    }
  };

  const trackProperty = async () => {
    if (!analysis) {
      return;
    }

    setError("");
    setNotice("");

    const payload = {
      address: analysis.address,
      zip_code: analysis.zip_code || analysisForm.zip_code || undefined,
      city: analysis.city || analysisForm.city || undefined,
      state: analysis.state || analysisForm.state || undefined,
      property_type: analysis.property_type || analysisForm.property_type,
      listing_price: numericOrNull(analysisForm.listing_price) ?? numericOrNull(analysis.listing_price),
      bedrooms: numericOrNull(analysisForm.bedrooms) ?? numericOrNull(analysis.bedrooms),
      bathrooms: numericOrNull(analysisForm.bathrooms) ?? numericOrNull(analysis.bathrooms),
      sqft: numericOrNull(analysisForm.sqft) ?? numericOrNull(analysis.sqft),
      lot_size_sqft: numericOrNull(analysisForm.lot_size_sqft) ?? numericOrNull(analysis.lot_size_sqft),
      year_built: numericOrNull(analysisForm.year_built) ?? numericOrNull(analysis.year_built),
      status: analysisForm.status,
      notes: analysisForm.notes,
    };

    try {
      const res = await api.post("/property", payload);
      const created = res.data?.data;
      setNotice("Property tracked and moved into acquisition pipeline.");
      await loadProperties();
      if (created?.id) {
        await openProperty(created.id);
      }
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to track property.");
    }
  };

  const patchStatus = async (propertyId, status) => {
    setError("");
    try {
      await api.patch(`/property/${propertyId}`, { status });
      setNotice(`Status updated to ${status}.`);
      await loadProperties();
      if (selectedId === propertyId) {
        await openProperty(propertyId);
      }
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to update property status.");
    }
  };

  const triggerAnalyze = async (propertyId) => {
    setError("");
    try {
      await api.post(`/property/${propertyId}/analyze`);
      setNotice("Property re-analysis completed.");
      await loadProperties();
      if (selectedId === propertyId) {
        await openProperty(propertyId);
      }
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to re-analyze property.");
    }
  };

  const metrics = useMemo(() => {
    const tracked = properties.length;
    const goodDeals = properties.filter((p) => p.deal_verdict === "good_deal").length;
    const watching = properties.filter((p) => p.status === "watching").length;
    const interested = properties.filter((p) => p.status === "interested").length;
    return { tracked, goodDeals, watching, interested };
  }, [properties]);

  const tableRows = useMemo(() => {
    const tagNeedle = tagFilter.trim().toLowerCase();
    const textNeedle = query.trim().toLowerCase();

    const filtered = properties.filter((property) => {
      if (statusFilter !== "all" && property.status !== statusFilter) {
        return false;
      }

      if (textNeedle) {
        const haystack = [
          property.address,
          property.city,
          property.state,
          property.zip_code,
          property.property_type,
          property.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(textNeedle)) {
          return false;
        }
      }

      if (tagNeedle) {
        const tags = extractTags(property.notes);
        if (!tags.some((tag) => tag.includes(tagNeedle) || tagNeedle.includes(tag))) {
          return false;
        }
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const aUnderval = deriveUndervaluationPct(a.listing_price, a.estimated_value);
      const bUnderval = deriveUndervaluationPct(b.listing_price, b.estimated_value);
      const aCash = deriveCashFlow(a);
      const bCash = deriveCashFlow(b);

      const map = {
        score: [Number(a.deal_score) || 0, Number(b.deal_score) || 0],
        listing: [Number(a.listing_price) || 0, Number(b.listing_price) || 0],
        value: [Number(a.estimated_value) || 0, Number(b.estimated_value) || 0],
        undervaluation: [aUnderval || 0, bUnderval || 0],
        cashflow: [aCash || 0, bCash || 0],
        updated: [Date.parse(a.last_analyzed_at || a.created_at || "") || 0, Date.parse(b.last_analyzed_at || b.created_at || "") || 0],
      };

      const [aValue, bValue] = map[sortKey] || map.updated;
      return sortDir === "asc" ? aValue - bValue : bValue - aValue;
    });

    return sorted;
  }, [properties, query, statusFilter, tagFilter, sortDir, sortKey]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-10 rounded-xl bg-white/5 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-20 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
        <div className="h-52 rounded-xl bg-white/5 animate-pulse" />
        <div className="h-72 rounded-xl bg-white/5 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg tracking-widest text-white uppercase">Property Intelligence</h1>
          <p className="mt-1 font-mono text-[11px] text-slate-400 uppercase tracking-[0.18em]">
            Acquisition workflow, comp intelligence, and deal operations
          </p>
        </div>
      </div>

      {notice ? <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs font-mono text-emerald-200">{notice}</div> : null}
      {error ? <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs font-mono text-red-200">{error}</div> : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Tracked" value={metrics.tracked} status="ok" />
        <MetricCard label="Good Deals" value={metrics.goodDeals} status={metrics.goodDeals > 0 ? "ok" : "warn"} />
        <MetricCard label="Watching" value={metrics.watching} status="ok" />
        <MetricCard label="Interested" value={metrics.interested} status="ok" />
      </div>

      <GlassPanel>
        <form onSubmit={runAnalysis} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_170px_auto] gap-2">
            <input
              value={analysisForm.address}
              onChange={(e) => setAnalysisForm((prev) => ({ ...prev, address: e.target.value }))}
              placeholder="Search property address"
              className="h-11 bg-black/30 border border-white/10 rounded px-3 font-mono text-sm text-white outline-none focus:border-emerald-500/50"
              required
            />
            <input
              value={analysisForm.listing_price}
              onChange={(e) => setAnalysisForm((prev) => ({ ...prev, listing_price: e.target.value }))}
              placeholder="Listing price"
              className="h-11 bg-black/30 border border-white/10 rounded px-3 font-mono text-sm text-white outline-none focus:border-emerald-500/50"
            />
            <button
              type="submit"
              disabled={analyzing}
              className="h-11 px-5 rounded-lg bg-emerald-600/80 text-white font-mono text-xs tracking-wider hover:bg-emerald-600 transition disabled:opacity-60"
            >
              {analyzing ? "Analyzing..." : "Analyze"}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="text-xs font-mono text-slate-400 hover:text-white transition"
            >
              Advanced Inputs {showAdvanced ? "▲" : "▼"}
            </button>
            {analyzing ? <span className="text-xs font-mono text-cyan-300">{stageMessage}</span> : null}
          </div>

          {showAdvanced ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 border border-white/10 rounded-lg p-3 bg-black/20">
              <select
                value={analysisForm.property_type}
                onChange={(e) => setAnalysisForm((prev) => ({ ...prev, property_type: e.target.value }))}
                className="bg-black/30 border border-white/10 rounded px-2 py-2 font-mono text-xs text-white"
              >
                {PROPERTY_TYPES.map((type) => (
                  <option key={type} value={type}>{type.replace("_", " ")}</option>
                ))}
              </select>
              <input value={analysisForm.sqft} onChange={(e) => setAnalysisForm((p) => ({ ...p, sqft: e.target.value }))} placeholder="Sqft override" className="bg-black/30 border border-white/10 rounded px-2 py-2 font-mono text-xs text-white" />
              <input value={analysisForm.zip_code} onChange={(e) => setAnalysisForm((p) => ({ ...p, zip_code: e.target.value }))} placeholder="Zip override" className="bg-black/30 border border-white/10 rounded px-2 py-2 font-mono text-xs text-white" />
              <input value={analysisForm.lot_size_sqft} onChange={(e) => setAnalysisForm((p) => ({ ...p, lot_size_sqft: e.target.value }))} placeholder="Lot size" className="bg-black/30 border border-white/10 rounded px-2 py-2 font-mono text-xs text-white" />
              <input value={analysisForm.year_built} onChange={(e) => setAnalysisForm((p) => ({ ...p, year_built: e.target.value }))} placeholder="Year built" className="bg-black/30 border border-white/10 rounded px-2 py-2 font-mono text-xs text-white" />
              <input value={analysisForm.bedrooms} onChange={(e) => setAnalysisForm((p) => ({ ...p, bedrooms: e.target.value }))} placeholder="Bedrooms" className="bg-black/30 border border-white/10 rounded px-2 py-2 font-mono text-xs text-white" />
              <input value={analysisForm.bathrooms} onChange={(e) => setAnalysisForm((p) => ({ ...p, bathrooms: e.target.value }))} placeholder="Bathrooms" className="bg-black/30 border border-white/10 rounded px-2 py-2 font-mono text-xs text-white" />
              <input value={analysisForm.rehab_estimate} onChange={(e) => setAnalysisForm((p) => ({ ...p, rehab_estimate: e.target.value }))} placeholder="Rehab estimate" className="bg-black/30 border border-white/10 rounded px-2 py-2 font-mono text-xs text-white" />
              <input value={analysisForm.target_roi_pct} onChange={(e) => setAnalysisForm((p) => ({ ...p, target_roi_pct: e.target.value }))} placeholder="Target ROI %" className="bg-black/30 border border-white/10 rounded px-2 py-2 font-mono text-xs text-white" />
              <input value={analysisForm.down_payment_pct} onChange={(e) => setAnalysisForm((p) => ({ ...p, down_payment_pct: e.target.value }))} placeholder="Down payment %" className="bg-black/30 border border-white/10 rounded px-2 py-2 font-mono text-xs text-white" />
              <input value={analysisForm.interest_rate_pct} onChange={(e) => setAnalysisForm((p) => ({ ...p, interest_rate_pct: e.target.value }))} placeholder="Rate %" className="bg-black/30 border border-white/10 rounded px-2 py-2 font-mono text-xs text-white" />
              <input value={analysisForm.loan_years} onChange={(e) => setAnalysisForm((p) => ({ ...p, loan_years: e.target.value }))} placeholder="Loan years" className="bg-black/30 border border-white/10 rounded px-2 py-2 font-mono text-xs text-white" />
              <input value={analysisForm.expense_ratio_pct} onChange={(e) => setAnalysisForm((p) => ({ ...p, expense_ratio_pct: e.target.value }))} placeholder="Expense ratio %" className="bg-black/30 border border-white/10 rounded px-2 py-2 font-mono text-xs text-white" />
              <select value={analysisForm.status} onChange={(e) => setAnalysisForm((p) => ({ ...p, status: e.target.value }))} className="bg-black/30 border border-white/10 rounded px-2 py-2 font-mono text-xs text-white">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <textarea
                value={analysisForm.notes}
                onChange={(e) => setAnalysisForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Notes, tags (#rental #offmarket), reminders"
                className="col-span-2 md:col-span-3 bg-black/30 border border-white/10 rounded px-2 py-2 h-20 resize-none font-mono text-xs text-white"
              />
            </div>
          ) : null}
        </form>
      </GlassPanel>

      <GlassPanel>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="font-mono text-[10px] tracking-[0.18em] text-slate-500 uppercase">Analysis Intelligence</p>
            <p className="font-mono text-xs text-slate-400 mt-1">Results-first deal diagnostics with automated enrichment and confidence scoring.</p>
          </div>
          <button
            type="button"
            disabled={!analysis}
            onClick={trackProperty}
            className="px-3 py-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-emerald-300 font-mono text-xs disabled:opacity-40"
          >
            Track Property
          </button>
        </div>

        {!analysis ? (
          <div className="somb-empty-state">
            <p className="font-mono text-xs text-slate-200">Start with one address in the search bar.</p>
            <p className="mt-1 font-mono text-xs text-slate-500">The system will enrich property data, pull comps, estimate value, and classify opportunity automatically.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4">
            <div className="border border-white/10 rounded-xl p-4 bg-black/20">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Property Score</p>
                  <p className="font-mono text-2xl text-white">{analysis.deal_score ? `${Number(analysis.deal_score).toFixed(0)}/100` : "--"}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Estimated Market Value</p>
                  <p className="font-mono text-lg text-white">{formatMoney(analysis.estimated_value)}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Listing Price</p>
                  <p className="font-mono text-lg text-white">{formatMoney(analysis.listing_price)}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Potential Undervaluation</p>
                  <p className="font-mono text-lg text-emerald-300">{formatPercent(deriveUndervaluationPct(analysis.listing_price, analysis.estimated_value), 1)}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Estimated Cash Flow</p>
                  <p className="font-mono text-lg text-white">{formatMoney(analysis.monthly_cash_flow_est)}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Confidence</p>
                  <p className="font-mono text-lg text-cyan-300">{analysis.confidence || "LOW"}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Cap Rate</p><p className="font-mono text-sm text-white">{formatPercent(analysis.cap_rate_pct, 2)}</p></div>
                <div><p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">ROI Estimate</p><p className="font-mono text-sm text-white">{formatPercent(analysis.roi_estimate_pct, 2)}</p></div>
                <div><p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Mortgage Est.</p><p className="font-mono text-sm text-white">{formatMoney(analysis.monthly_mortgage_est)}</p></div>
                <div><p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Taxes Est.</p><p className="font-mono text-sm text-white">{formatMoney(analysis.monthly_tax_est)}</p></div>
                <div><p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Neighborhood Trend</p><p className="font-mono text-sm text-white">{String(analysis.neighborhood_trend || "unknown").replace(/_/g, " ")}</p></div>
                <div><p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Appreciation Trend</p><p className="font-mono text-sm text-white">{String(analysis.appreciation_trend || "unknown").replace(/_/g, " ")}</p></div>
                <div><p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Risk Level</p><p className="font-mono text-sm text-white">{String(analysis.risk_level || "unknown").toUpperCase()}</p></div>
                <div><p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Opportunity</p><p className="font-mono text-sm text-emerald-300">{String(analysis.opportunity_classification || "monitor").replace(/_/g, " ")}</p></div>
              </div>
            </div>

            <div className="border border-white/10 rounded-xl p-4 bg-black/20">
              <p className="font-mono text-[10px] tracking-[0.18em] text-slate-500 uppercase">Comparable Sales</p>
              <div className="mt-2 divide-y divide-white/5 max-h-[330px] overflow-y-auto">
                {(analysis.comps || []).length === 0 ? (
                  <p className="font-mono text-xs text-slate-500 py-4">No comps found for current criteria.</p>
                ) : (
                  (analysis.comps || []).slice(0, 10).map((comp, index) => (
                    <div key={`${comp.address}-${index}`} className="py-2 text-xs font-mono">
                      <p className="text-slate-300 truncate">{comp.address || "Unknown address"}</p>
                      <div className="flex items-center justify-between text-slate-500 mt-1">
                        <span>{formatMoney(comp.sale_price)}</span>
                        <span>{comp.sqft ? `${comp.sqft} sqft` : "-"}</span>
                        <span>{comp.price_per_sqft ? `${formatMoney(comp.price_per_sqft)}/sqft` : "-"}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </GlassPanel>

      <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_1fr] gap-4">
        <GlassPanel>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tracked properties"
              className="h-9 bg-black/30 border border-white/10 rounded px-3 font-mono text-xs text-white outline-none"
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 bg-black/30 border border-white/10 rounded px-2 font-mono text-xs text-white">
              <option value="all">All statuses</option>
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <input
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              placeholder="Filter by tag (#rental)"
              className="h-9 bg-black/30 border border-white/10 rounded px-3 font-mono text-xs text-white outline-none"
            />
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="h-9 bg-black/30 border border-white/10 rounded px-2 font-mono text-xs text-white">
              <option value="score">Sort: Score</option>
              <option value="listing">Sort: Listing</option>
              <option value="value">Sort: Estimated Value</option>
              <option value="undervaluation">Sort: Undervaluation</option>
              <option value="cashflow">Sort: Cash Flow</option>
              <option value="updated">Sort: Updated</option>
            </select>
            <button type="button" onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))} className="h-9 px-3 border border-white/10 rounded font-mono text-xs text-slate-300 hover:text-white">
              {sortDir === "asc" ? "Asc" : "Desc"}
            </button>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-xs font-mono">
              <thead className="text-slate-500 uppercase tracking-wider text-[10px]">
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 pr-2">Address</th>
                  <th className="text-left py-2 pr-2">Score</th>
                  <th className="text-left py-2 pr-2">Listing</th>
                  <th className="text-left py-2 pr-2">Value</th>
                  <th className="text-left py-2 pr-2">Undervaluation</th>
                  <th className="text-left py-2 pr-2">Cash Flow</th>
                  <th className="text-left py-2 pr-2">Confidence</th>
                  <th className="text-left py-2 pr-2">Status</th>
                  <th className="text-left py-2 pr-2">Updated</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-slate-500">No properties match current filters.</td>
                  </tr>
                ) : (
                  tableRows.map((property) => {
                    const undervaluation = deriveUndervaluationPct(property.listing_price, property.estimated_value);
                    const cashFlow = deriveCashFlow(property);
                    const confidence = deriveConfidence(property);
                    return (
                      <tr key={property.id} className={`border-b border-white/5 ${selectedId === property.id ? "bg-white/5" : ""}`}>
                        <td className="py-2 pr-2">
                          <button type="button" onClick={() => openProperty(property.id)} className="text-left hover:text-emerald-300">
                            <div>{property.address}</div>
                            <div className="text-[10px] text-slate-500">{property.city || "-"}, {property.state || "-"}</div>
                          </button>
                        </td>
                        <td className="py-2 pr-2">{property.deal_score ? Number(property.deal_score).toFixed(0) : "-"}</td>
                        <td className="py-2 pr-2">{formatMoney(property.listing_price)}</td>
                        <td className="py-2 pr-2">{formatMoney(property.estimated_value)}</td>
                        <td className="py-2 pr-2 text-emerald-300">{formatPercent(undervaluation, 1)}</td>
                        <td className="py-2 pr-2">{formatMoney(cashFlow)}</td>
                        <td className="py-2 pr-2">{confidence}</td>
                        <td className="py-2 pr-2">
                          <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] uppercase tracking-wider ${statusTone[property.status] || statusTone.watching}`}>
                            {property.status}
                          </span>
                        </td>
                        <td className="py-2 pr-2">{property.last_analyzed_at ? new Date(property.last_analyzed_at).toLocaleDateString() : "-"}</td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            <button type="button" onClick={() => patchStatus(property.id, property.status === "watching" ? "interested" : "watching")} className="px-2 py-1 border border-white/10 rounded text-[10px] hover:border-emerald-500/40">
                              {property.status === "watching" ? "Mark Interested" : "Watch"}
                            </button>
                            <button type="button" onClick={() => triggerAnalyze(property.id)} className="px-2 py-1 border border-emerald-500/30 rounded text-[10px] text-emerald-300">
                              Analyze
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </GlassPanel>

        <GlassPanel>
          {!selected ? (
            <div className="somb-empty-state">
              <p className="font-mono text-xs text-slate-300">Select a property for detailed intelligence.</p>
              <p className="mt-1 font-mono text-xs text-slate-500">Review comp snapshots, status progression, and operational notes.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-sm text-white">{selected.address}</p>
                  <p className="font-mono text-xs text-slate-500">{selected.city || "-"}, {selected.state || "-"} {selected.zip_code || ""}</p>
                </div>
                <span className={`font-mono text-xs ${verdictTone[selected.deal_verdict] || verdictTone.unknown}`}>
                  {String(selected.deal_verdict || "unknown").replace(/_/g, " ")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div><p className="text-slate-500">Listing</p><p className="text-white">{formatMoney(selected.listing_price)}</p></div>
                <div><p className="text-slate-500">Estimated Value</p><p className="text-white">{formatMoney(selected.estimated_value)}</p></div>
                <div><p className="text-slate-500">Deal Score</p><p className="text-white">{selected.deal_score ? `${Number(selected.deal_score).toFixed(0)}/100` : "-"}</p></div>
                <div><p className="text-slate-500">Status</p><p className="text-white uppercase">{selected.status}</p></div>
                <div><p className="text-slate-500">ROI Est.</p><p className="text-white">{formatPercent(selected.roi_estimate_pct, 2)}</p></div>
                <div><p className="text-slate-500">Cap Rate</p><p className="text-white">{formatPercent(selected.cap_rate_pct, 2)}</p></div>
              </div>

              <div className="flex flex-wrap gap-1">
                {STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => patchStatus(selected.id, status)}
                    className={`px-2 py-1 rounded border text-[10px] font-mono uppercase ${selected.status === status ? "border-emerald-500/45 text-emerald-300 bg-emerald-500/10" : "border-white/10 text-slate-400 hover:text-white"}`}
                  >
                    {status}
                  </button>
                ))}
              </div>

              <div>
                <p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Comp Snapshots</p>
                <div className="max-h-52 overflow-y-auto divide-y divide-white/5 mt-1">
                  {(selected.comps || []).slice(0, 12).map((comp) => (
                    <div key={comp.id} className="py-2 text-xs font-mono flex justify-between gap-2">
                      <span className="text-slate-300 truncate">{comp.address}</span>
                      <span className="text-white">{formatMoney(comp.sale_price)}</span>
                    </div>
                  ))}
                  {(selected.comps || []).length === 0 ? <p className="text-xs text-slate-500 py-2 font-mono">No comps captured for this property yet.</p> : null}
                </div>
              </div>

              <div>
                <p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Notes / Tags</p>
                <p className="font-mono text-xs text-slate-300 mt-1 whitespace-pre-wrap">{selected.notes || "No notes"}</p>
              </div>
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
