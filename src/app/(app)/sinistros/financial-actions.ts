"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { readPanel } from "@/lib/financial-panel";
import { valueError, VALUE_FIELD_TYPES } from "@/lib/field-rules";
import { writeAudit } from "./actions";

// Salva os valores dos campos que o fluxo colocou no painel financeiro. O servidor só aceita chaves que estão no painel
// do fluxo do sinistro (e nunca calculados), valida mínimo/máximo e grava em claims.custom_fields.
export async function saveFinancialFields(claimId: string, formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "financial.manage");
  const supabase = await createClient();

  const { data: claim } = await supabase
    .from("claims")
    .select("id, custom_fields, claim_cycles(workflow_version_id, cycle_number)")
    .eq("id", claimId)
    .eq("tenant_id", ctx.tenantId)
    .single();
  if (!claim) throw new Error("Sinistro não encontrado.");
  const cycle = [...claim.claim_cycles].sort((a, b) => b.cycle_number - a.cycle_number)[0];
  if (!cycle) throw new Error("Sinistro sem ciclo.");
  const { data: version } = await supabase.from("workflow_versions").select("workflow_id").eq("id", cycle.workflow_version_id).single();
  if (!version) throw new Error("Fluxo do sinistro não encontrado.");

  const [{ data: workflow }, { data: fields }] = await Promise.all([
    supabase.from("workflows").select("financial_panel").eq("id", version.workflow_id).single(),
    supabase.from("workflow_fields").select("key, label, field_type, min_value, max_value").eq("workflow_id", version.workflow_id),
  ]);
  const panelKeys = new Set(readPanel(workflow?.financial_panel).filter((i) => i.mode !== "view").map((i) => i.key));
  const defs = (fields ?? []).filter((f) => panelKeys.has(f.key) && VALUE_FIELD_TYPES.includes(f.field_type));

  const current = (claim.custom_fields ?? {}) as Record<string, string>;
  const next: Record<string, string> = { ...current };
  for (const def of defs) {
    if (!formData.has(`field_${def.key}`)) continue;
    const value = String(formData.get(`field_${def.key}`) ?? "").trim().replace(",", ".");
    const err = value ? valueError(def, value) : null;
    if (err) throw new Error(err);
    if (value) next[def.key] = value;
    else delete next[def.key];
  }

  await supabase.from("claims").update({ custom_fields: next }).eq("id", claimId);
  await writeAudit(supabase, ctx.tenantId, "claim.financial_fields_saved", "claim", claimId, { next: { keys: defs.map((d) => d.key) } });
  revalidatePath(`/sinistros/${claimId}`);
}
