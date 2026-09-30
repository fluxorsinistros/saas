"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { writeAudit } from "@/app/(app)/sinistros/actions";
import type { Json } from "@/lib/supabase/database.types";
import { PLAN_LIMITS } from "@/lib/plan-limits";

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

// Edita nome e preços de um plano existente. O código (standard, professional…) não muda.
export async function updatePlan(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const planId = String(formData.get("plan_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!planId || !name) throw new Error("O nome do plano é obrigatório.");

  const next = {
    name,
    setup_fee: money(formData, "setup_fee"),
    monthly_fee: money(formData, "monthly_fee"),
    claim_price: money(formData, "claim_price"),
  };
  const { error } = await supabase.from("plans").update(next).eq("id", planId);
  if (error) throw new Error(error.message);

  await writeAudit(supabase, null, "plan.updated", "plan", planId, { next });
  revalidatePath("/admin");
}

// Vazio = sem valor; "ilimitado" = null; número aceita vírgula. Lança erro em texto inválido.
function parseLimitField(raw: FormDataEntryValue | null, label: string): number | null | undefined {
  const text = String(raw ?? "").trim();
  if (text === "") return undefined;
  if (/^ilimitado$/i.test(text)) return null;
  const n = Number(text.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new Error(`Valor inválido em "${label}": use um número ou deixe vazio.`);
  return n;
}

// Grava todos os limites do catálogo de uma vez: campo vazio = sem limite (a linha é removida).
export async function savePlanLimits(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const planId = String(formData.get("plan_id") ?? "");
  if (!planId) throw new Error("Plano não informado.");

  const toSet: { plan_id: string; limit_key: string; limit_value: number | null }[] = [];
  const toClear: string[] = [];
  for (const def of PLAN_LIMITS) {
    const value = parseLimitField(formData.get(`limit_${def.key}`), def.label);
    if (value === undefined) toClear.push(def.key);
    else toSet.push({ plan_id: planId, limit_key: def.key, limit_value: value });
  }

  if (toSet.length) {
    const { error } = await supabase.from("plan_limits").upsert(toSet, { onConflict: "plan_id,limit_key" });
    if (error) throw new Error(error.message);
  }
  if (toClear.length) {
    const { error } = await supabase.from("plan_limits").delete().eq("plan_id", planId).in("limit_key", toClear);
    if (error) throw new Error(error.message);
  }

  await writeAudit(supabase, null, "plan_limit.set", "plan", planId, {
    next: Object.fromEntries(toSet.map((s) => [s.limit_key, s.limit_value])) as Json,
  });
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
  if (!contractId) throw new Error("Contrato não informado.");

  // Preserva overrides de chaves fora do catálogo (legado); as do catálogo vêm dos campos.
  const { data: current } = await supabase.from("tenant_contracts").select("overrides").eq("id", contractId).single();
  const known = new Set(PLAN_LIMITS.map((d) => d.key));
  const overrides: Record<string, Json> = {};
  for (const [k, v] of Object.entries((current?.overrides ?? {}) as Record<string, Json>)) {
    if (!known.has(k)) overrides[k] = v;
  }
  for (const def of PLAN_LIMITS) {
    const value = parseLimitField(formData.get(`limit_${def.key}`), def.label);
    if (value !== undefined) overrides[def.key] = value;
  }

  const { error } = await supabase.from("tenant_contracts").update({ overrides: overrides as Json }).eq("id", contractId);
  if (error) throw new Error(error.message);

  await writeAudit(supabase, null, "contract.overrides_updated", "tenant_contract", contractId, { next: overrides as Json });
  revalidatePath("/admin");
}

// Suspende ou reativa a conta de um cliente. Suspensa: ninguém da empresa acessa nada (RLS), mas os
// dados ficam intactos. Só o administrador de plataforma chama isto (o banco também barra os demais).
export async function setTenantStatus(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const tenantId = String(formData.get("tenant_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!tenantId || (status !== "active" && status !== "suspended")) throw new Error("Pedido inválido.");

  const next =
    status === "suspended"
      ? { status, suspended_at: new Date().toISOString(), suspension_reason: reason || null }
      : { status, suspended_at: null, suspension_reason: null };
  const { error } = await supabase.from("tenants").update(next).eq("id", tenantId);
  if (error) throw new Error(error.message);

  await writeAudit(supabase, null, status === "suspended" ? "tenant.suspended" : "tenant.reactivated", "tenant", tenantId, {
    next: { status, reason: reason || null },
  });
  revalidatePath("/admin");
}

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };
const LOGO_MAX_BYTES = 1024 * 1024;

// Nome, subtítulo e logo do produto (aparecem no menu, no login e no título da aba).
export async function savePlatformBranding(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const name = String(formData.get("product_name") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  if (!name) throw new Error("O nome do produto é obrigatório.");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: current } = await supabase.from("platform_settings").select("logo_path").eq("id", true).single();
  let logoPath = current?.logo_path ?? null;

  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    const ext = LOGO_TYPES[file.type];
    if (!ext) throw new Error("Logo precisa ser PNG, JPG, WEBP ou SVG.");
    if (file.size > LOGO_MAX_BYTES) throw new Error("Logo grande demais: máximo de 1 MB.");
    const path = `platform/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("branding").upload(path, file, { contentType: file.type });
    if (error) throw new Error(error.message);
    if (logoPath) await supabase.storage.from("branding").remove([logoPath]);
    logoPath = path;
  } else if (formData.get("remove_logo") === "on" && logoPath) {
    await supabase.storage.from("branding").remove([logoPath]);
    logoPath = null;
  }

  const { error } = await supabase
    .from("platform_settings")
    .update({ product_name: name, tagline, logo_path: logoPath, updated_by: user?.id ?? null })
    .eq("id", true);
  if (error) throw new Error(error.message);

  await writeAudit(supabase, null, "platform.branding_updated", "platform", "settings", { next: { name, tagline, logo: !!logoPath } });
  revalidatePath("/", "layout");
}

// Libera (ou não) a marca própria do cliente, independente do plano, com acréscimo % sobre a mensalidade.
export async function setWhiteLabel(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const contractId = String(formData.get("contract_id") ?? "");
  const enabled = formData.get("enabled") === "on";
  const pct = money(formData, "surcharge_pct");
  if (!contractId) throw new Error("Contrato não informado.");
  if (pct < 0 || pct > 1000) throw new Error("O acréscimo deve ficar entre 0% e 1000%.");

  const next = { white_label_enabled: enabled, white_label_surcharge_pct: pct };
  const { error } = await supabase.from("tenant_contracts").update(next).eq("id", contractId);
  if (error) throw new Error(error.message);

  await writeAudit(supabase, null, "contract.white_label_updated", "tenant_contract", contractId, { next });
  revalidatePath("/admin");
}
