import "server-only";
import { createClient } from "@/lib/supabase/server";

// Catálogo das telas que um Grupo pode esconder do menu (groups.hidden_screens). Espelha os itens
// de NavLinks — "admin" fica de fora porque é exclusivo do administrador de plataforma, nunca
// depende de grupo. Mudar aqui sem mudar NavLinks deixa uma tela sem chave pra esconder.
export type ScreenKey =
  | "dashboard"
  | "torre-de-controle"
  | "fluxos"
  | "sinistros"
  | "importacao"
  | "tarefas"
  | "usuarios"
  | "grupos"
  | "calendarios";

export const SCREENS: { key: ScreenKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "torre-de-controle", label: "Torre de Controle" },
  { key: "fluxos", label: "Fluxos" },
  { key: "sinistros", label: "Sinistros" },
  { key: "importacao", label: "Importação" },
  { key: "tarefas", label: "Tarefas" },
  { key: "usuarios", label: "Usuários" },
  { key: "grupos", label: "Grupos" },
  { key: "calendarios", label: "Calendários" },
];

// Grupo de usuário é um conceito de Operador: Administrador sempre vê o menu inteiro, mesmo que o
// grupo dela tenha telas escondidas (decisão explícita do usuário — grupo nunca tranca quem admina
// a própria empresa fora de uma tela).
export async function getHiddenScreensForMember(userId: string, tenantId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("id, membership_roles(roles(name))")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return [];

  const roleNames = (membership.membership_roles ?? []).map((mr) => (mr as unknown as { roles: { name: string } | null }).roles?.name);
  if (roleNames.includes("Administrador")) return [];

  const { data: memberGroup } = await supabase
    .from("group_members")
    .select("groups(hidden_screens)")
    .eq("membership_id", membership.id)
    .maybeSingle();
  return (memberGroup?.groups as unknown as { hidden_screens: string[] } | null)?.hidden_screens ?? [];
}
