import GlassPanel from "./GlassPanel";

export default function LiveTerminalCard() {
  return (
    <GlassPanel title="Vault Terminal">
      <pre className="overflow-x-auto rounded-lg border border-slate-700/80 bg-black/60 p-3 text-xs text-emerald-300">
{`$ vaultctl status
[ok] auth-service
[ok] payment-rails
[ok] notification-bus
[ok] module-registry
[ok] chain-monitor`}
      </pre>
    </GlassPanel>
  );
}
