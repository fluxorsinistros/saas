"use server";

import { publicDbMessage } from "@/lib/errors";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { writeAudit, type Supa } from "./actions";
import { canActOnGroup, hasPermission, requirePermission } from "@/lib/permissions";
import { getLimits, isAllowed, limitOf, type Limits } from "@/lib/limits";
import { HARD_MAX_BYTES, MB, extOf, formatMb, mimeForFile, safeFileName } from "@/lib/document-files";

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

// Fila de eventos (tabela notifications): cada fato do documento extra é gravado aqui. O envio por e-mail lê esta fila (rota
// /api/notificacoes/processar), conforme as regras da empresa. Falha ao gravar o evento nunca derruba a ação principal.
async function emitDocumentEvent(
  supabase: Supa,
  tenantId: string,
  eventType: "document_extra.requested" | "document_extra.delivered" | "document_extra.validated" | "document_extra.rejected",
  claimCycleId: string,
  payload: Record<string, unknown>,
) {
  // O e-mail precisa saber o grupo, quem pediu, o nome do documento e o número do sinistro: completa o evento aqui.
  const enriched: Record<string, unknown> = { ...payload };
  const pendingId = typeof payload.pending_item_id === "string" ? payload.pending_item_id : null;
  if (pendingId) {
    const { data: pend } = await supabase.from("pending_items").select("title, requested_by, responsible_group_id, due_at").eq("id", pendingId).maybeSingle();
    if (pend) {
      enriched.document_name = pend.title;
      enriched.requested_by = pend.requested_by;
      enriched.group_id = pend.responsible_group_id;
      enriched.due_at = pend.due_at;
    }
  }
  const claimId = typeof payload.claim_id === "string" ? payload.claim_id : null;
  if (claimId) {
    const { data: cl } = await supabase.from("claims").select("claim_number").eq("id", claimId).maybeSingle();
    if (cl) enriched.claim_number = cl.claim_number;
  }
  const { error } = await supabase.from("notifications").insert({ tenant_id: tenantId, event_type: eventType, claim_cycle_id: claimCycleId, payload: enriched as never });
  if (error) console.error("evento de documento não gravado:", error.message);
}

// Documento extra: pedido avulso, só deste sinistro, a um grupo, com nome, instruções e prazo. Vira uma pendência do grupo
// (aparece em Tarefas e no sinistro) e um documento "solicitado" que o grupo preenche enviando o arquivo.
export async function requestExtraDocument(formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "claim.execute");
  const supabase = await createClient();
  const claimId = String(formData.get("claim_id") ?? "");
  const claimCycleId = String(formData.get("claim_cycle_id") ?? "");
  const name = String(formData.get("type_name") ?? "").trim();
  const instructions = String(formData.get("instructions") ?? "").trim();
  const groupId = String(formData.get("group_id") ?? "").trim();
  const dueRaw = String(formData.get("due_at") ?? "").trim();
  if (!name) throw new Error("Informe o nome do documento.");
  if (name.length > 80) throw new Error("O nome do documento aceita no máximo 80 caracteres.");
  if (instructions.length > 1000) throw new Error("As instruções aceitam no máximo 1000 caracteres.");
  if (!groupId) throw new Error("Escolha o grupo que deve entregar o documento.");
  const due = new Date(dueRaw);
  if (!dueRaw || Number.isNaN(due.getTime())) throw new Error("Informe o prazo (data e hora).");

  const { data: cycle } = await supabase.from("claim_cycles").select("id, claim_id").eq("id", claimCycleId).eq("claim_id", claimId).maybeSingle();
  if (!cycle) throw new Error("Ciclo do sinistro não encontrado.");
  const { data: group } = await supabase.from("groups").select("id, name").eq("id", groupId).eq("tenant_id", ctx.tenantId).eq("status", "active").maybeSingle();
  if (!group) throw new Error("Grupo inválido.");

  const typeId = await ensureDocumentType(supabase, ctx.tenantId, name);
  const { data: item, error: pErr } = await supabase
    .from("pending_items")
    .insert({
      tenant_id: ctx.tenantId,
      claim_cycle_id: claimCycleId,
      title: name,
      description: instructions || null,
      requested_by: ctx.userId,
      responsible_group_id: groupId,
      due_at: due.toISOString(),
    })
    .select("id")
    .single();
  if (pErr || !item) throw new Error(pErr ? publicDbMessage(pErr) : "Falha ao criar a pendência.");

  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      tenant_id: ctx.tenantId,
      claim_cycle_id: claimCycleId,
      document_type_id: typeId,
      is_required: false,
      is_extra: true,
      instructions: instructions || null,
      pending_item_id: item.id,
      status: "requested",
      requested_by: ctx.userId,
      requested_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !doc) {
    await supabase.from("pending_items").delete().eq("id", item.id);
    throw new Error(error ? publicDbMessage(error) : "Falha ao solicitar o documento.");
  }

  await writeAudit(supabase, ctx.tenantId, "document_extra.requested", "document", doc.id, { next: { name, group: group.name, due_at: due.toISOString() } });
  await emitDocumentEvent(supabase, ctx.tenantId, "document_extra.requested", claimCycleId, {
    claim_id: claimId, document_id: doc.id, pending_item_id: item.id, name, instructions, group_id: groupId, due_at: due.toISOString(), requested_by: ctx.userId,
  });
  revalidatePath(`/sinistros/${claimId}`);
  revalidatePath("/tarefas");
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

