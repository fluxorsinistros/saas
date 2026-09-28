"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleStop,
  Clock3,
  CopyPlus,
  GitFork,
  GitMerge,
  Hourglass,
  ListTodo,
  Lock,
  Rocket,
  Save,
  Split,
  Workflow,
  XCircle,
} from "lucide-react";
import { BuilderContext, type FlowEdge, type FlowEdgeData, type FlowNode, type FlowNodeData } from "./context";
import { nodeTypes } from "./nodes";
import { EdgeInspector, NodeInspector } from "./Inspector";
import { NODE_META, NODE_TYPES, toDbEdgeType, type Graph, type NodeConfig, type NodeType } from "@/lib/workflow/types";
import { validateGraph, type Issue } from "@/lib/workflow/validator";
import { TEMPLATES, type WorkflowTemplate } from "@/lib/workflow/templates";
import { createNewVersion, publishVersion, saveDraft, type SavePayload } from "@/app/(app)/fluxos/actions";

export type DbNode = {
  id: string;
  node_type: string;
  name: string;
  group_id: string | null;
  config: unknown;
  position: unknown;
};
export type DbEdge = {
  id: string;
  from_node_id: string;
  to_node_id: string;
  edge_type: string;
  label: string | null;
  is_required: boolean;
};
export type VersionInfo = { id: string; version_number: number; status: string };

type Props = {
  workflow: { id: string; name: string };
  version: VersionInfo;
  versions: VersionInfo[];
  initialNodes: DbNode[];
  initialEdges: DbEdge[];
  groups: { id: string; name: string }[];
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  validated: "Validado",
  published: "Publicado",
  archived: "Arquivado",
};

const PALETTE_ICON: Record<NodeType, React.ReactNode> = {
  stage: <Workflow className="size-4 text-brand" />,
  decision: <Split className="size-4 text-violet" />,
  parallel_split: <GitFork className="size-4 text-cyan-700" />,
  join: <GitMerge className="size-4 text-cyan-700" />,
  wait: <Hourglass className="size-4 text-slate-500" />,
  pending: <ListTodo className="size-4 text-rose-600" />,
  end: <CircleStop className="size-4 text-navy" />,
};

const DND_TYPE = "application/x-workflow-node";

function toFlowNodes(rows: DbNode[]): FlowNode[] {
  return rows.map((r) => ({
    id: r.id,
    type: r.node_type as NodeType,
    position: (r.position as { x: number; y: number } | null) ?? { x: 0, y: 0 },
    data: { name: r.name, groupId: r.group_id, config: (r.config ?? {}) as NodeConfig },
  }));
}

function toFlowEdges(rows: DbEdge[]): FlowEdge[] {
  return rows.map((r) => ({
    id: r.id,
    source: r.from_node_id,
    target: r.to_node_id,
    data: { kind: r.edge_type === "return" ? "return" : "normal", label: r.label ?? "", isRequired: r.is_required },
  }));
}

function toGraph(nodes: FlowNode[], edges: FlowEdge[]): Graph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type as NodeType,
      name: n.data.name,
      groupId: n.data.groupId,
      config: n.data.config,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      kind: e.data?.kind ?? "normal",
      label: e.data?.label ?? "",
      isRequired: e.data?.isRequired ?? true,
    })),
  };
}

function toPayload(nodes: FlowNode[], edges: FlowEdge[]): SavePayload {
  const typeOf = new Map(nodes.map((n) => [n.id, n.type as NodeType]));
  const siblingIndex = new Map<string, number>();
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      node_type: n.type as NodeType,
      name: n.data.name,
      group_id: n.data.groupId,
      config: JSON.parse(JSON.stringify(n.data.config)),
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    })),
    edges: edges.map((e) => {
      const data = e.data ?? { kind: "normal", label: "", isRequired: true };
      const sourceType = typeOf.get(e.source);
      const order = siblingIndex.get(e.source) ?? 0;
      siblingIndex.set(e.source, order + 1);
      return {
        id: e.id,
        from_node_id: e.source,
        to_node_id: e.target,
        edge_type: toDbEdgeType({ ...data, id: e.id, source: e.source, target: e.target }, sourceType),
        condition: sourceType === "decision" && data.kind !== "return" ? { option: data.label } : null,
        is_required: data.isRequired,
        order_index: order,
        label: data.label || null,
      };
    }),
  };
}

