"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertCountLimit } from "@/lib/limits";
import { getTenantContext } from "@/lib/tenant";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { validateGraph, type Issue } from "@/lib/workflow/validator";
import type { Graph, NodeConfig, NodeType } from "@/lib/workflow/types";
import type { Json } from "@/lib/supabase/database.types";

export type SavePayload = {
  nodes: {
    id: string;
    node_type: NodeType;
    name: string;
    group_id: string | null;
    config: NodeConfig;
    position: { x: number; y: number };
  }[];
  edges: {
    id: string;
    from_node_id: string;
    to_node_id: string;
    edge_type: string;
    condition: Json | null;
    is_required: boolean;
    order_index: number;
    label: string | null;
  }[];
};

export type ActionResult = { ok: true } | { ok: false; error: string; issues?: Issue[] };

export type PublishDiff = {
  hasPublishedBefore: boolean;
  nodesAdded: number;
  nodesRemoved: number;
  nodesChanged: number;
  edgesAdded: number;
  edgesRemoved: number;
};

// Alimenta o diálogo de confirmação de publicação (crítica de design P1: publicar precisa dizer o que muda).
export async function getPublishDiff(versionId: string): Promise<PublishDiff | { error: string }> {
  await getTenantContext();
  const supabase = await createClient();

  const { data: version, error: vErr } = await supabase
    .from("workflow_versions")
    .select("workflow_id")
    .eq("id", versionId)
    .single();
  if (vErr || !version) return { error: vErr?.message ?? "Versão não encontrada" };

  const { data: published } = await supabase
    .from("workflow_versions")
    .select("id")
    .eq("workflow_id", version.workflow_id)
    .eq("status", "published")
    .maybeSingle();

  if (!published) {
    const { count } = await supabase
      .from("workflow_nodes")
      .select("id", { count: "exact", head: true })
      .eq("workflow_version_id", versionId);
    return { hasPublishedBefore: false, nodesAdded: count ?? 0, nodesRemoved: 0, nodesChanged: 0, edgesAdded: 0, edgesRemoved: 0 };
  }

  const [{ data: draftNodes }, { data: prevNodes }, { data: draftEdges }, { data: prevEdges }] = await Promise.all([
    supabase.from("workflow_nodes").select("id, name, node_type, group_id, config").eq("workflow_version_id", versionId),
    supabase.from("workflow_nodes").select("id, name, node_type, group_id, config").eq("workflow_version_id", published.id),
    supabase.from("workflow_edges").select("id").eq("workflow_version_id", versionId),
    supabase.from("workflow_edges").select("id").eq("workflow_version_id", published.id),
  ]);

  // Nós carregam o mesmo id entre versões (create_draft_from_version gera novos ids, então comparamos por posição+nome
  // seria frágil; em vez disso comparamos o conjunto de nomes normalizado, que é o que o usuário reconhece na tela).
  const draftNames = new Map((draftNodes ?? []).map((n) => [`${n.node_type}::${n.name.trim().toLowerCase()}`, n]));
  const prevNames = new Map((prevNodes ?? []).map((n) => [`${n.node_type}::${n.name.trim().toLowerCase()}`, n]));

  let changed = 0;
  for (const [key, node] of draftNames) {
    const prev = prevNames.get(key);
    if (prev && JSON.stringify(prev.config) !== JSON.stringify(node.config)) changed++;
  }

  return {
    hasPublishedBefore: true,
    nodesAdded: [...draftNames.keys()].filter((k) => !prevNames.has(k)).length,
    nodesRemoved: [...prevNames.keys()].filter((k) => !draftNames.has(k)).length,
    nodesChanged: changed,
    edgesAdded: Math.max(0, (draftEdges?.length ?? 0) - (prevEdges?.length ?? 0)),
    edgesRemoved: Math.max(0, (prevEdges?.length ?? 0) - (draftEdges?.length ?? 0)),
  };
}

export async function createWorkflow(formData: FormData) {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "workflow.edit");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!name) return;

  const supabase = await createClient();
  const { count: workflowCount } = await supabase.from("workflows").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId);
  await assertCountLimit(supabase, ctx.tenantId, "workflows", "workflows", workflowCount ?? 0);
  const { data: wf, error } = await supabase
    .from("workflows")
    .insert({ tenant_id: ctx.tenantId, name, description })
    .select("id")
    .single();
  if (error || !wf) throw new Error(error?.message ?? "Falha ao criar fluxo");

  const { error: vErr } = await supabase
    .from("workflow_versions")
    .insert({ tenant_id: ctx.tenantId, workflow_id: wf.id, version_number: 1, status: "draft" });
  if (vErr) throw new Error(vErr.message);

  revalidatePath("/fluxos");
  redirect(`/fluxos/${wf.id}`);
}

export async function saveDraft(versionId: string, payload: SavePayload): Promise<ActionResult> {
  const ctx = await getTenantContext();
  if (!(await hasPermission(ctx, "workflow.edit"))) return { ok: false, error: "Você não tem permissão para editar fluxos." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_workflow_draft", {
    p_version_id: versionId,
    p_nodes: payload.nodes as unknown as Json,
    p_edges: payload.edges as unknown as Json,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/fluxos");
  return { ok: true };
}

// A validação roda de novo aqui sobre o que está gravado: o navegador não é fonte de verdade (Documento 1 §56).
export async function publishVersion(versionId: string, releaseNote: string): Promise<ActionResult> {
  const ctx = await getTenantContext();
  if (!(await hasPermission(ctx, "workflow.publish"))) return { ok: false, error: "Você não tem permissão para publicar fluxos." };
  const supabase = await createClient();

  const [{ data: nodes, error: nErr }, { data: edges, error: eErr }] = await Promise.all([
    supabase.from("workflow_nodes").select("id, node_type, name, group_id, config").eq("workflow_version_id", versionId),
    supabase
      .from("workflow_edges")
      .select("id, from_node_id, to_node_id, edge_type, label, is_required")
      .eq("workflow_version_id", versionId),
  ]);
  if (nErr || eErr) return { ok: false, error: (nErr ?? eErr)!.message };

  const graph: Graph = {
    nodes: (nodes ?? []).map((n) => ({
      id: n.id,
      type: n.node_type as NodeType,
      name: n.name,
      groupId: n.group_id,
      config: (n.config ?? {}) as NodeConfig,
    })),
    edges: (edges ?? []).map((e) => ({
      id: e.id,
      source: e.from_node_id,
      target: e.to_node_id,
      kind: e.edge_type === "return" ? "return" : "normal",
      label: e.label ?? "",
      isRequired: e.is_required,
    })),
  };

  const issues = validateGraph(graph);
  if (issues.some((i) => i.severity === "error")) {
    return { ok: false, error: "O fluxo tem erros e não pode ser publicado.", issues };
  }

  const { error } = await supabase.rpc("publish_workflow_version", {
    p_version_id: versionId,
    p_validation: { checked_at: new Date().toISOString(), warnings: issues } as unknown as Json,
    p_release_note: releaseNote.trim() || undefined,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/fluxos");
  return { ok: true };
}

export async function createNewVersion(versionId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await getTenantContext();
  if (!(await hasPermission(ctx, "workflow.edit"))) return { ok: false, error: "Você não tem permissão para editar fluxos." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_draft_from_version", { p_version_id: versionId });
  if (error || !data) return { ok: false, error: error?.message ?? "Falha ao criar versão" };
  revalidatePath("/fluxos");
  return { ok: true, id: data };
}
