import { useEffect, useState, useCallback } from "react";
import api, { setAuthToken } from "../lib/api";
import { useVaultStore } from "../store/useVaultStore";
import GlassPanel from "../components/GlassPanel";

const KINDS = ["note", "prompt", "idea", "workflow", "architecture", "api_doc", "strategy", "recipe", "infrastructure", "automation"];

const kindColor = (k) => ({
  prompt: "text-purple-400 border-purple-500/30",
  idea: "text-yellow-400 border-yellow-500/30",
  workflow: "text-blue-400 border-blue-500/30",
  architecture: "text-emerald-400 border-emerald-500/30",
  api_doc: "text-orange-400 border-orange-500/30",
  strategy: "text-pink-400 border-pink-500/30",
  recipe: "text-teal-400 border-teal-500/30",
  infrastructure: "text-cyan-400 border-cyan-500/30",
  automation: "text-indigo-400 border-indigo-500/30",
}[k] || "text-slate-400 border-white/10");

export default function KnowledgePage() {
  const { accessToken, clearAuth } = useVaultStore();
  const [entries, setEntries] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterKind, setFilterKind] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", kind: "note", category: "", tags: "" });
  const [page, setPage] = useState(1);

  const load = useCallback(async (q = search, kind = filterKind, p = page) => {
    if (!accessToken) return;
    setAuthToken(accessToken);
    setLoading(true);
    try {
      const res = await api.get("/knowledge", { params: { q, kind: kind || undefined, page: p, limit: 20 } });
      setEntries(res.data?.data?.items || []);
      setPagination(res.data?.data?.pagination);
    } catch (err) {
      if (err?.response?.status === 401) clearAuth();
    } finally {
      setLoading(false);
    }
  }, [accessToken, clearAuth, search, filterKind, page]);

  useEffect(() => { load(); }, [load]);

  const addEntry = async (e) => {
    e.preventDefault();
    try {
      await api.post("/knowledge", form);
      setShowAdd(false);
      setForm({ title: "", body: "", kind: "note", category: "", tags: "" });
      load();
    } catch {}
  };

  const archiveEntry = async (id) => {
    await api.delete(`/knowledge/${id}`);
    setSelected(null);
    load();
  };

  const togglePin = async (entry) => {
    await api.patch(`/knowledge/${entry.id}`, { is_pinned: !entry.is_pinned });
    load();
    if (selected?.id === entry.id) setSelected(s => ({ ...s, is_pinned: !entry.is_pinned }));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg tracking-widest text-white uppercase">Knowledge OS</h1>
        <button type="button" onClick={() => setShowAdd(!showAdd)} className="px-3 py-1.5 rounded-lg border border-white/10 text-white font-mono text-xs hover:bg-white/5 transition">
          + Add Entry
        </button>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search notes, prompts, docs..."
          value={search}
          onChange={e => { setSearch(e.target.value); load(e.target.value, filterKind, 1); }}
          className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white placeholder:text-slate-600 outline-none focus:border-emerald-500/50"
        />
        <select value={filterKind} onChange={e => { setFilterKind(e.target.value); load(search, e.target.value, 1); }}
          className="bg-black/30 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white outline-none">
          <option value="">All kinds</option>
          {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

      {showAdd && (
        <GlassPanel>
          <form onSubmit={addEntry} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1">
                <label className="font-mono text-xs text-slate-400">Title</label>
                <input required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  className="bg-black/30 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white outline-none focus:border-emerald-500/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono text-xs text-slate-400">Kind</label>
                <select value={form.kind} onChange={e => setForm(p => ({ ...p, kind: e.target.value }))}
                  className="bg-black/30 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white outline-none">
                  {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono text-xs text-slate-400">Tags (comma-separated)</label>
                <input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
                  className="bg-black/30 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white outline-none focus:border-emerald-500/50" />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <label className="font-mono text-xs text-slate-400">Content</label>
                <textarea required value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
                  className="bg-black/30 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white outline-none h-28 resize-none focus:border-emerald-500/50" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 font-mono text-xs text-slate-400 hover:text-white transition">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded-lg bg-emerald-600/80 text-white font-mono text-xs hover:bg-emerald-600 transition">Save</button>
            </div>
          </form>
        </GlassPanel>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Entry List */}
        <GlassPanel>
          {loading ? (
            <div className="text-center py-12 font-mono text-xs text-slate-500">searching vault...</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 font-mono text-xs text-slate-500">
              {search ? "No results found." : "Vault is empty. Add your first entry."}
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {entries.map(e => (
                <button key={e.id} type="button" onClick={() => setSelected(e)}
                  className={`w-full text-left py-3 px-1 hover:bg-white/5 transition ${selected?.id === e.id ? "bg-white/5" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {e.is_pinned && <span className="text-yellow-400 text-xs">★</span>}
                        <p className="font-mono text-xs text-white truncate">{e.title}</p>
                      </div>
                      <p className="font-mono text-xs text-slate-500 truncate mt-0.5">{e.body?.slice(0, 60)}...</p>
                    </div>
                    <span className={`shrink-0 font-mono text-xs border rounded px-1.5 py-0.5 ${kindColor(e.kind)}`}>{e.kind}</span>
                  </div>
                  {e.tags?.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {e.tags.map(t => <span key={t} className="font-mono text-xs text-slate-600 bg-white/5 rounded px-1.5 py-0.5">{t}</span>)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          {pagination && pagination.total > pagination.limit && (
            <div className="flex justify-between pt-3 border-t border-white/5 mt-3">
              <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="font-mono text-xs text-slate-400 hover:text-white disabled:opacity-30 transition">← prev</button>
              <span className="font-mono text-xs text-slate-500">{page} / {Math.ceil(pagination.total / pagination.limit)}</span>
              <button type="button" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(pagination.total / pagination.limit)}
                className="font-mono text-xs text-slate-400 hover:text-white disabled:opacity-30 transition">next →</button>
            </div>
          )}
        </GlassPanel>

        {/* Detail View */}
        {selected ? (
          <GlassPanel>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2">
                  {selected.is_pinned && <span className="text-yellow-400">★</span>}
                  <span className={`font-mono text-xs border rounded px-1.5 py-0.5 ${kindColor(selected.kind)}`}>{selected.kind}</span>
                </div>
                <h2 className="font-mono text-sm text-white mt-1">{selected.title}</h2>
                <p className="font-mono text-xs text-slate-500 mt-0.5">v{selected.version} · {selected.created_at?.slice(0, 10)}</p>
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={() => togglePin(selected)} className="p-1 text-slate-400 hover:text-yellow-400 transition font-mono text-xs">
                  {selected.is_pinned ? "unpin" : "pin"}
                </button>
                <button type="button" onClick={() => archiveEntry(selected.id)} className="p-1 text-slate-400 hover:text-red-400 transition font-mono text-xs">archive</button>
                <button type="button" onClick={() => setSelected(null)} className="text-slate-500 hover:text-white font-mono text-xs p-1">✕</button>
              </div>
            </div>
            <div className="bg-black/20 rounded-lg p-4 font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto">
              {selected.body}
            </div>
            {selected.tags?.length > 0 && (
              <div className="flex gap-1 mt-3 flex-wrap">
                {selected.tags.map(t => <span key={t} className="font-mono text-xs text-slate-500 bg-white/5 rounded px-2 py-1">{t}</span>)}
              </div>
            )}
          </GlassPanel>
        ) : (
          <GlassPanel>
            <div className="flex items-center justify-center h-full min-h-[200px] text-slate-500 font-mono text-xs">
              Select an entry to read
            </div>
          </GlassPanel>
        )}
      </div>
    </div>
  );
}
