import type { Graph } from "./types";

// Caminho mais longo do Início até um Fim, em minutos de prazo, sem contar as voltas (conexões de retorno) nem os caminhos de
// "limite atingido". É o prazo total máximo do fluxo para um sinistro que não volta atrás: vias que se excluem não se somam, e
// caminhos simultâneos contam o mais longo, porque andam ao mesmo tempo.
export function longestPath(graph: Graph, minutesOf: (node: Graph["nodes"][number]) => number): { minutes: number; nodeIds: string[] } {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const outs = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.kind === "return" || e.onLimit) continue;
    outs.set(e.source, [...(outs.get(e.source) ?? []), e.target]);
  }
  const memo = new Map<string, { minutes: number; next: string | null }>();
  const visiting = new Set<string>();
  const best = (id: string): { minutes: number; next: string | null } => {
    const known = memo.get(id);
    if (known) return known;
    const node = byId.get(id);
    if (!node || visiting.has(id)) return { minutes: 0, next: null };
    visiting.add(id);
    const own = node.type === "stage" || node.type === "wait" || node.type === "decision" ? minutesOf(node) : 0;
    let top = { minutes: 0, next: null as string | null };
    for (const t of outs.get(id) ?? []) {
      const sub = best(t);
      if (sub.minutes >= top.minutes && (sub.minutes > top.minutes || top.next === null)) top = { minutes: sub.minutes, next: t };
    }
    visiting.delete(id);
    const result = { minutes: own + top.minutes, next: top.next };
    memo.set(id, result);
    return result;
  };
  const start = graph.nodes.find((n) => n.type === "start") ?? graph.nodes[0];
  if (!start) return { minutes: 0, nodeIds: [] };
  const nodeIds: string[] = [];
  for (let id: string | null = start.id; id; id = memo.get(id)?.next ?? null) {
    best(id);
    nodeIds.push(id);
    if (nodeIds.length > graph.nodes.length) break;
  }
  return { minutes: best(start.id).minutes, nodeIds };
}

// Prazo acumulado até cada elemento, em minutos, contando só conexões para frente (sem as voltas).
// `max` é o caminho mais demorado até chegar ali (o que vale como previsão segura); `min`, o mais curto. Onde chegam vários caminhos
// (como no Fim), a previsão é o maior; a diferença para o menor mostra o quanto o caminho escolhido muda o prazo.
export function accumulatedMinutes(
  graph: Graph,
  minutesOf: (node: Graph["nodes"][number]) => number,
): Map<string, { own: number; max: number; min: number }> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const preds = new Map<string, string[]>();
  for (const e of graph.edges) {
    // o caminho "ao atingir o limite" é um caminho real do sinistro, então conta; só as voltas ficam de fora
    if (e.kind === "return") continue;
    preds.set(e.target, [...(preds.get(e.target) ?? []), e.source]);
  }
  const memo = new Map<string, { own: number; max: number; min: number }>();
  const visiting = new Set<string>();
  const calc = (id: string): { own: number; max: number; min: number } => {
    const known = memo.get(id);
    if (known) return known;
    const node = byId.get(id);
    if (!node || visiting.has(id)) return { own: 0, max: 0, min: 0 };
    visiting.add(id);
    const own = node.type === "stage" || node.type === "wait" || node.type === "decision" ? minutesOf(node) : 0;
    const before = (preds.get(id) ?? []).map(calc);
    const result = {
      own,
      max: own + (before.length ? Math.max(...before.map((b) => b.max)) : 0),
      min: own + (before.length ? Math.min(...before.map((b) => b.min)) : 0),
    };
    visiting.delete(id);
    memo.set(id, result);
    return result;
  };
  for (const n of graph.nodes) calc(n.id);
  return memo;
}