// ---------------------------------------------------------------------------------------------
// Upload de documentos: o arquivo sobe direto do navegador para o Storage (uma Server Action na
// Vercel aceita ~4,5 MB no máximo), mas SÓ depois de o servidor conferir os limites do plano
// (prepareDocumentUpload) e SÓ vale depois de conferir de novo o tamanho real gravado
// (finalizeDocumentUpload). Nunca confiar no tamanho que o navegador diz ter.
// ---------------------------------------------------------------------------------------------

export type UploadResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// Total já guardado no sinistro (soma de todas as versões de todos os ciclos)
async function claimUsedBytes(supabase: Supa, claimId: string): Promise<number> {
  const { data: cycles } = await supabase.from("claim_cycles").select("id").eq("claim_id", claimId);
  const cycleIds = (cycles ?? []).map((c) => c.id);
  if (!cycleIds.length) return 0;
  const { data: docs } = await supabase.from("documents").select("id").in("claim_cycle_id", cycleIds);
  const docIds = (docs ?? []).map((d) => d.id);
  if (!docIds.length) return 0;
  const { data: versions } = await supabase.from("document_versions").select("size_bytes").in("document_id", docIds);
  return (versions ?? []).reduce((sum, v) => sum + Number(v.size_bytes), 0);
}

// Devolve a mensagem de recusa, ou null se o plano permite este arquivo.
function checkLimits(limits: Limits | null, fileName: string, size: number, usedBytes: number): string | null {
  const fileMaxMb = limitOf(limits, "file_max_mb");
  if (fileMaxMb !== null && size > fileMaxMb * MB && !isAllowed(limits, "allow_file_overage")) {
    return `"${fileName}" tem ${formatMb(size)} e o máximo por arquivo do plano é ${fileMaxMb} MB.`;
  }
  const perClaimMb = limitOf(limits, "storage_per_claim_mb");
  if (perClaimMb !== null && usedBytes + size > perClaimMb * MB && !isAllowed(limits, "allow_storage_overage")) {
    return `Este sinistro já usa ${formatMb(usedBytes)} de ${perClaimMb} MB do plano; não cabe mais ${formatMb(size)}.`;
  }
  return null;
}

type PrepareInput = {
  claimId: string;
  claimCycleId: string;
  documentId?: string;
  fileName: string;
  size: number;
};

