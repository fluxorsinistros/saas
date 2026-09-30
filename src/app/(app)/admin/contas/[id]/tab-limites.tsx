import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PLAN_LIMITS, PLAN_LIMIT_KEYS } from "@/lib/plan-limits";
import { SaveButton } from "../../save-button";
import { updateContractOverrides } from "../../actions";
import { formatNumber, input, limitLabel, showValue } from "../../shared";

type Plan = { id: string; name: string };
type Contract = { id: string; plan_id: string; overrides: unknown };

// O padrão do plano vale para todo mundo; aqui o que esta conta tem de diferente (a "personalização").
export async function TabLimites({ contract, plan }: { contract: Contract | null; plan: Plan | undefined }) {
  if (!contract || !plan) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-600">
        Esta conta ainda não tem plano. Atribua um plano na aba{" "}
        <Link href="?aba=plano" className="font-medium text-brand hover:underline">
          Plano e cobrança
        </Link>{" "}
        para configurar os limites.
      </p>
    );
  }

  const supabase = await createClient();
  const { data: planLimits } = await supabase.from("plan_limits").select("limit_key, limit_value").eq("plan_id", plan.id);
  const overrides = (contract.overrides ?? {}) as Record<string, unknown>;
  const overrideKeys = Object.keys(overrides);
  const planValueOf = (key: string) => (planLimits ?? []).find((l) => l.limit_key === key)?.limit_value;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Valendo hoje</h2>
        <p className="mb-3 text-[12px] text-slate-500">
          Padrão do plano {plan.name}, com o que foi personalizado para esta conta em destaque.
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {PLAN_LIMITS.map((def) => {
            const overridden = Object.prototype.hasOwnProperty.call(overrides, def.key);
            const value = overridden ? overrides[def.key] : planValueOf(def.key);
            return (
              <li
                key={def.key}
                className={`rounded-md px-2 py-0.5 text-[11px] ${
                  overridden ? "bg-violet/10 text-violet ring-1 ring-inset ring-violet/30" : "bg-slate-100 text-slate-600"
                }`}
                title={overridden ? `Padrão do plano: ${showValue(def, planValueOf(def.key))}` : undefined}
              >
                {def.label}: {showValue(def, value)}
                {overridden && " (personalizado)"}
              </li>
            );
          })}
          {overrideKeys
            .filter((k) => !PLAN_LIMIT_KEYS.has(k))
            .map((k) => (
              <li key={k} className="rounded-md bg-violet/10 px-2 py-0.5 text-[11px] text-violet ring-1 ring-inset ring-violet/30">
                {limitLabel(k)}: {String(overrides[k])} (personalizado, fora do catálogo)
              </li>
            ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Personalizar para esta conta</h2>
        <form action={updateContractOverrides}>
          <input type="hidden" name="contract_id" value={contract.id} />
          <p className="mb-3 text-[12px] text-slate-500">
            Preencha só o que esta conta tem de diferente do plano. Vazio = usa o padrão do plano; &quot;ilimitado&quot; libera sem limite.
          </p>
          <div key={`${plan.id}-${JSON.stringify(overrides)}`} className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {PLAN_LIMITS.map((def) => {
              const ov = overrides[def.key];
              return (
                <div key={def.key}>
                  <label className="mb-0.5 block text-[12px] text-slate-600">
                    {def.label} <span className="text-slate-400">({def.unit})</span>
                  </label>
                  {def.kind === "toggle" ? (
                    <select name={`limit_${def.key}`} defaultValue={ov === undefined ? "" : String(Number(ov))} className={input}>
                      <option value="">Padrão do plano ({showValue(def, planValueOf(def.key))})</option>
                      <option value="1">Permitir (com cobrança extra)</option>
                      <option value="0">Bloquear</option>
                    </select>
                  ) : (
                    <input
                      name={`limit_${def.key}`}
                      inputMode="decimal"
                      defaultValue={ov === undefined ? "" : ov === null ? "ilimitado" : formatNumber(ov as number)}
                      placeholder={`plano: ${showValue(def, planValueOf(def.key))}`}
                      className={input}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <SaveButton className="mt-4 rounded-lg bg-brand px-3 py-2 text-[12px] font-medium text-white hover:bg-brand-600">
            Salvar limites da conta
          </SaveButton>
        </form>
      </section>
    </div>
  );
}
