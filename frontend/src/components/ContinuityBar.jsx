/**
 * ContinuityBar — persistent context strip below Topbar.
 * Shows: upcoming event, open tasks, unread notifications, active pipeline.
 * Syncs from /os/context every 90 seconds.
 */
import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useOperationalStore } from "../store/useOperationalStore";

function Chip({ label, value, url, onClick, accent = false }) {
  const cls = `inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors cursor-pointer select-none ${
    accent
      ? "border-vault-accent/50 bg-vault-accent/10 text-vault-accent hover:bg-vault-accent/20"
      : "border-vault-accent/15 bg-vault-bg/40 text-vault-textDim hover:text-vault-text hover:border-vault-accent/30"
  }`;
  return (
    <button type="button" className={cls} onClick={onClick}>
      {label && <span className="text-vault-textDim">{label}</span>}
      <span className={accent ? "text-vault-accent font-semibold" : "text-vault-text font-semibold"}>
        {value}
      </span>
    </button>
  );
}

export default function ContinuityBar() {
  const navigate = useNavigate();
  const { context, contextLastFetched, setContext, membership } = useOperationalStore();

  const sync = useCallback(async () => {
    try {
      const res = await api.get("/os/context");
      setContext(res.data?.data || {});
    } catch {
      // non-fatal: context bar degrades gracefully
    }
  }, [setContext]);

  useEffect(() => {
    const stale = !contextLastFetched || Date.now() - contextLastFetched > 90_000;
    if (stale) sync();
    const interval = setInterval(sync, 90_000);
    return () => clearInterval(interval);
  }, [sync, contextLastFetched]);

  const nextEvent = context.upcoming_events?.[0];
  const minutesUntil = nextEvent
    ? Math.round((new Date(nextEvent.starts_at) - Date.now()) / 60_000)
    : null;

  function formatCountdown(mins) {
    if (mins <= 0) return "now";
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `in ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `in ${days}d`;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap rounded-xl border border-vault-accent/10 bg-vault-panel/40 px-4 py-2 backdrop-blur-sm overflow-x-auto">
      {/* System label */}
      <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-vault-textDim mr-1 flex-shrink-0">
        OPS
      </span>

      {/* Membership tier */}
      {membership?.tier && membership.tier !== "free" && (
        <Chip
          label="tier"
          value={membership.tier.toUpperCase()}
          accent
          onClick={() => navigate("/blockchain")}
        />
      )}

      {/* Upcoming event */}
      {nextEvent ? (
        <Chip
          label={minutesUntil !== null ? formatCountdown(minutesUntil) : "next"}
          value={nextEvent.title.length > 28 ? nextEvent.title.slice(0, 28) + "…" : nextEvent.title}
          accent={minutesUntil !== null && minutesUntil <= 30}
          onClick={() => navigate("/pda")}
        />
      ) : (
        <Chip label="no upcoming" value="events" onClick={() => navigate("/pda")} />
      )}

      <span className="font-mono text-[9px] text-vault-accent/20 select-none hidden sm:inline">·</span>

      {/* Open tasks */}
      <Chip
        label="tasks"
        value={context.open_tasks ?? 0}
        accent={(context.open_tasks ?? 0) > 0}
        onClick={() => navigate("/pda")}
      />

      {/* Unread notifications */}
      {(context.unread_notifications ?? 0) > 0 && (
        <Chip
          label="alerts"
          value={context.unread_notifications}
          accent
          onClick={() => navigate("/notifications")}
        />
      )}

      {/* Active property pipeline */}
      {(context.active_properties ?? 0) > 0 && (
        <Chip
          label="deals"
          value={context.active_properties}
          onClick={() => navigate("/property")}
        />
      )}

      {/* Financial alert: high burn rate surfaced from context */}
      {context.burn_alert && (
        <Chip
          label="burn"
          value={context.burn_alert}
          accent
          onClick={() => navigate("/financial")}
        />
      )}

      <span className="flex-1" />

      {/* Refresh */}
      <button
        type="button"
        onClick={sync}
        className="font-mono text-[9px] uppercase tracking-[0.2em] text-vault-textDim hover:text-vault-accent transition-colors flex-shrink-0"
        title="Refresh context"
      >
        ↺
      </button>
    </div>
  );
}
