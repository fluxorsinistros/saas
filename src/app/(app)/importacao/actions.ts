"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { createClaimAndCycle, writeAudit, type Supa } from "@/app/(app)/sinistros/actions";
import { csvToRows, type ImportRowData } from "./csv";
import type { Json } from "@/lib/supabase/database.types";

// Valida uma linha sem criar nada (Prévia): mesma checagem de fluxo publicado e data que
// createClaimAndCycle faria, mais a checagem de duplicidade por referência externa — que só faz
// sentido em lote, não existe na formalização manual de um único sinistro.
async function validateRow(supabase: Supa, tenantId: string, raw: ImportRowData): Promise<{ status: string; errors: string[] | null }> {
  const errors: string[] = [];
  const workflowName = raw.fluxo.trim();
  if (!workflowName) {
    errors.push("Coluna 'fluxo' vazia.");
  } else {
    const { data: workflow } = await supabase.from("workflows").select("id, name").eq("tenant_id", tenantId).ilike("name", workflowName).maybeSingle();
    if (!workflow) {
      errors.push(`Fluxo "${workflowName}" não encontrado.`);
    } else {
      const { data: version } = await supabase
        .from("workflow_versions")
        .select("id")
        .eq("workflow_id", workflow.id)
        .eq("status", "published")
        .maybeSingle();
      if (!version) errors.push(`"${workflow.name}" não tem versão publicada.`);
    }
  }
  if (raw.data_ocorrencia && Number.isNaN(new Date(raw.data_ocorrencia).getTime())) {
    errors.push(`Data do evento inválida: "${raw.data_ocorrencia}".`);
  }
  if (errors.length > 0) return { status: "error", errors };

  if (raw.referencia_externa.trim()) {
    const { data: existing } = await supabase
      .from("claims")
      .select("id, claim_number")
      .eq("tenant_id", tenantId)
      .eq("external_reference", raw.referencia_externa.trim())
      .maybeSingle();
    if (existing) return { status: "duplicate_candidate", errors: [`Referência já usada pelo sinistro ${existing.claim_number}.`] };
  }

  return { status: "valid", errors: null };
}

export async function uploadImport(formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Escolha um arquivo CSV.");

  const text = await file.text();
  const { rows } = csvToRows(text);
  if (rows.length === 0) throw new Error("O arquivo está vazio ou não tem linhas de dados.");

  const { data: imp, error: impErr } = await supabase
    .from("imports")
    .insert({ tenant_id: ctx.tenantId, file_name: file.name, status: "validating", total_rows: rows.length, created_by: ctx.userId })
    .select("id")
    .single();
  if (impErr || !imp) throw new Error(impErr?.message ?? "Falha ao registrar a importação.");

  let errorCount = 0;
  let duplicateCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const { status, errors } = await validateRow(supabase, ctx.tenantId, rows[i]);
    if (status === "error") errorCount++;
    else if (status === "duplicate_candidate") duplicateCount++;
    await supabase.from("import_rows").insert({
      tenant_id: ctx.tenantId,
      import_id: imp.id,
      row_number: i + 1,
      raw_data: rows[i] as unknown as Json,
      status,
      errors: errors ? (errors as unknown as Json) : null,
    });
  }

  await supabase
    .from("imports")
    .update({ status: "preview", error_rows: errorCount, duplicate_rows: duplicateCount, created_rows: 0, ignored_rows: 0 })
    .eq("id", imp.id);

  await writeAudit(supabase, ctx.tenantId, "import.uploaded", "import", imp.id, { next: { file_name: file.name, total_rows: rows.length } });

  revalidatePath("/importacao");
  redirect(`/importacao/${imp.id}`);
}

