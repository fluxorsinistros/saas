import Link from "next/link";
import { SaveButton } from "../../save-button";
import { assignContract, setWhiteLabel } from "../../actions";
import { btnPrimary, currency, formatNumber, input } from "../../shared";

type Plan = { id: string; code: string; name: string; setup_fee: number; monthly_fee: number; claim_price: number };
type Contract = { id: string; plan_id: string; white_label_enabled: boolean; white_label_surcharge_pct: number };

export function TabPlano({
  tenantId,
  plans,
  contract,
  plan,
}: {
  tenantId: string;
  plans: Plan[];
  contract: Contract | null;
  plan: Plan | undefined;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Plano aplicado</h2>
        <form action={assignContract} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="tenant_id" value={tenantId} />
          <div className="w-56">
            <label htmlFor="plan_id" className="mb-1 block text-[12px] font-medium text-slate-600">
              Plano
            </label>
            <select key={contract?.plan_id ?? "none"} id="plan_id" name="plan_id" defaultValue={contract?.plan_id ?? ""} className={input}>
              <option value="" disabled>
                Escolher plano…
              </option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <SaveButton className={btnPrimary}>{contract ? "Trocar plano" : "Atribuir plano"}</SaveButton>
        </form>

        {plan ? (
          <p className="mt-3 text-[13px] text-slate-600">
            Implantação {currency.format(plan.setup_fee)} · Mensalidade {currency.format(plan.monthly_fee)} · Por sinistro{" "}
            {currency.format(plan.claim_price)}.{" "}
            <Link href="/admin?aba=planos" className="font-medium text-brand hover:underline">
              Editar os preços em Planos
            </Link>
          </p>
        ) : (
          <p className="mt-3 text-[13px] text-slate-500">Sem plano: nenhum limite é aplicado e nada é cobrado. Atribua um plano acima.</p>
        )}
      </section>

      {contract && plan && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Marca própria (white-label)</h2>
          <form action={setWhiteLabel} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="contract_id" value={contract.id} />
            <label className="flex items-center gap-2 pb-1.5 text-[13px] font-medium text-slate-700">
              <input key={String(contract.white_label_enabled)} type="checkbox" name="enabled" defaultChecked={contract.white_label_enabled} />
              White-label liberado
            </label>
            <div className="w-40">
              <label className="mb-0.5 block text-xs text-slate-500">Acréscimo na mensalidade (%)</label>
              <input
                key={contract.white_label_surcharge_pct}
                name="surcharge_pct"
                inputMode="decimal"
                defaultValue={formatNumber(contract.white_label_surcharge_pct)}
                className={input}
              />
            </div>
            <SaveButton className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-100">
              Salvar
            </SaveButton>
          </form>
          <p className="mt-3 text-[13px] text-slate-600">
            {contract.white_label_enabled
              ? `Mensalidade com white-label: ${currency.format(plan.monthly_fee * (1 + contract.white_label_surcharge_pct / 100))} (plano ${currency.format(plan.monthly_fee)} + ${formatNumber(contract.white_label_surcharge_pct) || "0"}%). A aba Marca fica disponível.`
              : `Sem white-label: mensalidade do plano: ${currency.format(plan.monthly_fee)}. Ao liberar, aparece a aba Marca.`}
          </p>
        </section>
      )}
    </div>
  );
}
