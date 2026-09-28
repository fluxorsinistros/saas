"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { writeAudit } from "./actions";

function toAmount(raw: FormDataEntryValue | null): number {
  const n = Number(String(raw ?? "0").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) throw new Error("Valor precisa ser um número maior que zero.");
  return n;
}

export async function setDeclaredValue(claimId: string, formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const raw = String(formData.get("declared_value") ?? "").trim();
  const value = raw === "" ? null : Number(raw.replace(",", "."));
  if (raw !== "" && (value === null || !Number.isFinite(value) || value < 0)) {
    throw new Error("Valor declarado inválido.");
  }

  await supabase.from("claims").update({ declared_value: value }).eq("id", claimId);
  await writeAudit(supabase, ctx.tenantId, "claim.declared_value_set", "claim", claimId, { next: { declared_value: value } });
  revalidatePath(`/sinistros/${claimId}`);
}

export async function createFinancialEntry(cycleId: string, formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const entryType = String(formData.get("entry_type") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const entryDate = String(formData.get("entry_date") ?? "").trim();
  const claimId = String(formData.get("claim_id") ?? "");
  if (!["expense", "receipt", "reimbursement"].includes(entryType)) throw new Error("Tipo de lançamento inválido.");
  if (!description) throw new Error("Informe a descrição do lançamento.");
  const amount = toAmount(formData.get("amount"));

  const { data: entry, error } = await supabase
    .from("cycle_financial_entries")
    .insert({
      tenant_id: ctx.tenantId,
      claim_cycle_id: cycleId,
      entry_type: entryType,
      description,
      amount,
      entry_date: entryDate || new Date().toISOString().slice(0, 10),
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error || !entry) throw new Error(error?.message ?? "Falha ao criar o lançamento.");

  await writeAudit(supabase, ctx.tenantId, "financial_entry.created", "cycle_financial_entry", entry.id, {
    next: { entry_type: entryType, amount },
  });
  revalidatePath(`/sinistros/${claimId}`);
}

export async function markFinancialEntry(entryId: string, claimId: string, status: "paid" | "cancelled"): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  await supabase.from("cycle_financial_entries").update({ status }).eq("id", entryId);
  await writeAudit(supabase, ctx.tenantId, status === "paid" ? "financial_entry.paid" : "financial_entry.cancelled", "cycle_financial_entry", entryId);
  revalidatePath(`/sinistros/${claimId}`);
}
