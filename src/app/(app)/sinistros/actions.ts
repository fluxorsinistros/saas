"use server";

import { lengthError, valueError, VALUE_FIELD_TYPES } from "@/lib/field-rules";
import { publicDbMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { assertCountLimit } from "@/lib/limits";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { isTenantAdmin, requireGroupAccess, requirePermission } from "@/lib/permissions";
import { UNDO_WINDOW_MINUTES } from "@/lib/undo";
import { isActionAllowedForMember } from "@/lib/group-actions";
import { addBusinessMinutes } from "@/lib/sla";
import { loadGraph } from "@/lib/workflow/load-graph";
import { resolveTransition, startNode } from "@/lib/workflow/engine";
import { MULTI_SEPARATOR, splitFieldValues, type Graph, type GraphNode } from "@/lib/workflow/types";
import type { Database, Json } from "@/lib/supabase/database.types";
import { groupRefError } from "@/lib/group-ref";

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
    // para eventos de plataforma (Documento 5 §11), checado por app.is_platform_admin() no banco.
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
// tela de configuração de tipos existir, isto deixa de ser necessário, os dados já ficam corretos.
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

// Subgrupo responsável pela etapa: o fixo escolhido no fluxo, o escolhido em um campo do sinistro, ou nenhum (todo o grupo).
// Sem um valor válido a etapa não abre (o sinistro fica bloqueado com o motivo), em vez de abrir para o grupo inteiro.
async function resolveStageSubgroup(
  supabase: Supa,
  cycleId: string,
  node: { name: string; groupId: string | null; config: { subgroup_mode?: string; subgroup_id?: string; subgroup_field_key?: string } },
): Promise<{ subgroupId: string | null } | { error: string }> {
  const mode = node.config.subgroup_mode;
  if (!node.groupId || !mode || mode === "all") return { subgroupId: null };
  let subgroupId: string | null = null;
  if (mode === "fixed") {
    subgroupId = node.config.subgroup_id ?? null;
  } else {
    const key = node.config.subgroup_field_key;
    const { data: cycle } = await supabase.from("claim_cycles").select("claim_id").eq("id", cycleId).maybeSingle();
    const { data: claim } = cycle ? await supabase.from("claims").select("custom_fields").eq("id", cycle.claim_id).maybeSingle() : { data: null };
    const value = key ? ((claim?.custom_fields ?? {}) as Record<string, string>)[key] : undefined;
    if (!value) return { error: `O campo que define o subgrupo da etapa "${node.name}" está sem valor.` };
    subgroupId = value;
  }
  if (!subgroupId) return { error: `O subgrupo da etapa "${node.name}" não foi definido.` };
  const { data: sub } = await supabase.from("group_subgroups").select("id").eq("id", subgroupId).eq("group_id", node.groupId).maybeSingle();
  if (!sub) return { error: `O subgrupo escolhido não pertence ao grupo da etapa "${node.name}".` };
  return { subgroupId };
}

// Lista com várias opções chega no formulário como várias entradas de mesmo nome; o valor guardado é "a|b"
function multiValue(formData: FormData, formKey: string): string {
  return formData
    .getAll(formKey)
    .map((v) => String(v).trim())
    .filter(Boolean)
    .join(MULTI_SEPARATOR);
}

// Confere o campo pelo qual uma etapa (ou o Início) escolhe o caminho: tem valor, o valor é do campo e cada opção tem saída.
// Devolve a mensagem para o usuário, ou null se está tudo certo.
async function routeError(supabase: Supa, workflowId: string, claimFields: Record<string, string>, graph: Graph, node: GraphNode): Promise<string | null> {
  const key = node.config.route_field_key;
  if (!key) return null;
  const { data: def } = await supabase.from("workflow_fields").select("label, options, multiple").eq("workflow_id", workflowId).eq("key", key).maybeSingle();
  if (!def) return `O campo que decide o caminho de "${node.name}" não existe mais.`;
  const values = splitFieldValues(claimFields[key]);
  if (values.length === 0) return `Escolha "${def.label}" antes de concluir: é ele que decide o próximo passo.`;
  if (!def.multiple && values.length > 1) return `"${def.label}" aceita só uma opção.`;
  const options = (def.options as string[] | null) ?? [];
  const outs = graph.edges.filter((e) => e.source === node.id);
  for (const value of values) {
    if (!options.includes(value)) return `"${value}" não é uma opção de "${def.label}".`;
    if (!outs.some((e) => e.label === value)) return `A opção "${value}" de "${def.label}" não tem caminho configurado em "${node.name}".`;
  }
  return null;
}

// Várias opções escolhidas = caminhos simultâneos: abre um evento de bifurcação (modo "exclusive": só as escolhidas seguem) com
// um ramo por destino. Um Fim em cada ramo conclui o ramo; o sinistro só conclui quando todos os ramos terminarem.
async function openRouteBranches(supabase: Supa, tenantId: string, cycleId: string, versionId: string, graph: Graph, fromNodeId: string, targetIds: string[], parentBranchInstanceId: string | null) {
  if (parentBranchInstanceId) {
    const { data: parent } = await supabase.from("branch_instances").select("branches(branch_mode)").eq("id", parentBranchInstanceId).maybeSingle();
    if ((parent?.branches as { branch_mode?: string } | null)?.branch_mode === "parallel") {
      await supabase.from("claim_cycles").update({ status: "blocked" }).eq("id", cycleId);
      await writeAudit(supabase, tenantId, "cycle.blocked", "claim_cycle", cycleId, {
        reason: "Escolher mais de um caminho dentro de um ramo de Paralelo ainda não é suportado pela execução.",
      });
      return;
    }
  }
  const { data: branch, error } = await supabase
    .from("branches")
    .insert({ tenant_id: tenantId, claim_cycle_id: cycleId, source_node_id: fromNodeId, branch_mode: "exclusive" })
    .select("id")
    .single();
  if (error || !branch) throw new Error(error?.message ?? "Falha ao abrir os caminhos.");
  await writeAudit(supabase, tenantId, "branch.opened", "branch", branch.id, { next: { ramos: targetIds.length, por_campo: true } });
  for (const targetId of targetIds) {
    const edge = graph.edges.find((e) => e.source === fromNodeId && e.target === targetId);
    const { data: bi, error: biErr } = await supabase
      .from("branch_instances")
      .insert({ tenant_id: tenantId, branch_id: branch.id, target_node_id: targetId, edge_id: edge?.id ?? null, is_required: true, status: "active" })
      .select("id")
      .single();
    if (biErr || !bi) throw new Error(biErr?.message ?? "Falha ao abrir um caminho.");
    await enterNode(supabase, tenantId, cycleId, versionId, graph, targetId, "advance", bi.id);
  }
}

// Cria a stage_instance (e a activity/decision/paralelo/convergência correspondente) para um nó,
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

  // Início não é uma etapa de verdade, é só o gate de campos da formalização (já coletados e
  // validados antes de chegar aqui, ver formalizeClaim). Não vira stage_instance; passa direto pra
  // etapa real conectada a ele.
  if (node.type === "start" && node.config.route_field_key) {
    // O Início escolhe o caminho pelo campo preenchido na abertura (ex.: tipo de sinistro)
    await advance(supabase, tenantId, versionId, cycleId, nodeId, undefined, branchInstanceId);
    return;
  }
  if (node.type === "start") {
    const edge = graph.edges.find((e) => e.source === nodeId);
    if (!edge) {
      await supabase.from("claim_cycles").update({ status: "blocked" }).eq("id", cycleId);
      await writeAudit(supabase, tenantId, "cycle.blocked", "claim_cycle", cycleId, { reason: `"${node.name}" (Início) sem saída.` });
      return;
    }
    await enterNode(supabase, tenantId, cycleId, versionId, graph, edge.target, entryReason, branchInstanceId);
    return;
  }

  if (node.type === "parallel_split" && branchInstanceId) {
    // Paralelo dentro de outro Paralelo: o ramo externo nunca fecharia certo (só fecha ao chegar
    // numa Convergência), então bloqueia com motivo em vez de deixar o ciclo com um ramo pendurado.
    await supabase.from("claim_cycles").update({ status: "blocked" }).eq("id", cycleId);
    await writeAudit(supabase, tenantId, "cycle.blocked", "claim_cycle", cycleId, {
      reason: `"${node.name}" é um Paralelo dentro de outro Paralelo, ainda não suportado pela execução.`,
    });
    return;
  }

  let responsibleSubgroupId: string | null = null;
  if (node.type === "stage" || node.type === "wait" || node.type === "pending" || node.type === "decision") {
    const sub = await resolveStageSubgroup(supabase, cycleId, node);
    if ("error" in sub) {
      await supabase.from("claim_cycles").update({ status: "blocked" }).eq("id", cycleId);
      await writeAudit(supabase, tenantId, "cycle.blocked", "claim_cycle", cycleId, { reason: sub.error });
      return;
    }
    responsibleSubgroupId = sub.subgroupId;
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
      .filter((e) => e.source === nodeId && !e.onLimit)
      .map((e) => e.label)
      .filter(Boolean);
    await supabase.from("decisions").insert({
      tenant_id: tenantId,
      claim_cycle_id: cycleId,
      stage_instance_id: stage.id,
      node_id: nodeId,
      question: node.name,
      options: options as unknown as Json,
      subgroup_id: responsibleSubgroupId,
    });
    await startSlaTracking(supabase, tenantId, cycleId, versionId, nodeId, stage.id);
    return;
  }

  if (node.type === "end") {
    if (branchInstanceId) await supabase.from("branch_instances").update({ status: "completed" }).eq("id", branchInstanceId);
    // Com caminhos simultâneos, o sinistro só conclui quando o último deles chega ao Fim
    const { count: stillOpen } = await supabase
      .from("stage_instances")
      .select("id", { count: "exact", head: true })
      .eq("claim_cycle_id", cycleId)
      .in("status", ["in_progress", "paused"])
      .neq("id", stage.id);
    if ((stillOpen ?? 0) === 0) {
      await supabase.from("claim_cycles").update({ status: "completed", completed_at: now }).eq("id", cycleId);
    }
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
    subgroup_id: responsibleSubgroupId,
    status: "in_progress",
    assigned_at: now,
    started_at: now,
  });

  await startSlaTracking(supabase, tenantId, cycleId, versionId, nodeId, stage.id);
  // A primeira etapa já é avisada pelo "sinistro aberto"; as seguintes (e as devoluções) avisam o grupo da etapa.
  if (entryReason !== "initial" && node.groupId) {
    await emitStageAssigned(supabase, tenantId, cycleId, stage.id, node.name, node.groupId, responsibleSubgroupId, entryReason);
  }
}

