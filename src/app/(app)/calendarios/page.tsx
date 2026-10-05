import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes } from "@/lib/permissions";
import { addException, createCalendar, deleteCalendar, removeException } from "./actions";

export const metadata: Metadata = { title: "Calendários de SLA" };

const WEEKDAYS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
];

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

export default async function CalendariosPage() {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const perms = await getPermissionCodes(ctx.userId, ctx.tenantId);
  const canManage = perms.has("workflow.edit");

  const [{ data: calendars }, { data: exceptions }] = await Promise.all([
    supabase.from("sla_calendars").select("id, name, business_days, business_start, business_end, timezone").eq("tenant_id", ctx.tenantId).order("name"),
    supabase.from("sla_calendar_exceptions").select("id, calendar_id, exception_date, is_working_day, note").eq("tenant_id", ctx.tenantId).order("exception_date"),
  ]);
  const exceptionsByCalendar = new Map<string, typeof exceptions>();
  for (const e of exceptions ?? []) {
    exceptionsByCalendar.set(e.calendar_id, [...(exceptionsByCalendar.get(e.calendar_id) ?? []), e]);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-narrow px-4 py-6 md:px-8 md:py-8">
        <div className="mb-4">
          <Link
            href="/admin?aba=sla"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500 hover:text-slate-800 transition"
          >
            <ArrowLeft className="size-3.5" /> Voltar para Administração (SLA)
          </Link>
        </div>
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Calendários de SLA</h1>
        <p className="mt-1 max-w-xl text-[14px] text-slate-600">
          Dias úteis, horário de expediente e feriados — usados pelo motor de SLA para calcular prazos. Um
          SLA sem calendário conta corrido, 24/7.
        </p>

        {canManage && (
          <form action={createCalendar} className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-2 text-[13px] font-medium text-slate-700">Novo calendário</p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <label className="mb-1 block text-[12px] font-medium text-slate-600">Nome</label>
                <input name="name" required placeholder="Ex.: Comercial 9h-18h" className={input} />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-slate-600">Início</label>
                <input name="business_start" type="time" defaultValue="09:00" className={`${input} w-28`} />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-slate-600">Fim</label>
                <input name="business_end" type="time" defaultValue="18:00" className={`${input} w-28`} />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <label key={d.value} className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[12px] text-slate-600">
                  <input type="checkbox" name={`day_${d.value}`} defaultChecked={d.value <= 5} className="accent-[var(--color-brand)]" />
                  {d.label}
                </label>
              ))}
            </div>
            <button className="mt-3 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600">Criar calendário</button>
          </form>
        )}

        <div className="mt-6 space-y-4">
          {(calendars ?? []).map((cal) => {
            const days = new Set(cal.business_days);
            const excs = exceptionsByCalendar.get(cal.id) ?? [];
            return (
              <div key={cal.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="size-4 text-slate-500" />
                    <span className="text-[14px] font-medium text-slate-900">{cal.name}</span>
                  </div>
                  {canManage && (
                    <form action={deleteCalendar.bind(null, cal.id)}>
                      <button className="text-slate-500 hover:text-rose-600" aria-label={`Remover ${cal.name}`}>
                        <Trash2 className="size-4" />
                      </button>
                    </form>
                  )}
                </div>
                <p className="mt-1.5 text-[12px] text-slate-500">
                  {WEEKDAYS.filter((d) => days.has(d.value)).map((d) => d.label).join(", ")}
                  {cal.business_start && cal.business_end ? ` · ${cal.business_start.slice(0, 5)}–${cal.business_end.slice(0, 5)}` : " · dia inteiro"}
                </p>

                {excs.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                    {excs.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 text-[12px]">
                        <span className={e.is_working_day ? "text-emerald-700" : "text-rose-700"}>
                          {new Date(e.exception_date + "T00:00:00").toLocaleDateString("pt-BR")} —{" "}
                          {e.is_working_day ? "dia útil extra" : "feriado"}
                          {e.note && <span className="ml-1 text-slate-500">({e.note})</span>}
                        </span>
                        {canManage && (
                          <form action={removeException.bind(null, e.id)}>
                            <button className="text-slate-500 hover:text-rose-600">Remover</button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {canManage && (
                  <form action={addException.bind(null, cal.id)} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                    <input name="exception_date" type="date" required className={`${input} w-40`} />
                    <label className="flex items-center gap-1 text-[12px] text-slate-600">
                      <input type="checkbox" name="is_working_day" className="accent-[var(--color-brand)]" />
                      Dia útil extra (em vez de feriado)
                    </label>
                    <input name="note" placeholder="Nota (opcional)" className={`${input} w-40`} />
                    <button className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
                      Adicionar exceção
                    </button>
                  </form>
                )}
              </div>
            );
          })}
          {(calendars ?? []).length === 0 && (
            <p className="text-[13px] text-slate-500">Nenhum calendário ainda — SLAs contam corrido, 24/7.</p>
          )}
        </div>
      </div>
    </div>
  );
}
