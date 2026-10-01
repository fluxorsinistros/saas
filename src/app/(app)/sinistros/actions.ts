"use server";

import { revalidatePath } from "next/cache";
import { assertCountLimit } from "@/lib/limits";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { requireGroupAccess, requirePermission } from "@/lib/permissions";
import { isActionAllowedForMember } from "@/lib/group-actions";
import { addBusinessMinutes } from "@/lib/sla";
import { loadGraph } from "@/lib/workflow/load-graph";
import { resolveTransition, startNode } from "@/lib/workflow/engine";
import type { Graph, GraphNode } from "@/lib/workflow/types";
import type { Database, Json } from "@/lib/supabase/database.types";

export type Supa = SupabaseClient<Database>;

export async function writeAudit(
  supabase: Supa,
  tenantId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  extra?: { previous?: unknown; next?: unknown; reason?: string },
) {
  await supabase.rpc("write_audit", {
    // O tipo gerado marca p_tenant_id como string não-nula, mas a função aceita NULL de propósito
    // para eventos de plataforma (Documento 5 §11) — checado por app.is_platform_admin() no banco.
    p_tenant_id: tenantId as unknown as string,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_previous: extra?.previous !== undefined ? (extra.previous as unknown as Json) : undefined,
    p_new: extra?.next !== undefined ? (extra.next as unknown as Json) : undefined,
    p_reason: extra?.reason,
  });
}

// Simplificação desta fatia: "tipo de sinistro" ainda não tem tela própria de configuração
// (Documento 5 não construiu isso ainda), então cada fluxo publicado vira automaticamente seu
// próprio tipo de sinistro (1:1) na primeira vez que alguém formaliza um sinistro nele. Quando a
// tela de configuração de tipos existir, isto deixa de ser necessário — os dados já ficam corretos.
async function ensureClaimType(supabase: Supa, tenantId: string, workflowId: string, workflowName: string): Promise<string> {
  const { data: existing } = await supabase
    .from("claim_types")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("default_workflow_id", workflowId)
    .maybeSingle();
  if (existing) return existing.id;

  const { count: typeCount } = await supabase.from("claim_types").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  await assertCountLimit(supabase, tenantId, "claim_types", "tipos de sinistro", typeCount ?? 0);

  let categoryId: string;
  const { data: category } = await supabase
    .from("claim_categories")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", workflowName)
    .maybeSingle();
  if (category) {
    categoryId = category.id;
  } else {
    const { data: newCategory, error } = await supabase
      .from("claim_categories")
      .insert({ tenant_id: tenantId, name: workflowName })
      .select("id")
      .single();
    if (error || !newCategory) throw new Error(error?.message ?? "Falha ao criar categoria de sinistro.");
    categoryId = newCategory.id;
  }

  const { data: type, error: typeErr } = await supabase
    .from("claim_types")
    .insert({ tenant_id: tenantId, claim_category_id: categoryId, name: workflowName, default_workflow_id: workflowId })
    .select("id")
    .single();
  if (typeErr || !type) throw new Error(typeErr?.message ?? "Falha ao criar tipo de sinistro.");
  return type.id;
}

// Cria a stage_instance (e a activity/decision/paralelo/convergência correspondente) para um nó —
// usado na formalização e em todo avanço. Cada passagem por um nó é uma linha nova (Documento 3
// §17): nunca sobrescreve. `branchInstanceId` amarra a passagem ao ramo de um Paralelo em curso
// (null fora de qualquer Paralelo), para uma Convergência saber qual ramo específico chegou.
async function enterNode(
  supabase: Supa,
  tenantId: string,
  cycleId: string,
  versionId: string,
  graph: Graph,
  nodeId: string,
  entryReason: string,
  branchInstanceId: string | null = null,
) {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error("Elemento não encontrado no fluxo publicado.");

  if (node.type === "parallel_split" && branchInstanceId) {
    // Paralelo dentro de outro Paralelo: o ramo externo nunca fecharia certo (só fecha ao chegar
    // numa Convergência), então bloqueia com motivo em vez de deixar o ciclo com um ramo pendurado.
    await supabase.from("claim_cycles").update({ status: "blocked" }).eq("id", cycleId);
    await writeAudit(supabase, tenantId, "cycle.blocked", "claim_cycle", cycleId, {
      reason: `"${node.name}" é um Paralelo dentro de outro Paralelo — ainda não suportado pela execução.`,
    });
    return;
  }

  const { count } = await supabase
    .from("stage_instances")
    .select("id", { count: "exact", head: true })
    .eq("claim_cycle_id", cycleId)
    .eq("node_id", nodeId);
  const passNumber = (count ?? 0) + 1;
  const now = new Date().toISOString();
  const isInstantaneous = node.type === "end" || node.type === "parallel_split" || node.type === "join";

  const { data: stage, error: stageErr } = await supabase
    .from("stage_instances")
    .insert({
      tenant_id: tenantId,
      claim_cycle_id: cycleId,
      node_id: nodeId,
      pass_number: passNumber,
      status: isInstantaneous ? "completed" : "in_progress",
      entry_reason: entryReason,
      exited_at: isInstantaneous ? now : null,
      branch_instance_id: branchInstanceId,
    })
    .select("id")
    .single();
  if (stageErr || !stage) throw new Error(stageErr?.message ?? "Falha ao registrar a etapa.");

  await writeAudit(supabase, tenantId, "stage.entered", "stage_instance", stage.id, {
    next: { node_name: node.name, node_type: node.type },
  });

  if (node.type === "decision") {
    const options = graph.edges
      .filter((e) => e.source === nodeId)
      .map((e) => e.label)
      .filter(Boolean);
    await supabase.from("decisions").insert({
      tenant_id: tenantId,
      claim_cycle_id: cycleId,
      stage_instance_id: stage.id,
      node_id: nodeId,
      question: node.name,
      options: options as unknown as Json,
    });
    await startSlaTracking(supabase, tenantId, cycleId, versionId, nodeId, stage.id);
    return;
  }

  if (node.type === "end") {
    await supabase.from("claim_cycles").update({ status: "completed", completed_at: now }).eq("id", cycleId);
    return;
  }

  if (node.type === "parallel_split") {
    await openParallelSplit(supabase, tenantId, cycleId, versionId, graph, nodeId);
    return;
  }

  if (node.type === "join") {
    await arriveAtJoin(supabase, tenantId, cycleId, versionId, graph, node, branchInstanceId);
    return;
  }

  await supabase.from("activity_instances").insert({
    tenant_id: tenantId,
    stage_instance_id: stage.id,
    group_id: node.groupId,
    status: "in_progress",
    assigned_at: now,
    started_at: now,
  });

  await startSlaTracking(supabase, tenantId, cycleId, versionId, nodeId, stage.id);
}

