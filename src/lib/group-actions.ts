import "server-only";
import { getMemberGroups } from "@/lib/active-group";

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
// Pessoa com mais de um grupo: vale só o grupo ativo da sessão (atua em um por vez).
export async function isActionAllowedForMember(userId: string, tenantId: string, action: GroupActionKey): Promise<boolean> {
  const { membershipId, isAdmin, active } = await getMemberGroups(userId, tenantId);
  if (!membershipId) return false;
  if (isAdmin) return true;
  if (!active) return true; // sem grupo nenhum: nada restringe (não é o caso coberto por esta regra)
  return !active.disabled_actions.includes(action);
}
