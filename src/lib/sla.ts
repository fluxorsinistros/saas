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
  timezone?: string | null; // fuso em que o expediente vale (ex.: America/Sao_Paulo); sem fuso, Brasília
};
export type SlaCalendarException = { exception_date: string; is_working_day: boolean };

const DEFAULT_TZ = "America/Sao_Paulo";

type Parts = { y: number; m: number; d: number; h: number; mi: number; s: number };

// O servidor roda em UTC, o expediente vale no fuso do calendário: todo cálculo de dia e de horário passa por aqui, nunca pelo
// fuso da máquina (getHours/setHours erravam o horário comercial em 3 horas em produção).
function tzParts(at: Date, tz: string): Parts {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(at)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year, m: o.month, d: o.day, h: o.hour % 24, mi: o.minute, s: o.second };
}

function offsetMs(at: Date, tz: string): number {
  const p = tzParts(at, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(at.getTime() / 1000) * 1000;
}

// Instante (UTC) que corresponde a esta data e hora no relógio do fuso.
function zonedToDate(y: number, m: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  const first = guess - offsetMs(new Date(guess), tz);
  return new Date(guess - offsetMs(new Date(first), tz));
}

function isoWeekday(y: number, m: number, d: number): number {
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=domingo..6=sábado
  return day === 0 ? 7 : day;
}

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function hms(t: string | null, fallback: [number, number, number]): [number, number, number] {
  if (!t) return fallback;
  const [h, m, s] = t.split(":").map(Number);
  return [h, m ?? 0, s ?? 0];
}

// Minutos de uma jornada do calendário (09:00 às 18:00 = 540). Sem horário definido, o dia inteiro (1440).
export function businessDayMinutes(calendar: { business_start?: string | null; business_end?: string | null }): number {
  if (!calendar.business_start || !calendar.business_end) return 1440;
  const [sh, sm] = hms(calendar.business_start, [0, 0, 0]);
  const [eh, em] = hms(calendar.business_end, [23, 59, 59]);
  return Math.max(1, eh * 60 + em - (sh * 60 + sm));
}

// "N dias úteis" = N jornadas do calendário. É assim que o prazo em dias úteis vira os minutos de expediente que o relógio gasta.
export function businessDaysToMinutes(days: number, calendar: { business_start?: string | null; business_end?: string | null }): number {
  return Math.round(days * businessDayMinutes(calendar));
}

// Avança `minutes` de duração útil a partir de `from`, pulando fins de semana/feriados e horário
// fora do expediente (Documento 4 §3: "fora do calendário, o relógio não avança"). Avança dia a dia
// em vez de minuto a minuto por performance, matematicamente equivalente para calendários fixos.
// Tudo no fuso do calendário. Feriado (is_working_day=false) vence a semana; dia útil extra (true) também.
export function addBusinessMinutes(from: Date, minutes: number, calendar: SlaCalendar, exceptions: SlaCalendarException[]): Date {
  const tz = calendar.timezone || DEFAULT_TZ;
  const exceptionByDate = new Map(exceptions.map((e) => [e.exception_date, e.is_working_day]));
  const [sh, sm, ss] = hms(calendar.business_start, [0, 0, 0]);
  const [eh, em, es] = hms(calendar.business_end, [23, 59, 59]);
  let remainingMs = minutes * 60_000;
  let cursor = new Date(from);

  for (let guard = 0; guard < 5000; guard++) {
    if (remainingMs <= 0) return cursor;
    const p = tzParts(cursor, tz);
    const key = dateKey(p.y, p.m, p.d);
    const override = exceptionByDate.get(key);
    const working = override !== undefined ? override : calendar.business_days.includes(isoWeekday(p.y, p.m, p.d));
    const next = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
    const nextMidnight = () => zonedToDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, 0, tz);
    if (!working) {
      cursor = nextMidnight();
      continue;
    }
    const start = zonedToDate(p.y, p.m, p.d, sh, sm, ss, tz);
    const end = calendar.business_end ? zonedToDate(p.y, p.m, p.d, eh, em, es, tz) : nextMidnight();
    const dayStart = cursor < start ? start : cursor;
    const availableMs = end.getTime() - dayStart.getTime();
    if (availableMs <= 0) {
      cursor = nextMidnight();
      continue;
    }
    if (remainingMs <= availableMs) return new Date(dayStart.getTime() + remainingMs);
    remainingMs -= availableMs;
    cursor = nextMidnight();
  }
  return cursor;
}

