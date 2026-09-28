import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { createGroup, toggleGroup, updateGroup } from "./actions";

export const metadata: Metadata = { title: "Grupos" };

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

export default async function GruposPage() {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const { data: groups } = await supabase
    .from("groups")
    .select("id, name, description, status, group_members(count)")
    .eq("tenant_id", ctx.tenantId)
    .order("status")
    .order("name");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Grupos</h1>
        <p className="mt-1 max-w-xl text-[14px] text-slate-500">
          Unidades operacionais que respondem pelas etapas do fluxo. A etapa aponta para o grupo, e qualquer membro ativo pode
          atuar nela.
        </p>

        <form action={createGroup} className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="g-name" className="mb-1 block text-[12px] font-medium text-slate-600">
              Novo grupo
            </label>
            <input id="g-name" name="name" required placeholder="Ex.: Sinistros Sul" className={input} />
          </div>
          <div className="min-w-[200px] flex-[1.4]">
            <label htmlFor="g-desc" className="mb-1 block text-[12px] font-medium text-slate-600">
              Descrição <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input id="g-desc" name="description" className={input} />
          </div>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600">
            <Plus className="size-4" /> Adicionar
          </button>
        </form>

        <ul className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {(groups ?? []).map((g) => {
            const members = g.group_members?.[0]?.count ?? 0;
            const active = g.status === "active";
            return (
              <li key={g.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${active ? "" : "bg-slate-50/70"}`}>
                <form action={updateGroup} className="flex min-w-[240px] flex-1 items-center gap-2">
                  <input type="hidden" name="id" value={g.id} />
                  <label htmlFor={`name-${g.id}`} className="sr-only">
                    Nome do grupo
                  </label>
                  <input
                    id={`name-${g.id}`}
                    name="name"
                    defaultValue={g.name}
                    className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-[14px] font-medium text-slate-900 outline-none transition hover:border-slate-200 focus:border-brand focus:bg-white"
                  />
                  <button className="shrink-0 rounded-md px-2 py-1 text-[12px] text-brand hover:bg-brand/5">Salvar</button>
                </form>
                <span className="text-[12px] text-slate-500">
                  {members} membro{members === 1 ? "" : "s"}
                </span>
                <form action={toggleGroup}>
                  <input type="hidden" name="id" value={g.id} />
                  <input type="hidden" name="status" value={g.status} />
                  <button
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset transition ${
                      active
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100"
                        : "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200"
                    }`}
                    title={active ? "Desativar grupo" : "Reativar grupo"}
                  >
                    {active ? "Ativo" : "Inativo"}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
