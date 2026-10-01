import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes, type PermissionCode } from "@/lib/permissions";
import { toggleGroup, updateGroup } from "../actions";

export const metadata: Metadata = { title: "Editar grupo" };

const UUID = /^[0-9a-f-]{36}$/i;

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

const PERMISSION_LABELS: Record<PermissionCode, string> = {
  "claim.formalize": "Formalizar sinistro",
  "claim.execute": "Avançar etapas do sinistro",
  "claim.reopen": "Reabrir ciclo",
  "claim.discard": "Descartar ciclo",
  "document.validate": "Validar documentos",
  "workflow.edit": "Editar fluxos",
  "workflow.publish": "Publicar versão de fluxo",
  "import.confirm": "Confirmar importação em massa",
  "user.manage": "Gerenciar usuários e grupos",
  "financial.manage": "Gerenciar financeiro do ciclo",
};

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

  // Papel (Administrador/Operador) controla telas e ações — é escolhido por pessoa em /usuarios,
  // não por grupo. Mostrar aqui é só pra deixar claro a diferença, sem misturar os dois conceitos.
  const { data: roleRows } = await supabase
    .from("roles")
    .select("id, name, tenant_id, role_permissions(permissions(code))")
    .or(`tenant_id.is.null,tenant_id.eq.${ctx.tenantId}`)
    .in("name", ["Administrador", "Operador"]);
  const roles = ["Administrador", "Operador"].flatMap((name) => {
    const candidates = (roleRows ?? []).filter((r) => r.name === name);
    const chosen = candidates.find((r) => r.tenant_id === ctx.tenantId) ?? candidates[0];
    if (!chosen) return [];
    const codes = (chosen.role_permissions ?? [])
      .map((rp) => rp.permissions?.code)
      .filter((c): c is PermissionCode => !!c)
      .sort();
    return [{ name, codes }];
  });

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
          <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Papéis e permissões</h2>
          <p className="mb-3 flex items-start gap-1.5 text-[12px] text-slate-500">
            <Info className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
            Quais telas e ações cada pessoa vê é controlado pelo <strong>Papel</strong> dela, não pelo grupo — grupo só define em
            quais etapas do fluxo ela pode atuar. O papel é escolhido por pessoa em{" "}
            <Link href="/usuarios" className="text-brand hover:underline">
              Usuários
            </Link>
            .
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {roles.map((r) => (
              <div key={r.name} className="rounded-lg border border-slate-200 p-3">
                <p className="mb-1.5 text-[13px] font-medium text-slate-900">{r.name}</p>
                <ul className="space-y-0.5">
                  {r.codes.map((c) => (
                    <li key={c} className="text-[12px] text-slate-600">
                      {PERMISSION_LABELS[c] ?? c}
                    </li>
                  ))}
                  {r.codes.length === 0 && <li className="text-[12px] text-slate-400">Nenhuma permissão.</li>}
                </ul>
              </div>
            ))}
          </div>
        </section>

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
