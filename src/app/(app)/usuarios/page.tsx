import type { Metadata } from "next";
import { Building2, Plus, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes } from "@/lib/permissions";
import { addMember, createOrganization } from "./actions";
import { MemberAccessForm } from "./member-access-form";

export const metadata: Metadata = { title: "Usuários e organizações" };

const ROLE_KIND_LABEL: Record<string, string> = {
  interno: "Interno",
  transportadora: "Transportadora",
  embarcador: "Embarcador",
  seguradora: "Seguradora",
  corretora: "Corretora",
  gerenciadora_risco: "Gerenciadora de risco",
  fornecedor: "Fornecedor",
  outro: "Outro",
};

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

export default async function UsuariosPage() {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const perms = await getPermissionCodes(ctx.userId, ctx.tenantId);
  const canManage = perms.has("user.manage");

  const [{ data: memberships }, { data: groups }, { data: tenantOrgs }, { data: roles }] = await Promise.all([
    supabase
      .from("tenant_memberships")
      .select("id, status, user_id, organization_id, joined_at, membership_roles(role_id)")
      .eq("tenant_id", ctx.tenantId)
      .order("joined_at", { ascending: true }),
    supabase.from("groups").select("id, name").eq("tenant_id", ctx.tenantId).eq("status", "active").order("name"),
    supabase
      .from("tenant_organizations")
      .select("id, role_kind, is_owner, organizations(id, name)")
      .eq("tenant_id", ctx.tenantId),
    supabase.from("roles").select("id, name, tenant_id").or(`tenant_id.is.null,tenant_id.eq.${ctx.tenantId}`).order("name"),
  ]);
  const roleNameById = new Map((roles ?? []).map((r) => [r.id, r.name]));
  // papéis elegíveis: só Administrador e Operador, preferindo o papel próprio da empresa quando tem o mesmo nome
  const roleOptions = ["Administrador", "Operador"].flatMap((name) => {
    const candidates = (roles ?? []).filter((r) => r.name === name);
    return candidates.length ? [candidates.find((r) => r.tenant_id === ctx.tenantId) ?? candidates[0]] : [];
  });

  const userIds = [...new Set((memberships ?? []).map((m) => m.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase.from("user_profiles").select("id, full_name, email").in("id", userIds)
    : { data: [] as { id: string; full_name: string; email: string }[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const membershipIds = (memberships ?? []).map((m) => m.id);
  const { data: memberGroups } = membershipIds.length
    ? await supabase.from("group_members").select("id, group_id, membership_id").in("membership_id", membershipIds)
    : { data: [] as { id: string; group_id: string; membership_id: string }[] };
  const groupsByMembership = new Map<string, { id: string; group_id: string }[]>();
  for (const mg of memberGroups ?? []) {
    groupsByMembership.set(mg.membership_id, [...(groupsByMembership.get(mg.membership_id) ?? []), mg]);
  }
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));

  const orgById = new Map((tenantOrgs ?? []).map((t) => [t.id, t]));
  const orgNameByMembershipOrgId = new Map((tenantOrgs ?? []).map((t) => [t.organizations?.id, t.organizations?.name]));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-8 space-y-10">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Usuários e organizações</h1>
          <p className="mt-1 max-w-xl text-[14px] text-slate-500">
            Quem participa deste tenant, em qual organização e em quais grupos operacionais.
          </p>
        </div>

        <section>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Membros</h2>

          {canManage && (
            <form action={addMember} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="min-w-[240px] flex-1">
                <label htmlFor="email" className="mb-1 block text-[12px] font-medium text-slate-600">
                  Adicionar pelo e-mail
                </label>
                <input id="email" name="email" type="email" required placeholder="pessoa@empresa.com" className={input} />
                <p className="mt-1 text-[11px] text-slate-500">
                  A pessoa precisa já ter uma conta (tela de login → Criar conta). Convite por e-mail para quem ainda não tem
                  conta é um passo futuro.
                </p>
              </div>
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600">
                <UserPlus className="size-4" /> Adicionar
              </button>
            </form>
          )}

          <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {(memberships ?? []).map((m) => {
              const profile = profileById.get(m.user_id);
              const active = m.status === "active";
              const isSelf = m.user_id === ctx.userId;
              const myGroup = (groupsByMembership.get(m.id) ?? [])[0];
              const orgName = m.organization_id ? orgNameByMembershipOrgId.get(m.organization_id) : null;
              const currentRoleId = m.membership_roles?.[0]?.role_id;
              const currentRoleName = currentRoleId ? roleNameById.get(currentRoleId) : undefined;
              // o seletor usa o papel da lista (o da empresa, se houver), mesmo que o usuário tenha o de sistema de mesmo nome
              const formRoleId = roleOptions.find((r) => r.name === currentRoleName)?.id ?? currentRoleId ?? "";
              return (
                <li key={m.id} className={`px-5 py-4 ${active ? "" : "bg-slate-50/70"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-[180px] flex-1">
                      <div className="text-[14px] font-medium text-slate-900">
                        {profile?.full_name ?? "—"}
                        {isSelf && <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">Você</span>}
                      </div>
                      <div className="text-[12px] text-slate-500">
                        {profile?.email ?? m.user_id}
                        {orgName && ` · ${orgName}`}
                      </div>
                    </div>
                    {currentRoleName && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{currentRoleName}</span>
                    )}
                    {myGroup && (
                      <span className="rounded-full bg-violet/10 px-2 py-0.5 text-[11px] font-medium text-violet">
                        {groupName.get(myGroup.group_id) ?? "—"}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                        active ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-slate-200"
                      }`}
                    >
                      {active ? "Ativo" : "Inativo"}
                    </span>
                  </div>

                  {canManage &&
                    (isSelf ? (
                      <p className="mt-2 text-[11px] text-slate-400">Você não pode alterar o seu próprio acesso. Peça a outro Administrador.</p>
                    ) : (
                      <details className="mt-2">
                        <summary className="cursor-pointer list-none text-[12px] font-medium text-brand hover:underline">Editar acesso</summary>
                        <MemberAccessForm
                          membershipId={m.id}
                          roleId={formRoleId}
                          groupId={myGroup?.group_id ?? ""}
                          active={active}
                          roles={roleOptions.map((r) => ({ id: r.id, name: r.name }))}
                          groups={(groups ?? []).map((g) => ({ id: g.id, name: g.name }))}
                        />
                      </details>
                    ))}
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Organizações participantes</h2>
          <p className="mb-3 text-[13px] text-slate-500">
            Seguradoras, corretoras e outros parceiros que colaboram neste tenant (Documento 1 §3.2) — não precisam de conta
            própria do produto, só de membros vinculados a elas na lista de acima.
          </p>

          {canManage && (
            <form action={createOrganization} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="min-w-[200px] flex-1">
                <label htmlFor="org-name" className="mb-1 block text-[12px] font-medium text-slate-600">
                  Nome
                </label>
                <input id="org-name" name="name" required placeholder="Ex.: Seguradora Alfa" className={input} />
              </div>
              <div className="min-w-[180px]">
                <label htmlFor="org-role" className="mb-1 block text-[12px] font-medium text-slate-600">
                  Papel
                </label>
                <select id="org-role" name="role_kind" defaultValue="seguradora" className={input}>
                  {Object.entries(ROLE_KIND_LABEL)
                    .filter(([k]) => k !== "interno")
                    .map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                </select>
              </div>
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600">
                <Plus className="size-4" /> Adicionar organização
              </button>
            </form>
          )}

          <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {(tenantOrgs ?? []).map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                  <Building2 className="size-4" />
                </div>
                <div className="min-w-0 flex-1 text-[14px] font-medium text-slate-900">{t.organizations?.name}</div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  {t.is_owner ? "Interno (dono)" : (ROLE_KIND_LABEL[t.role_kind] ?? t.role_kind)}
                </span>
              </li>
            ))}
            {orgById.size === 0 && (
              <li className="px-5 py-6 text-center text-[13px] text-slate-400">Nenhuma organização ainda.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
