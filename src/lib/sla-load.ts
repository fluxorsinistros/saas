import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { addBusinessMinutes, type CalendarBundle } from "@/lib/sla";

export type { CalendarBundle };

// Calendários (horário comercial, fuso e feriados) por id, em duas consultas, para as telas que mostram prazo em dias úteis.
export async function loadCalendarBundles(supabase: SupabaseClient<Database>, ids: string[]): Promise<Map<string, CalendarBundle>> {
  const out = new Map<string, CalendarBundle>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return out;
  const [{ data: cals }, { data: exc }] = await Promise.all([
    supabase.from("sla_calendars").select("id, business_days, business_start, business_end, timezone").in("id", unique),
    supabase.from("sla_calendar_exceptions").select("calendar_id, exception_date, is_working_day").in("calendar_id", unique),
  ]);
  for (const c of cals ?? []) {
    out.set(c.id, {
      calendar: { business_days: c.business_days, business_start: c.business_start, business_end: c.business_end, timezone: c.timezone },
      exceptions: (exc ?? []).filter((e) => e.calendar_id === c.id).map((e) => ({ exception_date: e.exception_date, is_working_day: e.is_working_day ?? false })),
    });
  }
  return out;
}

// Prazo total do fluxo em dias úteis: soma dos minutos de expediente das etapas, contada no calendário a partir da abertura.
export function flowDeadlineIso(startIso: string, totalMinutes: number, bundle: CalendarBundle): string {
  return addBusinessMinutes(new Date(startIso), totalMinutes, bundle.calendar, bundle.exceptions).toISOString();
}
