"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Clock, CalendarClock, AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { saveTenantSlaSettings, type ActionState } from "./actions";

type CalendarItem = {
  id: string;
  name: string;
  business_days: number[];
  business_start: string | null;
  business_end: string | null;
  timezone: string;
};

type Props = {
  tenantId: string;
  calendars: CalendarItem[];
  currentSlaSettings: {
    default_calendar_id?: string | null;
    warning_threshold_pct?: number;
    critical_threshold_pct?: number;
  };
};

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function TenantSlaTab({ tenantId, calendars, currentSlaSettings }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveTenantSlaSettings, null);

  const defaultCalId = currentSlaSettings.default_calendar_id ?? "";
  const warningPct = currentSlaSettings.warning_threshold_pct ?? 75;
  const criticalPct = currentSlaSettings.critical_threshold_pct ?? 90;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Coluna 1 e 2: Parâmetros e Regras de SLA */}
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Clock className="size-5 text-brand" />
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">Parâmetros Operacionais de SLA</h2>
              <p className="text-[12px] text-slate-500">
                Defina o calendário de expediente padrão e as regras de alerta preventivo para processos e etapas.
              </p>
            </div>
          </div>

          <form action={formAction} className="space-y-5">
            <input type="hidden" name="tenant_id" value={tenantId} />

            {/* Calendário Padrão */}
            <div>
              <label htmlFor="default_calendar_id" className="mb-1 block text-[13px] font-medium text-slate-700">
                Calendário Padrão da Conta
              </label>
              <select
                id="default_calendar_id"
                name="default_calendar_id"
                defaultValue={defaultCalId}
                className={inputClass}
              >
                <option value="">Nenhum (Contagem corrida 24 horas por dia, 7 dias por semana)</option>
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.business_start?.slice(0, 5) ?? "00:00"} às {c.business_end?.slice(0, 5) ?? "23:59"})
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-slate-400">
                Usado automaticamente em novos fluxos e etapas quando nenhum calendário específico for definido.
              </span>
            </div>

            {/* Limiares de Alerta */}
            <div className="border-t border-slate-100 pt-4">
              <h3 className="mb-2 text-[13px] font-medium text-slate-800">
                Gatilhos de Alerta Preventivo e Risco
              </h3>
              <p className="mb-3 text-[12px] text-slate-500">
                Indique quando o sistema deve sinalizar atenção ou risco no painel de controle e na listagem de sinistros.
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3.5">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-800">
                    <AlertTriangle className="size-4 text-amber-600" />
                    <span>Aviso de Atenção ("Em Risco")</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      name="warning_threshold_pct"
                      defaultValue={warningPct}
                      min={10}
                      max={95}
                      className={`${inputClass} w-24`}
                    />
                    <span className="text-[13px] font-medium text-slate-600">% do tempo previsto consumido</span>
                  </div>
                  <span className="mt-1 block text-[11px] text-amber-700">
                    Padrão recomendado: 75%
                  </span>
                </div>

                <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3.5">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-rose-800">
                    <ShieldAlert className="size-4 text-rose-600" />
                    <span>Nível Crítico / Pré-estouro</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      name="critical_threshold_pct"
                      defaultValue={criticalPct}
                      min={15}
                      max={100}
                      className={`${inputClass} w-24`}
                    />
                    <span className="text-[13px] font-medium text-slate-600">% do tempo previsto consumido</span>
                  </div>
                  <span className="mt-1 block text-[11px] text-rose-700">
                    Padrão recomendado: 90%
                  </span>
                </div>
              </div>
            </div>

            {/* Mensagem de Feedback */}
            {state && (
              <div
                className={`flex items-center gap-2 rounded-lg p-3 text-[13px] ${
                  state.ok ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {state.ok ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="size-4 shrink-0 text-rose-600" />}
                <span>{state.message}</span>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-50"
              >
                {pending ? "Salvando parâmetros…" : "Salvar Parâmetros de SLA"}
              </button>
            </div>
          </form>
        </div>

        {/* Coluna 3: Calendários Cadastrados */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4 text-brand" />
                <h3 className="text-[13px] font-semibold text-slate-900">Calendários Ativos</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {calendars.length}
              </span>
            </div>

            <div className="mt-3 divide-y divide-slate-100">
              {calendars.length === 0 ? (
                <div className="py-4 text-center text-[12px] text-slate-400">
                  Nenhum calendário personalizado criado ainda.
                </div>
              ) : (
                calendars.map((c) => (
                  <div key={c.id} className="py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-slate-800">{c.name}</span>
                      {c.id === defaultCalId && (
                        <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                          PADRÃO
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Horário: {c.business_start?.slice(0, 5) ?? "00:00"} às {c.business_end?.slice(0, 5) ?? "23:59"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {WEEKDAYS.map((w, idx) => {
                        const active = c.business_days.includes(idx + 1);
                        return (
                          <span
                            key={w}
                            className={`rounded px-1 text-[9px] font-medium ${
                              active ? "bg-slate-200 text-slate-800" : "text-slate-300"
                            }`}
                          >
                            {w}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3">
              <Link
                href="/calendarios"
                className="flex items-center justify-between text-[12px] font-medium text-brand hover:text-brand-600"
              >
                <span>Gerenciar Calendários e Feriados</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