// Cria o relógio de SLA (Documento 4 §1-§2) se a versão publicada tiver uma regra para este nó.
// Sem calendário configurável ainda nesta fatia — corrido 24/7, comportamento explícito do §3 quando
// `calendar_id` é nulo, não uma omissão.
async function startSlaTracking(supabase: Supa, tenantId: string, cycleId: string, versionId: string, nodeId: string, stageInstanceId: string) {
  const { data: sla } = await supabase
    .from("workflow_slas")
    .select("id, duration_minutes, calendar_id")
    .eq("workflow_version_id", versionId)
    .eq("node_id", nodeId)
    .maybeSingle();
  if (!sla) return;

  const startedAt = new Date();
  let targetAt = new Date(startedAt.getTime() + sla.duration_minutes * 60_000);

  if (sla.calendar_id) {
    const { data: calendar } = await supabase
      .from("sla_calendars")
      .select("business_days, business_start, business_end")
      .eq("id", sla.calendar_id)
      .maybeSingle();
    if (calendar) {
      const { data: exceptions } = await supabase
        .from("sla_calendar_exceptions")
        .select("exception_date, is_working_day")
        .eq("calendar_id", sla.calendar_id);
      targetAt = addBusinessMinutes(startedAt, sla.duration_minutes, calendar, exceptions ?? []);
    }
  }

  await supabase.from("sla_tracking").insert({
    tenant_id: tenantId,
    claim_cycle_id: cycleId,
    workflow_sla_id: sla.id,
    stage_instance_id: stageInstanceId,
    started_at: startedAt.toISOString(),
    target_at: targetAt.toISOString(),
  });
}

// Encerra o(s) relógio(s) de SLA abertos para esta etapa (Documento 4 §8): 'breached' vira
// 'completed' normalmente — o descumprimento já ocorrido continua sendo dado histórico, nunca apagado.
async function completeSlaTracking(supabase: Supa, stageInstanceId: string) {
  await supabase
    .from("sla_tracking")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("stage_instance_id", stageInstanceId)
    .not("status", "eq", "completed");
}

// Abre um Paralelo (Documento 3 §4): cria o evento de bifurcação (`branches`), um `branch_instances`
// por ramo, e entra em cada ramo imediatamente e de forma independente.
async function openParallelSplit(supabase: Supa, tenantId: string, cycleId: string, versionId: string, graph: Graph, nodeId: string) {
  const outs = graph.edges.filter((e) => e.source === nodeId);
  if (outs.length === 0) {
    await supabase.from("claim_cycles").update({ status: "blocked" }).eq("id", cycleId);
    await writeAudit(supabase, tenantId, "cycle.blocked", "claim_cycle", cycleId, { reason: "Paralelo sem ramos de saída." });
    return;
  }

  const { data: branch, error } = await supabase
    .from("branches")
    .insert({ tenant_id: tenantId, claim_cycle_id: cycleId, source_node_id: nodeId, branch_mode: "parallel" })
    .select("id")
    .single();
  if (error || !branch) throw new Error(error?.message ?? "Falha ao abrir o paralelo.");
  await writeAudit(supabase, tenantId, "branch.opened", "branch", branch.id, { next: { ramos: outs.length } });

  for (const edge of outs) {
    const { data: bi, error: biErr } = await supabase
      .from("branch_instances")
      .insert({
        tenant_id: tenantId,
        branch_id: branch.id,
        target_node_id: edge.target,
        edge_id: edge.id,
        is_required: edge.isRequired,
        status: "active",
      })
      .select("id")
      .single();
    if (biErr || !bi) throw new Error(biErr?.message ?? "Falha ao abrir um ramo.");
    await enterNode(supabase, tenantId, cycleId, versionId, graph, edge.target, "advance", bi.id);
  }
}

