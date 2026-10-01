import type { SupabaseClient } from "@supabase/supabase-js";

export type OrgOption = { id: string; name: string; isOwner: boolean };

// Organizações ativas da empresa (a própria primeiro). Todo usuário pertence a uma delas.
export async function getTenantOrganizations(supabase: SupabaseClient, tenantId: string): Promise<OrgOption[]> {
  const { data } = await supabase
    .from("tenant_organizations")
    .select("is_owner, organizations(id, name)")
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  const rows = (data ?? []) as unknown as { is_owner: boolean; organizations: { id: string; name: string } | null }[];
  return rows
    .filter((r) => r.organizations)
    .map((r) => ({ id: r.organizations!.id, name: r.organizations!.name, isOwner: r.is_owner }))
    .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name, "pt-BR"));
}
