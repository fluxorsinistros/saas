// Linha de tendência (SVG puro, sem biblioteca): curva suave com área em degradê. A cor vem de `currentColor`.
// Decorativa para leitores de tela; o texto `summary` diz o que a linha mostra (ex.: "Aberturas por dia, últimos 30 dias: 12").
export function Sparkline({ values, id, className, summary }: { values: number[]; id: string; className?: string; summary: string }) {
  const W = 120;
  const H = 36;
  const PAD = 3;
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const step = W / (values.length - 1);
  const pts = values.map((v, i) => [i * step, H - PAD - (v / max) * (H - PAD * 2)] as const);
  // curva suave (Catmull-Rom convertida em Bézier)
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = Math.min(H - PAD, Math.max(PAD, p1[1] + (p2[1] - p0[1]) / 6));
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = Math.min(H - PAD, Math.max(PAD, p2[1] - (p3[1] - p1[1]) / 6));
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const area = `${d} L${W},${H} L0,${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary} className={className}>
      <title>{summary}</title>
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
