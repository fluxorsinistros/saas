import "server-only";
import { createClient } from "@/lib/supabase/server";

// Catálogo de ações que um Grupo pode desabilitar para seus membros Operador (groups.disabled_actions).
// Primeira entrada: lançar/formalizar um sinistro novo. Mais entram aqui conforme a necessidade —
// é uma restrição adicional sobre o que o Papel já libera, nunca uma permissão nova por si só.
export type GroupActionKey = "claim.formalize";

export const GROUP_ACTIONS: { key: GroupActionKey; label: string; hint: string }[] = [
  {
    key: "claim.formalize",
    label: "Lançar novo sinistro",
    hint: "Formalizar/abrir um sinistro novo a partir de um fluxo publicado.",
  },
];

// Administrador nunca é afetado (grupo é conceito de Operador — mesma decisão de hidden_screens).
// Pessoa com mais de um grupo: basta UM grupo liberar a ação pra ela poder usar.
export async function isActionAllowedForMember(userId: string, tenantId: string, action: GroupActionKey): Promise<boolean> {
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("id, membership_roles(roles(name))")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return false;

  const isAdmin = (membership.membership_roles ?? []).some(
    (mr) => (mr as unknown as { roles: { name: string } | null }).roles?.name === "Administrador",
  );
  if (isAdmin) return true;

  const { data: memberGroups } = await supabase.from("group_members").select("groups(disabled_actions)").eq("membership_id", membership.id);
  const groups = (memberGroups ?? []).map((g) => g.groups).filter((g): g is { disabled_actions: string[] } => !!g);
  if (groups.length === 0) return true; // sem grupo nenhum: nada restringe (não é o caso coberto por esta regra)
  return groups.some((g) => !g.disabled_actions.includes(action));
}