// Um ramo chega numa Convergência (Documento 3 §5): marca o branch_instance como concluído, registra
// a contribuição em join_instances e reavalia a regra (all/all_required/any/min_count). As atividades
// já concluídas dos outros ramos permanecem concluídas — nunca desfaz progresso de um ramo.
async function arriveAtJoin(
  supabase: Supa,
  tenantId: string,
  cycleId: string,
  versionId: string,
  graph: Graph,
  node: GraphNode,
  branchInstanceId: string | null,
) {
  if (!branchInstanceId) {
    await supabase.from("claim_cycles").update({ status: "blocked" }).eq("id", cycleId);
    await writeAudit(supabase, tenantId, "cycle.blocked", "claim_cycle", cycleId, {
      reason: `"${node.name}" (Convergência) foi alcançada fora de um Paralelo — o fluxo publicado é inválido.`,
    });
    return;
  }

  const { data: bi, error: biErr } = await supabase
    .from("branch_instances")
    .select("id, branch_id")
    .eq("id", branchInstanceId)
    .single();
  if (biErr || !bi) throw new Error(biErr?.message ?? "Ramo não encontrado.");

  const now = new Date().toISOString();
  await supabase.from("branch_instances").update({ status: "completed" }).eq("id", bi.id);

  const ruleType = node.config.join_rule ?? "all_required";
  const minCount = node.config.min_count ?? null;

  const { data: existingJoin } = await supabase
    .from("joins")
    .select("id")
    .eq("claim_cycle_id", cycleId)
    .eq("node_id", node.id)
    .eq("branch_id", bi.branch_id)
    .maybeSingle();

  let joinId = existingJoin?.id as string | undefined;
  if (!joinId) {
    const { data: created, error: joinErr } = await supabase
      .from("joins")
      .insert({
        tenant_id: tenantId,
        claim_cycle_id: cycleId,
        node_id: node.id,
        branch_id: bi.branch_id,
        rule_type: ruleType,
        min_count: ruleType === "min_count" ? minCount : null,
        status: "waiting",
      })
      .select("id")
      .single();
    if (joinErr || !created) throw new Error(joinErr?.message ?? "Falha ao abrir a convergência.");
    joinId = created.id;
    await writeAudit(supabase, tenantId, "join.waiting", "join", joinId, { next: { node_name: node.name, rule_type: ruleType } });
  }

  await supabase
    .from("join_instances")
    .insert({ tenant_id: tenantId, join_id: joinId, branch_instance_id: bi.id, satisfied: true, satisfied_at: now });

  const { data: siblings } = await supabase.from("branch_instances").select("status, is_required").eq("branch_id", bi.branch_id);
  const all = siblings ?? [];
  const completedCount = all.filter((s) => s.status === "completed").length;
  const requiredTotal = all.filter((s) => s.is_required).length;
  const requiredCompleted = all.filter((s) => s.is_required && s.status === "completed").length;

  let released = false;
  if (ruleType === "any") released = completedCount >= 1;
  else if (ruleType === "all") released = completedCount >= all.length;
  else if (ruleType === "all_required") released = requiredCompleted >= requiredTotal;
  else if (ruleType === "min_count") released = completedCount >= (minCount ?? all.length);

  if (!released) return; // fica "waiting" — a chegada do próximo ramo reavalia de novo

  await supabase.from("joins").update({ status: "completed", released_at: now }).eq("id", joinId);
  await writeAudit(supabase, tenantId, "join.released", "join", joinId);

  const target = graph.edges.find((e) => e.source === node.id);
  if (!target) {
    await supabase.from("claim_cycles").update({ status: "blocked" }).eq("id", cycleId);
    await writeAudit(supabase, tenantId, "cycle.blocked", "claim_cycle", cycleId, { reason: `"${node.name}" não tem saída configurada.` });
    return;
  }
  await enterNode(supabase, tenantId, cycleId, versionId, graph, target.target, "advance", null);
}

// Resolve a transição a partir do nó concluído e entra no(s) próximo(s) nó(s), ou bloqueia o ciclo
// com um motivo explícito (Documento 3 §3: "nenhuma edge sem correspondência" nunca falha em silêncio).
async function advance(
  supabase: Supa,
  tenantId: string,
  versionId: string,
  cycleId: string,
  fromNodeId: string,
  selectedOption?: string,
  branchInstanceId: string | null = null,
) {
  const graph = await loadGraph(supabase, versionId);

  const { data: rules } = await supabase
    .from("workflow_rules")
    .select("node_id, config")
    .eq("workflow_version_id", versionId)
    .eq("rule_type", "loop_limit");
  const loopMax: Record<string, number | undefined> = {};
  for (const r of rules ?? []) {
    if (r.node_id) loopMax[r.node_id] = (r.config as { max_count?: number } | null)?.max_count;
  }

  const { data: passRows } = await supabase.from("stage_instances").select("node_id").eq("claim_cycle_id", cycleId);
  const loopPassCounts: Record<string, number> = {};
  for (const row of passRows ?? []) loopPassCounts[row.node_id] = (loopPassCounts[row.node_id] ?? 0) + 1;

  const result = resolveTransition(graph, fromNodeId, { selectedOption, loopPassCounts, loopMax });

  if (result.kind === "unsupported") {
    await supabase.from("claim_cycles").update({ status: "blocked" }).eq("id", cycleId);
    await writeAudit(supabase, tenantId, "cycle.blocked", "claim_cycle", cycleId, { reason: result.reason });
    return;
  }
  if (result.kind === "end") return;
  for (const targetId of result.targets) {
    await enterNode(supabase, tenantId, cycleId, versionId, graph, targetId, "advance", branchInstanceId);
  }
}

