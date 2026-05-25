import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { setAuthToken } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import { useVaultStore } from "../store/useVaultStore";
import AppShell from "../components/AppShell";
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

const DEFAULT_CALIBRATION_FORM = {
  type_match_bonus: "0.35",
  type_related_bonus: "0.15",
  type_mismatch_penalty: "0.20",
  sqft_weight: "0.70",
  bed_weight: "0.08",
  bath_weight: "0.06",
  year_weight: "0.0041667",
  distance_penalty_per_mile: "0.07",
};

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
  const n = Number(String(value).replace(/[$,]/g, "").trim());
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
  const { accessToken, refreshToken, user, clearAuth } = useVaultStore();
  const [searchParams] = useSearchParams();

  const [properties, setProperties] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const [analyzing, setAnalyzing] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [savingCalibration, setSavingCalibration] = useState(false);
  const [stageMessage, setStageMessage] = useState(ANALYSIS_STAGES[0]);
  const stageTimerRef = useRef(null);

  // Address autocomplete
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const addressDebounceRef = useRef(null);
  const addressWrapperRef = useRef(null);

  const [analysis, setAnalysis] = useState(null);
  const [calibrationForm, setCalibrationForm] = useState(DEFAULT_CALIBRATION_FORM);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCalibration, setShowCalibration] = useState(false);
  const [analysisForm, setAnalysisForm] = useState({
    address: "",
    listing_price: "",
    property_type: "single_family",
    sqft: "",
    zip_code: "",
    city: "",
    state: "",
    lot_size_sqft: "",
    latitude: "",
    longitude: "",
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

  // Pre-fill address from ?address= query param (e.g. deep-linked from PDA Zillow lookup)
  useEffect(() => {
    const addrParam = searchParams.get("address");
    if (addrParam) {
      setAnalysisForm((prev) => ({ ...prev, address: decodeURIComponent(addrParam) }));
    }
  }, [searchParams]);

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

  // ── Address autocomplete (Nominatim / OpenStreetMap) ──────────────────
  const fetchAddressSuggestions = (value) => {
    clearTimeout(addressDebounceRef.current);
    if (!value || value.trim().length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    addressDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=json&limit=6&addressdetails=1&countrycodes=us`,
          { headers: { "Accept-Language": "en-US,en;q=0.9" } }
        );
        const data = await res.json();
        setAddressSuggestions(data || []);
        setShowSuggestions((data || []).length > 0);
      } catch {
        setAddressSuggestions([]);
        setShowSuggestions(false);
      }
    }, 320);
  };

  const selectAddressSuggestion = (item) => {
    const addr = item.address || {};
    const houseNumber = addr.house_number || "";
    const road = addr.road || addr.pedestrian || addr.path || "";
    const street = [houseNumber, road].filter(Boolean).join(" ").trim();
    const city = addr.city || addr.town || addr.village || addr.suburb || "";
    const state = addr.state || "";
    const zip = addr.postcode || "";
    const lat = item.lat || "";
    const lon = item.lon || "";

    const displayAddress = street
      ? `${street}${city ? `, ${city}` : ""}${state ? `, ${state}` : ""}${zip ? ` ${zip}` : ""}`
      : item.display_name;

    setAnalysisForm((prev) => ({
      ...prev,
      address: displayAddress,
      city: city || prev.city,
      state: state || prev.state,
      zip_code: zip || prev.zip_code,
      latitude: lat || prev.latitude,
      longitude: lon || prev.longitude,
    }));
    setAddressSuggestions([]);
    setShowSuggestions(false);
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (addressWrapperRef.current && !addressWrapperRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
      latitude: numericOrNull(analysisForm.latitude),
      longitude: numericOrNull(analysisForm.longitude),
      year_built: numericOrNull(analysisForm.year_built),
      bedrooms: numericOrNull(analysisForm.bedrooms),
      bathrooms: numericOrNull(analysisForm.bathrooms),
    };

    try {
      const res = await api.post("/property/estimate", payload);
      const estimate = res.data?.data || null;
      setAnalysis(estimate);
      if (estimate?.data_source === "market_baseline") {
        setNotice("Estimated using regional market data — no local comps found. Add a listing price or scrape comps for a precise AVM.");
      } else {
        setNotice("Analysis complete. Review and track if the opportunity is viable.");
      }
      setAnalysisForm((prev) => ({
        ...prev,
        zip_code: prev.zip_code || estimate?.zip_code || "",
        city: prev.city || estimate?.city || "",
        state: prev.state || estimate?.state || "",
        sqft: prev.sqft || (estimate?.sqft ? String(estimate.sqft) : ""),
        lot_size_sqft: prev.lot_size_sqft || (estimate?.lot_size_sqft ? String(estimate.lot_size_sqft) : ""),
        latitude: prev.latitude || (estimate?.latitude ? String(estimate.latitude) : ""),
        longitude: prev.longitude || (estimate?.longitude ? String(estimate.longitude) : ""),
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

  const scrapeComps = async () => {
    if (!analysisForm.address && !analysisForm.zip_code) {
      setError("Enter an address or zip code before scraping comps.");
      return;
    }

    setScraping(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        address: analysisForm.address,
        zip_code: analysisForm.zip_code || undefined,
        city: analysisForm.city || undefined,
        state: analysisForm.state || undefined,
        property_type: analysisForm.property_type,
        listing_price: numericOrNull(analysisForm.listing_price),
        sqft: numericOrNull(analysisForm.sqft),
        bedrooms: numericOrNull(analysisForm.bedrooms),
        bathrooms: numericOrNull(analysisForm.bathrooms),
        year_built: numericOrNull(analysisForm.year_built),
        latitude: numericOrNull(analysisForm.latitude),
        longitude: numericOrNull(analysisForm.longitude),
        max_results: 12,
      };
      const res = await api.post("/property/scrape-comps", payload);
      const data = res.data?.data || {};
      const nextEstimate = data.estimate || null;
      const subjectDetails = data.subject_details || null;

      // Auto-populate missing property details scraped from Zillow's property page.
      if (subjectDetails) {
        setAnalysisForm((prev) => ({
          ...prev,
          sqft: prev.sqft || (subjectDetails.sqft ? String(subjectDetails.sqft) : prev.sqft),
          bedrooms: prev.bedrooms || (subjectDetails.bedrooms ? String(subjectDetails.bedrooms) : prev.bedrooms),
          bathrooms: prev.bathrooms || (subjectDetails.bathrooms ? String(subjectDetails.bathrooms) : prev.bathrooms),
          year_built: prev.year_built || (subjectDetails.year_built ? String(subjectDetails.year_built) : prev.year_built),
          latitude: prev.latitude || (subjectDetails.latitude ? String(subjectDetails.latitude) : prev.latitude),
          longitude: prev.longitude || (subjectDetails.longitude ? String(subjectDetails.longitude) : prev.longitude),
        }));
      }

      if (nextEstimate) {
        setAnalysis(nextEstimate);
      }
      const enrichMsg = subjectDetails ? " Property details auto-populated from Zillow." : "";
      setNotice(`Scraped ${data.scraped_count || 0} comps from Zillow/Realtor.${enrichMsg}`);
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to scrape comps right now.");
    } finally {
      setScraping(false);
    }
  };

  const loadCalibration = async () => {
    setError("");
    try {
      const params = {
        property_type: analysisForm.property_type,
        zip_code: analysisForm.zip_code || undefined,
        city: analysisForm.city || undefined,
        state: analysisForm.state || undefined,
      };
      const res = await api.get("/property/avm-calibration", { params });
      const weights = res.data?.data?.calibration?.weights || {};
      setCalibrationForm((prev) => ({
        ...prev,
        ...Object.keys(prev).reduce((acc, key) => {
          acc[key] = weights[key] !== undefined ? String(weights[key]) : prev[key];
          return acc;
        }, {}),
      }));
      setNotice("Loaded AVM market calibration for current property context.");
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to load AVM calibration.");
    }
  };

  const saveCalibration = async () => {
    setSavingCalibration(true);
    setError("");
    try {
      const calibration = {
        weights: Object.keys(calibrationForm).reduce((acc, key) => {
          const numeric = numericOrNull(calibrationForm[key]);
          if (numeric !== null) {
            acc[key] = numeric;
          }
          return acc;
        }, {}),
      };
      await api.put("/property/avm-calibration", {
        market: {
          zip_code: analysisForm.zip_code || null,
          city: analysisForm.city || null,
          state: analysisForm.state || null,
          property_type: analysisForm.property_type,
        },
        calibration,
      });
      setNotice("AVM calibration saved for current market.");
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to save AVM calibration.");
    } finally {
      setSavingCalibration(false);
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
      latitude: numericOrNull(analysisForm.latitude) ?? numericOrNull(analysis.latitude),
      longitude: numericOrNull(analysisForm.longitude) ?? numericOrNull(analysis.longitude),
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
      <AppShell user={user} onLogout={handleLogout} title="property intelligence">
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
      </AppShell>
    );
  }

  return (
    <AppShell user={user} onLogout={handleLogout} title="property intelligence">
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
            {/* Address autocomplete */}
            <div ref={addressWrapperRef} className="relative">
              <input
                value={analysisForm.address}
                onChange={(e) => {
                  setAnalysisForm((prev) => ({ ...prev, address: e.target.value }));
                  fetchAddressSuggestions(e.target.value);
                }}
                onFocus={() => addressSuggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Search property address"
                className="h-11 w-full bg-black/30 border border-white/10 rounded px-3 font-mono text-sm text-white outline-none focus:border-emerald-500/50"
                required
                autoComplete="off"
              />
              {showSuggestions && addressSuggestions.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 top-full mt-1 rounded-lg border border-white/15 bg-zinc-900 shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                  {addressSuggestions.map((item) => (
                    <li
                      key={item.place_id}
                      onMouseDown={() => selectAddressSuggestion(item)}
                      className="px-3 py-2 font-mono text-xs text-slate-300 hover:bg-emerald-600/25 hover:text-white cursor-pointer border-b border-white/5 last:border-0 truncate"
                      title={item.display_name}
                    >
                      {item.display_name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={scraping}
                onClick={scrapeComps}
                className="h-8 px-3 rounded border border-cyan-500/35 bg-cyan-500/10 text-cyan-300 font-mono text-[11px] disabled:opacity-50"
              >
                {scraping ? "Scraping..." : "Scrape Zillow/Realtor"}
              </button>
              {analyzing ? <span className="text-xs font-mono text-cyan-300">{stageMessage}</span> : null}
            </div>
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
              <input value={analysisForm.latitude} onChange={(e) => setAnalysisForm((p) => ({ ...p, latitude: e.target.value }))} placeholder="Latitude" className="bg-black/30 border border-white/10 rounded px-2 py-2 font-mono text-xs text-white" />
              <input value={analysisForm.longitude} onChange={(e) => setAnalysisForm((p) => ({ ...p, longitude: e.target.value }))} placeholder="Longitude" className="bg-black/30 border border-white/10 rounded px-2 py-2 font-mono text-xs text-white" />
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadCalibration}
              className="px-3 py-1.5 rounded-lg border border-cyan-500/35 bg-cyan-500/10 text-cyan-300 font-mono text-xs"
            >
              Load Calibration
            </button>
            <button
              type="button"
              onClick={() => setShowCalibration((prev) => !prev)}
              className="px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 text-slate-200 font-mono text-xs"
            >
              {showCalibration ? "Hide" : "Tune"} AVM
            </button>
            <button
              type="button"
              disabled={!analysis}
              onClick={trackProperty}
              className="px-3 py-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-emerald-300 font-mono text-xs disabled:opacity-40"
            >
              Track Property
            </button>
          </div>
        </div>

        {showCalibration ? (
          <div className="mb-4 border border-cyan-500/20 rounded-xl p-3 bg-cyan-500/5">
            <p className="font-mono text-[10px] tracking-[0.18em] text-cyan-200 uppercase">AVM Calibration</p>
            <p className="font-mono text-xs text-cyan-100/70 mt-1">Tune feature weights per market for this property type and location context.</p>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.keys(calibrationForm).map((key) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] text-cyan-200 uppercase tracking-wider">{key.replace(/_/g, " ")}</span>
                  <input
                    value={calibrationForm[key]}
                    onChange={(e) => setCalibrationForm((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="bg-black/30 border border-cyan-400/20 rounded px-2 py-2 font-mono text-xs text-white"
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                disabled={savingCalibration}
                onClick={saveCalibration}
                className="px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-cyan-200 font-mono text-xs disabled:opacity-50"
              >
                {savingCalibration ? "Saving..." : "Save Calibration"}
              </button>
            </div>
          </div>
        ) : null}

        {!analysis ? (
          <div className="space-y-4">
            {/* Market Intelligence Context — shown when no analysis is active */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Sacramento median $/sqft", value: "$320", tone: "text-emerald-300", note: "Sacramento CA" },
                { label: "Rancho Cordova median $/sqft", value: "$278", tone: "text-emerald-300", note: "Sacramento suburb" },
                { label: "National median $/sqft", value: "$185", tone: "text-vault-text", note: "US average" },
                { label: "7% interest rate", value: "30yr fixed", tone: "text-amber-300", note: "Current rate environment" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                  <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                  <p className={`font-mono text-base mt-1 ${item.tone}`}>{item.value}</p>
                  <p className="font-mono text-[10px] text-slate-600 mt-0.5">{item.note}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-vault-accent/15 bg-vault-accent/5 px-4 py-3 flex items-start gap-3">
              <span className="text-vault-accent text-lg mt-0.5">⬡</span>
              <div>
                <p className="font-mono text-xs text-vault-text font-semibold">PROPERTY INTELLIGENCE ENGINE — READY</p>
                <p className="font-mono text-[11px] text-slate-400 mt-1">
                  Enter an address above to get AVM valuation, deal scoring, comp analysis, cash flow estimate, and opportunity classification.
                  Use <span className="text-cyan-300">Scrape Zillow/Realtor</span> to auto-pull comps and subject property details.
                </p>
              </div>
            </div>

            {properties.length > 0 && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">Pipeline Snapshot</p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {properties.slice(0, 6).map((prop) => {
                    const cashflow = deriveCashFlow(prop);
                    const underval = deriveUndervaluationPct(prop.listing_price, prop.estimated_value);
                    return (
                      <button
                        key={prop.id}
                        type="button"
                        onClick={() => openProperty(prop.id)}
                        className="text-left rounded-xl border border-white/10 bg-black/25 px-3 py-3 hover:border-vault-accent/40 hover:bg-vault-accent/5 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-mono text-xs text-white truncate">{prop.address}</p>
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${statusTone[prop.status] || "text-slate-400 border-slate-400/20"} flex-shrink-0`}>
                            {prop.status}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] font-mono">
                          <div>
                            <p className="text-slate-500">Score</p>
                            <p className="text-white">{prop.deal_score ? `${Number(prop.deal_score).toFixed(0)}` : "—"}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Value</p>
                            <p className="text-emerald-300">{formatMoney(prop.estimated_value)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">{underval !== null ? "Underval" : "CF/mo"}</p>
                            <p className={underval !== null && underval > 0 ? "text-emerald-300" : underval !== null && underval < -5 ? "text-red-400" : "text-white"}>
                              {underval !== null ? formatPercent(underval, 1) : formatMoney(cashflow)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4">
            {analysis.data_source === "market_baseline" && (
              <div className="xl:col-span-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-300 text-xs">
                <span className="mt-0.5">⚠</span>
                <span>
                  <strong>Regional estimate only</strong> — no comparable sales found in the database for this area.
                  Values are based on {analysis.city || analysis.state || "national"} market medians.
                  For a precise AVM, enter a listing price or use <strong>Scrape Comps</strong>.
                </span>
              </div>
            )}
            <div className="border border-white/10 rounded-xl p-4 bg-black/20">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Property Score</p>
                  <p className="font-mono text-2xl text-white">{analysis.deal_score ? `${Number(analysis.deal_score).toFixed(0)}/100` : "--"}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">Estimated Market Value</p>
                  <p className="font-mono text-lg text-white">{formatMoney(analysis.estimated_value)}</p>
                  {analysis.zestimate && (
                    <p className="font-mono text-[10px] text-slate-400 mt-0.5">
                      Zestimate™ <span className="text-slate-300">{formatMoney(analysis.zestimate)}</span>
                    </p>
                  )}
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

              <div className="mt-4 border border-white/10 rounded-xl p-3 bg-black/20">
                <p className="font-mono text-[10px] tracking-[0.18em] text-slate-500 uppercase">AVM Explainability</p>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(analysis?.avm_details?.feature_adjustments || {}).length === 0 ? (
                    <p className="col-span-full font-mono text-xs text-slate-500">Feature adjustments unavailable until comparable data is present.</p>
                  ) : (
                    Object.entries(analysis?.avm_details?.feature_adjustments || {}).map(([name, value]) => (
                      <div key={name} className="rounded border border-white/10 px-2 py-1">
                        <p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">{name}</p>
                        <p className="font-mono text-sm text-white">{Number(value).toFixed(3)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="border border-white/10 rounded-xl p-4 bg-black/20">
              <p className="font-mono text-[10px] tracking-[0.18em] text-slate-500 uppercase">Top Weighted Comps</p>
              <div className="mt-2 divide-y divide-white/5 max-h-[330px] overflow-y-auto">
                {(analysis?.avm_details?.top_comps || analysis.comps || []).length === 0 ? (
                  <p className="font-mono text-xs text-slate-500 py-4">No comps found for current criteria.</p>
                ) : (
                  (analysis?.avm_details?.top_comps || analysis.comps || []).slice(0, 5).map((comp, index) => (
                    <div key={`${comp.address}-${index}`} className="py-2 text-xs font-mono">
                      <p className="text-slate-300 truncate">{comp.address || "Unknown address"}</p>
                      <div className="flex items-center justify-between text-slate-500 mt-1">
                        <span>{formatMoney(comp.sale_price)}</span>
                        <span>{comp.sqft ? `${comp.sqft} sqft` : "-"}</span>
                        <span>{comp.price_per_sqft ? `${formatMoney(comp.price_per_sqft)}/sqft` : "-"}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-cyan-300/90 mt-1">
                        <span>Similarity: {Number(comp.similarity || 0).toFixed(3)}</span>
                        <span>{comp.distance_miles ? `${Number(comp.distance_miles).toFixed(2)} mi` : "distance n/a"}</span>
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
    </AppShell>
  );
}
