// Cálculo de status "ao vivo" de um relógio de SLA (Documento 4 §4), sem esperar o scheduler
// periódico (§7, ainda não implementado nesta fatia — ver docs/04-sla-engine.md §10). Sempre 24/7:
// calendário de SLA (`sla_calendars`) é a próxima extensão, hoje todo `workflow_slas.calendar_id`
// é nulo e o cálculo é corrido, comportamento explícito do §3.
export type LiveSlaStatus = "on_track" | "at_risk" | "breached" | "paused" | "completed";

export function computeLiveSlaStatus(
  tracking: { status: string; started_at: string; target_at: string },
  alertThresholds: number[] = [75, 90, 95, 100],
): { status: LiveSlaStatus; elapsedPct: number } {
  if (tracking.status === "paused" || tracking.status === "completed") {
    return { status: tracking.status as LiveSlaStatus, elapsedPct: 0 };
  }
  const now = Date.now();
  const started = new Date(tracking.started_at).getTime();
  const target = new Date(tracking.target_at).getTime();
  const durationMs = target - started;
  if (durationMs <= 0) return { status: "breached", elapsedPct: 100 };
  const elapsedPct = Math.max(0, Math.round(((now - started) / durationMs) * 100));
  if (now >= target) return { status: "breached", elapsedPct: 100 };
  const firstThreshold = Math.min(...alertThresholds);
  const status: LiveSlaStatus = elapsedPct >= firstThreshold ? "at_risk" : "on_track";
  return { status, elapsedPct };
}

export function formatMinutesRemaining(targetAt: string): string {
  const diffMs = new Date(targetAt).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60_000);
  const label = minutes < 60 ? `${minutes}min` : minutes < 1440 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / 1440)}d`;
  return diffMs >= 0 ? `faltam ${label}` : `${label} em atraso`;
}