// Evento "etapa atribuída ao grupo" para a fila de e-mails. Falha aqui nunca atrapalha o avanço do sinistro.
async function emitStageAssigned(supabase: Supa, tenantId: string, cycleId: string, stageId: string, stageName: string, groupId: string, subgroupId: string | null, entryReason: string) {
  try {
    const [{ data: cycle }, { data: sla }] = await Promise.all([
      supabase.from("claim_cycles").select("claim_id, created_by").eq("id", cycleId).maybeSingle(),
      supabase.from("sla_tracking").select("target_at").eq("stage_instance_id", stageId).limit(1).maybeSingle(),
    ]);
    if (!cycle) return;
    const { data: claim } = await supabase.from("claims").select("claim_number").eq("id", cycle.claim_id).maybeSingle();
    const { error } = await supabase.from("notifications").insert({
      tenant_id: tenantId,
      event_type: "stage.assigned",
      claim_cycle_id: cycleId,
      dedupe_key: `stage.assigned:${stageId}`,
      payload: {
        claim_id: cycle.claim_id,
        claim_number: claim?.claim_number ?? "",
        stage_name: stageName,
        group_id: groupId,
        subgroup_id: subgroupId,
        entry_reason: entryReason,
        target_at: sla?.target_at ?? null,
        requested_by: cycle.created_by,
      } as unknown as Json,
    });
    if (error) console.error("evento de etapa não gravado:", error.message);
  } catch (e) {
    console.error("evento de etapa não gravado:", e);
  }
}

