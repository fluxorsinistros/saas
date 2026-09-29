import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenant";

// Catálogo espelha a migração 0024 — mudar um sem mudar o outro deixa o código checando uma
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
  | "financial.manage";

// Uma consulta por request (cache do React), não uma por botão da tela.
export const getPermissionCodes = cache(async (userId: string, tenantId: string): Promise<Set<PermissionCode>> => {
  const supabase = await createClient();
  // membership_roles e role_permissions não têm FK direta entre si (os dois referenciam `roles`,
  // não um ao outro) — o embed do PostgREST precisa passar por `roles` no meio do caminho.
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
  return codes;
});

export async function hasPermission(ctx: TenantContext, code: PermissionCode): Promise<boolean> {
  const codes = await getPermissionCodes(ctx.userId, ctx.tenantId);
  return codes.has(code);
}

// Para Server Actions: nunca confiar só na UI escondendo o botão (Documento 1 §56) — a ação em si
// barra antes de tocar o banco, com mensagem clara em vez de deixar a RLS falhar sem explicação.
export async function requirePermission(ctx: TenantContext, code: PermissionCode): Promise<void> {
  if (!(await hasPermission(ctx, code))) {
    throw new Error("Você não tem permissão para executar esta ação.");
  }
}