export type FormalizeClaimInput = {
  workflowName: string;
  occurredAt?: string;
  location?: string;
  externalReference?: string;
};

// Detecção de duplicidade (Documento 2 §28): roda UMA VEZ, na primeira entrada do sinistro — nunca um
// job contínuo. Avisa, nunca bloqueia: mesmo com candidatos fortes, a criação do sinistro já aconteceu
// (chamado depois do insert em claims) e o usuário decide na Tela de Sinistro se é ou não duplicidade.
async function runDuplicateCheck(
  supabase: Supa,
  tenantId: string,
  claimId: string,
  claimCategoryId: string,
  input: FormalizeClaimInput,
): Promise<void> {
  const candidates: { claimId: string; confidence: number; matchedFields: string[] }[] = [];

  if (input.externalReference) {
    const { data: refMatches } = await supabase
      .from("claims")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("external_reference", input.externalReference)
      .neq("id", claimId);
    for (const m of refMatches ?? []) candidates.push({ claimId: m.id, confidence: 0.95, matchedFields: ["external_reference"] });
  }

  if (input.occurredAt) {
    const day = input.occurredAt.slice(0, 10);
    const { data: dayMatches } = await supabase
      .from("claims")
      .select("id, location")
      .eq("tenant_id", tenantId)
      .eq("claim_category_id", claimCategoryId)
      .gte("occurred_at", `${day}T00:00:00`)
      .lt("occurred_at", `${day}T23:59:59.999`)
      .neq("id", claimId);
    for (const m of dayMatches ?? []) {
      if (candidates.some((c) => c.claimId === m.id)) continue;
      const sameLocation =
        input.location && (m.location as { text?: string } | null)?.text?.toLowerCase().trim() === input.location.toLowerCase().trim();
      const matchedFields = ["claim_category_id", "occurred_at", ...(sameLocation ? ["location"] : [])];
      candidates.push({ claimId: m.id, confidence: sameLocation ? 0.8 : 0.5, matchedFields });
    }
  }

  if (candidates.length === 0) return;

  const { data: check, error } = await supabase
    .from("duplicate_checks")
    .insert({
      tenant_id: tenantId,
      claim_id: claimId,
      evidence: { external_reference: input.externalReference ?? null, occurred_at: input.occurredAt ?? null, location: input.location ?? null } as unknown as Json,
      decision: "pending",
    })
    .select("id")
    .single();
  if (error || !check) return; // nunca bloqueia a formalização por causa disso

  await supabase.from("duplicate_candidates").insert(
    candidates.map((c) => ({
      tenant_id: tenantId,
      duplicate_check_id: check.id,
      candidate_claim_id: c.claimId,
      confidence: c.confidence,
      matched_fields: c.matchedFields as unknown as Json,
    })),
  );
  await writeAudit(supabase, tenantId, "duplicate_check.flagged", "duplicate_check", check.id, { next: { candidates: candidates.length } });
}

export async function decideDuplicate(checkId: string, decision: "confirmed_duplicate" | "not_duplicate", formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const justification = String(formData.get("justification") ?? "").trim();
  const claimId = String(formData.get("claim_id") ?? "");

  await supabase
    .from("duplicate_checks")
    .update({ decision, decided_by: ctx.userId, decided_at: new Date().toISOString(), justification: justification || null })
    .eq("id", checkId);
  await writeAudit(supabase, ctx.tenantId, "duplicate_check.decided", "duplicate_check", checkId, { next: { decision }, reason: justification || undefined });

  revalidatePath(`/sinistros/${claimId}`);
}