// Cria o relógio de SLA (Documento 4 §1-§2) se a versão publicada tiver uma regra para este nó.
// Sem calendário configurável ainda nesta fatia, corrido 24/7, comportamento explícito do §3 quando
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
// 'completed' normalmente, o descumprimento já ocorrido continua sendo dado histórico, nunca apagado.
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
// já concluídas dos outros ramos permanecem concluídas, nunca desfaz progresso de um ramo.
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
      reason: `"${node.name}" (Convergência) foi alcançada fora de um Paralelo, o fluxo publicado é inválido.`,
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

  if (!released) return; // fica "waiting", a chegada do próximo ramo reavalia de novo

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

  const { data: passRows } = await supabase
    .from("stage_instances")
    .select("node_id")
    .eq("claim_cycle_id", cycleId)
    .neq("status", "cancelled");
  const loopPassCounts: Record<string, number> = {};
  for (const row of passRows ?? []) loopPassCounts[row.node_id] = (loopPassCounts[row.node_id] ?? 0) + 1;

  let routeValues: string[] | undefined;
  const routeKey = graph.nodes.find((n) => n.id === fromNodeId)?.config.route_field_key;
  if (routeKey) {
    const { data: cy } = await supabase.from("claim_cycles").select("claim_id").eq("id", cycleId).maybeSingle();
    const { data: cl } = cy ? await supabase.from("claims").select("custom_fields").eq("id", cy.claim_id).maybeSingle() : { data: null };
    routeValues = splitFieldValues(((cl?.custom_fields ?? {}) as Record<string, string>)[routeKey]);
  }

  const result = resolveTransition(graph, fromNodeId, { selectedOption, routeValues, loopPassCounts, loopMax });

  if (result.kind === "unsupported") {
    await supabase.from("claim_cycles").update({ status: "blocked" }).eq("id", cycleId);
    // Bloqueio por limite de repetições: guarda de onde veio e para onde ia, para um Administrador poder autorizar e continuar
    await writeAudit(supabase, tenantId, "cycle.blocked", "claim_cycle", cycleId, {
      reason: result.reason,
      next: result.limit ? { limit: true, from: fromNodeId, targets: result.blockedTargets ?? [], branchInstanceId } : undefined,
    });
    return;
  }
  if (result.kind === "end") return;
  if (result.targets.length > 1) {
    await openRouteBranches(supabase, tenantId, cycleId, versionId, graph, fromNodeId, result.targets, branchInstanceId);
    return;
  }
  for (const targetId of result.targets) {
    await enterNode(supabase, tenantId, cycleId, versionId, graph, targetId, "advance", branchInstanceId);
  }
}

export type FormalizeClaimInput = {
  workflowName: string;
  occurredAt?: string;
  location?: string;
  externalReference?: string;
  // Valores dos campos do Início já na criação: o subgrupo da primeira etapa pode depender de um deles
  customFields?: Record<string, string>;
};

