"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/app/(app)/sinistros/actions";
import { CALENDAR_TIMEZONES } from "@/lib/calendar-zones";

const WEEKDAY_KEYS = [1, 2, 3, 4, 5, 6, 7] as const;

export async function createCalendar(formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "workflow.edit");
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Informe o nome do calendário.");

  const businessDays = WEEKDAY_KEYS.filter((d) => formData.get(`day_${d}`) === "on");
  const start = String(formData.get("business_start") ?? "").trim();
  const end = String(formData.get("business_end") ?? "").trim();

  const { data, error } = await supabase
    .from("sla_calendars")
    .insert({
      tenant_id: ctx.tenantId,
      name,
      business_days: businessDays.length ? businessDays : [1, 2, 3, 4, 5],
      business_start: start || null,
      business_end: end || null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Falha ao criar o calendário.");

  await writeAudit(supabase, ctx.tenantId, "sla_calendar.created", "sla_calendar", data.id, { next: { name } });
  revalidatePath("/calendarios");
}

export async function deleteCalendar(calendarId: string): Promise<void> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "workflow.edit");
  const supabase = await createClient();
  const { error } = await supabase.from("sla_calendars").delete().eq("id", calendarId);
  if (error) throw new Error("Este calendário está em uso por algum fluxo publicado e não pode ser removido.");
  revalidatePath("/calendarios");
}

export async function addException(calendarId: string, formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "workflow.edit");
  const supabase = await createClient();
  const date = String(formData.get("exception_date") ?? "").trim();
  const isWorkingDay = formData.get("is_working_day") === "on";
  const note = String(formData.get("note") ?? "").trim();
  if (!date) throw new Error("Informe a data.");

  const { error } = await supabase
    .from("sla_calendar_exceptions")
    .insert({ tenant_id: ctx.tenantId, calendar_id: calendarId, exception_date: date, is_working_day: isWorkingDay, note: note || null });
  if (error) throw new Error(error.code === "23505" ? "Já existe uma exceção para essa data." : error.message);

  revalidatePath("/calendarios");
}

export async function removeException(exceptionId: string): Promise<void> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "workflow.edit");
  const supabase = await createClient();
  await supabase.from("sla_calendar_exceptions").delete().eq("id", exceptionId);
  revalidatePath("/calendarios");
}


// Edita nome, dias úteis, expediente e fuso. Devolve a mensagem de erro em vez de lançar (a tela mostra junto ao botão).
// Vale só para prazos que ainda vão começar: os já calculados em sinistros em andamento ficam como estão.
export async function updateCalendar(calendarId: string, _prev: { error: string | null; ok?: boolean }, formData: FormData): Promise<{ error: string | null; ok?: boolean }> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "workflow.edit");
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Informe o nome do calendário." };
  if (name.length > 80) return { error: "O nome aceita no máximo 80 caracteres." };
  const businessDays = WEEKDAY_KEYS.filter((d) => formData.get(`day_${d}`) === "on");
  if (!businessDays.length) return { error: "Marque pelo menos um dia útil da semana." };
  const start = String(formData.get("business_start") ?? "").trim();
  const end = String(formData.get("business_end") ?? "").trim();
  if (!!start !== !!end) return { error: "Informe o início e o fim do expediente, ou deixe os dois vazios para contar o dia inteiro." };
  if (start && end && end <= start) return { error: "O fim do expediente precisa ser depois do início." };
  const tz = String(formData.get("timezone") ?? "");
  if (!CALENDAR_TIMEZONES.some((z) => z.value === tz)) return { error: "Escolha um fuso horário da lista." };

  const { data: before } = await supabase
    .from("sla_calendars")
    .select("name, business_days, business_start, business_end, timezone")
    .eq("id", calendarId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!before) return { error: "Calendário não encontrado." };

  const { data: updated, error } = await supabase
    .from("sla_calendars")
    .update({ name, business_days: [...businessDays], business_start: start || null, business_end: end || null, timezone: tz })
    .eq("id", calendarId)
    .eq("tenant_id", ctx.tenantId)
    .select("id");
  if (error) return { error: "Não foi possível salvar o calendário." };
  if (!updated?.length) return { error: "Só o Administrador da empresa pode alterar calendários." };

  await writeAudit(supabase, ctx.tenantId, "sla_calendar.updated", "sla_calendar", calendarId, {
    previous: before,
    next: { name, business_days: businessDays, business_start: start || null, business_end: end || null, timezone: tz },
  });
  revalidatePath("/calendarios");
  revalidatePath("/fluxos", "layout");
  return { error: null, ok: true };
}
