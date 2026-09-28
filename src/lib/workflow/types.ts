export const NODE_TYPES = ["stage", "decision", "parallel_split", "join", "wait", "pending", "end"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export type JoinRule = "all" | "all_required" | "any" | "min_count";

export type NodeConfig = {
  description?: string;
  question?: string;
  sla_minutes?: number;
  loop_max?: number;
  join_rule?: JoinRule;
  min_count?: number;
};

export type EdgeKind = "normal" | "return";

// Forma neutra do grafo, compartilhada pelo builder (navegador) e pela publicação (servidor).
export type GraphNode = {
  id: string;
  type: NodeType;
  name: string;
  groupId: string | null;
  config: NodeConfig;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label: string;
  isRequired: boolean;
};

export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

export const NODE_META: Record<NodeType, { label: string; hint: string }> = {
  stage: { label: "Etapa", hint: "Atividade executada por um grupo" },
  decision: { label: "Decisão", hint: "Escolha única entre caminhos" },
  parallel_split: { label: "Paralelo", hint: "Abre ramos simultâneos" },
  join: { label: "Convergência", hint: "Aguarda ramos antes de seguir" },
  wait: { label: "Espera", hint: "Aguarda terceiro ou prazo" },
  pending: { label: "Pendência", hint: "Solicitação sem nova etapa" },
  end: { label: "Fim", hint: "Encerra o caminho" },
};

export const JOIN_RULE_LABEL: Record<JoinRule, string> = {
  all_required: "Todos os obrigatórios",
  all: "Todos",
  any: "Qualquer um",
  min_count: "Mínimo de N",
};

// Tipos que exigem grupo responsável (Documento 1 §5.3: etapa aponta para grupo, não pessoa).
export const REQUIRES_GROUP: NodeType[] = ["stage", "decision", "pending"];

export type DbEdgeType = "normal" | "conditional" | "parallel" | "return" | "close";

export function toDbEdgeType(edge: GraphEdge, sourceType: NodeType | undefined): DbEdgeType {
  if (edge.kind === "return") return "return";
  if (sourceType === "parallel_split") return "parallel";
  if (sourceType === "decision") return "conditional";
  return "normal";
}

export function formatSla(minutes?: number) {
  if (!minutes) return null;
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}min`;
}