// Detecção de duplicidade (Documento 2 §28): roda UMA VEZ, na primeira entrada do sinistro, nunca um
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

  // Candidatos a duplicidade vêm do banco, que compara com todos os sinistros da empresa, não só com os que a pessoa enxerga
  const { data: found } = await supabase.rpc("find_duplicate_claim_candidates", {
    p_tenant_id: tenantId,
    p_claim_id: claimId,
    p_category_id: claimCategoryId,
    p_external_reference: input.externalReference || undefined,
    p_day: input.occurredAt ? input.occurredAt.slice(0, 10) : undefined,
  });
  for (const m of found ?? []) {
    if (m.kind === "external_reference") {
      candidates.push({ claimId: m.candidate_claim_id, confidence: 0.95, matchedFields: ["external_reference"] });
    } else if (!candidates.some((x) => x.claimId === m.candidate_claim_id)) {
      const sameLocation = input.location && (m.location as { text?: string } | null)?.text?.toLowerCase().trim() === input.location.toLowerCase().trim();
      candidates.push({ claimId: m.candidate_claim_id, confidence: sameLocation ? 0.8 : 0.5, matchedFields: ["claim_category_id", "occurred_at", ...(sameLocation ? ["location"] : [])] });
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

// Evento "sinistro aberto" para a fila de e-mails (regras da empresa decidem quem recebe). Guarda o grupo da primeira etapa,
// quem formalizou e o nome do fluxo. Falha aqui nunca impede a abertura do sinistro.
async function emitClaimOpened(supabase: Supa, tenantId: string, userId: string, claimId: string, claimNumber: string, cycleId: string, workflowName: string) {
  try {
    const { data: stage } = await supabase
      .from("stage_instances")
      .select("id, node_id")
      .eq("claim_cycle_id", cycleId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    let groupId: string | null = null;
    let subgroupId: string | null = null;
    let stageName: string | null = null;
    if (stage) {
      const [{ data: act }, { data: node }] = await Promise.all([
        supabase.from("activity_instances").select("group_id, subgroup_id").eq("stage_instance_id", stage.id).limit(1).maybeSingle(),
        supabase.from("workflow_nodes").select("name").eq("id", stage.node_id).maybeSingle(),
      ]);
      groupId = act?.group_id ?? null;
      subgroupId = act?.subgroup_id ?? null;
      stageName = node?.name ?? null;
    }
    const { error } = await supabase.from("notifications").insert({
      tenant_id: tenantId,
      event_type: "claim.opened",
      claim_cycle_id: cycleId,
      dedupe_key: `claim.opened:${cycleId}`,
      payload: { claim_id: claimId, claim_number: claimNumber, workflow_name: workflowName, stage_name: stageName, group_id: groupId, subgroup_id: subgroupId, requested_by: userId } as unknown as Json,
    });
    if (error) console.error("evento de abertura não gravado:", error.message);
  } catch (e) {
    console.error("evento de abertura não gravado:", e);
  }
}

// Rotina única de criação de sinistro (Documento 5 §29: a importação em massa "usa as mesmas regras
// de criação manual", não existe caminho de escrita paralelo para `claims`). formalizeClaim (form da
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
    // O número vem do banco, que enxerga todos os sinistros da empresa (quem abre pode ver só os seus)
    const { data: claimNumber, error: numberError } = await supabase.rpc("next_claim_number", { p_tenant_id: tenantId, p_year: year, p_attempt: attempt });
    if (numberError || !claimNumber) throw new Error("Não foi possível gerar o número do sinistro. Tente de novo.");
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
        custom_fields: (input.customFields ?? {}) as unknown as Json,
        created_by: userId,
      })
      .select("id, claim_number")
      .single();
    if (!error) claim = data;
    else if (error.code !== "23505") throw new Error(publicDbMessage(error));
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
    .select("id, cycle_number")
    .single();
  if (cycleErr || !cycle) throw new Error(cycleErr?.message ?? "Falha ao abrir o ciclo.");

  await supabase.from("cycle_configuration_snapshots").insert({
    tenant_id: tenantId,
    claim_cycle_id: cycle.id,
    workflow_version_id: version.id,
    snapshot: graph as unknown as Json,
  });

  await writeAudit(supabase, tenantId, "claim.created", "claim", claim.id, {
    next: { claim_number: claim.claim_number },
  });
  await writeAudit(supabase, tenantId, "cycle.created", "claim_cycle", cycle.id, {
    next: { cycle_number: cycle.cycle_number, workflow_name: workflowName },
  });
  await enterNode(supabase, tenantId, cycle.id, version.id, graph, start.id, "initial");
  await emitClaimOpened(supabase, tenantId, userId, claim.id, claim.claim_number, cycle.id, workflowName);

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

  // Campos do elemento Início (Documento 1): validados ANTES de criar qualquer coisa, pra não
  // deixar um sinistro pela metade se faltar um campo obrigatório. Início não é etapa de verdade
  // (enterNode passa direto por ele), os campos são só da formalização em si.
  const { data: publishedVersion } = await supabase
    .from("workflow_versions")
    .select("id")
    .eq("workflow_id", workflowId)
    .eq("status", "published")
    .maybeSingle();
  const startFieldKeys: string[] = [];
  if (publishedVersion) {
    const graph = await loadGraph(supabase, publishedVersion.id);
    const startNode = graph.nodes.find((n) => n.type === "start");
    if (startNode) startFieldKeys.push(...(startNode.config.field_keys ?? []));
  }

  const { data: fieldDefs } = startFieldKeys.length
    ? await supabase
        .from("workflow_fields")
        .select("key, label, field_type, required, is_unique, min_length, max_length, min_value, max_value, ref_group_id, multiple")
        .eq("workflow_id", workflowId)
        .in("key", startFieldKeys)
    : { data: [] as { key: string; label: string; field_type: string; required: boolean; is_unique: boolean; min_length: number | null; max_length: number | null; min_value: number | null; max_value: number | null; ref_group_id: string | null; multiple: boolean }[] };
  const defByKey = new Map((fieldDefs ?? []).map((f) => [f.key, f]));

  const patch: Record<string, string> = {};
  const attachments: { key: string; file: File }[] = [];
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("field_")) continue;
    const key = k.slice("field_".length);
    const def = defByKey.get(key);
    if (!def || def.field_type === "calculated") continue; // calculado nunca é gravado: vem da fórmula
    if (def.field_type === "attachment") {
      if (v instanceof File && v.size > 0) attachments.push({ key, file: v });
      continue;
    }
    const value = def.multiple ? multiValue(formData, k) : VALUE_FIELD_TYPES.includes(def.field_type) ? String(v).trim().replace(",", ".") : String(v);
    if (value !== "") patch[key] = value;
  }

  for (const def of fieldDefs ?? []) {
    if (def.field_type === "calculated") continue;
    const hasValue = def.field_type === "attachment" ? attachments.some((a) => a.key === def.key) : !!patch[def.key];
    if (def.required && !hasValue) throw new Error(`O campo "${def.label}" é obrigatório.`);
  }
  for (const def of fieldDefs ?? []) {
    const err = patch[def.key] ? (lengthError(def, patch[def.key]) ?? valueError(def, patch[def.key])) : null;
    if (err) throw new Error(err);
  }
  const refErr = await groupRefError(supabase, ctx.tenantId, fieldDefs ?? [], patch);
  if (refErr) throw new Error(refErr);
  if (publishedVersion) {
    const startGraph = await loadGraph(supabase, publishedVersion.id);
    const startNodeRow = startGraph.nodes.find((n) => n.type === "start");
    if (startNodeRow?.config.route_field_key) {
      const problem = await routeError(supabase, workflowId, patch, startGraph, startNodeRow);
      if (problem) throw new Error(problem);
    }
  }
  for (const def of fieldDefs ?? []) {
    if (!def.is_unique || !patch[def.key]) continue;
    const { data: dupe } = await supabase.rpc("claim_field_value_in_use", { p_tenant_id: ctx.tenantId, p_key: def.key, p_value: patch[def.key] });
    if (dupe) throw new Error(`O valor informado em "${def.label}" já está em uso em outro sinistro.`);
  }

  const { claimId } = await createClaimAndCycle(supabase, ctx.tenantId, ctx.userId, {
    workflowName: workflow.name,
    externalReference: String(formData.get("external_reference") ?? "").trim() || undefined,
    customFields: { ...patch },
  });

  for (const { key, file } of attachments) {
    const path = `${ctx.tenantId}/custom-fields/${claimId}/${key}-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type });
    if (!upErr) patch[key] = path;
  }
  if (Object.keys(patch).length) {
    await supabase.from("claims").update({ custom_fields: patch }).eq("id", claimId);
  }

  revalidatePath("/sinistros");
  redirect(`/sinistros/${claimId}`);
}

// Versão para o formulário da etapa: devolve a mensagem de erro em vez de lançar, que em produção vira um erro genérico
// ("Minified React error") e derruba a tela. As mensagens lançadas por completeActivity são todas escritas para o usuário.
export async function completeActivityWithState(activityInstanceId: string, _prev: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  try {
    await completeActivity(activityInstanceId, formData);
    return { error: null };
  } catch (e) {
    const digest = (e as { digest?: string } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e; // redirecionamentos e "não encontrado" seguem o caminho normal
    return { error: e instanceof Error && e.message ? e.message : "Não foi possível concluir a etapa. Tente de novo." };
  }
}

export async function completeActivity(activityInstanceId: string, formData?: FormData): Promise<void> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "claim.execute");
  const supabase = await createClient();

  const { data: activity, error: aErr } = await supabase
    .from("activity_instances")
    .select("id, status, stage_instance_id, group_id, subgroup_id")
    .eq("id", activityInstanceId)
    .single();
  if (aErr || !activity) throw new Error("Atividade não encontrada.");
  if (activity.status === "completed") return;
  await requireGroupAccess(ctx, activity.group_id, activity.subgroup_id);

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
  // sinistro, nunca sobrescrevem o que outra etapa já preencheu, só somam (merge raso). Anexo é
  // tratado à parte: o valor vira o caminho do arquivo no Storage, não o texto bruto. Obrigatório
  // e duplicidade são validados aqui, não só escondendo/marcando o input (Documento 1 §56).
  const { data: nodeRow } = await supabase.from("workflow_nodes").select("config").eq("id", stage.node_id).single();
  const stageFieldKeys = ((nodeRow?.config as { field_keys?: string[] } | null)?.field_keys ?? []) as string[];
  // Campos desta etapa que são só consulta: o servidor ignora qualquer valor enviado para eles e não os exige.
  const readonlyKeys = new Set(((nodeRow?.config as { readonly_field_keys?: string[] } | null)?.readonly_field_keys ?? []) as string[]);
  if (stageFieldKeys.length) {
    const { data: versionRow } = await supabase
      .from("workflow_versions")
      .select("workflow_id")
      .eq("id", cycle.workflow_version_id)
      .single();
    const { data: fieldDefs } = versionRow
      ? await supabase
          .from("workflow_fields")
          .select("key, label, field_type, required, is_unique, min_length, max_length, min_value, max_value, ref_group_id, multiple")
          .eq("workflow_id", versionRow.workflow_id)
          .in("key", stageFieldKeys)
      : { data: [] as { key: string; label: string; field_type: string; required: boolean; is_unique: boolean; min_length: number | null; max_length: number | null; min_value: number | null; max_value: number | null; ref_group_id: string | null; multiple: boolean }[] };
    const defByKey = new Map((fieldDefs ?? []).map((f) => [f.key, f]));

    const fieldEntries = [...(formData?.entries() ?? [])].filter(([k]) => k.startsWith("field_"));
    const patch: Record<string, string> = {};
    for (const [k, v] of fieldEntries) {
      const key = k.slice("field_".length);
      if (readonlyKeys.has(key) || defByKey.get(key)?.field_type === "calculated") continue;
      if (defByKey.get(key)?.field_type === "attachment") {
        if (!(v instanceof File) || v.size === 0) continue;
        const path = `${ctx.tenantId}/custom-fields/${cycle.claim_id}/${key}-${Date.now()}-${v.name}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, v, { contentType: v.type });
        if (!upErr) patch[key] = path;
        continue;
      }
      const value = defByKey.get(key)?.multiple
        ? multiValue(formData!, k)
        : VALUE_FIELD_TYPES.includes(defByKey.get(key)?.field_type ?? "")
          ? String(v).trim().replace(",", ".")
          : String(v);
      if (value !== "") patch[key] = value;
    }

    const { data: claimRow } = await supabase.from("claims").select("custom_fields").eq("id", cycle.claim_id).single();
    const current = (claimRow?.custom_fields ?? {}) as Record<string, string>;
    const merged = { ...current, ...patch };

    for (const def of fieldDefs ?? []) {
      if (readonlyKeys.has(def.key) || def.field_type === "calculated") continue;
      if (def.required && !merged[def.key]) throw new Error(`O campo "${def.label}" é obrigatório.`);
    }
    for (const def of fieldDefs ?? []) {
      const err = patch[def.key] ? (lengthError(def, patch[def.key]) ?? valueError(def, patch[def.key])) : null;
      if (err) throw new Error(err);
    }
    const refErr = await groupRefError(supabase, ctx.tenantId, fieldDefs ?? [], patch);
    if (refErr) throw new Error(refErr);
    for (const def of fieldDefs ?? []) {
      if (!def.is_unique || !patch[def.key]) continue;
      const { data: dupe } = await supabase.rpc("claim_field_value_in_use", { p_tenant_id: ctx.tenantId, p_key: def.key, p_value: patch[def.key], p_exclude_claim: cycle.claim_id });
      if (dupe) throw new Error(`O valor informado em "${def.label}" já está em uso em outro sinistro.`);
    }

    if (Object.keys(patch).length) {
      await supabase.from("claims").update({ custom_fields: merged }).eq("id", cycle.claim_id);
    }
  }

  const graph = await loadGraph(supabase, cycle.workflow_version_id);
  const node = graph.nodes.find((n) => n.id === stage.node_id);
  if (node?.config.route_field_key) {
    const { data: versionRow } = await supabase.from("workflow_versions").select("workflow_id").eq("id", cycle.workflow_version_id).single();
    const { data: claimNow } = await supabase.from("claims").select("custom_fields").eq("id", cycle.claim_id).single();
    const problem = versionRow ? await routeError(supabase, versionRow.workflow_id, (claimNow?.custom_fields ?? {}) as Record<string, string>, graph, node) : null;
    if (problem) throw new Error(problem);
  }

  const now = new Date().toISOString();
  await supabase
    .from("activity_instances")
    .update({ status: "completed", completed_at: now, completed_by: ctx.userId })
    .eq("id", activityInstanceId);
  await supabase.from("stage_instances").update({ status: "completed", exited_at: now }).eq("id", stage.id);
  await writeAudit(supabase, ctx.tenantId, "activity.completed", "activity_instance", activityInstanceId, {
    next: { node_name: node?.name, node_type: node?.type },
  });
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
    .select("id, claim_cycle_id, node_id, stage_instance_id, selected_option, question, subgroup_id")
    .eq("id", decisionId)
    .single();
  if (dErr || !decision) throw new Error("Decisão não encontrada.");
  if (decision.selected_option) return;
  if (!decision.node_id) throw new Error("Decisão sem elemento de origem.");

  const { data: decisionNode } = await supabase.from("workflow_nodes").select("group_id").eq("id", decision.node_id).single();
  await requireGroupAccess(ctx, decisionNode?.group_id ?? null, decision.subgroup_id);

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
  await writeAudit(supabase, ctx.tenantId, "decision.made", "decision", decisionId, {
    next: { selected_option: selectedOption, question: decision.question },
    reason: justification || undefined,
  });

  await advance(supabase, ctx.tenantId, cycle.workflow_version_id, cycle.id, decision.node_id, selectedOption, branchInstanceId);

  revalidatePath("/sinistros");
  revalidatePath(`/sinistros/${cycle.claim_id}`);
}

