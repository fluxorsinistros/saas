import { NODE_META, REQUIRES_GROUP, type Graph, type GraphEdge } from "./types";

export type Issue = {
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  edgeId?: string;
};

// Workflow Validator (Documento 3 §7). Erro bloqueia publicação; aviso não.
// `untouched` (crítica de design, P2): nós recém-criados que ainda não perderam o foco uma vez.
// Enquanto "intocados", seus próprios problemas ficam em silêncio — evita punir quem acabou de arrastar um elemento.
export function validateGraph(graph: Graph, untouched: ReadonlySet<string> = new Set()): Issue[] {
  const { nodes, edges } = graph;
  if (nodes.length === 0) return [];

  const issues: Issue[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const forward = edges.filter((e) => e.kind !== "return");
  const out = (id: string, list: GraphEdge[] = edges) => list.filter((e) => e.source === id);
  const inc = (id: string, list: GraphEdge[] = edges) => list.filter((e) => e.target === id);
  const title = (id: string) => byId.get(id)?.name || NODE_META[byId.get(id)!.type].label;

  // Checagens estruturais (ponto de partida, alcançabilidade, ciclo) ignoram nós intocados,
  // para que um elemento solto no quadro não seja tratado como "início" nem como "inalcançável".
  const structural = nodes.filter((n) => !untouched.has(n.id));
  const relevant = structural.length > 0 ? structural : nodes;
  const isStructural = (id: string) => relevant.some((n) => n.id === id);

  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) {
      issues.push({ severity: "error", message: "Conexão sem origem ou destino válido.", edgeId: e.id });
    }
  }

  const entries = relevant.filter((n) => inc(n.id, forward).filter((e) => isStructural(e.source)).length === 0);
  if (entries.length === 0) {
    issues.push({ severity: "error", message: "Não há ponto de início: todo elemento recebe uma conexão." });
  } else if (entries.length > 1) {
    const names = entries.map((n) => `"${title(n.id)}"`).join(" e ");
    issues.push({
      severity: "error",
      message: `Há mais de um ponto de partida: ${names}. Ligue um deles ao restante do fluxo para haver um único início.`,
      nodeId: entries[0].id,
    });
  }

  if (!relevant.some((n) => n.type === "end")) {
    issues.push({ severity: "error", message: "Adicione ao menos um elemento de Fim." });
  }

  const starts = relevant.filter((n) => n.type === "start");
  if (starts.length > 1) {
    issues.push({ severity: "error", message: "Só pode haver um elemento de Início.", nodeId: starts[1].id });
  }

  for (const n of nodes) {
    const name = title(n.id);
    const outs = out(n.id);
    const ins = inc(n.id, forward);

    if (!n.name.trim()) {
      issues.push({ severity: "error", message: `${NODE_META[n.type].label} sem nome.`, nodeId: n.id });
    }
    if (REQUIRES_GROUP.includes(n.type) && !n.groupId) {
      issues.push({ severity: "error", message: `"${name}" não tem grupo responsável.`, nodeId: n.id });
    }
    if (n.type === "end") {
      if (outs.length > 0) {
        issues.push({ severity: "error", message: `"${name}" é um Fim e não pode ter saída.`, nodeId: n.id });
      }
    } else if (outs.length === 0) {
      issues.push({ severity: "error", message: `"${name}" não tem saída.`, nodeId: n.id });
    }
    if (n.type === "decision") {
      if (outs.length < 2) {
        issues.push({ severity: "error", message: `Decisão "${name}" precisa de ao menos 2 opções.`, nodeId: n.id });
      }
      const labels = outs.map((e) => e.label.trim());
      if (labels.some((l) => !l)) {
        issues.push({ severity: "error", message: `Decisão "${name}" tem opção sem nome.`, nodeId: n.id });
      }
      if (new Set(labels.filter(Boolean)).size !== labels.filter(Boolean).length) {
        issues.push({ severity: "error", message: `Decisão "${name}" tem opções repetidas.`, nodeId: n.id });
      }
    }
    if (n.type === "parallel_split" && outs.length < 2) {
      issues.push({ severity: "error", message: `Paralelo "${name}" precisa de ao menos 2 ramos.`, nodeId: n.id });
    }
    if (["stage", "wait", "pending", "start"].includes(n.type) && out(n.id, forward).length > 1) {
      issues.push({
        severity: "error",
        message: `"${name}" tem mais de uma saída. Use uma Decisão ou um Paralelo para dividir o caminho.`,
        nodeId: n.id,
      });
    }
    if (n.type === "join") {
      if (ins.length < 2) {
        issues.push({ severity: "error", message: `Convergência "${name}" precisa receber ao menos 2 ramos.`, nodeId: n.id });
      }
      const rule = n.config.join_rule ?? "all_required";
      if (rule === "min_count") {
        const min = n.config.min_count ?? 0;
        if (min < 1 || min > ins.length) {
          issues.push({
            severity: "error",
            message: `Convergência "${name}": mínimo ${min} é impossível com ${ins.length} ramo(s).`,
            nodeId: n.id,
          });
        }
      }
      if (rule === "all_required" && ins.length > 0 && ins.every((e) => !e.isRequired)) {
        issues.push({
          severity: "warning",
          message: `Convergência "${name}" espera obrigatórios, mas todos os ramos são opcionais.`,
          nodeId: n.id,
        });
      }
    }
    if (n.config.sla_minutes !== undefined && n.config.sla_minutes <= 0) {
      issues.push({ severity: "error", message: `"${name}" tem SLA inválido.`, nodeId: n.id });
    }
  }

  for (const e of edges.filter((x) => x.kind === "return")) {
    const target = byId.get(e.target);
    if (target && !target.config.loop_max) {
      issues.push({
        severity: "warning",
        message: `Retorno para "${target.name}" sem limite de repetições (será ilimitado).`,
        nodeId: target.id,
        edgeId: e.id,
      });
    }
  }

  if (entries.length === 1) {
    const reached = walk([entries[0].id], (id) => out(id).filter((e) => isStructural(e.target)).map((e) => e.target));
    for (const n of relevant) {
      if (!reached.has(n.id)) {
        issues.push({ severity: "error", message: `"${title(n.id)}" nunca é alcançado a partir do início.`, nodeId: n.id });
      }
    }
  }

  const ends = relevant.filter((n) => n.type === "end").map((n) => n.id);
  if (ends.length > 0) {
    const canFinish = walk(ends, (id) => inc(id).filter((e) => isStructural(e.source)).map((e) => e.source));
    for (const n of relevant) {
      if (!canFinish.has(n.id)) {
        issues.push({ severity: "error", message: `"${title(n.id)}" nunca chega a um Fim.`, nodeId: n.id });
      }
    }
  }

  const cycleNode = findCycle(
    relevant.map((n) => n.id),
    forward.filter((e) => isStructural(e.source) && isStructural(e.target)),
  );
  if (cycleNode) {
    issues.push({
      severity: "error",
      message: `Há um ciclo passando por "${title(cycleNode)}". Marque a conexão que volta como "Retorno (loop)".`,
      nodeId: cycleNode,
    });
  }

  return dedupe(issues.filter((i) => !i.nodeId || !untouched.has(i.nodeId)));
}

function walk(start: string[], next: (id: string) => string[]) {
  const seen = new Set<string>(start);
  const queue = [...start];
  while (queue.length) {
    for (const n of next(queue.shift()!)) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

function findCycle(ids: string[], edges: GraphEdge[]): string | null {
  const state = new Map<string, 0 | 1 | 2>();
  const adj = new Map<string, string[]>();
  for (const e of edges) adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);

  const visit = (id: string): string | null => {
    state.set(id, 1);
    for (const n of adj.get(id) ?? []) {
      if (state.get(n) === 1) return n;
      if (!state.get(n)) {
        const found = visit(n);
        if (found) return found;
      }
    }
    state.set(id, 2);
    return null;
  };

  for (const id of ids) {
    if (!state.get(id)) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}

function dedupe(issues: Issue[]) {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.severity}|${i.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
