import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Supa = SupabaseClient<Database>;

const NO_GROUP = "00000000-0000-0000-0000-000000000000";

// Quantas linhas a página Tarefas mostra para esta pessoa: etapas para executar, documentos para enviar e documentos para dar
// o OK. As mesmas regras da página (Administrador vê a empresa toda; Operador só o grupo em que atua), para o número do
// balão do menu nunca divergir da lista. Cada tipo novo de tarefa que entrar em Tarefas deve ser somado aqui.
export async function loadTaskCount(supabase: Supa, tenantId: string, userId: string, isAdmin: boolean, activeGroupId: string | null, activeSubgroupId: string | null = null): Promise<number> {
  let stagesQuery = supabase
    .from("activity_instances")
    .select("id, stage_instances!inner(claim_cycles!inner(status))", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("status", ["not_started", "in_progress"])
    .not("stage_instances.claim_cycles.status", "in", "(blocked,completed,discarded,cancelled,archived)");
  if (!isAdmin) {
    stagesQuery = stagesQuery.eq("group_id", activeGroupId ?? NO_GROUP);
    // etapa de um subgrupo só conta para quem está nele
    stagesQuery = activeSubgroupId ? stagesQuery.or(`subgroup_id.is.null,subgroup_id.eq.${activeSubgroupId}`) : stagesQuery.is("subgroup_id", null);
  }

  // Decisões sem resposta também são tarefas (mesma regra da página Tarefas)
  let decisionQuery = supabase.from("decisions").select("id, node_id, claim_cycle_id").eq("tenant_id", tenantId).is("selected_option", null).not("stage_instance_id", "is", null).limit(200);
  if (!isAdmin) decisionQuery = activeSubgroupId ? decisionQuery.or(`subgroup_id.is.null,subgroup_id.eq.${activeSubgroupId}`) : decisionQuery.is("subgroup_id", null);
  const { data: pendingDecisions } = await decisionQuery;
  let decisionTasks = 0;
  if (pendingDecisions?.length) {
    const [{ data: dNodes }, { data: dCycles }] = await Promise.all([
      supabase.from("workflow_nodes").select("id, group_id").in("id", [...new Set(pendingDecisions.map((d) => d.node_id).filter((x): x is string => !!x))]),
      supabase.from("claim_cycles").select("id, status").in("id", [...new Set(pendingDecisions.map((d) => d.claim_cycle_id))]),
    ]);
    const groupOf = new Map((dNodes ?? []).map((n) => [n.id, n.group_id]));
    const cycleOk = new Map((dCycles ?? []).map((c) => [c.id, !["blocked", "completed", "discarded", "cancelled", "archived"].includes(c.status)]));
    decisionTasks = pendingDecisions.filter((d) => cycleOk.get(d.claim_cycle_id) && (isAdmin || (d.node_id && groupOf.get(d.node_id) === (activeGroupId ?? NO_GROUP)))).length;
  }

  const [{ count: stages }, { data: docs }] = await Promise.all([
    stagesQuery,
    supabase
      .from("documents")
      .select("status, pending_items!inner(requested_by, responsible_group_id, status)")
      .eq("tenant_id", tenantId)
      .eq("is_extra", true)
      .eq("pending_items.status", "open")
      .limit(200),
  ]);

  let documents = 0;
  for (const d of docs ?? []) {
    const pend = d.pending_items as unknown as { requested_by: string | null; responsible_group_id: string | null };
    if ((d.status === "requested" || d.status === "rejected") && (isAdmin || (pend.responsible_group_id !== null && pend.responsible_group_id === activeGroupId))) documents++;
    else if (d.status === "received" && (isAdmin || pend.requested_by === userId)) documents++;
  }
  return (stages ?? 0) + decisionTasks + documents;
}