// Pausa não é um botão livre (Documento 4 §5, §68.7): exige motivo e tipo. Autorização por tipo de
// pausa fica fora desta fatia (o próprio Documento 4 §10 registra o catálogo de pause_type como
// decisão de implementação em aberto), hoje toda pausa é aceita sem exigir aprovação.
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

// Reabrir ciclo (Documento 3 §11, caso J): só um ciclo já `completed` pode ser reaberto, grava uma
// nova passagem (`entry_reason='reopen'`) sobre o mesmo claim_cycle_id, no último nó não-Fim por onde
// o ciclo passou, em vez de recomeçar do zero. Autorização granular por papel fica para quando
// `role_permissions` existir (gap conhecido), por ora exige motivo obrigatório e fica auditado.
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
// status='discarded' pra sempre (nunca é apagado, é histórico), e um novo claim_cycles nasce
// apontando pra ele via previous_cycle_id, sob a versão publicada ATUAL do fluxo (que pode ter
// mudado desde que o ciclo velho abriu, o velho já estava preso à versão dele, imutável).
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

  // O ciclo descartado não pode deixar trabalho aberto: etapas, decisões sem resposta, prazos e vias em andamento são encerrados
  const nowIso = new Date().toISOString();
  const { data: openStages } = await supabase.from("stage_instances").select("id").eq("claim_cycle_id", cycleId).in("status", ["in_progress", "paused"]);
  const openStageIds = (openStages ?? []).map((x) => x.id);
  if (openStageIds.length) {
    await supabase.from("activity_instances").update({ status: "cancelled" }).in("stage_instance_id", openStageIds).in("status", ["in_progress", "paused", "not_started"]);
    await supabase.from("decisions").delete().in("stage_instance_id", openStageIds).is("selected_option", null);
    await supabase.from("sla_tracking").delete().in("stage_instance_id", openStageIds);
    await supabase.from("stage_instances").update({ status: "cancelled", exited_at: nowIso }).in("id", openStageIds);
  }
  const { data: discardedBranches } = await supabase.from("branches").select("id").eq("claim_cycle_id", cycleId);
  const discardedBranchIds = (discardedBranches ?? []).map((x) => x.id);
  if (discardedBranchIds.length) {
    await supabase.from("branch_instances").update({ status: "cancelled" }).in("branch_id", discardedBranchIds).eq("status", "active");
  }

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
// processo pra outro nó, por isso não passa por enterNode/stage_instances, é só uma linha própria
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

