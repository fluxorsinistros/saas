"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
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
    return;
  }

  if (node.type === "end") {
    await supabase.from("claim_cycles").update({ status: "completed", completed_at: now }).eq("id", cycleId);
    return;
  }

  if (node.type === "parallel_split") {
    await openParallelSplit(supabase, tenantId, cycleId, graph, nodeId);
    return;
  }

  if (node.type === "join") {
    await arriveAtJoin(supabase, tenantId, cycleId, graph, node, branchInstanceId);
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
}

// Abre um Paralelo (Documento 3 §4): cria o evento de bifurcação (`branches`), um `branch_instances`
// por ramo, e entra em cada ramo imediatamente e de forma independente.
async function openParallelSplit(supabase: Supa, tenantId: string, cycleId: string, graph: Graph, nodeId: string) {
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
    await enterNode(supabase, tenantId, cycleId, graph, edge.target, "advance", bi.id);
  }
}

// Um ramo chega numa Convergência (Documento 3 §5): marca o branch_instance como concluído, registra
// a contribuição em join_instances e reavalia a regra (all/all_required/any/min_count). As atividades
// já concluídas dos outros ramos permanecem concluídas — nunca desfaz progresso de um ramo.
async function arriveAtJoin(
  supabase: Supa,
  tenantId: string,
  cycleId: string,
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
  await enterNode(supabase, tenantId, cycleId, graph, target.target, "advance", null);
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
    await enterNode(supabase, tenantId, cycleId, graph, targetId, "advance", branchInstanceId);
  }
}

export type FormalizeClaimInput = {
  workflowName: string;
  occurredAt?: string;
  location?: string;
  externalReference?: string;
};

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
  await enterNode(supabase, tenantId, cycle.id, graph, start.id, "initial");

  return { claimId: claim.id, claimNumber: claim.claim_number };
}

export async function formalizeClaim(formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
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

export async function completeActivity(activityInstanceId: string): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();

  const { data: activity, error: aErr } = await supabase
    .from("activity_instances")
    .select("id, status, stage_instance_id")
    .eq("id", activityInstanceId)
    .single();
  if (aErr || !activity) throw new Error("Atividade não encontrada.");
  if (activity.status === "completed") return;

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
  if (cycle.status === "completed" || cycle.status === "blocked") {
    throw new Error(`Este ciclo não pode mais avançar (status atual: ${cycle.status}).`);
  }

  const now = new Date().toISOString();
  await supabase
    .from("activity_instances")
    .update({ status: "completed", completed_at: now, completed_by: ctx.userId })
    .eq("id", activityInstanceId);
  await supabase.from("stage_instances").update({ status: "completed", exited_at: now }).eq("id", stage.id);
  await writeAudit(supabase, ctx.tenantId, "activity.completed", "activity_instance", activityInstanceId);

  await advance(supabase, ctx.tenantId, cycle.workflow_version_id, cycle.id, stage.node_id, undefined, stage.branch_instance_id);

  revalidatePath("/sinistros");
  revalidatePath(`/sinistros/${cycle.claim_id}`);
}

export async function chooseDecision(decisionId: string, selectedOption: string, justification: string): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();

  const { data: decision, error: dErr } = await supabase
    .from("decisions")
    .select("id, claim_cycle_id, node_id, stage_instance_id, selected_option")
    .eq("id", decisionId)
    .single();
  if (dErr || !decision) throw new Error("Decisão não encontrada.");
  if (decision.selected_option) return;
  if (!decision.node_id) throw new Error("Decisão sem elemento de origem.");

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
  if (cycle.status === "completed" || cycle.status === "blocked") {
    throw new Error(`Este ciclo não pode mais avançar (status atual: ${cycle.status}).`);
  }

  const now = new Date().toISOString();
  await supabase
    .from("decisions")
    .update({ selected_option: selectedOption, decided_by: ctx.userId, decided_at: now, justification: justification || null })
    .eq("id", decisionId);
  if (decision.stage_instance_id) {
    await supabase.from("stage_instances").update({ status: "completed", exited_at: now }).eq("id", decision.stage_instance_id);
  }
  await writeAudit(supabase, ctx.tenantId, "decision.made", "decision", decisionId, { next: { selected_option: selectedOption } });

  await advance(supabase, ctx.tenantId, cycle.workflow_version_id, cycle.id, decision.node_id, selectedOption, branchInstanceId);

  revalidatePath("/sinistros");
  revalidatePath(`/sinistros/${cycle.claim_id}`);
}
