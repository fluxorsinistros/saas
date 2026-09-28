import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const TENANT_COOKIE = "tenant_id";

export type TenantContext = {
  userId: string;
  email: string;
  tenantId: string;
  tenantName: string;
  tenants: { id: string; name: string }[];
};

// Autorização real fica no banco (RLS) — aqui só resolvemos qual tenant está ativo para o usuário.
export const getTenantContext = cache(async (): Promise<TenantContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, tenants(id, name)")
    .eq("user_id", user.id)
    .eq("status", "active");

  const tenants = (memberships ?? [])
    .map((m) => m.tenants)
    .filter((t): t is { id: string; name: string } => !!t);

  if (tenants.length === 0) redirect("/onboarding");

  const preferred = (await cookies()).get(TENANT_COOKIE)?.value;
  const current = tenants.find((t) => t.id === preferred) ?? tenants[0];

  return {
    userId: user.id,
    email: user.email ?? "",
    tenantId: current.id,
    tenantName: current.name,
    tenants,
  };
});
