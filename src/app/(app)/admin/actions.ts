"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { writeAudit } from "@/app/(app)/sinistros/actions";
import type { Json } from "@/lib/supabase/database.types";

function money(formData: FormData, key: string): number {
  const raw = String(formData.get(key) ?? "0").replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export async function createPlan(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const code = String(formData.get("code") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!code || !name) throw new Error("Código e nome são obrigatórios.");

  const { data, error } = await supabase
    .from("plans")
    .insert({
      code,
      name,
      setup_fee: money(formData, "setup_fee"),
      monthly_fee: money(formData, "monthly_fee"),
      claim_price: money(formData, "claim_price"),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Falha ao criar plano.");

  await writeAudit(supabase, null, "plan.created", "plan", data.id, { next: { code, name } });
  revalidatePath("/admin");
}

export async function upsertPlanLimit(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const planId = String(formData.get("plan_id") ?? "");
  const limitKey = String(formData.get("limit_key") ?? "").trim();
  const rawValue = String(formData.get("limit_value") ?? "").trim();
  if (!planId || !limitKey) throw new Error("Escolha o plano e o nome do limite.");
  const limitValue = rawValue === "" ? null : Number(rawValue);

  const { error } = await supabase
    .from("plan_limits")
    .upsert({ plan_id: planId, limit_key: limitKey, limit_value: limitValue }, { onConflict: "plan_id,limit_key" });
  if (error) throw new Error(error.message);

  await writeAudit(supabase, null, "plan_limit.set", "plan", planId, { next: { limit_key: limitKey, limit_value: limitValue } });
  revalidatePath("/admin");
}

export async function removePlanLimit(limitId: string): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("plan_limits").delete().eq("id", limitId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function assignContract(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const tenantId = String(formData.get("tenant_id") ?? "");
  const planId = String(formData.get("plan_id") ?? "");
  if (!tenantId || !planId) throw new Error("Escolha a empresa e o plano.");

  const { error } = await supabase
    .from("tenant_contracts")
    .upsert({ tenant_id: tenantId, plan_id: planId, status: "active" }, { onConflict: "tenant_id" });
  if (error) throw new Error(error.message);

  await writeAudit(supabase, null, "contract.assigned", "tenant", tenantId, { next: { plan_id: planId } });
  revalidatePath("/admin");
}

// Cria uma nova empresa cliente com o admin da plataforma já como Administrador dela — usa a
// mesma RPC create_tenant do onboarding (Documento 1 §64), só que a partir de /admin, porque quem
// já é membro de algum tenant nunca vê o formulário de onboarding (a página redireciona direto).
export async function createTenantAsAdmin(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Nome da empresa é obrigatório.");

  const { data, error } = await supabase.rpc("create_tenant", { p_name: name });
  if (error || !data) throw new Error(error?.message ?? "Não foi possível criar a empresa.");

  revalidatePath("/admin");
}

export async function updateContractOverrides(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const contractId = String(formData.get("contract_id") ?? "");
  const raw = String(formData.get("overrides") ?? "{}").trim() || "{}";

  let overrides: unknown;
  try {
    overrides = JSON.parse(raw);
  } catch {
    throw new Error("Overrides precisa ser um JSON válido, ex.: {\"users\": 50}");
  }
  if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) {
    throw new Error("Overrides precisa ser um objeto JSON, ex.: {\"users\": 50}");
  }

  const { error } = await supabase.from("tenant_contracts").update({ overrides: overrides as Json }).eq("id", contractId);
  if (error) throw new Error(error.message);

  await writeAudit(supabase, null, "contract.overrides_updated", "tenant_contract", contractId, { next: overrides as Json });
  revalidatePath("/admin");
}
