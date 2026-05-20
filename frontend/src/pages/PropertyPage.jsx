import { useEffect, useState, useCallback } from "react";
import api, { setAuthToken } from "../lib/api";
import { useVaultStore } from "../store/useVaultStore";
import GlassPanel from "../components/GlassPanel";
import MetricCard from "../components/MetricCard";

const PROPERTY_TYPES = ["single_family", "condo", "multi_family", "land", "commercial"];
const STATUSES = ["watching", "interested", "passed", "acquired"];

const verdictColor = (v) => ({
  good_deal: "text-emerald-400",
  fair: "text-yellow-400",
  overpriced: "text-red-400",
  unknown: "text-slate-500",
}[v] || "text-slate-500");

export default function PropertyPage() {
  const { accessToken, clearAuth } = useVaultStore();
  const [properties, setProperties] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [estimateForm, setEstimateForm] = useState({ address: "", zip_code: "", listing_price: "", sqft: "", property_type: "single_family" });
  const [estimate, setEstimate] = useState(null);
  const [form, setForm] = useState({
    address: "", zip_code: "", city: "", state: "",
    property_type: "single_family", listing_price: "", bedrooms: "", bathrooms: "", sqft: "", notes: "",
  });
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setAuthToken(accessToken);
    setLoading(true);
    try {
      const res = await api.get("/property?limit=50");
      setProperties(res.data?.data?.items || []);
    } catch (err) {
      if (err?.response?.status === 401) clearAuth();
    } finally {
      setLoading(false);
    }
  }, [accessToken, clearAuth]);

  useEffect(() => { load(); }, [load]);

  const openProperty = async (id) => {
    setActionError("");
    try {
      const res = await api.get(`/property/${id}`);
      setSelected(res.data?.data);
    } catch (err) {
      setActionError(err?.response?.data?.error || "Unable to open property details.");
    }
  };

  const addProperty = async (e) => {
    e.preventDefault();
    setActionError("");
    try {
      await api.post("/property", form);
      setShowAdd(false);
      setForm({ address: "", zip_code: "", city: "", state: "", property_type: "single_family", listing_price: "", bedrooms: "", bathrooms: "", sqft: "", notes: "" });
      await load();
    } catch (err) {
      setActionError(err?.response?.data?.error || "Unable to add property.");
    }
  };

  const reAnalyze = async (id) => {
    setActionError("");
    try {
      const res = await api.post(`/property/${id}/analyze`);
      setSelected(res.data?.data);
      await load();
    } catch (err) {
      setActionError(err?.response?.data?.error || "Unable to re-analyze property.");
    }
  };

  const updateStatus = async (id, status) => {
    await api.patch(`/property/${id}`, { status });
    setSelected(s => s ? { ...s, status } : s);
    load();
  };

  const deals = properties.filter(p => p.deal_verdict === "good_deal").length;

  const runEstimate = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post("/property/estimate", estimateForm);
      setEstimate(res.data?.data || null);
    } catch (err) {
      setEstimate(null);
      setActionError(err?.response?.data?.error || "Unable to estimate value.");
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 font-mono text-slate-400 text-xs tracking-widest">loading property intelligence...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg tracking-widest text-white uppercase">Property Intelligence</h1>
        <button type="button" onClick={() => setShowAdd(!showAdd)} className="px-3 py-1.5 rounded-lg border border-white/10 text-white font-mono text-xs hover:bg-white/5 transition">
          + Add Property
        </button>
      </div>

      {actionError ? <div className="text-xs font-mono text-red-300">{actionError}</div> : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Tracked" value={properties.length} status="ok" />
        <MetricCard label="Good Deals" value={deals} status={deals > 0 ? "ok" : "warn"} />
        <MetricCard label="Watching" value={properties.filter(p => p.status === "watching").length} status="ok" />
        <MetricCard label="Interested" value={properties.filter(p => p.status === "interested").length} status="ok" />
      </div>

      <GlassPanel>
        <p className="font-mono text-xs text-slate-500 mb-3 uppercase tracking-widest">Value Estimator</p>
        <form onSubmit={runEstimate} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <label className="font-mono text-xs text-slate-400">Address</label>
            <input required value={estimateForm.address} onChange={e => setEstimateForm(p => ({ ...p, address: e.target.value }))}
              className="bg-black/30 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white outline-none focus:border-emerald-500/50" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-slate-400">Zip Code</label>
            <input required value={estimateForm.zip_code} onChange={e => setEstimateForm(p => ({ ...p, zip_code: e.target.value }))}
              className="bg-black/30 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white outline-none focus:border-emerald-500/50" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-slate-400">Listing Price ($)</label>
            <input value={estimateForm.listing_price} onChange={e => setEstimateForm(p => ({ ...p, listing_price: e.target.value }))}
              className="bg-black/30 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white outline-none focus:border-emerald-500/50" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-slate-400">Sqft</label>
            <input value={estimateForm.sqft} onChange={e => setEstimateForm(p => ({ ...p, sqft: e.target.value }))}
              className="bg-black/30 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white outline-none focus:border-emerald-500/50" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-slate-400">Property Type</label>
            <select value={estimateForm.property_type} onChange={e => setEstimateForm(p => ({ ...p, property_type: e.target.value }))}
              className="bg-black/30 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white outline-none">
              {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
          </div>
          <div className="col-span-2 flex justify-end">
            <button type="submit" className="px-4 py-1.5 rounded-lg bg-emerald-600/80 text-white font-mono text-xs hover:bg-emerald-600 transition">
              Estimate Value
            </button>
          </div>
        </form>
        {estimate && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><p className="font-mono text-xs text-slate-500">Estimated Value</p><p className="font-mono text-sm text-white">{estimate.estimated_value ? `$${Number(estimate.estimated_value).toLocaleString()}` : "—"}</p></div>
            <div><p className="font-mono text-xs text-slate-500">Deal Verdict</p><p className={`font-mono text-sm ${verdictColor(estimate.deal_verdict)}`}>{estimate.deal_verdict?.replace("_", " ") || "unknown"}</p></div>
            <div><p className="font-mono text-xs text-slate-500">Deal Score</p><p className="font-mono text-sm text-white">{estimate.deal_score ? `${Number(estimate.deal_score).toFixed(0)}/100` : "—"}</p></div>
            <div><p className="font-mono text-xs text-slate-500">Comps Used</p><p className="font-mono text-sm text-white">{estimate.comps_used ?? 0}</p></div>
          </div>
        )}
      </GlassPanel>

      {showAdd && (
        <GlassPanel>
          <form onSubmit={addProperty} className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1">
              <label className="font-mono text-xs text-slate-400">Address</label>
              <input required value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                className="bg-black/30 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white outline-none focus:border-emerald-500/50" />
            </div>
            {[["zip_code", "Zip Code"], ["city", "City"], ["state", "State"], ["listing_price", "Listing Price ($)"], ["bedrooms", "Bedrooms"], ["bathrooms", "Bathrooms"], ["sqft", "Sqft"]].map(([f, label]) => (
              <div key={f} className="flex flex-col gap-1">
                <label className="font-mono text-xs text-slate-400">{label}</label>
                <input value={form[f]} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))}
                  className="bg-black/30 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white outline-none focus:border-emerald-500/50" />
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs text-slate-400">Property Type</label>
              <select value={form.property_type} onChange={e => setForm(p => ({ ...p, property_type: e.target.value }))}
                className="bg-black/30 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white outline-none">
                {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <label className="font-mono text-xs text-slate-400">Notes</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                className="bg-black/30 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white outline-none h-16 resize-none" />
            </div>
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 font-mono text-xs text-slate-400 hover:text-white transition">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded-lg bg-emerald-600/80 text-white font-mono text-xs hover:bg-emerald-600 transition">Analyze & Add</button>
            </div>
          </form>
        </GlassPanel>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Property List */}
        <GlassPanel>
          <p className="font-mono text-xs text-slate-500 mb-3 tracking-widest uppercase">Properties</p>
          {properties.length === 0 ? (
            <p className="text-center py-8 font-mono text-xs text-slate-500">No properties tracked yet.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {properties.map(p => (
                <button key={p.id} type="button" onClick={() => openProperty(p.id)}
                  className={`w-full text-left py-3 px-1 hover:bg-white/5 transition ${selected?.id === p.id ? "bg-white/5" : ""}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-mono text-xs text-white">{p.address}</p>
                      <p className="font-mono text-xs text-slate-500">{p.zip_code} · {p.property_type.replace("_", " ")} · {p.status}</p>
                    </div>
                    <span className={`font-mono text-xs ${verdictColor(p.deal_verdict)}`}>
                      {p.deal_verdict ? p.deal_verdict.replace("_", " ") : "—"}
                    </span>
                  </div>
                  {p.listing_price && (
                    <p className="font-mono text-xs text-slate-400 mt-1">
                      ${parseFloat(p.listing_price).toLocaleString()} {p.deal_score ? `· score: ${parseFloat(p.deal_score).toFixed(0)}` : ""}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </GlassPanel>

        {/* Property Detail */}
        {selected ? (
          <GlassPanel>
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="font-mono text-sm text-white">{selected.address}</p>
                <p className="font-mono text-xs text-slate-500">{selected.city}, {selected.state} {selected.zip_code}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => reAnalyze(selected.id)} className="px-2 py-1 rounded border border-emerald-500/30 text-emerald-400 font-mono text-xs hover:bg-emerald-500/10 transition">
                  Re-analyze
                </button>
                <button type="button" onClick={() => setSelected(null)} className="text-slate-500 hover:text-white font-mono text-xs">✕</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                ["Listing Price", selected.listing_price ? `$${parseFloat(selected.listing_price).toLocaleString()}` : "—"],
                ["Est. Value", selected.estimated_value ? `$${parseFloat(selected.estimated_value).toLocaleString()}` : "—"],
                ["Area Avg", selected.area_avg_price ? `$${parseFloat(selected.area_avg_price).toLocaleString()}` : "—"],
                ["Deviation", selected.price_deviation_pct ? `${parseFloat(selected.price_deviation_pct).toFixed(2)}%` : "—"],
                ["Est. Rent/mo", selected.estimated_rent ? `$${parseFloat(selected.estimated_rent).toLocaleString()}` : "—"],
                ["Mortgage Est.", selected.monthly_mortgage_est ? `$${parseFloat(selected.monthly_mortgage_est).toLocaleString()}` : "—"],
                ["Cap Rate", selected.cap_rate_pct ? `${parseFloat(selected.cap_rate_pct).toFixed(2)}%` : "—"],
                ["ROI Est.", selected.roi_estimate_pct ? `${parseFloat(selected.roi_estimate_pct).toFixed(2)}%` : "—"],
              ].map(([label, val]) => (
                <div key={label}>
                  <p className="font-mono text-xs text-slate-500">{label}</p>
                  <p className="font-mono text-sm text-white">{val}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 mb-4">
              <span className={`font-mono text-base font-bold ${verdictColor(selected.deal_verdict)}`}>
                {selected.deal_verdict?.replace("_", " ").toUpperCase() || "UNKNOWN"}
              </span>
              {selected.deal_score && (
                <span className="font-mono text-xs text-slate-400">Score: {parseFloat(selected.deal_score).toFixed(0)}/100</span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {STATUSES.map(s => (
                <button key={s} type="button" onClick={() => updateStatus(selected.id, s)}
                  className={`px-2 py-1 rounded font-mono text-xs border transition ${selected.status === s ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10" : "border-white/10 text-slate-500 hover:text-white"}`}>
                  {s}
                </button>
              ))}
            </div>
            {selected.comps?.length > 0 && (
              <div className="mt-4">
                <p className="font-mono text-xs text-slate-500 mb-2 uppercase tracking-widest">Comps ({selected.comps.length})</p>
                <div className="divide-y divide-white/5 max-h-40 overflow-y-auto">
                  {selected.comps.map(c => (
                    <div key={c.id} className="flex justify-between py-2 font-mono text-xs">
                      <span className="text-slate-400 truncate max-w-[60%]">{c.address}</span>
                      <span className="text-white">${parseFloat(c.sale_price).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </GlassPanel>
        ) : (
          <GlassPanel>
            <div className="flex items-center justify-center h-full min-h-[200px] text-slate-500 font-mono text-xs">
              Select a property to view analysis
            </div>
          </GlassPanel>
        )}
      </div>
    </div>
  );
}
