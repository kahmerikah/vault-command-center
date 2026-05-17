export default function GlassPanel({ title, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-vault-accent/20 bg-vault-glass/80 p-4 shadow-glow backdrop-blur-md ${className}`}>
      {title && <h3 className="mb-3 font-display text-sm uppercase tracking-[0.2em] text-vault-accent">{title}</h3>}
      {children}
    </section>
  );
}
