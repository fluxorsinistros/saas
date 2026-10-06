// Cálculo de status "ao vivo" de um relógio de SLA (Documento 4 §4), sem esperar o scheduler
// periódico (§7, ainda não implementado nesta fatia, ver docs/04-sla-engine.md §10). Sempre 24/7:
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

export type SlaCalendar = {
  business_days: number[]; // 1=segunda..7=domingo, igual ISO weekday (Documento 4 §3)
  business_start: string | null; // "HH:MM:SS" ou null = sem restrição de horário
  business_end: string | null;
};
export type SlaCalendarException = { exception_date: string; is_working_day: boolean };

function isoWeekday(d: Date): number {
  const day = d.getDay(); // 0=domingo..6=sábado
  return day === 0 ? 7 : day;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isWorkingDay(d: Date, calendar: SlaCalendar, exceptionByDate: Map<string, boolean>): boolean {
  const override = exceptionByDate.get(dateKey(d));
  if (override !== undefined) return override; // feriado (false) ou dia útil extra (true) sempre vence
  return calendar.business_days.includes(isoWeekday(d));
}

function dayWindow(d: Date, calendar: SlaCalendar): { start: Date; end: Date } {
  const start = new Date(d);
  const end = new Date(d);
  if (calendar.business_start) {
    const [h, m, s] = calendar.business_start.split(":").map(Number);
    start.setHours(h, m, s ?? 0, 0);
  } else {
    start.setHours(0, 0, 0, 0);
  }
  if (calendar.business_end) {
    const [h, m, s] = calendar.business_end.split(":").map(Number);
    end.setHours(h, m, s ?? 0, 0);
  } else {
    end.setHours(23, 59, 59, 999);
  }
  return { start, end };
}

// Avança `minutes` de duração útil a partir de `from`, pulando fins de semana/feriados e horário
// fora do expediente (Documento 4 §3: "fora do calendário, o relógio não avança"). Avança dia a dia
// em vez de minuto a minuto por performance, matematicamente equivalente para calendários fixos.
export function addBusinessMinutes(from: Date, minutes: number, calendar: SlaCalendar, exceptions: SlaCalendarException[]): Date {
  const exceptionByDate = new Map(exceptions.map((e) => [e.exception_date, e.is_working_day]));
  let remainingMs = minutes * 60_000;
  let cursor = new Date(from);

  while (remainingMs > 0) {
    if (!isWorkingDay(cursor, calendar, exceptionByDate)) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }
    const { start, end } = dayWindow(cursor, calendar);
    const dayStart = cursor < start ? start : cursor;
    const availableMs = end.getTime() - dayStart.getTime();
    if (availableMs <= 0) {
      cursor = new Date(dayStart);
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }
    if (remainingMs <= availableMs) {
      return new Date(dayStart.getTime() + remainingMs);
    }
    remainingMs -= availableMs;
    cursor = new Date(dayStart);
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }
  return cursor;
}

export function formatMinutesRemaining(targetAt: string): string {
  const diffMs = new Date(targetAt).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60_000);
  const label = minutes < 60 ? `${minutes}min` : minutes < 1440 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / 1440)}d`;
  return diffMs >= 0 ? `faltam ${label}` : `${label} em atraso`;
}
