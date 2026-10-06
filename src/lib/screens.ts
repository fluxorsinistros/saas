import "server-only";
import { notFound, redirect } from "next/navigation";
import { getMemberGroups } from "@/lib/active-group";
import { getTenantContext } from "@/lib/tenant";

// Catálogo das telas que um Grupo pode esconder do menu (groups.hidden_screens). Espelha os itens
// de NavLinks, "admin" fica de fora porque é exclusivo do administrador de plataforma, nunca
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
// grupo dela tenha telas escondidas (decisão explícita do usuário, grupo nunca tranca quem admina
// a própria empresa fora de uma tela).
export async function getHiddenScreensForMember(userId: string, tenantId: string): Promise<string[]> {
  const { isAdmin, active } = await getMemberGroups(userId, tenantId);
  if (isAdmin) return [];
  // Só o grupo ativo da sessão vale: quem está em vários grupos atua em um por vez.
  return active?.hidden_screens ?? [];
}

// A tela escondida pelo grupo não some só do menu: abrir o endereço direto também é barrado aqui, no servidor.
// Quem tem a tela escondida cai na primeira tela liberada; sem nenhuma, vê "não encontrada".
export async function requireScreen(key: ScreenKey): Promise<void> {
  const ctx = await getTenantContext();
  const hidden = await getHiddenScreensForMember(ctx.userId, ctx.tenantId);
  if (!hidden.includes(key)) return;
  const allowed = SCREENS.find((s) => !hidden.includes(s.key));
  if (allowed) redirect(`/${allowed.key}`);
  notFound();
}
