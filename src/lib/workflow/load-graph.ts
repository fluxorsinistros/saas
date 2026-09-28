import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Graph, NodeConfig, NodeType } from "./types";

// Carrega o grafo (nós + arestas) de uma versão publicada, direto das tabelas normalizadas.
// Como versão publicada é imutável (trigger em 0015), não precisamos reconstruir a partir do
// snapshot JSON para rodar o motor — as tabelas workflow_nodes/workflow_edges já são a fonte
// estável. O snapshot em cycle_configuration_snapshots continua sendo gravado (Documento 2 §31),
// serve de arquivo histórico caso o modelo evolua para permitir migração de ciclo entre versões.
export async function loadGraph(supabase: SupabaseClient<Database>, versionId: string): Promise<Graph> {
  const [{ data: nodes, error: nErr }, { data: edges, error: eErr }] = await Promise.all([
    supabase.from("workflow_nodes").select("id, node_type, name, group_id, config").eq("workflow_version_id", versionId),
    supabase
      .from("workflow_edges")
      .select("id, from_node_id, to_node_id, edge_type, label, is_required")
      .eq("workflow_version_id", versionId),
  ]);
  if (nErr) throw new Error(nErr.message);
  if (eErr) throw new Error(eErr.message);

  return {
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
}
