import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Supa = SupabaseClient<Database>;

export type RefOption = { id: string; name: string };

// Opções de cada campo "Grupo ou subgrupo", por id do grupo do campo: os subgrupos ativos do grupo ou, quando o grupo não usa
// subgrupos, o próprio grupo. É o que aparece na lista ao abrir o sinistro e o que o servidor aceita como valor.
export async function loadGroupRefOptions(supabase: Supa, tenantId: string, groupIds: string[]): Promise<Map<string, RefOption[]>> {
  const out = new Map<string, RefOption[]>();
  const ids = [...new Set(groupIds.filter(Boolean))];
  if (!ids.length) return out;
  const [{ data: groups }, { data: subs }] = await Promise.all([
    supabase.from("groups").select("id, name, uses_subgroups").eq("tenant_id", tenantId).in("id", ids),
    supabase.from("group_subgroups").select("id, name, group_id").eq("tenant_id", tenantId).eq("status", "active").in("group_id", ids).order("name"),
  ]);
  for (const g of groups ?? []) {
    out.set(g.id, g.uses_subgroups ? (subs ?? []).filter((s) => s.group_id === g.id).map((s) => ({ id: s.id, name: s.name })) : [{ id: g.id, name: g.name }]);
  }
  return out;
}

// Nome de um valor guardado no sinistro (id de subgrupo ou de grupo), mesmo que o subgrupo tenha sido desativado depois.
export async function loadGroupRefNames(supabase: Supa, tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return out;
  const [{ data: subs }, { data: groups }] = await Promise.all([
    supabase.from("group_subgroups").select("id, name").eq("tenant_id", tenantId).in("id", unique),
    supabase.from("groups").select("id, name").eq("tenant_id", tenantId).in("id", unique),
  ]);
  for (const g of groups ?? []) out.set(g.id, g.name);
  for (const s of subs ?? []) out.set(s.id, s.name);
  return out;
}

// Confere os valores de campos "Grupo ou subgrupo" contra as opções permitidas. Devolve a mensagem de erro, ou null.
export async function groupRefError(
  supabase: Supa,
  tenantId: string,
  defs: { key: string; label: string; field_type: string; ref_group_id: string | null }[],
  values: Record<string, string>,
): Promise<string | null> {
  const refs = defs.filter((d) => d.field_type === "group_ref" && values[d.key]);
  if (!refs.length) return null;
  const options = await loadGroupRefOptions(supabase, tenantId, refs.map((d) => d.ref_group_id ?? ""));
  for (const d of refs) {
    if (!(options.get(d.ref_group_id ?? "") ?? []).some((o) => o.id === values[d.key])) return `Escolha uma opção válida em "${d.label}".`;
  }
  return null;
}
