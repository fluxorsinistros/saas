import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes } from "@/lib/permissions";
import { getRoleOptions } from "@/lib/tenant-roles";
import { getTenantOrganizations } from "@/lib/tenant-organizations";
import { MemberEditForm } from "./member-edit-form";
import { ResetPasswordButton } from "./reset-button";

export const metadata: Metadata = { title: "Editar usuário" };

const UUID = /^[0-9a-f-]{36}$/i;

// Passo 3 do modelo (pesquisar → lista → editar). Só Administrador da conta; ninguém edita o próprio acesso.
export default async function EditTenantUserPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  const perms = await getPermissionCodes(ctx.userId, ctx.tenantId);
  if (!perms.has("user.manage")) redirect("/usuarios");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  // as regras de acesso (RLS) já escondem Gestores e outras empresas: o que não aparece aqui dá 404
  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("id, user_id, status, organization_id, membership_roles(role_id)")
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!membership) notFound();
  if (membership.user_id === ctx.userId) redirect("/usuarios");

  const [{ data: profile }, { data: memberGroup }, { data: groups }, roles, { data: roleRows }, organizations] = await Promise.all([
    supabase.from("user_profiles").select("full_name, email, phone, cpf").eq("id", membership.user_id).maybeSingle(),
    supabase.from("group_members").select("group_id").eq("membership_id", id).maybeSingle(),
    supabase.from("groups").select("id, name").eq("tenant_id", ctx.tenantId).eq("status", "active").order("name"),
    getRoleOptions(supabase, ctx.tenantId),
    supabase.from("roles").select("id, name").in("id", (membership.membership_roles ?? []).map((r) => r.role_id)),
    getTenantOrganizations(supabase, ctx.tenantId),
  ]);

  // o seletor usa o papel da lista (o da empresa, se houver), mesmo que o usuário tenha o de sistema de mesmo nome
  const currentRoleName = roleRows?.[0]?.name;
  const formRoleId = roles.find((r) => r.name === currentRoleName)?.id ?? roleRows?.[0]?.id ?? "";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-narrow space-y-6 px-4 py-6 md:px-8 md:py-8">
        <div>
          <Link href="/usuarios" className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-3.5" /> Usuários
          </Link>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">{profile?.full_name || profile?.email}</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {ctx.tenantName} · {currentRoleName ?? "Sem tipo"} · {membership.status === "active" ? "Ativo" : "Inativo"}
          </p>
        </div>

        <MemberEditForm
          membershipId={id}
          fullName={profile?.full_name ?? ""}
          email={profile?.email ?? ""}
          phone={profile?.phone ?? ""}
          cpf={profile?.cpf ?? ""}
          tenantName={ctx.tenantName}
          roleId={formRoleId}
          groupId={memberGroup?.group_id ?? ""}
          active={membership.status === "active"}
          roles={roles}
          organizations={organizations}
          organizationId={membership.organization_id ?? ""}
          groups={(groups ?? []).map((g) => ({ id: g.id, name: g.name }))}
        />

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Acesso</h2>
          <p className="mb-3 text-[12px] text-slate-500">
            A senha é da própria pessoa: enviamos um link para ela criar uma nova. Definir a senha diretamente é uma função do Gestor da plataforma.
          </p>
          <ResetPasswordButton membershipId={id} />
        </section>
      </div>
    </div>
  );
}
