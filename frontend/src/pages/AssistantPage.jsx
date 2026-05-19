import { useEffect, useState } from "react";
import api, { setAuthToken } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import { useVaultStore } from "../store/useVaultStore";
import AppShell from "../components/AppShell";
import GlassPanel from "../components/GlassPanel";

export default function AssistantPage() {
  const { accessToken, refreshToken, user, clearAuth } = useVaultStore();
  const [bookings, setBookings] = useState([]);
  const [morning, setMorning] = useState(null);
  const [todos, setTodos] = useState([]);
  const [todoText, setTodoText] = useState("");
  const [zip, setZip] = useState("90001");
  const [loading, setLoading] = useState(true);

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

  const load = async () => {
    setLoading(true);
    try {
      const [bookingsRes, morningRes, todoRes] = await Promise.all([
        api.get("/bookings", { params: { limit: 50 } }),
        api.get(`/briefing/morning?zip=${zip}`),
        api.get("/knowledge", { params: { category: "todo", limit: 50 } }),
      ]);
      setBookings((bookingsRes.data?.data?.items || []).filter((b) => b.status !== "completed"));
      setMorning(morningRes.data?.data || null);
      setTodos(todoRes.data?.data?.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    setAuthToken(accessToken);
    load();
  }, [accessToken]);

  const addTodo = async (e) => {
    e.preventDefault();
    if (!todoText.trim()) return;
    await api.post("/knowledge", {
      title: todoText.trim(),
      body: todoText.trim(),
      kind: "note",
      category: "todo",
      tags: "todo,assistant",
      source: "assistant",
    });
    setTodoText("");
    load();
  };

  const completeTodo = async (id) => {
    await api.delete(`/knowledge/${id}`);
    load();
  };

  return (
    <AppShell user={user} onLogout={handleLogout} title="assistant">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <GlassPanel title="Upcoming + Priorities">
          {loading ? (
            <div className="text-vault-textDim">Loading assistant context...</div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-vault-textDim">Today's Priorities</div>
                <ul className="space-y-1 text-sm">
                  {(morning?.priorities || []).map((item, idx) => (
                    <li key={idx} className="text-vault-text">• {item}</li>
                  ))}
                  {(morning?.priorities || []).length === 0 && <li className="text-vault-textDim">No priorities generated yet.</li>}
                </ul>
              </div>

              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-vault-textDim">Upcoming Bookings</div>
                <div className="space-y-2">
                  {bookings.slice(0, 8).map((b) => (
                    <div key={b.id} className="rounded border border-vault-accent/20 px-3 py-2 text-sm">
                      <div className="text-vault-text">{b.module_key}</div>
                      <div className="text-vault-textDim">{new Date(b.starts_at).toLocaleString()}</div>
                    </div>
                  ))}
                  {bookings.length === 0 && <div className="text-vault-textDim text-sm">No upcoming bookings.</div>}
                </div>
              </div>
            </div>
          )}
        </GlassPanel>

        <GlassPanel title="To-Do List">
          <form onSubmit={addTodo} className="mb-3 flex gap-2">
            <input
              value={todoText}
              onChange={(e) => setTodoText(e.target.value)}
              placeholder="Add a task"
              className="flex-1 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 py-1 text-sm"
            />
            <button type="submit" className="rounded border border-vault-accent/30 px-2 py-1 text-xs uppercase tracking-[0.18em]">Add</button>
          </form>

          <div className="space-y-2">
            {todos.map((todo) => (
              <div key={todo.id} className="flex items-center justify-between rounded border border-vault-accent/20 px-3 py-2 text-sm">
                <span>{todo.title}</span>
                <button type="button" onClick={() => completeTodo(todo.id)} className="text-xs text-vault-textDim hover:text-white">Done</button>
              </div>
            ))}
            {todos.length === 0 && <div className="text-vault-textDim text-sm">No to-dos yet.</div>}
          </div>

          <div className="mt-4 border-t border-vault-accent/20 pt-3">
            <label className="text-xs text-vault-textDim">Briefing Zip</label>
            <div className="mt-1 flex gap-2">
              <input value={zip} onChange={(e) => setZip(e.target.value)} className="flex-1 rounded border border-vault-accent/30 bg-vault-bg/60 px-2 py-1 text-sm" />
              <button type="button" onClick={load} className="rounded border border-vault-accent/30 px-2 py-1 text-xs uppercase tracking-[0.18em]">Refresh</button>
            </div>
          </div>
        </GlassPanel>
      </div>
    </AppShell>
  );
}
