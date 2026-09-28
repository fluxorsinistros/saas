"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";

export async function createGroup(formData: FormData) {
  const ctx = await getTenantContext();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const supabase = await createClient();
  await supabase.from("groups").insert({
    tenant_id: ctx.tenantId,
    name,
    description: String(formData.get("description") ?? "").trim() || null,
  });
  revalidatePath("/grupos");
}

export async function updateGroup(formData: FormData) {
  const ctx = await getTenantContext();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const supabase = await createClient();
  await supabase.from("groups").update({ name }).eq("id", id).eq("tenant_id", ctx.tenantId);
  revalidatePath("/grupos");
}

// Grupo nunca é excluído: etapas e histórico apontam para ele (Documento 1 §2.3).
export async function toggleGroup(formData: FormData) {
  const ctx = await getTenantContext();
  const id = String(formData.get("id"));
  const next = formData.get("status") === "active" ? "inactive" : "active";
  const supabase = await createClient();
  await supabase.from("groups").update({ status: next }).eq("id", id).eq("tenant_id", ctx.tenantId);
  revalidatePath("/grupos");
}
