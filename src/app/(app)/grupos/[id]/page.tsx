import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes } from "@/lib/permissions";
import { toggleGroup, updateGroup } from "../actions";

export const metadata: Metadata = { title: "Editar grupo" };

const UUID = /^[0-9a-f-]{36}$/i;

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

// Passo 3 do modelo (cadastrar → filtrar/listar → editar), igual a Usuários.
export default async function EditGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  const perms = await getPermissionCodes(ctx.userId, ctx.tenantId);
  if (!perms.has("user.manage")) redirect("/grupos");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, description, status, group_members(count)")
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!group) notFound();

  const active = group.status === "active";
  const members = group.group_members?.[0]?.count ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl space-y-6 px-8 py-8">
        <div>
          <Link href="/grupos" className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-3.5" /> Grupos
          </Link>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">{group.name}</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {members} membro{members === 1 ? "" : "s"} · {active ? "Ativo" : "Inativo"}
          </p>
        </div>

        <form action={updateGroup} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <input type="hidden" name="id" value={group.id} />
          <div>
            <label htmlFor="name" className="mb-1 block text-[12px] font-medium text-slate-600">
              Nome
            </label>
            <input id="name" name="name" required defaultValue={group.name} className={input} />
          </div>
          <div>
            <label htmlFor="description" className="mb-1 block text-[12px] font-medium text-slate-600">
              Descrição <span className="font-normal text-slate-500">(opcional)</span>
            </label>
            <input id="description" name="description" defaultValue={group.description ?? ""} className={input} />
          </div>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600">
            Salvar alterações
          </button>
        </form>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Situação</h2>
          <p className="mb-3 text-[12px] text-slate-500">
            Grupo nunca é excluído — etapas e histórico já publicados continuam apontando para ele. Desativar só impede que ele
            seja escolhido em novos fluxos ou cadastros de usuário.
          </p>
          <form action={toggleGroup}>
            <input type="hidden" name="id" value={group.id} />
            <input type="hidden" name="status" value={group.status} />
            <button
              className={`rounded-lg px-4 py-2 text-[13px] font-medium ring-1 ring-inset transition ${
                active
                  ? "bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100"
                  : "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100"
              }`}
            >
              {active ? "Desativar grupo" : "Reativar grupo"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
