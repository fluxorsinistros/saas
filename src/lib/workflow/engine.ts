import type { Graph, GraphNode } from "./types";

// Motor de execução (Documento 3). Função pura, sem I/O — quem chama decide o que fazer
// com o resultado (gravar stage_instances, marcar bloqueado, etc).
//
// Escopo desta fatia (ver plano): sequência, decisão exclusiva e retorno (loop) com limite.
// Paralelo/Convergência ainda não têm runtime — resolveTransition devolve "unsupported"
// em vez de fingir que funciona, para nunca deixar um ciclo em estado inconsistente.

export type TransitionResult =
  | { kind: "advance"; targets: string[] }
  | { kind: "end" }
  | { kind: "unsupported"; reason: string };

export function startNode(graph: Graph): GraphNode {
  const targets = new Set(graph.edges.filter((e) => e.kind !== "return").map((e) => e.target));
  const entry = graph.nodes.find((n) => !targets.has(n.id));
  if (!entry) throw new Error("Fluxo sem ponto de início — a publicação não deveria ter permitido isso.");
  return entry;
}

export function resolveTransition(
  graph: Graph,
  fromNodeId: string,
  opts: { selectedOption?: string; loopPassCounts: Record<string, number>; loopMax: Record<string, number | undefined> },
): TransitionResult {
  const node = graph.nodes.find((n) => n.id === fromNodeId);
  if (!node) return { kind: "unsupported", reason: "Elemento não encontrado no fluxo publicado." };

  if (node.type === "end") return { kind: "end" };

  if (node.type === "parallel_split" || node.type === "join") {
    return {
      kind: "unsupported",
      reason: `${node.type === "parallel_split" ? "Paralelo" : "Convergência"} ainda não é suportado pela execução — esta fatia cobre só sequência, decisão e retorno.`,
    };
  }

  const outs = graph.edges.filter((e) => e.source === fromNodeId);

  if (node.type === "decision") {
    const edge = outs.find((e) => e.label === opts.selectedOption);
    if (!edge) {
      return { kind: "unsupported", reason: `Opção "${opts.selectedOption ?? ""}" não corresponde a nenhum caminho desta decisão.` };
    }
    return checkedAdvance(graph, edge.target, opts);
  }

  // stage / wait / pending: uma única saída, normal ou de retorno (o Workflow Validator já garante isso).
  const edge = outs[0];
  if (!edge) return { kind: "unsupported", reason: "Elemento sem saída configurada." };
  return checkedAdvance(graph, edge.target, opts);
}

function checkedAdvance(
  graph: Graph,
  targetId: string,
  opts: { loopPassCounts: Record<string, number>; loopMax: Record<string, number | undefined> },
): TransitionResult {
  const passCount = opts.loopPassCounts[targetId] ?? 0;
  const max = opts.loopMax[targetId];
  if (max !== undefined && passCount >= max) {
    const name = graph.nodes.find((n) => n.id === targetId)?.name ?? targetId;
    return {
      kind: "unsupported",
      reason: `"${name}" atingiu o limite de ${max} repetições configurado para o retorno. É preciso autorização para continuar (ainda não implementada).`,
    };
  }
  return { kind: "advance", targets: [targetId] };
}
