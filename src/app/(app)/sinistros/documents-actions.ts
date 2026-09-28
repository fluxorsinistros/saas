"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { writeAudit, type Supa } from "./actions";

// Sem tela própria de "tipos de documento" ainda (mesma decisão de ensureClaimType em actions.ts):
// o nome digitado vira o tipo, reaproveitando um já existente com o mesmo nome quando houver.
async function ensureDocumentType(supabase: Supa, tenantId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  const { data: existing } = await supabase
    .from("document_types")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("name", trimmed)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("document_types")
    .insert({ tenant_id: tenantId, name: trimmed })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Falha ao criar tipo de documento.");
  return data.id;
}

export async function requestDocument(formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const claimId = String(formData.get("claim_id") ?? "");
  const claimCycleId = String(formData.get("claim_cycle_id") ?? "");
  const typeName = String(formData.get("type_name") ?? "").trim();
  const isRequired = formData.get("is_required") === "on";
  if (!typeName) throw new Error("Informe o nome do documento.");

  const typeId = await ensureDocumentType(supabase, ctx.tenantId, typeName);
  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      tenant_id: ctx.tenantId,
      claim_cycle_id: claimCycleId,
      document_type_id: typeId,
      is_required: isRequired,
      status: "requested",
      requested_by: ctx.userId,
      requested_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !doc) throw new Error(error?.message ?? "Falha ao solicitar documento.");

  await writeAudit(supabase, ctx.tenantId, "document.requested", "document", doc.id, { next: { type: typeName } });
  revalidatePath(`/sinistros/${claimId}`);
}

export async function uploadDocumentVersion(formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const claimId = String(formData.get("claim_id") ?? "");
  const claimCycleId = String(formData.get("claim_cycle_id") ?? "");
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Escolha um arquivo.");

  let documentId = String(formData.get("document_id") ?? "");
  if (!documentId) {
    // "Enviar documento" avulso, sem solicitação prévia — cria o registro na hora.
    const typeName = String(formData.get("type_name") ?? "").trim();
    if (!typeName) throw new Error("Informe o nome do documento.");
    const typeId = await ensureDocumentType(supabase, ctx.tenantId, typeName);
    const { data: doc, error } = await supabase
      .from("documents")
      .insert({
        tenant_id: ctx.tenantId,
        claim_cycle_id: claimCycleId,
        document_type_id: typeId,
        status: "received",
      })
      .select("id")
      .single();
    if (error || !doc) throw new Error(error?.message ?? "Falha ao criar documento.");
    documentId = doc.id;
  }

  const { count } = await supabase
    .from("document_versions")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId);
  const versionNumber = (count ?? 0) + 1;
  const path = `${ctx.tenantId}/${claimCycleId}/${documentId}/${versionNumber}-${file.name}`;

  const { error: upErr } = await supabase.storage.from("documents").upload(path, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (upErr) throw new Error(upErr.message);

  const { error: verErr } = await supabase.from("document_versions").insert({
    tenant_id: ctx.tenantId,
    document_id: documentId,
    version_number: versionNumber,
    storage_path: path,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: ctx.userId,
  });
  if (verErr) throw new Error(verErr.message);

  await supabase.from("documents").update({ status: "received" }).eq("id", documentId);
  await writeAudit(supabase, ctx.tenantId, "document.received", "document", documentId, {
    next: { version: versionNumber, file_name: file.name },
  });

  revalidatePath(`/sinistros/${claimId}`);
}

export async function reviewDocument(formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const claimId = String(formData.get("claim_id") ?? "");
  const documentId = String(formData.get("document_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (decision !== "validated" && decision !== "rejected") throw new Error("Decisão inválida.");
  if (decision === "rejected" && !reason) throw new Error("Informe o motivo da rejeição.");

  const { data: latest } = await supabase
    .from("document_versions")
    .select("id")
    .eq("document_id", documentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("documents").update({ status: decision }).eq("id", documentId);
  if (latest) {
    await supabase
      .from("document_versions")
      .update({ validated_by: ctx.userId, validated_at: new Date().toISOString(), rejection_reason: decision === "rejected" ? reason : null })
      .eq("id", latest.id);
  }
  await writeAudit(supabase, ctx.tenantId, decision === "validated" ? "document.validated" : "document.rejected", "document", documentId, {
    reason: decision === "rejected" ? reason : undefined,
  });

  revalidatePath(`/sinistros/${claimId}`);
}