// Desfaz a conclusão da ÚLTIMA etapa concluída (clique sem querer). Não apaga história: a etapa seguinte é marcada
// como cancelada (fica no histórico), a etapa desfeita volta a "em andamento" e tudo vai para a trilha de auditoria
// com o motivo. Recusa quando já há trabalho feito depois, ramos paralelos ou convergência, nesses casos o fluxo
// segue e a correção é por Reabrir ciclo / Descartar, que exigem motivo e permissão própria.
export async function undoActivityCompletion(activityInstanceId: string, formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "claim.execute");
  const supabase = await createClient();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("Informe o motivo para desfazer.");

  const { data: activity } = await supabase
    .from("activity_instances")
    .select("id, status, stage_instance_id, group_id, subgroup_id, completed_at, completed_by")
    .eq("id", activityInstanceId)
    .single();
  if (!activity) throw new Error("Atividade não encontrada.");
  if (activity.status !== "completed") throw new Error("Esta etapa não está concluída.");

  const admin = await isTenantAdmin(ctx.userId, ctx.tenantId);
  if (!admin) {
    const minutes = activity.completed_at ? (Date.now() - new Date(activity.completed_at).getTime()) / 60000 : Infinity;
    if (activity.completed_by !== ctx.userId) throw new Error("Só quem concluiu a etapa (ou um Administrador) pode desfazer.");
    if (minutes > UNDO_WINDOW_MINUTES) throw new Error(`O prazo de ${UNDO_WINDOW_MINUTES} minutos para desfazer já passou. Peça a um Administrador.`);
    await requireGroupAccess(ctx, activity.group_id, activity.subgroup_id);
  }

  const { data: stage } = await supabase
    .from("stage_instances")
    .select("id, node_id, claim_cycle_id, branch_instance_id, status, exited_at")
    .eq("id", activity.stage_instance_id)
    .single();
  if (!stage || stage.status !== "completed" || !stage.exited_at) throw new Error("Etapa não encontrada ou já reaberta.");
  if (stage.branch_instance_id) throw new Error("Esta etapa está num ramo paralelo e não pode ser desfeita por aqui.");

  const { data: cycle } = await supabase
    .from("claim_cycles")
    .select("id, claim_id, status, workflow_version_id")
    .eq("id", stage.claim_cycle_id)
    .single();
  if (!cycle) throw new Error("Ciclo não encontrado.");
  if (["blocked", "discarded", "cancelled", "archived"].includes(cycle.status)) {
    throw new Error(`Este ciclo não permite desfazer (status atual: ${cycle.status}).`);
  }

  // Etapas criadas logo depois da conclusão (as sucessoras), nenhuma pode ter trabalho concluído.
  const graph = await loadGraph(supabase, cycle.workflow_version_id);
  const { data: later } = await supabase
    .from("stage_instances")
    .select("id, node_id, status, entered_at, branch_instance_id")
    .eq("claim_cycle_id", cycle.id)
    .neq("id", stage.id)
    .neq("status", "cancelled")
    .gte("entered_at", stage.exited_at)
    .order("entered_at", { ascending: true });
  const successors = later ?? [];
  const laterIds = successors.map((x) => x.id);
  const { data: laterActs } = laterIds.length
    ? await supabase.from("activity_instances").select("stage_instance_id, status").in("stage_instance_id", laterIds)
    : { data: [] as { stage_instance_id: string; status: string }[] };
  const { data: laterDecisions } = laterIds.length
    ? await supabase.from("decisions").select("id, stage_instance_id, selected_option").in("stage_instance_id", laterIds)
    : { data: [] as { id: string; stage_instance_id: string | null; selected_option: string | null }[] };

  for (const sx of successors) {
    const type = graph.nodes.find((n) => n.id === sx.node_id)?.type;
    if (type === "parallel_split" || type === "join") {
      throw new Error("A etapa seguinte é um paralelo/convergência e não pode ser desfeita por aqui.");
    }
    if (type !== "end" && sx.status === "completed") {
      throw new Error("A etapa seguinte já foi concluída. Desfaça primeiro a mais recente.");
    }
    if ((laterActs ?? []).some((a) => a.stage_instance_id === sx.id && a.status === "completed")) {
      throw new Error("A etapa seguinte já foi concluída. Desfaça primeiro a mais recente.");
    }
  }
  if ((laterDecisions ?? []).some((d) => d.selected_option)) throw new Error("Uma decisão já foi tomada depois desta etapa. Desfaça primeiro a mais recente.");

  const now = new Date().toISOString();
  // 1) sucessoras: canceladas (ficam no histórico); o que era só derivado delas (decisão sem resposta, relógio de SLA) sai
  const hadEnd = successors.some((sx) => graph.nodes.find((n) => n.id === sx.node_id)?.type === "end");
  if (laterIds.length) {
    await supabase.from("activity_instances").update({ status: "cancelled" }).in("stage_instance_id", laterIds);
    await supabase.from("decisions").delete().in("stage_instance_id", laterIds).is("selected_option", null);
    await supabase.from("sla_tracking").delete().in("stage_instance_id", laterIds);
    await supabase.from("stage_instances").update({ status: "cancelled", exited_at: now }).in("id", laterIds);
    const laterBranchIds = [...new Set(successors.map((x) => x.branch_instance_id).filter((id): id is string => !!id))];
    if (laterBranchIds.length) await supabase.from("branch_instances").update({ status: "cancelled" }).in("id", laterBranchIds);
  }
  if (hadEnd || cycle.status === "completed") {
    await supabase.from("claim_cycles").update({ status: "in_progress", completed_at: null }).eq("id", cycle.id);
  }

  // 2) a etapa desfeita volta a andar; o relógio de SLA dela continua de onde estava (desfazer não zera prazo)
  await supabase.from("stage_instances").update({ status: "in_progress", exited_at: null }).eq("id", stage.id);
  await supabase
    .from("activity_instances")
    .update({ status: "in_progress", completed_at: null, completed_by: null })
    .eq("id", activity.id);
  await supabase.from("sla_tracking").update({ status: "on_track", completed_at: null }).eq("stage_instance_id", stage.id).eq("status", "completed");

  const node = graph.nodes.find((n) => n.id === stage.node_id);
  await writeAudit(supabase, ctx.tenantId, "activity.completion_undone", "activity_instance", activity.id, {
    reason,
    previous: { completed_at: activity.completed_at, completed_by: activity.completed_by },
    next: { node_name: node?.name, cancelled_stages: laterIds.length, by_admin: admin },
  });

  revalidatePath(`/sinistros/${cycle.claim_id}`);
  revalidatePath("/sinistros");
  revalidatePath("/tarefas");
}

