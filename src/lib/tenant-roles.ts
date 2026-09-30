import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type RoleOption = { id: string; name: string };

// Os dois tipos que o Administrador da conta pode dar: Administrador e Operador. Se a empresa tem papéis
// próprios com esses nomes (antigos), vale o da empresa; senão o de sistema.
export async function getRoleOptions(supabase: SupabaseClient<Database>, tenantId: string): Promise<RoleOption[]> {
  const { data: roles } = await supabase
    .from("roles")
    .select("id, name, tenant_id")
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .in("name", ["Administrador", "Operador"]);
  return ["Administrador", "Operador"].flatMap((name) => {
    const candidates = (roles ?? []).filter((r) => r.name === name);
    const chosen = candidates.find((r) => r.tenant_id === tenantId) ?? candidates[0];
    return chosen ? [{ id: chosen.id, name: chosen.name }] : [];
  });
}