export type CalendarBundle = { calendar: SlaCalendar; exceptions: SlaCalendarException[] };

// Minutos de expediente entre duas datas no calendário (fim de semana, feriado e fora do horário não contam).
export function businessMinutesBetween(from: Date, to: Date, calendar: SlaCalendar, exceptions: SlaCalendarException[]): number {
  if (to.getTime() <= from.getTime()) return 0;
  const tz = calendar.timezone || DEFAULT_TZ;
  const exceptionByDate = new Map(exceptions.map((e) => [e.exception_date, e.is_working_day]));
  const [sh, sm, ss] = hms(calendar.business_start, [0, 0, 0]);
  const [eh, em, es] = hms(calendar.business_end, [23, 59, 59]);
  let totalMs = 0;
  let cursor = new Date(from);
  for (let guard = 0; guard < 5000 && cursor.getTime() < to.getTime(); guard++) {
    const p = tzParts(cursor, tz);
    const override = exceptionByDate.get(dateKey(p.y, p.m, p.d));
    const working = override !== undefined ? override : calendar.business_days.includes(isoWeekday(p.y, p.m, p.d));
    const next = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
    const nextMidnight = zonedToDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, 0, tz);
    if (working) {
      const start = zonedToDate(p.y, p.m, p.d, sh, sm, ss, tz);
      const end = calendar.business_end ? zonedToDate(p.y, p.m, p.d, eh, em, es, tz) : nextMidnight;
      const lo = Math.max(start.getTime(), cursor.getTime());
      const hi = Math.min(end.getTime(), to.getTime());
      if (hi > lo) totalMs += hi - lo;
    }
    cursor = nextMidnight;
  }
  return totalMs / 60_000;
}

function fmtDays(n: number): string {
  const r = Math.round(n * 10) / 10;
  return String(r).replace(".", ",");
}

// Texto do prazo com os dois números e a data prevista: "2,1 dias úteis e 3 dias corridos" e "15/10/2026 às 16:00".
// Dias corridos = diferença entre as datas do calendário (hoje e o dia do prazo). Sem calendário, só os dias corridos.
export function describeSlaTarget(targetIso: string, nowMs: number, bundle?: CalendarBundle) {
  const tz = bundle?.calendar.timezone || DEFAULT_TZ;
  const target = new Date(targetIso);
  const now = new Date(nowMs);
  const targetLabel = target
    .toLocaleString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    .replace(", ", " às ");
  const tp = tzParts(target, tz);
  const np = tzParts(now, tz);
  const calendarDays = Math.abs(Math.round((Date.UTC(tp.y, tp.m - 1, tp.d) - Date.UTC(np.y, np.m - 1, np.d)) / 86_400_000));
  const calText = calendarDays === 0 ? "hoje" : `${calendarDays} ${calendarDays === 1 ? "dia corrido" : "dias corridos"}`;
  if (!bundle) return { targetLabel, businessDays: null as number | null, calendarDays, daysText: calText };
  const breached = target.getTime() <= nowMs;
  const minutes = breached ? businessMinutesBetween(target, now, bundle.calendar, bundle.exceptions) : businessMinutesBetween(now, target, bundle.calendar, bundle.exceptions);
  const businessDays = minutes / businessDayMinutes(bundle.calendar);
  const du = fmtDays(businessDays);
  const duText = `${du} ${du === "1" ? "dia útil" : "dias úteis"}`;
  return { targetLabel, businessDays, calendarDays, daysText: `${duText} e ${calText}` };
}

export function formatMinutesRemaining(targetAt: string): string {
  const diffMs = new Date(targetAt).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60_000);
  const label = minutes < 60 ? `${minutes}min` : minutes < 1440 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / 1440)}d`;
  return diffMs >= 0 ? `faltam ${label}` : `${label} em atraso`;
}