// Rotina única de criação de sinistro (Documento 5 §29: a importação em massa "usa as mesmas regras
// de criação manual" — não existe caminho de escrita paralelo para `claims`). formalizeClaim (form da
// UI) e a importação em massa (createImport/confirmImport) chamam exatamente esta função.
export async function createClaimAndCycle(
  supabase: Supa,
  tenantId: string,
  userId: string,
  input: FormalizeClaimInput,
): Promise<{ claimId: string; claimNumber: string }> {
  const workflowName = input.workflowName.trim();
  if (!workflowName) throw new Error("Informe o fluxo.");

  const { data: workflow } = await supabase.from("workflows").select("id, name").eq("tenant_id", tenantId).ilike("name", workflowName).maybeSingle();
  if (!workflow) throw new Error(`Fluxo "${workflowName}" não encontrado.`);

  const { data: version } = await supabase
    .from("workflow_versions")
    .select("id")
    .eq("workflow_id", workflow.id)
    .eq("status", "published")
    .maybeSingle();
  if (!version) throw new Error(`"${workflow.name}" ainda não tem nenhuma versão publicada.`);

  if (input.occurredAt && Number.isNaN(new Date(input.occurredAt).getTime())) {
    throw new Error(`Data do evento inválida: "${input.occurredAt}".`);
  }

  const graph = await loadGraph(supabase, version.id);
  const start = startNode(graph);
  const claimTypeId = await ensureClaimType(supabase, tenantId, workflow.id, workflow.name);
  const { data: claimType, error: typeErr } = await supabase
    .from("claim_types")
    .select("claim_category_id")
    .eq("id", claimTypeId)
    .single();
  if (typeErr || !claimType) throw new Error(typeErr?.message ?? "Tipo de sinistro inválido.");

  const year = new Date().getFullYear();
  let claim: { id: string; claim_number: string } | null = null;
  for (let attempt = 0; attempt < 5 && !claim; attempt++) {
    const { count } = await supabase
      .from("claims")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .like("claim_number", `${year}-%`);
    const claimNumber = `${year}-${String((count ?? 0) + 1 + attempt).padStart(5, "0")}`;
    const { data, error } = await supabase
      .from("claims")
      .insert({
        tenant_id: tenantId,
        claim_number: claimNumber,
        claim_category_id: claimType.claim_category_id,
        status: "active",
        occurred_at: input.occurredAt ? new Date(input.occurredAt).toISOString() : null,
        location: input.location ? ({ text: input.location } as unknown as Json) : null,
        external_reference: input.externalReference || null,
        created_by: userId,
      })
      .select("id, claim_number")
      .single();
    if (!error) claim = data;
    else if (error.code !== "23505") throw new Error(error.message);
  }
  if (!claim) throw new Error("Não foi possível gerar um número de sinistro único. Tente de novo.");

  await runDuplicateCheck(supabase, tenantId, claim.id, claimType.claim_category_id, input);

  const { data: cycle, error: cycleErr } = await supabase
    .from("claim_cycles")
    .insert({
      tenant_id: tenantId,
      claim_id: claim.id,
      cycle_number: 1,
      claim_type_id: claimTypeId,
      workflow_version_id: version.id,
      status: "open",
      formalized_at: new Date().toISOString(),
      created_by: userId,
    })
    .select("id")
    .single();
  if (cycleErr || !cycle) throw new Error(cycleErr?.message ?? "Falha ao abrir o ciclo.");

  await supabase.from("cycle_configuration_snapshots").insert({
    tenant_id: tenantId,
    claim_cycle_id: cycle.id,
    workflow_version_id: version.id,
    snapshot: graph as unknown as Json,
  });

  await writeAudit(supabase, tenantId, "claim.created", "claim", claim.id);
  await writeAudit(supabase, tenantId, "cycle.created", "claim_cycle", cycle.id);
  await enterNode(supabase, tenantId, cycle.id, version.id, graph, start.id, "initial");

  return { claimId: claim.id, claimNumber: claim.claim_number };
}

export async function formalizeClaim(formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "claim.formalize");
  if (!(await isActionAllowedForMember(ctx.userId, ctx.tenantId, "claim.formalize"))) {
    throw new Error("Seu grupo não está liberado para lançar sinistros.");
  }
  const supabase = await createClient();

  const workflowId = String(formData.get("workflow_id") ?? "");
  if (!workflowId) throw new Error("Escolha um fluxo publicado.");
  const { data: workflow } = await supabase.from("workflows").select("name").eq("id", workflowId).single();
  if (!workflow) throw new Error("Fluxo não encontrado.");

  const { claimId } = await createClaimAndCycle(supabase, ctx.tenantId, ctx.userId, {
    workflowName: workflow.name,
    occurredAt: String(formData.get("occurred_at") ?? "").trim() || undefined,
    location: String(formData.get("location") ?? "").trim() || undefined,
    externalReference: String(formData.get("external_reference") ?? "").trim() || undefined,
  });

  revalidatePath("/sinistros");
  redirect(`/sinistros/${claimId}`);
}

