// Um único formato de duração em todo o produto ("5h 8min", "2d 3h") — antes a Torre mostrava
// "310min" enquanto a lista de sinistros mostrava "5h 8min" para o mesmo atraso.
export function formatDuration(minutes: number): string {
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}min` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

// Prazo (SLA) de uma etapa em andamento: quanto do prazo já foi consumido e quanto resta. Uma só conta para a lista de
// Sinistros e para Tarefas, para os dois nunca divergirem.
export function computeSla(startedAtIso: string | null | undefined, slaMinutes: number | undefined) {
  if (!startedAtIso || !slaMinutes || slaMinutes <= 0) return null;
  const now = Date.now();
  const start = new Date(startedAtIso).getTime();
  const slaMs = slaMinutes * 60_000;
  const elapsedMs = Math.max(0, now - start);
  const remainingMs = slaMs - elapsedMs;
  const pct = Math.round((elapsedMs / slaMs) * 100);
  const isBreached = remainingMs <= 0;
  const diffMinutes = Math.round(Math.abs(remainingMs) / 60_000);
  const formattedRemaining = isBreached ? `estourado há ${formatDuration(diffMinutes)}` : `restam ${formatDuration(diffMinutes)}`;

  return {
    pct,
    isBreached,
    isAtRisk: !isBreached && pct >= 75,
    formattedRemaining,
    formattedLimit: formatDuration(slaMinutes),
  };
}