// Versão para o formulário da via: devolve a mensagem de erro em vez de lançar (em produção o erro lançado vira uma mensagem genérica).
export async function abortBranchWithState(branchInstanceId: string, _prev: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  try {
    await abortBranch(branchInstanceId, formData);
    return { error: null };
  } catch (e) {
    const digest = (e as { digest?: string } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e;
    return { error: e instanceof Error && e.message ? e.message : "Não foi possível abortar a via. Tente de novo." };
  }
}

// Aborta uma via (caminho simultâneo) no meio do caminho, com motivo: as etapas dela que estavam em andamento são canceladas
// (ficam no histórico), a via vira "dispensada com justificativa" e as outras vias seguem. Se não sobrar nada em andamento, o
// sinistro conclui. Quem pode: Administrador ou quem faz parte do grupo de uma das etapas em andamento da via.
export async function abortBranch(branchInstanceId: string, formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "claim.execute");
  const supabase = await createClient();

  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) throw new Error("Explique o motivo para abortar esta via.");

  const { data: bi } = await supabase.from("branch_instances").select("id, status, branch_id").eq("id", branchInstanceId).single();
  if (!bi) throw new Error("Via não encontrada.");
  if (bi.status !== "active") throw new Error("Esta via já terminou ou foi abortada.");
  const { data: branch } = await supabase.from("branches").select("claim_cycle_id").eq("id", bi.branch_id).single();
  if (!branch) throw new Error("Via sem sinistro.");
  const { data: cycle } = await supabase.from("claim_cycles").select("id, claim_id, status, workflow_version_id").eq("id", branch.claim_cycle_id).single();
  if (!cycle) throw new Error("Ciclo não encontrado.");
  if (["completed", "discarded", "cancelled", "archived"].includes(cycle.status)) {
    throw new Error(`Este ciclo não permite abortar a via (status atual: ${cycle.status}).`);
  }

  const { data: open } = await supabase
    .from("stage_instances")
    .select("id, node_id")
    .eq("branch_instance_id", bi.id)
    .in("status", ["in_progress", "paused"]);
  const stageIds = (open ?? []).map((s) => s.id);

  if (!(await isTenantAdmin(ctx.userId, ctx.tenantId))) {
    const [{ data: acts }, { data: decs }] = await Promise.all([
      stageIds.length ? supabase.from("activity_instances").select("group_id, subgroup_id").in("stage_instance_id", stageIds) : { data: [] as { group_id: string | null; subgroup_id: string | null }[] },
      stageIds.length ? supabase.from("decisions").select("node_id, subgroup_id").in("stage_instance_id", stageIds).is("selected_option", null) : { data: [] as { node_id: string | null; subgroup_id: string | null }[] },
    ]);
    const nodeIds = (decs ?? []).map((d) => d.node_id).filter((id): id is string => !!id);
    const { data: decNodes } = nodeIds.length ? await supabase.from("workflow_nodes").select("id, group_id").in("id", nodeIds) : { data: [] as { id: string; group_id: string | null }[] };
    const candidates = [
      ...(acts ?? []).map((a) => ({ group: a.group_id, sub: a.subgroup_id })),
      ...(decs ?? []).map((d) => ({ group: decNodes?.find((n) => n.id === d.node_id)?.group_id ?? null, sub: d.subgroup_id })),
    ];
    let allowed = false;
    for (const c of candidates) {
      try {
        await requireGroupAccess(ctx, c.group, c.sub);
        allowed = true;
        break;
      } catch {
        // tenta o próximo grupo desta via
      }
    }
    if (!allowed) throw new Error("Só um Administrador ou quem faz parte de uma etapa em andamento desta via pode abortá-la.");
  }

  const now = new Date().toISOString();
  if (stageIds.length) {
    await supabase.from("activity_instances").update({ status: "cancelled" }).in("stage_instance_id", stageIds).in("status", ["in_progress", "paused", "not_started"]);
    await supabase.from("decisions").delete().in("stage_instance_id", stageIds).is("selected_option", null);
    await supabase.from("sla_tracking").delete().in("stage_instance_id", stageIds);
    await supabase.from("stage_instances").update({ status: "cancelled", exited_at: now }).in("id", stageIds);
  }
  await supabase.from("branch_instances").update({ status: "waived", waived_reason: reason, waived_by: ctx.userId, waived_at: now }).eq("id", bi.id);

  const graph = await loadGraph(supabase, cycle.workflow_version_id);
  await writeAudit(supabase, ctx.tenantId, "branch.aborted", "branch_instance", bi.id, {
    next: { stages: (open ?? []).map((s) => graph.nodes.find((n) => n.id === s.node_id)?.name ?? s.node_id) },
    reason,
  });

  // Nada mais em andamento: o sinistro conclui
  const { count: stillOpen } = await supabase
    .from("stage_instances")
    .select("id", { count: "exact", head: true })
    .eq("claim_cycle_id", cycle.id)
    .in("status", ["in_progress", "paused"]);
  if ((stillOpen ?? 0) === 0) {
    // Só conclui de verdade se alguma via chegou ao Fim. Se todas foram abortadas, o sinistro fica cancelado, nunca "concluído".
    const endNodeIds = graph.nodes.filter((n) => n.type === "end").map((n) => n.id);
    const { count: reachedEnd } = endNodeIds.length
      ? await supabase.from("stage_instances").select("id", { count: "exact", head: true }).eq("claim_cycle_id", cycle.id).in("node_id", endNodeIds).eq("status", "completed")
      : { count: 0 };
    if ((reachedEnd ?? 0) > 0) {
      await supabase.from("claim_cycles").update({ status: "completed", completed_at: now }).eq("id", cycle.id);
    } else {
      await supabase.from("claim_cycles").update({ status: "cancelled" }).eq("id", cycle.id);
      await writeAudit(supabase, ctx.tenantId, "cycle.cancelled", "claim_cycle", cycle.id, { reason: "Todas as vias foram abortadas e nenhuma chegou ao fim." });
    }
  }

  revalidatePath("/sinistros");
  revalidatePath(`/sinistros/${cycle.claim_id}`);
  revalidatePath("/tarefas");
}

