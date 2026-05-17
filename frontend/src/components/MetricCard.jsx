import { motion } from "framer-motion";
import GlassPanel from "./GlassPanel";

export default function MetricCard({ label, value, hint, tone = "signal" }) {
  const toneClass =
    tone === "danger"
      ? "text-vault-danger"
      : tone === "warning"
      ? "text-vault-warning"
      : "text-vault-signal";

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <GlassPanel>
        <div className="text-xs uppercase tracking-[0.16em] text-vault-textDim">{label}</div>
        <div className={`mt-2 text-3xl font-display ${toneClass}`}>{value}</div>
        <div className="mt-2 text-sm text-vault-textDim">{hint}</div>
      </GlassPanel>
    </motion.div>
  );
}
