"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TENANT_COOKIE } from "@/lib/tenant";

export async function createTenant(_: { error?: string } | undefined, formData: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_tenant", { p_name: String(formData.get("name") ?? "") });
  if (error || !data) return { error: error?.message ?? "Não foi possível criar a empresa." };
  (await cookies()).set(TENANT_COOKIE, data, { path: "/", sameSite: "lax", httpOnly: true });
  redirect("/onboarding/wizard");
}
