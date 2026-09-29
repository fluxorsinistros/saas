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
};
export type ExecutionEdge = { id: string; source: string; target: string; label?: string };

const STATUS_STYLE: Record<ExecutionNode["status"], string> = {
  pending: "border-slate-200 bg-white text-slate-500",
  in_progress: "border-sky-400 bg-sky-50 text-sky-900 shadow-[0_0_0_3px_rgba(56,189,248,0.15)]",
  completed: "border-emerald-400 bg-emerald-50 text-emerald-900",
  blocked: "border-rose-400 bg-rose-50 text-rose-900",
};

function ExecutionNodeBox({ data }: NodeProps<Node<{ name: string; type: NodeType; status: ExecutionNode["status"] }>>) {
  return (
    <div className={`rounded-lg border-2 px-3 py-2 text-[12px] font-medium ${STATUS_STYLE[data.status]}`} style={{ minWidth: 140 }}>
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="text-[9px] font-semibold uppercase tracking-[0.06em] opacity-60">{NODE_META[data.type]?.label ?? data.type}</div>
      <div>{data.name}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  );
}

const nodeTypes = { execNode: ExecutionNodeBox };

// Documento 5 §5: mesmo grafo do Builder, com overlay de estado — em vez de reaproveitar o
// WorkflowBuilder inteiro (que carrega edição, histórico de undo, validação — tudo desnecessário e
// pesado pra uma visão só-leitura), é um render mínimo do mesmo canvas ReactFlow, sem interação de
// edição nenhuma.
export function ExecutionGraph({ nodes, edges }: { nodes: ExecutionNode[]; edges: ExecutionEdge[] }) {
  const flowNodes = useMemo(
    () =>
      nodes.map(
        (n): Node => ({
          id: n.id,
          type: "execNode",
          position: { x: n.x, y: n.y },
          data: { name: n.name, type: n.type, status: n.status },
          draggable: false,
          selectable: false,
        }),
      ),
    [nodes],
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
    <div className="h-[420px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <ReactFlowProvider>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
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
