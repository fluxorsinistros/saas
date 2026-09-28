"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
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

export async function createWorkflow(formData: FormData) {
  const ctx = await getTenantContext();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!name) return;

  const supabase = await createClient();
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
  await getTenantContext();
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
export async function publishVersion(versionId: string): Promise<ActionResult> {
  await getTenantContext();
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
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/fluxos");
  return { ok: true };
}

export async function createNewVersion(versionId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await getTenantContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_draft_from_version", { p_version_id: versionId });
  if (error || !data) return { ok: false, error: error?.message ?? "Falha ao criar versão" };
  revalidatePath("/fluxos");
  return { ok: true, id: data };
}