export async function prepareDocumentUpload(
  input: PrepareInput,
): Promise<UploadResult<{ path: string; token: string; documentId: string; isNew: boolean; mime: string }>> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const { claimId, claimCycleId, fileName, size } = input;

  const mime = mimeForFile(fileName);
  if (!mime) return { ok: false, error: "Tipo de arquivo não aceito. Use foto (JPG, PNG, WEBP), PDF, Word, Excel, CSV ou TXT." };
  if (!(size > 0)) return { ok: false, error: "Arquivo vazio." };
  if (size > HARD_MAX_BYTES) return { ok: false, error: `Arquivo acima do teto de ${formatMb(HARD_MAX_BYTES)}.` };

  const { data: cycle } = await supabase
    .from("claim_cycles")
    .select("id")
    .eq("id", claimCycleId)
    .eq("claim_id", claimId)
    .maybeSingle();
  if (!cycle) return { ok: false, error: "Ciclo do sinistro não encontrado." };

  const limits = await getLimits(supabase, ctx.tenantId);
  const refusal = checkLimits(limits, fileName, size, await claimUsedBytes(supabase, claimId));
  if (refusal) return { ok: false, error: refusal };

  // Documento extra: só o grupo responsável (ou o Administrador) envia o arquivo.
  if (input.documentId) {
    const { data: target } = await supabase.from("documents").select("is_extra, pending_items(responsible_group_id)").eq("id", input.documentId).eq("claim_cycle_id", claimCycleId).maybeSingle();
    if (!target) return { ok: false, error: "Documento não encontrado." };
    if (target.is_extra) {
      const groupId = (target.pending_items as unknown as { responsible_group_id: string | null } | null)?.responsible_group_id ?? null;
      if (!(await canActOnGroup(ctx, groupId))) return { ok: false, error: "Só o grupo responsável por este documento pode enviar o arquivo." };
    }
  }

  let documentId = input.documentId ?? "";
  const isNew = !documentId;
  let versionNumber = 1;
  if (isNew) {
    documentId = randomUUID();
  } else {
    const { count } = await supabase
      .from("document_versions")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId);
    versionNumber = (count ?? 0) + 1;
  }

  const path = `${ctx.tenantId}/${claimCycleId}/${documentId}/${versionNumber}-${safeFileName(fileName)}`;
  const { data: signed, error } = await supabase.storage.from("documents").createSignedUploadUrl(path);
  if (error || !signed) return { ok: false, error: error?.message ?? "Não foi possível preparar o envio." };

  return { ok: true, path: signed.path, token: signed.token, documentId, isNew, mime };
}

type FinalizeInput = {
  claimId: string;
  claimCycleId: string;
  documentId: string;
  isNew: boolean;
  typeName?: string;
  path: string;
  fileName: string;
};