export async function authorizeBlockedCycleWithState(cycleId: string, _prev: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  try {
    await authorizeBlockedCycle(cycleId, formData);
    return { error: null };
  } catch (e) {
    const digest = (e as { digest?: string } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e;
    return { error: e instanceof Error && e.message ? e.message : "Não foi possível autorizar. Tente de novo." };
  }
}

// Sinistro bloqueado porque a próxima etapa bateu no limite de repetições: um Administrador autoriza mais uma passagem, com motivo.
// O sinistro volta a andar entrando na etapa que estava barrada.
export async function authorizeBlockedCycle(cycleId: string, formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "claim.execute");
  if (!(await isTenantAdmin(ctx.userId, ctx.tenantId))) throw new Error("Só um Administrador autoriza a continuação de um sinistro bloqueado.");
  const supabase = await createClient();

  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) throw new Error("Explique o motivo da autorização.");

  const { data: cycle } = await supabase.from("claim_cycles").select("id, claim_id, status, workflow_version_id").eq("id", cycleId).single();
  if (!cycle) throw new Error("Ciclo não encontrado.");
  if (cycle.status !== "blocked") throw new Error("Este ciclo não está bloqueado.");

  const { data: log } = await supabase
    .from("audit_logs")
    .select("new_value")
    .eq("entity_id", cycle.id)
    .eq("action", "cycle.blocked")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ctxBlock = (log?.new_value ?? null) as { limit?: boolean; from?: string; targets?: string[]; branchInstanceId?: string | null } | null;
  if (!ctxBlock?.limit || !ctxBlock.targets?.length || !ctxBlock.from) {
    throw new Error("Este bloqueio não é de limite de repetições e não pode ser autorizado por aqui. Descarte o ciclo ou aborte a via.");
  }

  const graph = await loadGraph(supabase, cycle.workflow_version_id);
  await supabase.from("claim_cycles").update({ status: "open" }).eq("id", cycle.id);
  await writeAudit(supabase, ctx.tenantId, "cycle.authorized", "claim_cycle", cycle.id, { reason, next: { targets: ctxBlock.targets } });
  if (ctxBlock.targets.length > 1) {
    await openRouteBranches(supabase, ctx.tenantId, cycle.id, cycle.workflow_version_id, graph, ctxBlock.from, ctxBlock.targets, ctxBlock.branchInstanceId ?? null);
  } else {
    await enterNode(supabase, ctx.tenantId, cycle.id, cycle.workflow_version_id, graph, ctxBlock.targets[0], "authorized", ctxBlock.branchInstanceId ?? null);
  }

  revalidatePath("/sinistros");
  revalidatePath(`/sinistros/${cycle.claim_id}`);
  revalidatePath("/tarefas");
}
