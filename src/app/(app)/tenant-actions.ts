"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTenantContext, TENANT_COOKIE } from "@/lib/tenant";

export async function switchTenant(formData: FormData) {
  const ctx = await getTenantContext();
  const id = String(formData.get("tenant_id") ?? "");
  if (!ctx.tenants.some((t) => t.id === id)) return;
  (await cookies()).set(TENANT_COOKIE, id, { path: "/", sameSite: "lax", httpOnly: true });
  redirect("/fluxos");
}
