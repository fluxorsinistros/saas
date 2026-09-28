import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileWarning, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { formalizeClaim } from "./actions";

export const metadata: Metadata = { title: "Sinistros" };

const CYCLE_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  open: "Aberto",
  in_progress: "Em andamento",
  waiting: "Aguardando",
  blocked: "Bloqueado",
  completed: "Concluído",
  cancelled: "Cancelado",
  discarded: "Descartado",
  archived: "Arquivado",
};

const CYCLE_STATUS_STYLE: Record<string, string> = {
  blocked: "bg-rose-50 text-rose-700 ring-rose-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  open: "bg-sky-50 text-sky-700 ring-sky-200",
  in_progress: "bg-sky-50 text-sky-700 ring-sky-200",
};

export default async function SinistrosPage() {
  const ctx = await getTenantContext();
  const supabase = await createClient();

  const [{ data: claims }, { data: publishedWorkflows }] = await Promise.all([
    supabase
      .from("claims")
      .select("id, claim_number, status, created_at, claim_cycles(status, cycle_number)")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("workflows")
      .select("id, name, workflow_versions(status)")
      .eq("tenant_id", ctx.tenantId)
      .eq("status", "active"),
  ]);

  const options = (publishedWorkflows ?? []).filter((w) => w.workflow_versions.some((v) => v.status === "published"));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Sinistros</h1>
        <p className="mt-1 max-w-xl text-[14px] text-slate-500">
          Cada sinistro formalizado abre um ciclo preso à versão publicada do fluxo escolhido — mudanças futuras no fluxo não
          afetam ciclos já abertos.
        </p>

        {options.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-4 text-[13px] text-slate-500">
            Nenhum fluxo publicado ainda.{" "}
            <Link href="/fluxos" className="font-medium text-brand hover:underline">
              Publique um fluxo
            </Link>{" "}
            antes de abrir um sinistro.
          </div>
        ) : (
          <form action={formalizeClaim} className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="min-w-[220px] flex-1">
              <label htmlFor="workflow_id" className="mb-1 block text-[12px] font-medium text-slate-600">
                Fluxo publicado
              </label>
              <select
                id="workflow_id"
                name="workflow_id"
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
              >
                <option value="">Selecione…</option>
                {options.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[160px]">
              <label htmlFor="occurred_at" className="mb-1 block text-[12px] font-medium text-slate-600">
                Data do evento
              </label>
              <input
                id="occurred_at"
                name="occurred_at"
                type="date"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </div>
            <div className="min-w-[200px] flex-1">
              <label htmlFor="location" className="mb-1 block text-[12px] font-medium text-slate-600">
                Local <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <input
                id="location"
                name="location"
                placeholder="Ex.: São Paulo/SP"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600">
              <Plus className="size-4" /> Formalizar sinistro
            </button>
          </form>
        )}

        {!claims?.length ? (
          <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <FileWarning className="mx-auto size-8 text-slate-300" />
            <p className="mt-3 text-[15px] font-medium text-slate-800">Nenhum sinistro ainda</p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {claims.map((c) => {
              const cycle = [...c.claim_cycles].sort((a, b) => b.cycle_number - a.cycle_number)[0];
              const status = cycle?.status ?? c.status;
              return (
                <li key={c.id}>
                  <Link href={`/sinistros/${c.id}`} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50">
                    <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                      <FileWarning className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium text-slate-900">{c.claim_number}</div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                        CYCLE_STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600 ring-slate-200"
                      }`}
                    >
                      {CYCLE_STATUS_LABEL[status] ?? status}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-slate-300 transition group-hover:text-slate-500" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
