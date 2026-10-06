import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// Um Operador pode pertencer a vários grupos, mas atua em UM por vez (cada grupo tem telas e ações próprias).
// O grupo ativo vive num cookie por empresa e só vale se a pessoa ainda for membro dele; sem escolha, vale o
// primeiro grupo (por nome). Administrador não é limitado por grupo, para ele isto não restringe nada.
const ACTIVE_GROUP_COOKIE = "active_group";

// Um cookie por empresa: os grupos da pessoa são dali, e trocar de empresa nunca pode herdar o grupo de outra.
export function activeGroupCookieName(tenantId: string) {
  return `${ACTIVE_GROUP_COOKIE}_${tenantId}`;
}

export type MemberGroup = { id: string; name: string; icon: string | null; color: string | null; hidden_screens: string[]; disabled_actions: string[] };

export type MemberGroups = {
  membershipId: string | null;
  isAdmin: boolean;
  groups: MemberGroup[];
  active: MemberGroup | null;
};

export const getMemberGroups = cache(async (userId: string, tenantId: string): Promise<MemberGroups> => {
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("id, membership_roles(roles(name))")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return { membershipId: null, isAdmin: false, groups: [], active: null };

  const isAdmin = (membership.membership_roles ?? []).some(
    (mr) => (mr as unknown as { roles: { name: string } | null }).roles?.name === "Administrador",
  );
  const { data: rows } = await supabase
    .from("group_members")
    .select("groups(id, name, icon, color, status, hidden_screens, disabled_actions)")
    .eq("membership_id", membership.id);
  const groups = (rows ?? [])
    .map((r) => r.groups as unknown as (MemberGroup & { status: string }) | null)
    .filter((g): g is MemberGroup & { status: string } => !!g && g.status === "active")
    .map((g) => ({ id: g.id, name: g.name, icon: g.icon ?? null, color: g.color ?? null, hidden_screens: g.hidden_screens ?? [], disabled_actions: g.disabled_actions ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const saved = (await cookies()).get(activeGroupCookieName(tenantId))?.value ?? "";
  const active = groups.find((g) => g.id === saved) ?? groups[0] ?? null;
  return { membershipId: membership.id, isAdmin, groups, active };
});
