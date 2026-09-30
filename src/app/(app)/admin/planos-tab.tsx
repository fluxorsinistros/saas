import { Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { PLAN_LIMITS, PLAN_LIMIT_KEYS } from "@/lib/plan-limits";
import { SaveButton } from "./save-button";
import { createPlan, removePlanLimit, savePlanLimits, updatePlan } from "./actions";
import { btnPrimary, currency, formatNumber, input } from "./shared";

export async function PlanosTab() {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const [{ data: plans }, { data: limits }] = await Promise.all([
    supabase.from("plans").select("id, code, name, setup_fee, monthly_fee, claim_price, status").order("claim_price"),
    supabase.from("plan_limits").select("id, plan_id, limit_key, limit_value"),
  ]);
  const limitsByPlan = new Map<string, NonNullable<typeof limits>>();
  for (const l of limits ?? []) limitsByPlan.set(l.plan_id, [...(limitsByPlan.get(l.plan_id) ?? []), l]);

  return (
    <div className="space-y-6">
        <p className="max-w-xl text-[13px] text-slate-500">
          Os planos padrão e seus limites. O que for específico de um cliente se ajusta na conta dele, não aqui.
        </p>

        <section>

          <details className="mb-1">
            <summary className="cursor-pointer list-none text-[12px] font-medium text-slate-500 hover:text-slate-800">
              + Criar novo plano (raro — os planos padrão já existem)
            </summary>
          <form action={createPlan} className="mt-2 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="w-28">
              <label htmlFor="code" className="mb-1 block text-[12px] font-medium text-slate-600">
                Código
              </label>
              <input id="code" name="code" required placeholder="standard" className={input} />
            </div>
            <div className="min-w-[160px] flex-1">
              <label htmlFor="name" className="mb-1 block text-[12px] font-medium text-slate-600">
                Nome
              </label>
              <input id="name" name="name" required placeholder="Standard" className={input} />
            </div>
            <div className="w-28">
              <label htmlFor="setup_fee" className="mb-1 block text-[12px] font-medium text-slate-600">
                Implantação
              </label>
              <input id="setup_fee" name="setup_fee" type="number" step="0.01" defaultValue="0" className={input} />
            </div>
            <div className="w-28">
              <label htmlFor="monthly_fee" className="mb-1 block text-[12px] font-medium text-slate-600">
                Mensalidade
              </label>
              <input id="monthly_fee" name="monthly_fee" type="number" step="0.01" defaultValue="0" className={input} />
            </div>
            <div className="w-28">
              <label htmlFor="claim_price" className="mb-1 block text-[12px] font-medium text-slate-600">
                Por sinistro
              </label>
              <input id="claim_price" name="claim_price" type="number" step="0.01" defaultValue="0" className={input} />
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-brand-600">
              <Plus className="size-4" /> Criar plano
            </button>
          </form>
          </details>

          <div className="mt-4 space-y-3">
            {(plans ?? []).map((plan) => (
              <details key={plan.id} className="group rounded-xl border border-slate-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <span className="text-[13px] font-medium text-slate-900">{plan.name}</span>
                    <span className="ml-2 text-[11px] text-slate-400">{plan.code}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[12px] text-slate-500">
                    <span>Implantação {currency.format(plan.setup_fee)}</span>
                    <span>Mensal {currency.format(plan.monthly_fee)}</span>
                    <span>Sinistro {currency.format(plan.claim_price)}</span>
                  </div>
                </summary>
                <div className="space-y-5 border-t border-slate-100 px-4 py-4">
                  <form action={updatePlan} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="plan_id" value={plan.id} />
                    <div className="min-w-[160px] flex-1">
                      <label className="mb-1 block text-[12px] font-medium text-slate-600">Nome</label>
                      <input key={plan.name} name="name" required defaultValue={plan.name} className={input} />
                    </div>
                    <div className="w-28">
                      <label className="mb-1 block text-[12px] font-medium text-slate-600">Implantação (R$)</label>
                      <input key={plan.setup_fee} name="setup_fee" inputMode="decimal" defaultValue={formatNumber(plan.setup_fee)} className={input} />
                    </div>
                    <div className="w-28">
                      <label className="mb-1 block text-[12px] font-medium text-slate-600">Mensalidade (R$)</label>
                      <input key={plan.monthly_fee} name="monthly_fee" inputMode="decimal" defaultValue={formatNumber(plan.monthly_fee)} className={input} />
                    </div>
                    <div className="w-28">
                      <label className="mb-1 block text-[12px] font-medium text-slate-600">Por sinistro (R$)</label>
                      <input key={plan.claim_price} name="claim_price" inputMode="decimal" defaultValue={formatNumber(plan.claim_price)} className={input} />
                    </div>
                    <SaveButton className={btnPrimary}>Salvar preços</SaveButton>
                  </form>

                  <form action={savePlanLimits}>
                    <input type="hidden" name="plan_id" value={plan.id} />
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">
                      Limites — deixe vazio para não limitar
                    </p>
                    <div
                      key={JSON.stringify((limitsByPlan.get(plan.id) ?? []).map((l) => [l.limit_key, l.limit_value]))}
                      className="grid gap-x-6 gap-y-3 sm:grid-cols-2"
                    >
                      {PLAN_LIMITS.map((def) => {
                        const current = (limitsByPlan.get(plan.id) ?? []).find((l) => l.limit_key === def.key);
                        return (
                          <div key={def.key}>
                            <label className="mb-1 block text-[12px] font-medium text-slate-600">
                              {def.label} <span className="font-normal text-slate-400">({def.unit})</span>
                            </label>
                            {def.kind === "toggle" ? (
                              <select name={`limit_${def.key}`} defaultValue={Number(current?.limit_value) === 1 ? "1" : "0"} className={input}>
                                <option value="0">Bloquear</option>
                                <option value="1">Permitir (com cobrança extra)</option>
                              </select>
                            ) : (
                              <input
                                name={`limit_${def.key}`}
                                inputMode="decimal"
                                defaultValue={formatNumber(current?.limit_value)}
                                placeholder="sem limite"
                                className={input}
                              />
                            )}
                            <p className="mt-0.5 text-[11px] text-slate-400">{def.hint}</p>
                          </div>
                        );
                      })}
                    </div>
                    <SaveButton className={`mt-3 ${btnPrimary}`}>Salvar limites</SaveButton>
                  </form>

                  {(limitsByPlan.get(plan.id) ?? []).some((l) => !PLAN_LIMIT_KEYS.has(l.limit_key)) && (
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">
                        Limites antigos fora do catálogo
                      </p>
                      <ul className="space-y-1">
                        {(limitsByPlan.get(plan.id) ?? [])
                          .filter((l) => !PLAN_LIMIT_KEYS.has(l.limit_key))
                          .map((l) => (
                            <li key={l.id} className="flex items-center gap-2 text-[12px] text-slate-700">
                              <span>{l.limit_key}</span>
                              <span className="text-slate-500">{l.limit_value === null ? "ilimitado" : l.limit_value}</span>
                              <form action={removePlanLimit.bind(null, l.id)}>
                                <button className="text-slate-400 hover:text-rose-600" aria-label={`Remover limite ${l.limit_key}`}>
                                  <X className="size-3.5" />
                                </button>
                              </form>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
    </div>
  );
}
