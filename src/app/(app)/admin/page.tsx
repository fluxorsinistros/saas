import type { Metadata } from "next";
import { Building2, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { assignContract, createPlan, createTenantAsAdmin, removePlanLimit, updateContractOverrides, upsertPlanLimit } from "./actions";

export const metadata: Metadata = { title: "Administração de plataforma" };

const input =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function AdminPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const [{ data: plans }, { data: limits }, { data: tenants }, { data: contracts }] = await Promise.all([
    supabase.from("plans").select("id, code, name, setup_fee, monthly_fee, claim_price, status").order("claim_price"),
    supabase.from("plan_limits").select("id, plan_id, limit_key, limit_value"),
    supabase.from("tenants").select("id, name").order("name"),
    supabase.from("tenant_contracts").select("id, tenant_id, plan_id, overrides, status"),
  ]);

  const limitsByPlan = new Map<string, typeof limits>();
  for (const l of limits ?? []) limitsByPlan.set(l.plan_id, [...(limitsByPlan.get(l.plan_id) ?? []), l]);
  const planById = new Map((plans ?? []).map((p) => [p.id, p]));
  const contractByTenant = new Map((contracts ?? []).map((c) => [c.tenant_id, c]));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-8 space-y-10">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Administração de plataforma</h1>
          <p className="mt-1 max-w-xl text-[14px] text-slate-500">
            Global, fora de qualquer tenant — planos, limites e o contrato de cada empresa cliente (Documento 1 §64: nada
            disso é constante no código).
          </p>
        </div>

        <section>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Planos</h2>

          <form action={createPlan} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
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
                <div className="border-t border-slate-100 px-4 py-3">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">Limites</p>
                  <ul className="mb-3 space-y-1.5">
                    {(limitsByPlan.get(plan.id) ?? []).map((l) => (
                      <li key={l.id} className="flex items-center gap-2 text-[12px] text-slate-700">
                        <span className="w-40 shrink-0 truncate">{l.limit_key}</span>
                        <span className="text-slate-500">{l.limit_value === null ? "ilimitado" : l.limit_value}</span>
                        <form action={removePlanLimit.bind(null, l.id)}>
                          <button className="text-slate-400 hover:text-rose-600" aria-label={`Remover limite ${l.limit_key}`}>
                            <X className="size-3.5" />
                          </button>
                        </form>
                      </li>
                    ))}
                    {(limitsByPlan.get(plan.id) ?? []).length === 0 && (
                      <li className="text-[12px] text-slate-400">Nenhum limite definido — capacidade ilimitada em tudo.</li>
                    )}
                  </ul>
                  <form action={upsertPlanLimit} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="plan_id" value={plan.id} />
                    <input name="limit_key" required placeholder="ex.: users, storage_per_claim_mb" className={`${input} w-56`} />
                    <input name="limit_value" placeholder="vazio = ilimitado" className={`${input} w-40`} />
                    <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
                      Definir
                    </button>
                  </form>
                </div>
              </details>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Empresas e contratos</h2>
          <p className="mb-3 text-[13px] text-slate-500">
            O efetivo aparece sempre ao lado do padrão do plano — nunca escondemos quando um contrato sobrescreveu algo
            (Documento 5 §11).
          </p>

          <form action={createTenantAsAdmin} className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="min-w-[220px] flex-1">
              <label htmlFor="tenant_name" className="mb-1 block text-[12px] font-medium text-slate-600">
                Nova empresa cliente
              </label>
              <input id="tenant_name" name="name" required placeholder="Nome da empresa" className={input} />
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-brand-600">
              <Plus className="size-4" /> Criar empresa
            </button>
          </form>

          <ul className="space-y-3">
            {(tenants ?? []).map((t) => {
              const contract = contractByTenant.get(t.id);
              const plan = contract ? planById.get(contract.plan_id) : undefined;
              const overrides = (contract?.overrides ?? {}) as Record<string, unknown>;
              const overrideKeys = Object.keys(overrides);
              return (
                <li key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="size-4 text-slate-400" />
                      <span className="text-[14px] font-medium text-slate-900">{t.name}</span>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      {plan ? plan.name : "Sem contrato"}
                    </span>
                  </div>

                  <form action={assignContract} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="tenant_id" value={t.id} />
                    <select name="plan_id" defaultValue={contract?.plan_id ?? ""} className={`${input} w-48`}>
                      <option value="" disabled>
                        Escolher plano…
                      </option>
                      {(plans ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-600">
                      {contract ? "Trocar plano" : "Atribuir plano"}
                    </button>
                  </form>

                  {contract && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">
                        Limites efetivos (padrão do plano, sobrescritos onde houver override)
                      </p>
                      <ul className="mb-2 flex flex-wrap gap-1.5">
                        {(limitsByPlan.get(plan!.id) ?? []).map((l) => {
                          const overridden = Object.prototype.hasOwnProperty.call(overrides, l.limit_key);
                          const value = overridden ? overrides[l.limit_key] : l.limit_value;
                          return (
                            <span
                              key={l.id}
                              className={`rounded-md px-2 py-0.5 text-[11px] ${
                                overridden ? "bg-violet/10 text-violet ring-1 ring-inset ring-violet/30" : "bg-slate-100 text-slate-600"
                              }`}
                              title={overridden ? `Padrão do plano: ${l.limit_value === null ? "ilimitado" : l.limit_value}` : undefined}
                            >
                              {l.limit_key}: {value === null || value === undefined ? "ilimitado" : String(value)}
                              {overridden && " (customizado)"}
                            </span>
                          );
                        })}
                        {overrideKeys
                          .filter((k) => !(limitsByPlan.get(plan!.id) ?? []).some((l) => l.limit_key === k))
                          .map((k) => (
                            <span key={k} className="rounded-md bg-violet/10 px-2 py-0.5 text-[11px] text-violet ring-1 ring-inset ring-violet/30">
                              {k}: {String(overrides[k])} (customizado, fora do plano)
                            </span>
                          ))}
                      </ul>
                      <form action={updateContractOverrides} className="flex items-start gap-2">
                        <input type="hidden" name="contract_id" value={contract.id} />
                        <textarea
                          name="overrides"
                          rows={1}
                          defaultValue={JSON.stringify(overrides)}
                          placeholder='{"users": 50}'
                          className={`${input} font-mono`}
                        />
                        <button className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
                          Salvar overrides
                        </button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
