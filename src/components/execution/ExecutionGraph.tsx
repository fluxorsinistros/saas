"use client";

import { useMemo } from "react";
import { Background, Handle, Position, ReactFlow, ReactFlowProvider, type Node, type NodeProps } from "@xyflow/react";
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
};
export type ExecutionEdge = { id: string; source: string; target: string; label?: string };

const STATUS_STYLE: Record<ExecutionNode["status"], string> = {
  pending: "border-slate-200 bg-white text-slate-500",
  in_progress: "border-sky-400 bg-sky-50 text-sky-900 shadow-[0_0_0_3px_rgba(56,189,248,0.15)]",
  completed: "border-emerald-400 bg-emerald-50 text-emerald-900",
  blocked: "border-rose-400 bg-rose-50 text-rose-900",
};

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
  }>
>) {
  const count = data.claimCount ?? 0;
  const blocked = data.blockedCount ?? 0;

  return (
    <div
      className={`relative rounded-lg border-2 px-3 py-2 text-[12px] font-medium transition cursor-pointer ${
        selected ? "ring-2 ring-brand ring-offset-2 " : ""
      }${STATUS_STYLE[data.status]}`}
      style={{ minWidth: 140 }}
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
      <div className="text-[9px] font-semibold uppercase tracking-[0.06em] opacity-60">
        {NODE_META[data.type]?.label ?? data.type}
      </div>
      <div>{data.name}</div>
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
  height = 420,
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
          },
          draggable: false,
          selectable: Boolean(onNodeClick),
        }),
      ),
    [nodes, selectedNodeId, onNodeClick],
  );
  const flowEdges = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        style: { stroke: "#cbd5e1" },
      })),
    [edges],
  );

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
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={Boolean(onNodeClick)}
          panOnScroll
          zoomOnScroll
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