export async function reviseImportRow(rowId: string, formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();

  const { data: row, error: rowErr } = await supabase.from("import_rows").select("id, import_id").eq("id", rowId).single();
  if (rowErr || !row) throw new Error("Linha não encontrada.");

  const raw: ImportRowData = {
    fluxo: String(formData.get("fluxo") ?? "").trim(),
    data_ocorrencia: String(formData.get("data_ocorrencia") ?? "").trim(),
    local: String(formData.get("local") ?? "").trim(),
    referencia_externa: String(formData.get("referencia_externa") ?? "").trim(),
  };
  const { status, errors } = await validateRow(supabase, ctx.tenantId, raw);
  await supabase
    .from("import_rows")
    .update({ raw_data: raw as unknown as Json, status, errors: errors ? (errors as unknown as Json) : null })
    .eq("id", rowId);

  await recalcImportCounts(supabase, row.import_id);
  revalidatePath(`/importacao/${row.import_id}`);
}

export async function ignoreImportRow(rowId: string): Promise<void> {
  const supabase = await createClient();
  const { data: row, error } = await supabase.from("import_rows").select("id, import_id, status").eq("id", rowId).single();
  if (error || !row) throw new Error("Linha não encontrada.");
  if (row.status === "created") throw new Error("Esta linha já criou um sinistro — não pode ser ignorada.");

  await supabase.from("import_rows").update({ status: "ignored" }).eq("id", rowId);
  await recalcImportCounts(supabase, row.import_id);
  revalidatePath(`/importacao/${row.import_id}`);
}

async function recalcImportCounts(supabase: Supa, importId: string): Promise<void> {
  const { data: rows } = await supabase.from("import_rows").select("status").eq("import_id", importId);
  const counts = { created: 0, error: 0, duplicate_candidate: 0, ignored: 0 };
  for (const r of rows ?? []) {
    if (r.status === "created") counts.created++;
    else if (r.status === "error") counts.error++;
    else if (r.status === "duplicate_candidate") counts.duplicate_candidate++;
    else if (r.status === "ignored") counts.ignored++;
  }
  await supabase
    .from("imports")
    .update({ created_rows: counts.created, error_rows: counts.error, duplicate_rows: counts.duplicate_candidate, ignored_rows: counts.ignored })
    .eq("id", importId);
}

// Confirmação do lote (Documento 5 §10): cria um sinistro por linha 'valid' (e por 'duplicate_candidate'
// se o usuário decidiu incluir mesmo assim) chamando createClaimAndCycle — a mesma rotina da
// formalização manual (§29). Nenhuma linha 'error' ou 'ignored' vira sinistro.
export async function confirmImport(importId: string, formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "import.confirm");
  const supabase = await createClient();
  const includeDuplicates = formData.get("include_duplicates") === "on";

  const { data: imp, error: impErr } = await supabase.from("imports").select("id, status").eq("id", importId).single();
  if (impErr || !imp) throw new Error("Importação não encontrada.");
  if (imp.status === "completed") throw new Error("Esta importação já foi confirmada.");

  await supabase.from("imports").update({ status: "processing" }).eq("id", importId);

  const statuses = includeDuplicates ? ["valid", "duplicate_candidate"] : ["valid"];
  const { data: rows } = await supabase
    .from("import_rows")
    .select("id, raw_data")
    .eq("import_id", importId)
    .in("status", statuses)
    .order("row_number", { ascending: true });

  for (const row of rows ?? []) {
    const raw = row.raw_data as unknown as ImportRowData;
    try {
      const { claimId } = await createClaimAndCycle(supabase, ctx.tenantId, ctx.userId, {
        workflowName: raw.fluxo,
        occurredAt: raw.data_ocorrencia || undefined,
        location: raw.local || undefined,
        externalReference: raw.referencia_externa || undefined,
      });
      await supabase.from("import_rows").update({ status: "created", created_claim_id: claimId, errors: null }).eq("id", row.id);
    } catch (e) {
      await supabase
        .from("import_rows")
        .update({ status: "error", errors: [(e as Error).message] as unknown as Json })
        .eq("id", row.id);
    }
  }

  await recalcImportCounts(supabase, importId);
  await supabase.from("imports").update({ status: "completed" }).eq("id", importId);
  await writeAudit(supabase, ctx.tenantId, "import.confirmed", "import", importId);

  revalidatePath("/importacao");
  revalidatePath(`/importacao/${importId}`);
  revalidatePath("/sinistros");
}