export function WorkflowBuilder(props: Props) {
  return (
    <ReactFlowProvider>
      <Builder {...props} />
    </ReactFlowProvider>
  );
}

function Builder({ workflow, version, versions, initialNodes, initialEdges, groups }: Props) {
  const router = useRouter();
  const { screenToFlowPosition, setCenter, fitView, deleteElements, getViewport } = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(toFlowNodes(initialNodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(toFlowEdges(initialEdges));
  const [selection, setSelection] = useState<{ node?: string; edge?: string }>({});
  const [savedJson, setSavedJson] = useState(() =>
    JSON.stringify(toPayload(toFlowNodes(initialNodes), toFlowEdges(initialEdges))),
  );
  const [serverIssues, setServerIssues] = useState<{ issues: Issue[]; forJson: string } | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const readOnly = version.status !== "draft";
  const hasDraft = versions.some((v) => v.status === "draft");

  const payload = useMemo(() => toPayload(nodes, edges), [nodes, edges]);
  const payloadJson = useMemo(() => JSON.stringify(payload), [payload]);
  const dirty = !readOnly && payloadJson !== savedJson;

  const issues = useMemo(() => validateGraph(toGraph(nodes, edges)), [nodes, edges]);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  const nodeIssues = useMemo(() => {
    const map = new Map<string, "error" | "warning">();
    for (const i of issues) {
      if (!i.nodeId) continue;
      if (i.severity === "error" || !map.has(i.nodeId)) map.set(i.nodeId, i.severity);
    }
    return map;
  }, [issues]);

  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const typeOf = useMemo(() => new Map(nodes.map((n) => [n.id, n.type as NodeType])), [nodes]);

  const flash = useCallback((kind: "ok" | "error", text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const save = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        startTransition(async () => {
          const snapshot = payloadJson;
          const res = await saveDraft(version.id, JSON.parse(snapshot));
          if (res.ok) {
            setSavedJson(snapshot);
            flash("ok", "Rascunho salvo.");
          } else {
            flash("error", res.error);
          }
          resolve(res.ok);
        });
      }),
    [payloadJson, version.id, flash],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !pending) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, pending, save]);

  const publish = async () => {
    if (errors.length) return;
    if (dirty && !(await save())) return;
    startTransition(async () => {
      const res = await publishVersion(version.id);
      if (res.ok) {
        flash("ok", `Versão ${version.version_number} publicada.`);
        setServerIssues(null);
        router.refresh();
      } else {
        setServerIssues(res.issues ? { issues: res.issues, forJson: payloadJson } : null);
        flash("error", res.error);
      }
    });
  };

  const newVersion = () => {
    startTransition(async () => {
      const res = await createNewVersion(version.id);
      if (res.ok) router.push(`/fluxos/${workflow.id}?v=${res.id}`);
      else flash("error", res.error);
    });
  };

  const addNode = useCallback(
    (type: NodeType, position?: { x: number; y: number }) => {
      let pos = position;
      if (!pos) {
        const rect = wrapper.current?.getBoundingClientRect();
        pos = rect
          ? screenToFlowPosition({ x: rect.left + rect.width / 2 - 110, y: rect.top + rect.height / 3 })
          : { x: 0, y: 0 };
      }
      const id = crypto.randomUUID();
      const node: FlowNode = {
        id,
        type,
        position: pos,
        selected: true,
        data: {
          name: type === "end" ? "Encerramento" : type === "join" ? "Convergência" : "",
          groupId: null,
          config: type === "join" ? { join_rule: "all_required" } : {},
        },
      };
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node]);
      setEdges((es) => es.map((e) => ({ ...e, selected: false })));
    },
    [screenToFlowPosition, setNodes, setEdges],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      const sourceType = typeOf.get(c.source);
      const siblings = edges.filter((e) => e.source === c.source).length;
      const edge: FlowEdge = {
        ...c,
        id: crypto.randomUUID(),
        data: {
          kind: "normal",
          label: sourceType === "decision" ? `Opção ${siblings + 1}` : "",
          isRequired: true,
        },
      };
      setEdges((es) => addEdge(edge, es));
    },
    [edges, setEdges, typeOf],
  );

  const isValidConnection = useCallback(
    (c: Connection | Edge) =>
      c.source !== c.target && !edges.some((e) => e.source === c.source && e.target === c.target),
    [edges],
  );

  const onSelectionChange = useCallback(({ nodes: ns, edges: es }: OnSelectionChangeParams) => {
    setSelection({ node: ns.length === 1 && es.length === 0 ? ns[0].id : undefined, edge: es.length === 1 && ns.length === 0 ? es[0].id : undefined });
  }, []);

  const patchNode = (id: string, patch: Partial<FlowNodeData>) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  const patchEdge = (id: string, patch: Partial<FlowEdgeData>) =>
    setEdges((es) =>
      es.map((e) =>
        e.id === id ? { ...e, data: { ...(e.data ?? { kind: "normal", label: "", isRequired: true }), ...patch } } : e,
      ),
    );

  const focusIssue = (issue: Issue) => {
    const id = issue.nodeId;
    if (!id) return;
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    setEdges((es) => es.map((e) => ({ ...e, selected: false })));
    setCenter(node.position.x + (node.measured?.width ?? 220) / 2, node.position.y + (node.measured?.height ?? 80) / 2, {
      zoom: Math.max(getViewport().zoom, 1),
      duration: 400,
    });
  };

  const applyTemplate = (t: WorkflowTemplate) => {
    const byName = new Map(groups.map((g) => [g.name.toLowerCase(), g.id]));
    const ids = new Map(t.nodes.map((n) => [n.key, crypto.randomUUID()]));
    setNodes(
      t.nodes.map((n) => ({
        id: ids.get(n.key)!,
        type: n.type,
        position: { x: n.x, y: n.y },
        data: {
          name: n.name,
          groupId: n.group ? (byName.get(n.group.toLowerCase()) ?? null) : null,
          config: n.config ?? {},
        },
      })),
    );
    setEdges(
      t.edges.map((e) => ({
        id: crypto.randomUUID(),
        source: ids.get(e.from)!,
        target: ids.get(e.to)!,
        data: { kind: e.kind ?? "normal", label: e.label ?? "", isRequired: e.required ?? true },
      })),
    );
    window.setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50);
  };

  const displayEdges = useMemo<FlowEdge[]>(
    () =>
      edges.map((e) => {
        const data = e.data ?? { kind: "normal", label: "", isRequired: true };
        const fromParallel = typeOf.get(e.source) === "parallel_split";
        const isReturn = data.kind === "return";
        const color = e.selected
          ? "var(--color-brand)"
          : isReturn
            ? "var(--color-violet)"
            : fromParallel
              ? "#0891b2"
              : "#94a3b8";
        const dashed = isReturn || (fromParallel && !data.isRequired);
        const text = [isReturn ? "↺" : "", data.label, fromParallel && !data.isRequired ? "(opcional)" : ""]
          .filter(Boolean)
          .join(" ");
        return {
          ...e,
          type: "smoothstep",
          pathOptions: { borderRadius: 14, offset: 22 },
          label: text || undefined,
          labelShowBg: true,
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 6,
          labelStyle: { fontSize: 11, fontWeight: 500, fill: isReturn ? "#6d28d9" : "#334155" },
          labelBgStyle: { fill: "#ffffff", stroke: "#e2e8f0" },
          style: { stroke: color, strokeWidth: e.selected ? 2.5 : 1.6, strokeDasharray: dashed ? "6 4" : undefined },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        };
      }),
    [edges, typeOf],
  );

  const selectedNode = selection.node ? nodes.find((n) => n.id === selection.node) : undefined;
  const selectedEdge = selection.edge ? edges.find((e) => e.id === selection.edge) : undefined;
  const staleServer = !serverIssues || serverIssues.forJson !== payloadJson;
  const panelIssues = staleServer ? issues : serverIssues.issues;

  return (
    <BuilderContext.Provider value={{ groups: groupMap, nodeIssues, readOnly }}>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-2.5">
          <Link
            href="/fluxos"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <ArrowLeft className="size-4" /> Fluxos
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold text-slate-900">{workflow.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label="Versão"
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700"
              value={version.id}
              onChange={(e) => {
                if (dirty && !window.confirm("Há alterações não salvas. Trocar de versão mesmo assim?")) return;
                router.push(`/fluxos/${workflow.id}?v=${e.target.value}`);
              }}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version_number} · {STATUS_LABEL[v.status] ?? v.status}
                </option>
              ))}
            </select>
            <StatusBadge status={version.status} />
          </div>

          <div className="ml-auto flex items-center gap-2">
            {!readOnly && (
              <span className="hidden text-[12px] text-slate-500 sm:inline" aria-live="polite">
                {pending ? "Salvando…" : dirty ? "Alterações não salvas" : "Tudo salvo"}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${
                errors.length ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {errors.length ? <XCircle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
              {errors.length ? `${errors.length} erro${errors.length > 1 ? "s" : ""}` : "Válido"}
              {warnings.length > 0 && <span className="text-amber-700">· {warnings.length} aviso{warnings.length > 1 ? "s" : ""}</span>}
            </span>
            {readOnly ? (
              <button
                type="button"
                onClick={newVersion}
                disabled={pending || hasDraft}
                title={hasDraft ? "Já existe um rascunho para este fluxo" : undefined}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CopyPlus className="size-4" /> Nova versão
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!dirty || pending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Salvar (Ctrl+S)"
                >
                  <Save className="size-4" /> Salvar
                </button>
                <button
                  type="button"
                  onClick={() => void publish()}
                  disabled={errors.length > 0 || pending || nodes.length === 0}
                  title={errors.length ? "Corrija os erros para publicar" : undefined}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Rocket className="size-4" /> Publicar
                </button>
              </>
            )}
          </div>
        </header>

        {readOnly && (
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[12px] text-amber-900">
            <Lock className="size-3.5" />
            Versão {STATUS_LABEL[version.status]?.toLowerCase()} — somente leitura. Processos iniciados nela continuam seguindo
            exatamente este desenho. Para alterar, crie uma nova versão.
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {!readOnly && (
            <aside className="w-[184px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3" aria-label="Elementos">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Elementos</div>
              <ul className="space-y-1.5">
                {NODE_TYPES.map((t) => (
                  <li key={t}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DND_TYPE, t);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => addNode(t)}
                      className="flex w-full cursor-grab items-start gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left transition hover:border-brand/40 hover:bg-brand/[0.03] active:cursor-grabbing"
                      title="Arraste para o canvas ou clique para adicionar"
                    >
                      <span className="mt-0.5">{PALETTE_ICON[t]}</span>
                      <span>
                        <span className="block text-[13px] font-medium text-slate-800">{NODE_META[t].label}</span>
                        <span className="block text-[11px] leading-tight text-slate-500">{NODE_META[t].hint}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
                Conecte arrastando do ponto inferior de um elemento até o superior do próximo.
              </p>
            </aside>
          )}

          <div
            ref={wrapper}
            className="relative min-w-0 flex-1 bg-canvas"
            onDragOver={(e) => {
              if (readOnly) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              if (readOnly) return;
              const type = e.dataTransfer.getData(DND_TYPE) as NodeType;
              if (!type) return;
              e.preventDefault();
              addNode(type, screenToFlowPosition({ x: e.clientX - 110, y: e.clientY - 30 }));
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={displayEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onSelectionChange={onSelectionChange}
              nodesDraggable={!readOnly}
              nodesConnectable={!readOnly}
              deleteKeyCode={readOnly ? null : ["Delete", "Backspace"]}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
              minZoom={0.2}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#cbd5e1" />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap
                pannable
                zoomable
                position="bottom-right"
                nodeColor={(n) =>
                  n.type === "decision" ? "#a78bfa" : n.type === "end" ? "#0b1220" : n.type === "parallel_split" || n.type === "join" ? "#22d3ee" : "#93c5fd"
                }
                maskColor="rgba(248,250,252,0.7)"
                className="!rounded-lg !border !border-slate-200"
              />
            </ReactFlow>

            {nodes.length === 0 && !readOnly && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                <div className="pointer-events-auto w-full max-w-lg rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-xl backdrop-blur">
                  <h2 className="text-[16px] font-semibold text-slate-900">Desenhe o fluxo do processo</h2>
                  <p className="mt-1 text-[13px] text-slate-500">
                    Arraste elementos da coluna à esquerda para o quadro, ou comece de um modelo e ajuste como quiser.
                  </p>
                  <div className="mt-4 space-y-2">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => applyTemplate(t)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-brand/50 hover:bg-brand/[0.03]"
                      >
                        <span className="block text-[13px] font-medium text-slate-900">{t.name}</span>
                        <span className="block text-[12px] text-slate-500">{t.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {toast && (
              <div
                role="status"
                className={`absolute left-1/2 top-3 -translate-x-1/2 rounded-lg px-3 py-2 text-[13px] font-medium shadow-lg ${
                  toast.kind === "ok" ? "bg-navy text-white" : "bg-rose-600 text-white"
                }`}
              >
                {toast.text}
              </div>
            )}
          </div>

          <aside className="flex w-[320px] shrink-0 flex-col border-l border-slate-200 bg-white" aria-label="Propriedades e validação">
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {selectedNode ? (
                <NodeInspector
                  key={selectedNode.id}
                  node={selectedNode}
                  groups={groups}
                  readOnly={readOnly}
                  outgoing={edges.filter((e) => e.source === selectedNode.id)}
                  onChange={(patch) => patchNode(selectedNode.id, patch)}
                  onEdgeChange={patchEdge}
                  onSelectEdge={(id) => {
                    setNodes((ns) => ns.map((n) => ({ ...n, selected: false })));
                    setEdges((es) => es.map((e) => ({ ...e, selected: e.id === id })));
                  }}
                  onDelete={() => void deleteElements({ nodes: [{ id: selectedNode.id }] })}
                />
              ) : selectedEdge ? (
                <EdgeInspector
                  key={selectedEdge.id}
                  edge={selectedEdge}
                  sourceType={typeOf.get(selectedEdge.source)}
                  readOnly={readOnly}
                  onChange={(patch) => patchEdge(selectedEdge.id, patch)}
                  onDelete={() => void deleteElements({ edges: [{ id: selectedEdge.id }] })}
                />
              ) : (
                <div className="text-[13px] text-slate-500">
                  <h2 className="mb-1 text-[15px] font-semibold text-slate-900">Propriedades</h2>
                  Selecione um elemento ou uma conexão para editar responsável, SLA, opções e regras.
                  <dl className="mt-4 grid grid-cols-2 gap-2">
                    <Stat label="Elementos" value={nodes.length} />
                    <Stat label="Conexões" value={edges.length} />
                  </dl>
                </div>
              )}
            </div>

            <section className="max-h-[45%] shrink-0 overflow-y-auto border-t border-slate-200 bg-slate-50/60 p-4" aria-label="Validação">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Validação</h2>
                {!staleServer && <span className="text-[11px] text-slate-400">resultado da publicação</span>}
              </div>
              {panelIssues.length === 0 ? (
                <p className="flex items-center gap-2 text-[13px] text-emerald-700">
                  <CheckCircle2 className="size-4" /> Nenhum problema encontrado.
                </p>
              ) : (
                <ul className="space-y-1">
                  {panelIssues.map((i, idx) => (
                    <li key={idx}>
                      <button
                        type="button"
                        onClick={() => focusIssue(i)}
                        disabled={!i.nodeId}
                        className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[12px] leading-snug text-slate-700 transition hover:bg-white disabled:cursor-default"
                      >
                        {i.severity === "error" ? (
                          <XCircle className="mt-px size-3.5 shrink-0 text-rose-500" />
                        ) : (
                          <AlertTriangle className="mt-px size-3.5 shrink-0 text-amber-500" />
                        )}
                        {i.message}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </BuilderContext.Provider>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "published"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "draft"
        ? "bg-sky-50 text-sky-700 ring-sky-200"
        : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${style}`}>
      {status === "draft" && <Clock3 className="size-3" />}
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className="text-[18px] font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