export async function finalizeDocumentUpload(
  input: FinalizeInput,
): Promise<UploadResult<{ size: number; overageBytes: number }>> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const { claimId, claimCycleId, documentId, path, fileName } = input;

  const folder = `${ctx.tenantId}/${claimCycleId}/${documentId}`;
  if (!path.startsWith(`${folder}/`)) return { ok: false, error: "Caminho de arquivo inválido." };
  const objectName = path.slice(folder.length + 1);
  // O que vale é o objeto que está no Storage, não o nome que o navegador diz ter enviado.
  if (!mimeForFile(objectName) || extOf(objectName) !== extOf(fileName)) {
    await supabase.storage.from("documents").remove([path]);
    return { ok: false, error: "Tipo de arquivo não aceito." };
  }

  // Tamanho real, medido pelo Storage
  const { data: found } = await supabase.storage.from("documents").list(folder, { search: objectName, limit: 10 });
  const object = (found ?? []).find((o) => o.name === objectName);
  const size = Number((object?.metadata as { size?: number } | undefined)?.size ?? 0);
  if (!object || !(size > 0)) return { ok: false, error: "O arquivo não chegou ao armazenamento. Tente enviar de novo." };

  const limits = await getLimits(supabase, ctx.tenantId);
  const used = await claimUsedBytes(supabase, claimId);
  const refusal = size > HARD_MAX_BYTES ? "Arquivo acima do teto permitido." : checkLimits(limits, fileName, size, used);
  if (refusal) {
    await supabase.storage.from("documents").remove([path]);
    return { ok: false, error: refusal };
  }

  if (input.isNew) {
    const typeName = (input.typeName ?? "").trim();
    if (!typeName) {
      await supabase.storage.from("documents").remove([path]);
      return { ok: false, error: "Informe o nome do documento." };
    }
    const typeId = await ensureDocumentType(supabase, ctx.tenantId, typeName);
    const { error } = await supabase.from("documents").insert({
      id: documentId,
      tenant_id: ctx.tenantId,
      claim_cycle_id: claimCycleId,
      document_type_id: typeId,
      status: "received",
    });
    if (error) {
      await supabase.storage.from("documents").remove([path]);
      return { ok: false, error: publicDbMessage(error) };
    }
  }

  const versionNumber = Number(objectName.split("-")[0]) || 1;
  const { error: verErr } = await supabase.from("document_versions").insert({
    tenant_id: ctx.tenantId,
    document_id: documentId,
    version_number: versionNumber,
    storage_path: path,
    file_name: fileName,
    mime_type: mimeForFile(fileName),
    size_bytes: size,
    uploaded_by: ctx.userId,
  });
  if (verErr) {
    await supabase.storage.from("documents").remove([path]);
    return { ok: false, error: verErr.message };
  }

  await supabase.from("documents").update({ status: "received" }).eq("id", documentId);

  // Consumo do sinistro: a cobrança do que passar da franquia acontece no encerramento (Documento 1 §63)
  const total = used + size;
  const franchiseMb = limitOf(limits, "storage_per_claim_mb");
  const overageBytes = franchiseMb === null ? 0 : Math.max(0, total - franchiseMb * MB);
  const { error: usageErr } = await supabase.from("storage_usage").upsert(
    {
      tenant_id: ctx.tenantId,
      claim_id: claimId,
      claim_cycle_id: claimCycleId,
      bytes_used: total,
      quota_bytes: franchiseMb === null ? null : franchiseMb * MB,
      overage_bytes: overageBytes,
      measured_at: new Date().toISOString(),
    },
    { onConflict: "claim_id" },
  );
  if (usageErr) console.error("storage_usage não atualizado:", usageErr.message); // o arquivo já está registrado; só o medidor ficou defasado

  await writeAudit(supabase, ctx.tenantId, "document.received", "document", documentId, {
    next: { version: versionNumber, file_name: fileName, size_bytes: size },
  });
  const { data: sent } = await supabase.from("documents").select("is_extra, pending_item_id").eq("id", documentId).maybeSingle();
  if (sent?.is_extra) {
    await emitDocumentEvent(supabase, ctx.tenantId, "document_extra.delivered", claimCycleId, {
      claim_id: claimId, document_id: documentId, pending_item_id: sent.pending_item_id, file_name: fileName, version: versionNumber, uploaded_by: ctx.userId,
    });
  }
  revalidatePath(`/sinistros/${claimId}`);
  return { ok: true, size, overageBytes };
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

  // Quem pode dar o OK: quem tem a permissão de validar documentos; no documento extra, também quem fez o pedido.
  const { data: target } = await supabase
    .from("documents")
    .select("id, is_extra, pending_item_id, claim_cycle_id, pending_items(requested_by)")
    .eq("id", documentId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!target) throw new Error("Documento não encontrado.");
  const requesterId = (target.pending_items as unknown as { requested_by: string | null } | null)?.requested_by ?? null;
  const isRequester = target.is_extra && requesterId === ctx.userId;
  if (!isRequester && !(await hasPermission(ctx, "document.validate"))) throw new Error("Você não tem permissão para executar esta ação.");

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
  if (target.is_extra) {
    // OK encerra a pendência do grupo; rejeição a mantém aberta (o grupo envia uma nova versão)
    if (decision === "validated" && target.pending_item_id) {
      await supabase.from("pending_items").update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: ctx.userId }).eq("id", target.pending_item_id);
    }
    await emitDocumentEvent(supabase, ctx.tenantId, decision === "validated" ? "document_extra.validated" : "document_extra.rejected", target.claim_cycle_id, {
      claim_id: claimId, document_id: documentId, pending_item_id: target.pending_item_id, reason: decision === "rejected" ? reason : undefined, decided_by: ctx.userId,
    });
    revalidatePath("/tarefas");
  }

  revalidatePath(`/sinistros/${claimId}`);
}
