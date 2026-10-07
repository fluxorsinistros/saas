"use server";

import { publicDbMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { writeAudit } from "@/app/(app)/sinistros/actions";
import { assertCountLimit } from "@/lib/limits";
import { GROUP_ACTIONS } from "@/lib/group-actions";

// Cada passo grava estado parcial em `tenants.onboarding_step` (Documento 5 §3: "não é uma transação
// única no final, para permitir retomar"), nunca volta um passo já visitado, só avança.
async function advanceStep(tenantId: string, toStep: number): Promise<void> {
  const supabase = await createClient();
  const { data: tenant } = await supabase.from("tenants").select("onboarding_step").eq("id", tenantId).single();
  if (tenant && toStep > tenant.onboarding_step) {
    await supabase.from("tenants").update({ onboarding_step: toStep }).eq("id", tenantId);
  }
}

export async function setOperatingModel(formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const model = String(formData.get("operating_model") ?? "");
  await supabase.from("tenants").update({ operating_model: model || null }).eq("id", ctx.tenantId);
  await advanceStep(ctx.tenantId, 2);
  revalidatePath("/onboarding/wizard");
}

export async function createClaimTypeStep(formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Informe o nome do tipo de sinistro.");

  const { count: typeCount } = await supabase.from("claim_types").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId);
  await assertCountLimit(supabase, ctx.tenantId, "claim_types", "tipos de sinistro", typeCount ?? 0);

  const { data: category, error: catErr } = await supabase
    .from("claim_categories")
    .insert({ tenant_id: ctx.tenantId, name })
    .select("id")
    .single();
  if (catErr || !category) throw new Error(catErr?.message ?? "Falha ao criar a categoria.");

  const { error: typeErr } = await supabase.from("claim_types").insert({ tenant_id: ctx.tenantId, claim_category_id: category.id, name });
  if (typeErr) throw new Error(typeErr.message);

  await advanceStep(ctx.tenantId, 3);
  revalidatePath("/onboarding/wizard");
}

export async function skipToStep(step: number): Promise<void> {
  const ctx = await getTenantContext();
  await advanceStep(ctx.tenantId, step);
  revalidatePath("/onboarding/wizard");
}

export async function renameGroupStep(groupId: string, formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await supabase.from("groups").update({ name }).eq("id", groupId).eq("tenant_id", ctx.tenantId);
  revalidatePath("/onboarding/wizard");
}

export async function addGroupStep(formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Informe o nome do grupo.");
  const { count: groupCount } = await supabase.from("groups").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId);
  await assertCountLimit(supabase, ctx.tenantId, "groups", "grupos", groupCount ?? 0);
  await supabase.from("groups").insert({ tenant_id: ctx.tenantId, name, disabled_actions: GROUP_ACTIONS.map((a) => a.key), granted_actions: [] });
  await advanceStep(ctx.tenantId, 5);
  revalidatePath("/onboarding/wizard");
}

export async function inviteUserStep(formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) throw new Error("Informe um e-mail.");

  const { count: activeUsers } = await supabase
    .from("tenant_memberships")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "active");
  await assertCountLimit(supabase, ctx.tenantId, "users", "usuários", activeUsers ?? 0);

  const { error } = await supabase.rpc("add_tenant_member", { p_tenant_id: ctx.tenantId, p_email: email });
  if (error) throw new Error(publicDbMessage(error));

  await advanceStep(ctx.tenantId, 6);
  revalidatePath("/onboarding/wizard");
}

export async function finishOnboarding(): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  await supabase.from("tenants").update({ onboarding_completed_at: new Date().toISOString() }).eq("id", ctx.tenantId);
  await writeAudit(supabase, ctx.tenantId, "tenant.onboarding_completed", "tenant", ctx.tenantId);
  redirect("/dashboard");
}
