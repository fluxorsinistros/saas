// Marca exibida no produto. O nome e o logo vêm de platform_settings (editáveis em Administração);
// sem configuração, cai na marca provisória (nome comercial ainda em definição, Documento 1 §72).
export type Brand = { name: string; tagline: string; logoUrl: string | null };

export const DEFAULT_BRAND: Brand = { name: "Gerenciador de Sinistros", tagline: "Workflow de sinistros", logoUrl: null };

export function BrandMark({
  tone = "dark",
  compact = false,
  brand = DEFAULT_BRAND,
}: {
  tone?: "dark" | "light";
  compact?: boolean;
  brand?: Brand;
}) {
  const text = tone === "dark" ? "text-white" : "text-slate-900";
  const sub = tone === "dark" ? "text-slate-400" : "text-slate-500";
  return (
    <div className="relative flex items-center gap-2.5">
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo vem do Storage do Supabase, tamanho e formato livres
        <img src={brand.logoUrl} alt={brand.name} className="size-8 shrink-0 rounded-lg object-contain" />
      ) : (
        <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
          <rect width="32" height="32" rx="8" fill={tone === "dark" ? "#1b2640" : "#0b1220"} />
          <path d="M16 7v6M16 13c0 3-6 3-6 6M16 13c0 3 6 3 6 6M10 19v2M22 19v2" stroke="#22d3ee" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <circle cx="16" cy="7" r="2" fill="#2563eb" />
          <circle cx="10" cy="23" r="2.2" fill="#7c3aed" />
          <circle cx="22" cy="23" r="2.2" fill="#2563eb" />
        </svg>
      )}
      {!compact && (
        <div className="leading-tight">
          <div className={`text-[14px] font-semibold tracking-tight ${text}`}>{brand.name}</div>
          {brand.tagline && <div className={`text-xs ${sub}`}>{brand.tagline}</div>}
        </div>
      )}
    </div>
  );
}
