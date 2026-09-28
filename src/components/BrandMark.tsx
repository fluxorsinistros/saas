// Marca provisória: nome comercial ainda em definição (Documento 1 §72).
export function BrandMark({ tone = "dark", compact = false }: { tone?: "dark" | "light"; compact?: boolean }) {
  const text = tone === "dark" ? "text-white" : "text-slate-900";
  const sub = tone === "dark" ? "text-slate-400" : "text-slate-500";
  return (
    <div className="relative flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill={tone === "dark" ? "#1b2640" : "#0b1220"} />
        <path d="M16 7v6M16 13c0 3-6 3-6 6M16 13c0 3 6 3 6 6M10 19v2M22 19v2" stroke="#22d3ee" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="16" cy="7" r="2" fill="#2563eb" />
        <circle cx="10" cy="23" r="2.2" fill="#7c3aed" />
        <circle cx="22" cy="23" r="2.2" fill="#2563eb" />
      </svg>
      {!compact && (
        <div className="leading-tight">
          <div className={`text-[14px] font-semibold tracking-tight ${text}`}>Gerenciador de Sinistros</div>
          <div className={`text-[11px] ${sub}`}>Workflow de sinistros</div>
        </div>
      )}
    </div>
  );
}
