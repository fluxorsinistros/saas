import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Gestor da plataforma (Documento 5 §11; na tabela platform_admins), não é do tenant, é global. Independente de
// getTenantContext: a pessoa pode nem ter tenant ainda e já ser admin de plataforma.
export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return !!data;
});

export async function requirePlatformAdmin() {
  const admin = await isPlatformAdmin();
  if (!admin) redirect("/dashboard");
}
