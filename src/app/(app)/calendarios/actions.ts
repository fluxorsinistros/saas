"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/app/(app)/sinistros/actions";

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
