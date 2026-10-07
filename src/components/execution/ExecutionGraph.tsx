"use client";

import { useMemo } from "react";
import { Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NODE_META, type NodeType } from "@/lib/workflow/types";

export type ExecutionNode = {
  id: string;
  type: NodeType;
  name: string;
  x: number;
  y: number;
  status: "pending" | "in_progress" | "completed" | "blocked";
  claimCount?: number;
  blockedCount?: number;
  // Previsão: prazo da etapa, prazo acumulado desde a abertura e a data prevista (em dias úteis)
  own?: string;
  acc?: string;
  accDate?: string;
};
export type ExecutionEdge = { id: string; source: string; target: string; label?: string; color?: string; isReturn?: boolean };

const STATUS_LABEL: Record<ExecutionNode["status"], string> = {
  pending: "A fazer",
  in_progress: "Em andamento",
  completed: "Concluída",
  blocked: "Bloqueada",
};

// Cores dos ramos de uma saída com mais de uma opção (as mesmas do editor de fluxos)
const BRANCH_COLORS = ["#2563eb", "#db2777", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#65a30d"];

function ExecutionNodeBox({
  data,
  selected,
}: NodeProps<
  Node<{
    name: string;
    type: NodeType;
    status: ExecutionNode["status"];
    claimCount?: number;
    blockedCount?: number;
    own?: string;
    acc?: string;
    accDate?: string;
  }>
>) {
  const count = data.claimCount ?? 0;
  const blocked = data.blockedCount ?? 0;

  return (
    <div
      data-status={data.status}
      className={`exec-node relative w-[230px] cursor-pointer rounded-xl border-2 px-3.5 py-2.5 transition ${selected ? "ring-2 ring-brand ring-offset-2 " : ""}`}
    >
      {count > 0 && (
        <span
          className={`absolute -top-2.5 -right-2.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white shadow-sm ring-2 ring-white ${
            blocked > 0 ? "bg-rose-600 animate-pulse" : "bg-brand"
          }`}
          title={`${count} sinistro(s) nesta etapa${blocked > 0 ? ` (${blocked} bloqueado(s))` : ""}`}
        >
          {count}
        </span>
      )}
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] opacity-75">
        <span>{NODE_META[data.type]?.label ?? data.type}</span>
        {data.type !== "start" && data.type !== "end" && <span className="font-medium normal-case tracking-normal">{STATUS_LABEL[data.status]}</span>}
      </div>
      <div className="mt-0.5 text-[14px] font-semibold leading-snug">{data.name}</div>
      {(data.own || data.acc) && (
        <dl className="mt-1.5 space-y-0.5 border-t border-current/15 pt-1.5 text-[11.5px] leading-tight">
          {data.own && (
            <div className="flex justify-between gap-2">
              <dt className="opacity-70">Prazo da etapa</dt>
              <dd className="whitespace-nowrap font-semibold">{data.own}</dd>
            </div>
          )}
          {data.acc && (
            <div className="flex justify-between gap-2">
              <dt className="shrink-0 opacity-70">Acumulado</dt>
              <dd className="whitespace-nowrap text-right font-semibold">
                {data.acc.split(" (")[0]}
                {data.acc.includes(" (") && <span className="block text-[10.5px] font-normal opacity-70">({data.acc.split(" (").slice(1).join(" (")}</span>}
              </dd>
            </div>
          )}
          {data.accDate && (
            <div className="flex justify-between gap-2">
              <dt className="opacity-70">Previsto até</dt>
              <dd className="whitespace-nowrap font-semibold">{data.accDate}</dd>
            </div>
          )}
        </dl>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  );
}

const nodeTypes = { execNode: ExecutionNodeBox };

// Documento 5 §5: mesmo grafo do Builder, com overlay de estado, em vez de reaproveitar o
// WorkflowBuilder inteiro (que carrega edição, histórico de undo, validação, tudo desnecessário e
// pesado pra uma visão só-leitura), é um render mínimo do mesmo canvas ReactFlow, sem interação de
// edição nenhuma.
export function ExecutionGraph({
  nodes,
  edges,
  selectedNodeId,
  onNodeClick,
  height = 680,
}: {
  nodes: ExecutionNode[];
  edges: ExecutionEdge[];
  selectedNodeId?: string | null;
  onNodeClick?: (nodeId: string) => void;
  height?: number | string;
}) {
  const flowNodes = useMemo(
    () =>
      nodes.map(
        (n): Node => ({
          id: n.id,
          type: "execNode",
          position: { x: n.x, y: n.y },
          selected: selectedNodeId === n.id,
          data: {
            name: n.name,
            type: n.type,
            status: n.status,
            claimCount: n.claimCount,
            blockedCount: n.blockedCount,
            own: n.own,
            acc: n.acc,
            accDate: n.accDate,
          },
          draggable: false,
          selectable: Boolean(onNodeClick),
        }),
      ),
    [nodes, selectedNodeId, onNodeClick],
  );
  const flowEdges = useMemo<Edge[]>(() => {
    const statusOf = new Map(nodes.map((n) => [n.id, n.status]));
    const siblings = new Map<string, string[]>();
    for (const e of edges) siblings.set(e.source, [...(siblings.get(e.source) ?? []), e.id]);
    return edges.map((e) => {
      const sib = siblings.get(e.source) ?? [];
      const branchColor = sib.length > 1 ? BRANCH_COLORS[sib.indexOf(e.id) % BRANCH_COLORS.length] : null;
      // linha já percorrida: forte; as demais ficam mais suaves, mas legíveis
      const targetStatus = statusOf.get(e.target);
      const taken = statusOf.get(e.source) === "completed" && targetStatus !== undefined && targetStatus !== "pending";
      const base = e.color ?? branchColor ?? "var(--exec-edge)";
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        pathOptions: { borderRadius: 14, offset: 22 },
        label: e.label ? `${e.isReturn ? "↺ " : ""}${e.label}` : undefined,
        labelShowBg: true,
        labelBgPadding: [8, 4] as [number, number],
        labelBgBorderRadius: 6,
        labelStyle: { fontSize: 12, fontWeight: 600, fill: taken ? "#16a34a" : "var(--exec-label-fg)" },
        labelBgStyle: { fill: "var(--exec-label-bg)", stroke: taken ? "#16a34a" : "var(--exec-label-border)" },
        style: {
          stroke: taken ? "#22c55e" : base,
          strokeWidth: taken ? 3 : 1.8,
          opacity: taken ? 1 : 0.75,
          strokeDasharray: e.isReturn ? "6 4" : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: taken ? "#22c55e" : (e.color ?? branchColor ?? "#94a3b8"), width: 18, height: 18 },
      };
    });
  }, [edges, nodes]);

  return (
    <div
      className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
      style={{ height: typeof height === "number" ? `${height}px` : height }}
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick ? (_, node) => onNodeClick(node.id) : undefined}
          fitView
          fitViewOptions={{ padding: 0.12, minZoom: 0.02, maxZoom: 1 }}
          minZoom={0.02}
          maxZoom={2.5}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={Boolean(onNodeClick)}
          panOnScroll
          zoomOnScroll
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="rgba(148, 163, 184, 0.2)" />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            maskColor="rgba(15, 23, 42, 0.35)"
            nodeStrokeWidth={0}
            nodeColor={(n) => {
              const status = (n.data as { status?: ExecutionNode["status"] } | undefined)?.status;
              return status === "completed" ? "#22c55e" : status === "in_progress" ? "#38bdf8" : status === "blocked" ? "#fb7185" : "#94a3b8";
            }}
          />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
