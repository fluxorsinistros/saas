import Link from "next/link";
import { ChevronRight, Workflow } from "lucide-react";
import { readPanel } from "@/lib/financial-panel";

type Props = { workflows: { id: string; name: string; financial_panel: unknown }[] };

// Configuração do painel financeiro: cada fluxo escolhe quais campos numéricos aparecem na aba Financeiro dos sinistros.
export function TenantFinanceiroTab({ workflows }: Props) {
  return (
    <section className="max-w-2xl space-y-4">
      <p className="text-[13px] text-slate-700">
        A aba Financeiro de cada sinistro mostra os campos que você escolher aqui, fluxo por fluxo: valores em R$, porcentagens, números e
        campos calculados. Para criar um campo novo (ou uma fórmula), use o editor do fluxo.
      </p>
      {workflows.length === 0 ? (
        <p className="rounded-xl bg-white px-5 py-6 text-[13px] text-slate-700">Nenhum fluxo ainda. Crie um em Fluxos.</p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white">
          {workflows.map((wf) => {
            const n = readPanel(wf.financial_panel).length;
            return (
              <li key={wf.id}>
                <Link href={`/fluxos/${wf.id}/financeiro`} className="group flex items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50">
                  <Workflow className="size-4 shrink-0 text-brand" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-slate-900">{wf.name}</span>
                  <span className="shrink-0 text-[12px] text-slate-600">{n === 0 ? "Sem painel" : `${n} ${n === 1 ? "campo" : "campos"} no painel`}</span>
                  <span className="shrink-0 text-[13px] font-medium text-brand">Configurar</span>
                  <ChevronRight className="size-4 shrink-0 text-slate-500 transition group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