export async function completeActivity(activityInstanceId: string, formData?: FormData): Promise<void> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "claim.execute");
  const supabase = await createClient();

  const { data: activity, error: aErr } = await supabase
    .from("activity_instances")
    .select("id, status, stage_instance_id, group_id")
    .eq("id", activityInstanceId)
    .single();
  if (aErr || !activity) throw new Error("Atividade não encontrada.");
  if (activity.status === "completed") return;
  await requireGroupAccess(ctx, activity.group_id);

  const { data: stage, error: sErr } = await supabase
    .from("stage_instances")
    .select("id, node_id, claim_cycle_id, branch_instance_id")
    .eq("id", activity.stage_instance_id)
    .single();
  if (sErr || !stage) throw new Error("Etapa não encontrada.");

  const { data: cycle, error: cErr } = await supabase
    .from("claim_cycles")
    .select("id, claim_id, workflow_version_id, status")
    .eq("id", stage.claim_cycle_id)
    .single();
  if (cErr || !cycle) throw new Error("Ciclo não encontrado.");
  if (cycle.status === "completed" || cycle.status === "blocked" || cycle.status === "discarded") {
    throw new Error(`Este ciclo não pode mais avançar (status atual: ${cycle.status}).`);
  }

  // Campos personalizados desta etapa (Documento 1, "estilo SHARP") caem na mesma ficha do
  // sinistro — nunca sobrescrevem o que outra etapa já preencheu, só somam (merge raso). Anexo é
  // tratado à parte: o valor vira o caminho do arquivo no Storage, não o texto bruto. Obrigatório
  // e duplicidade são validados aqui, não só escondendo/marcando o input (Documento 1 §56).
  const { data: nodeRow } = await supabase.from("workflow_nodes").select("config").eq("id", stage.node_id).single();
  const stageFieldKeys = ((nodeRow?.config as { field_keys?: string[] } | null)?.field_keys ?? []) as string[];
  if (stageFieldKeys.length) {
    const { data: versionRow } = await supabase
      .from("workflow_versions")
      .select("workflow_id")
      .eq("id", cycle.workflow_version_id)
      .single();
    const { data: fieldDefs } = versionRow
      ? await supabase
          .from("workflow_fields")
          .select("key, label, field_type, required, is_unique")
          .eq("workflow_id", versionRow.workflow_id)
          .in("key", stageFieldKeys)
      : { data: [] as { key: string; label: string; field_type: string; required: boolean; is_unique: boolean }[] };
    const defByKey = new Map((fieldDefs ?? []).map((f) => [f.key, f]));

    const fieldEntries = [...(formData?.entries() ?? [])].filter(([k]) => k.startsWith("field_"));
    const patch: Record<string, string> = {};
    for (const [k, v] of fieldEntries) {
      const key = k.slice("field_".length);
      if (defByKey.get(key)?.field_type === "attachment") {
        if (!(v instanceof File) || v.size === 0) continue;
        const path = `${ctx.tenantId}/custom-fields/${cycle.claim_id}/${key}-${Date.now()}-${v.name}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, v, { contentType: v.type });
        if (!upErr) patch[key] = path;
        continue;
      }
      const value = String(v);
      if (value !== "") patch[key] = value;
    }

    const { data: claimRow } = await supabase.from("claims").select("custom_fields").eq("id", cycle.claim_id).single();
    const current = (claimRow?.custom_fields ?? {}) as Record<string, string>;
    const merged = { ...current, ...patch };

    for (const def of fieldDefs ?? []) {
      if (def.required && !merged[def.key]) throw new Error(`O campo "${def.label}" é obrigatório.`);
    }
    for (const def of fieldDefs ?? []) {
      if (!def.is_unique || !patch[def.key]) continue;
      const { data: dupe } = await supabase
        .from("claims")
        .select("id")
        .eq("tenant_id", ctx.tenantId)
        .neq("id", cycle.claim_id)
        .eq(`custom_fields->>${def.key}`, patch[def.key])
        .limit(1)
        .maybeSingle();
      if (dupe) throw new Error(`O valor informado em "${def.label}" já está em uso em outro sinistro.`);
    }

    if (Object.keys(patch).length) {
      await supabase.from("claims").update({ custom_fields: merged }).eq("id", cycle.claim_id);
    }
  }

  const now = new Date().toISOString();
  await supabase
    .from("activity_instances")
    .update({ status: "completed", completed_at: now, completed_by: ctx.userId })
    .eq("id", activityInstanceId);
  await supabase.from("stage_instances").update({ status: "completed", exited_at: now }).eq("id", stage.id);
  await writeAudit(supabase, ctx.tenantId, "activity.completed", "activity_instance", activityInstanceId);
  await completeSlaTracking(supabase, stage.id);

  await advance(supabase, ctx.tenantId, cycle.workflow_version_id, cycle.id, stage.node_id, undefined, stage.branch_instance_id);

  revalidatePath("/sinistros");
  revalidatePath(`/sinistros/${cycle.claim_id}`);
}

export async function chooseDecision(decisionId: string, selectedOption: string, justification: string): Promise<void> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "claim.execute");
  const supabase = await createClient();

  const { data: decision, error: dErr } = await supabase
    .from("decisions")
    .select("id, claim_cycle_id, node_id, stage_instance_id, selected_option")
    .eq("id", decisionId)
    .single();
  if (dErr || !decision) throw new Error("Decisão não encontrada.");
  if (decision.selected_option) return;
  if (!decision.node_id) throw new Error("Decisão sem elemento de origem.");

  const { data: decisionNode } = await supabase.from("workflow_nodes").select("group_id").eq("id", decision.node_id).single();
  await requireGroupAccess(ctx, decisionNode?.group_id ?? null);

  let branchInstanceId: string | null = null;
  if (decision.stage_instance_id) {
    const { data: dstage } = await supabase
      .from("stage_instances")
      .select("branch_instance_id")
      .eq("id", decision.stage_instance_id)
      .single();
    branchInstanceId = dstage?.branch_instance_id ?? null;
  }

  const { data: cycle, error: cErr } = await supabase
    .from("claim_cycles")
    .select("id, claim_id, workflow_version_id, status")
    .eq("id", decision.claim_cycle_id)
    .single();
  if (cErr || !cycle) throw new Error("Ciclo não encontrado.");
  if (cycle.status === "completed" || cycle.status === "blocked" || cycle.status === "discarded") {
    throw new Error(`Este ciclo não pode mais avançar (status atual: ${cycle.status}).`);
  }

  const now = new Date().toISOString();
  await supabase
    .from("decisions")
    .update({ selected_option: selectedOption, decided_by: ctx.userId, decided_at: now, justification: justification || null })
    .eq("id", decisionId);
  if (decision.stage_instance_id) {
    await supabase.from("stage_instances").update({ status: "completed", exited_at: now }).eq("id", decision.stage_instance_id);
    await completeSlaTracking(supabase, decision.stage_instance_id);
  }
  await writeAudit(supabase, ctx.tenantId, "decision.made", "decision", decisionId, { next: { selected_option: selectedOption } });

  await advance(supabase, ctx.tenantId, cycle.workflow_version_id, cycle.id, decision.node_id, selectedOption, branchInstanceId);

  revalidatePath("/sinistros");
  revalidatePath(`/sinistros/${cycle.claim_id}`);
}

// Pausa não é um botão livre (Documento 4 §5, §68.7): exige motivo e tipo. Autorização por tipo de
// pausa fica fora desta fatia (o próprio Documento 4 §10 registra o catálogo de pause_type como
// decisão de implementação em aberto) — hoje toda pausa é aceita sem exigir aprovação.
export async function pauseSla(trackingId: string, formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const pauseType = String(formData.get("pause_type") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const claimId = String(formData.get("claim_id") ?? "");
  if (!pauseType) throw new Error("Escolha o tipo de pausa.");
  if (!reason) throw new Error("Informe o motivo da pausa.");

  const { data: tracking, error } = await supabase.from("sla_tracking").select("id, status").eq("id", trackingId).single();
  if (error || !tracking) throw new Error("Relógio de SLA não encontrado.");
  if (tracking.status === "completed" || tracking.status === "paused") throw new Error(`Este SLA não pode ser pausado (status atual: ${tracking.status}).`);

  await supabase.from("sla_pauses").insert({ tenant_id: ctx.tenantId, sla_tracking_id: trackingId, pause_type: pauseType, reason });
  await supabase.from("sla_tracking").update({ status: "paused" }).eq("id", trackingId);
  await writeAudit(supabase, ctx.tenantId, "sla.paused", "sla_tracking", trackingId, { reason });

  revalidatePath(`/sinistros/${claimId}`);
}

export async function resumeSla(trackingId: string, claimId: string): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();

  const { data: pause, error: pErr } = await supabase
    .from("sla_pauses")
    .select("id, paused_at")
    .eq("sla_tracking_id", trackingId)
    .is("resumed_at", null)
    .order("paused_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pErr || !pause) throw new Error("Nenhuma pausa em aberto para este SLA.");

  const { data: tracking, error: tErr } = await supabase
    .from("sla_tracking")
    .select("id, target_at, paused_minutes")
    .eq("id", trackingId)
    .single();
  if (tErr || !tracking) throw new Error("Relógio de SLA não encontrado.");

  const now = new Date();
  const pausedMinutes = Math.round((now.getTime() - new Date(pause.paused_at).getTime()) / 60_000);
  const newPausedTotal = tracking.paused_minutes + pausedMinutes;
  const newTargetAt = new Date(new Date(tracking.target_at).getTime() + pausedMinutes * 60_000);

  await supabase.from("sla_pauses").update({ resumed_at: now.toISOString() }).eq("id", pause.id);
  await supabase
    .from("sla_tracking")
    .update({ status: "on_track", paused_minutes: newPausedTotal, target_at: newTargetAt.toISOString() })
    .eq("id", trackingId);
  await writeAudit(supabase, ctx.tenantId, "sla.resumed", "sla_tracking", trackingId, { next: { paused_minutes: newPausedTotal } });

  revalidatePath(`/sinistros/${claimId}`);
}

// Reabrir ciclo (Documento 3 §11, caso J): só um ciclo já `completed` pode ser reaberto — grava uma
// nova passagem (`entry_reason='reopen'`) sobre o mesmo claim_cycle_id, no último nó não-Fim por onde
// o ciclo passou, em vez de recomeçar do zero. Autorização granular por papel fica para quando
// `role_permissions` existir (gap conhecido) — por ora exige motivo obrigatório e fica auditado.
export async function reopenCycle(cycleId: string, formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "claim.reopen");
  const supabase = await createClient();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("Informe o motivo da reabertura.");

  const { data: cycle, error: cErr } = await supabase
    .from("claim_cycles")
    .select("id, claim_id, status, workflow_version_id")
    .eq("id", cycleId)
    .single();
  if (cErr || !cycle) throw new Error("Ciclo não encontrado.");
  if (cycle.status !== "completed") throw new Error(`Só um ciclo concluído pode ser reaberto (status atual: ${cycle.status}).`);

  const graph = await loadGraph(supabase, cycle.workflow_version_id);
  const { data: lastStage, error: sErr } = await supabase
    .from("stage_instances")
    .select("node_id")
    .eq("claim_cycle_id", cycleId)
    .order("entered_at", { ascending: false });
  if (sErr) throw new Error(sErr.message);
  const reopenNode = (lastStage ?? []).map((s) => graph.nodes.find((n) => n.id === s.node_id)).find((n) => n && n.type !== "end");
  if (!reopenNode) throw new Error("Não há etapa anterior ao Fim para reabrir.");

  await supabase.from("claim_cycles").update({ status: "in_progress", completed_at: null }).eq("id", cycleId);
  await writeAudit(supabase, ctx.tenantId, "cycle.reopened", "claim_cycle", cycleId, { reason });
  await enterNode(supabase, ctx.tenantId, cycleId, cycle.workflow_version_id, graph, reopenNode.id, "reopen");

  revalidatePath(`/sinistros/${cycle.claim_id}`);
}

// Descartar ciclo e abrir um novo relacionado (Documento 3 §11, caso K): o ciclo velho fica com
// status='discarded' pra sempre (nunca é apagado — é histórico), e um novo claim_cycles nasce
// apontando pra ele via previous_cycle_id, sob a versão publicada ATUAL do fluxo (que pode ter
// mudado desde que o ciclo velho abriu — o velho já estava preso à versão dele, imutável).
export async function discardCycle(cycleId: string, formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "claim.discard");
  const supabase = await createClient();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("Informe o motivo do descarte.");

  const { data: cycle, error: cErr } = await supabase
    .from("claim_cycles")
    .select("id, claim_id, status, cycle_number, claim_type_id, workflow_version_id")
    .eq("id", cycleId)
    .single();
  if (cErr || !cycle) throw new Error("Ciclo não encontrado.");
  if (cycle.status === "completed" || cycle.status === "discarded") {
    throw new Error(`Este ciclo não pode ser descartado (status atual: ${cycle.status}).`);
  }

  const { data: oldVersion, error: vErr } = await supabase
    .from("workflow_versions")
    .select("workflow_id")
    .eq("id", cycle.workflow_version_id)
    .single();
  if (vErr || !oldVersion) throw new Error(vErr?.message ?? "Versão do fluxo não encontrada.");
  const { data: currentVersion } = await supabase
    .from("workflow_versions")
    .select("id")
    .eq("workflow_id", oldVersion.workflow_id)
    .eq("status", "published")
    .maybeSingle();
  const newVersionId = currentVersion?.id ?? cycle.workflow_version_id;

  await supabase
    .from("claim_cycles")
    .update({ status: "discarded", discard_reason: reason, discarded_at: new Date().toISOString(), discarded_by: ctx.userId })
    .eq("id", cycleId);
  await writeAudit(supabase, ctx.tenantId, "cycle.discarded", "claim_cycle", cycleId, { reason });

  const graph = await loadGraph(supabase, newVersionId);
  const start = startNode(graph);
  const { data: newCycle, error: ncErr } = await supabase
    .from("claim_cycles")
    .insert({
      tenant_id: ctx.tenantId,
      claim_id: cycle.claim_id,
      cycle_number: cycle.cycle_number + 1,
      claim_type_id: cycle.claim_type_id,
      workflow_version_id: newVersionId,
      previous_cycle_id: cycleId,
      status: "open",
      formalized_at: new Date().toISOString(),
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (ncErr || !newCycle) throw new Error(ncErr?.message ?? "Falha ao abrir o novo ciclo.");

  await supabase.from("cycle_configuration_snapshots").insert({
    tenant_id: ctx.tenantId,
    claim_cycle_id: newCycle.id,
    workflow_version_id: newVersionId,
    snapshot: graph as unknown as Json,
  });
  await writeAudit(supabase, ctx.tenantId, "cycle.created", "claim_cycle", newCycle.id, { reason: "Novo ciclo após descarte do anterior." });
  await enterNode(supabase, ctx.tenantId, newCycle.id, newVersionId, graph, start.id, "initial");

  revalidatePath(`/sinistros/${cycle.claim_id}`);
}

// Pendência (Documento 3 §2.2, caso H): uma solicitação dentro da atividade atual, que NÃO move o
// processo pra outro nó — por isso não passa por enterNode/stage_instances, é só uma linha própria
// associada à activity_instance (§21: "pendência não é necessariamente uma nova etapa").
export async function createPendingItem(activityInstanceId: string, formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const groupId = String(formData.get("group_id") ?? "").trim();
  const dueAt = String(formData.get("due_at") ?? "").trim();
  const claimId = String(formData.get("claim_id") ?? "");
  if (!title) throw new Error("Informe o título da pendência.");

  const { data: activity, error } = await supabase
    .from("activity_instances")
    .select("id, stage_instance_id, stage_instances(claim_cycle_id)")
    .eq("id", activityInstanceId)
    .single();
  if (error || !activity) throw new Error("Atividade não encontrada.");
  const claimCycleId = (activity.stage_instances as unknown as { claim_cycle_id: string } | null)?.claim_cycle_id;
  if (!claimCycleId) throw new Error("Ciclo não encontrado para esta atividade.");

  const { data: item, error: insErr } = await supabase
    .from("pending_items")
    .insert({
      tenant_id: ctx.tenantId,
      claim_cycle_id: claimCycleId,
      activity_instance_id: activityInstanceId,
      title,
      description: description || null,
      requested_by: ctx.userId,
      responsible_group_id: groupId || null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
    })
    .select("id")
    .single();
  if (insErr || !item) throw new Error(insErr?.message ?? "Falha ao criar a pendência.");

  await writeAudit(supabase, ctx.tenantId, "pending_item.created", "pending_item", item.id, { next: { title } });
  revalidatePath(`/sinistros/${claimId}`);
}

export async function resolvePendingItem(pendingItemId: string, claimId: string): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  await supabase
    .from("pending_items")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: ctx.userId })
    .eq("id", pendingItemId);
  await writeAudit(supabase, ctx.tenantId, "pending_item.resolved", "pending_item", pendingItemId);
  revalidatePath(`/sinistros/${claimId}`);
}

export async function cancelPendingItem(pendingItemId: string, claimId: string): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  await supabase.from("pending_items").update({ status: "cancelled" }).eq("id", pendingItemId);
  await writeAudit(supabase, ctx.tenantId, "pending_item.cancelled", "pending_item", pendingItemId);
  revalidatePath(`/sinistros/${claimId}`);
}
