"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { assertCountLimit } from "@/lib/limits";

// Grupos entram no mesmo guard de Usuários (não têm código de permissão próprio no catálogo —
// quem administra pessoas administra as unidades operacionais que elas pertencem).
export async function createGroup(formData: FormData) {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Nome do grupo é obrigatório.");
  const supabase = await createClient();
  const { count: groupCount } = await supabase.from("groups").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId);
  await assertCountLimit(supabase, ctx.tenantId, "groups", "grupos", groupCount ?? 0);
  const { error } = await supabase.from("groups").insert({
    tenant_id: ctx.tenantId,
    name,
    description: String(formData.get("description") ?? "").trim() || null,
  });
  if (error) throw new Error(error.message);
  redirect("/grupos");
}

export async function updateGroup(formData: FormData) {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Nome do grupo é obrigatório.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("groups")
    .update({ name, description: String(formData.get("description") ?? "").trim() || null })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);
  if (error) throw new Error(error.message);
  revalidatePath("/grupos");
  revalidatePath(`/grupos/${id}`);
  redirect("/grupos");
}

// Grupo nunca é excluído: etapas e histórico apontam para ele (Documento 1 §2.3).
export async function toggleGroup(formData: FormData) {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const id = String(formData.get("id"));
  const next = formData.get("status") === "active" ? "inactive" : "active";
  const supabase = await createClient();
  const { error } = await supabase.from("groups").update({ status: next }).eq("id", id).eq("tenant_id", ctx.tenantId);
  if (error) throw new Error(error.message);
  revalidatePath("/grupos");
  revalidatePath(`/grupos/${id}`);
}
