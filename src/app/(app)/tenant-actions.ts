"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTenantContext, TENANT_COOKIE } from "@/lib/tenant";
import { activeGroupCookieName, getMemberGroups } from "@/lib/active-group";

export async function switchTenant(formData: FormData) {
  const ctx = await getTenantContext();
  const id = String(formData.get("tenant_id") ?? "");
  if (!ctx.tenants.some((t) => t.id === id)) return;
  (await cookies()).set(TENANT_COOKIE, id, { path: "/", sameSite: "lax", httpOnly: true });
  // Cada empresa tem as próprias telas liberadas para a pessoa: começa pelo painel, que todo grupo enxerga primeiro.
  redirect("/dashboard");
}

// Operador com mais de um grupo escolhe em qual atua agora. Só vale um grupo do qual a pessoa é membro.
export async function switchGroup(formData: FormData) {
  const ctx = await getTenantContext();
  const { isAdmin, groups } = await getMemberGroups(ctx.userId, ctx.tenantId);
  const id = String(formData.get("group_id") ?? "");
  if (isAdmin || !groups.some((g) => g.id === id)) return;
  (await cookies()).set(activeGroupCookieName(ctx.tenantId), id, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
}
