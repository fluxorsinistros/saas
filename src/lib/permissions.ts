import { getMemberGroups } from "@/lib/active-group";
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenant";

// Catálogo espelha a migração 0024, mudar um sem mudar o outro deixa o código checando uma
// permissão que não existe no banco (RLS nunca vai conceder, mas o erro fica silencioso).
export type PermissionCode =
  | "claim.formalize"
  | "claim.execute"
  | "claim.reopen"
  | "claim.discard"
  | "document.validate"
  | "workflow.edit"
  | "workflow.publish"
  | "import.confirm"
  | "user.manage"
  | "financial.manage"
  | "financial.configure";

// Uma consulta por request (cache do React), não uma por botão da tela.
export const getPermissionCodes = cache(async (userId: string, tenantId: string): Promise<Set<PermissionCode>> => {
  const supabase = await createClient();
  // membership_roles e role_permissions não têm FK direta entre si (os dois referenciam `roles`,
  // não um ao outro), o embed do PostgREST precisa passar por `roles` no meio do caminho.
  const { data } = await supabase
    .from("tenant_memberships")
    .select("membership_roles(roles(role_permissions(permissions(code))))")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .maybeSingle();

  const codes = new Set<PermissionCode>();
  const memberRoles = (data?.membership_roles ?? []) as unknown as {
    roles: { role_permissions: { permissions: { code: string } | null }[] } | null;
  }[];
  for (const mr of memberRoles) {
    for (const rp of mr.roles?.role_permissions ?? []) {
      if (rp.permissions?.code) codes.add(rp.permissions.code as PermissionCode);
    }
  }
  // Concessões do grupo: o Administrador tem tudo; o Operador ganha, além do papel, o que o grupo em que atua agora concede
  // (catálogo fechado: salvar valores do painel financeiro e configurar o painel). Só o grupo ativo vale.
  const { isAdmin, active } = await getMemberGroups(userId, tenantId);
  if (isAdmin) {
    codes.add("financial.manage");
    codes.add("financial.configure");
  } else if (active) {
    for (const g of active.granted_actions) {
      if (g === "financial.manage" || g === "financial.configure") codes.add(g);
    }
  }
  return codes;
});

export async function hasPermission(ctx: TenantContext, code: PermissionCode): Promise<boolean> {
  const codes = await getPermissionCodes(ctx.userId, ctx.tenantId);
  return codes.has(code);
}

// Para Server Actions: nunca confiar só na UI escondendo o botão (Documento 1 §56), a ação em si
// barra antes de tocar o banco, com mensagem clara em vez de deixar a RLS falhar sem explicação.
export async function requirePermission(ctx: TenantContext, code: PermissionCode): Promise<void> {
  if (!(await hasPermission(ctx, code))) {
    throw new Error("Você não tem permissão para executar esta ação.");
  }
}

// Etapa aponta pro grupo responsável, não pra pessoa (Documento 1 §5.3), ter a permissão
// claim.execute não basta, Operador só pode agir nas etapas do(s) grupo(s) dele. Administrador
// nunca é travado por grupo (mesma decisão já aplicada em telas, src/lib/screens.ts).
export async function canActOnGroup(ctx: TenantContext, groupId: string | null): Promise<boolean> {
  if (!groupId) return true;
  const { membershipId, isAdmin, active } = await getMemberGroups(ctx.userId, ctx.tenantId);
  if (!membershipId) return false;
  if (isAdmin) return true;
  // Operador só age na etapa do grupo em que está atuando agora.
  return active?.id === groupId;
}

export async function requireGroupAccess(ctx: TenantContext, groupId: string | null): Promise<void> {
  if (!(await canActOnGroup(ctx, groupId))) {
    throw new Error("Você não pertence ao grupo responsável por esta etapa.");
  }
}

export async function isTenantAdmin(userId: string, tenantId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("id, membership_roles(roles(name))")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return false;
  return (membership.membership_roles ?? []).some(
    (mr) => (mr as unknown as { roles: { name: string } | null }).roles?.name === "Administrador",
  );
}
