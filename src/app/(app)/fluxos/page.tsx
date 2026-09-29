import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus, Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes } from "@/lib/permissions";
import { createWorkflow } from "./actions";

export const metadata: Metadata = { title: "Fluxos" };

export default async function FluxosPage() {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const perms = await getPermissionCodes(ctx.userId, ctx.tenantId);
  const { data: workflows } = await supabase
    .from("workflows")
    .select("id, name, description, updated_at, workflow_versions(id, version_number, status, published_at)")
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-8 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Fluxos</h1>
            <p className="mt-1 max-w-xl text-[14px] text-slate-500">
              Desenhe os processos de sinistro: etapas, decisões, ramos paralelos, convergências e SLAs. Cada publicação gera
              uma versão imutável.
            </p>
          </div>
        </div>

        {perms.has("workflow.edit") && (
          <form action={createWorkflow} className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="min-w-[220px] flex-1">
              <label htmlFor="wf-name" className="mb-1 block text-[12px] font-medium text-slate-600">
                Novo fluxo
              </label>
              <input
                id="wf-name"
                name="name"
                required
                placeholder="Ex.: Sinistro de roubo"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </div>
            <div className="min-w-[220px] flex-[1.4]">
              <label htmlFor="wf-desc" className="mb-1 block text-[12px] font-medium text-slate-600">
                Descrição <span className="font-normal text-slate-500">(opcional)</span>
              </label>
              <input
                id="wf-desc"
                name="description"
                placeholder="Para que serve este fluxo"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600">
              <Plus className="size-4" /> Criar e desenhar
            </button>
          </form>
        )}

        {!workflows?.length ? (
          <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <Workflow className="mx-auto size-8 text-slate-300" />
            <p className="mt-3 text-[15px] font-medium text-slate-800">Nenhum fluxo ainda</p>
            <p className="mt-1 text-[13px] text-slate-500">
              Crie o primeiro acima. No editor você pode começar de um modelo pronto de Responsabilidade Financeira.
            </p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {workflows.map((wf) => {
              const versions = [...(wf.workflow_versions ?? [])].sort((a, b) => b.version_number - a.version_number);
              const published = versions.find((v) => v.status === "published");
              const draft = versions.find((v) => v.status === "draft");
              return (
                <li key={wf.id}>
                  <Link href={`/fluxos/${wf.id}`} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50">
                    <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                      <Workflow className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium text-slate-900">{wf.name}</div>
                      <div className="truncate text-[12px] text-slate-500">{wf.description || "Sem descrição"}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {published ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          v{published.version_number} publicada
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          Nunca publicado
                        </span>
                      )}
                      {draft && (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
                          v{draft.version_number} em rascunho
                        </span>
                      )}
                    </div>
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
