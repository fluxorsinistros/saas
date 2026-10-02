"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CircleDot, CircleStop, Clock, GitFork, GitMerge, Hourglass, ListTodo, Repeat, Users, Workflow } from "lucide-react";
import { formatSla, JOIN_RULE_LABEL, NODE_META } from "@/lib/workflow/types";
import { useBuilder, type FlowNode } from "./context";

function issueRing(issue: "error" | "warning" | undefined, selected: boolean) {
  if (selected) return "ring-2 ring-brand ring-offset-2 ring-offset-canvas";
  if (issue === "error") return "ring-2 ring-rose-400/80";
  if (issue === "warning") return "ring-2 ring-amber-300";
  return "";
}

function IssueDot({ issue, className = "" }: { issue?: "error" | "warning"; className?: string }) {
  if (!issue) return null;
  return (
    <span
      role="img"
      aria-label={issue === "error" ? "Erro de validação" : "Aviso de validação"}
      className={`absolute size-3 rounded-full border-2 border-white ${
        issue === "error" ? "bg-rose-500" : "bg-amber-400"
      } ${className || "-right-1.5 -top-1.5"}`}
    />
  );
}

function Chips({ data }: { data: FlowNode["data"] }) {
  const { groups } = useBuilder();
  const group = data.groupId ? groups.get(data.groupId) : null;
  const sla = formatSla(data.config.sla_minutes);
  if (!group && !sla && !data.config.loop_max) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {group && (
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
          <Users className="size-3" /> {group}
        </span>
      )}
      {sla && (
        <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-xs text-sky-800">
          <Clock className="size-3" /> SLA {sla}
        </span>
      )}
      {data.config.loop_max ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-xs text-violet-800">
          <Repeat className="size-3" /> até {data.config.loop_max}x
        </span>
      ) : null}
    </div>
  );
}

function In() {
  return <Handle type="target" position={Position.Top} />;
}
function Out() {
  return <Handle type="source" position={Position.Bottom} />;
}

function CardNode({
  node,
  icon,
  accent,
  dashed,
}: {
  node: NodeProps<FlowNode>;
  icon: React.ReactNode;
  accent: string;
  dashed?: boolean;
}) {
  const { nodeIssues } = useBuilder();
  const issue = nodeIssues.get(node.id);
  return (
    <div
      className={`relative w-[220px] rounded-xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_12px_rgba(15,23,42,0.05)] ${
        dashed ? "border border-dashed border-slate-300" : "border border-slate-200"
      } ${issueRing(issue, node.selected)}`}
    >
      <In />
      <IssueDot issue={issue} />
      <div className="px-3 pb-2.5 pt-2">
        <div className={`mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] ${accent}`}>
          {icon}
          {NODE_META[node.type].label}
        </div>
        <div className="text-[13px] font-medium leading-snug text-slate-900">
          {node.data.name || <span className="text-slate-500">Sem nome</span>}
        </div>
        <div className="mt-2 empty:hidden">
          <Chips data={node.data} />
        </div>
      </div>
      <Out />
    </div>
  );
}

export function StartNode(props: NodeProps<FlowNode>) {
  const { nodeIssues } = useBuilder();
  const issue = nodeIssues.get(props.id);
  const fieldCount = props.data.config.field_keys?.length ?? 0;
  return (
    <div
      className={`relative flex h-[44px] w-[180px] items-center justify-center gap-2 rounded-full bg-emerald-600 text-white shadow-md ${issueRing(
        issue,
        props.selected,
      )}`}
    >
      <IssueDot issue={issue} />
      <CircleDot className="size-4 text-emerald-200" />
      <span className="truncate text-[12px] font-medium">{props.data.name || "Início"}</span>
      {fieldCount > 0 && (
        <span className="rounded-full bg-emerald-800/60 px-1.5 text-xs font-semibold">{fieldCount}</span>
      )}
      <Out />
    </div>
  );
}

export function StageNode(props: NodeProps<FlowNode>) {
  return <CardNode node={props} icon={<Workflow className="size-3" />} accent="text-brand" />;
}

export function WaitNode(props: NodeProps<FlowNode>) {
  return <CardNode node={props} icon={<Hourglass className="size-3" />} accent="text-slate-500" dashed />;
}

export function PendingNode(props: NodeProps<FlowNode>) {
  return <CardNode node={props} icon={<ListTodo className="size-3" />} accent="text-rose-600" dashed />;
}

export function DecisionNode(props: NodeProps<FlowNode>) {
  const { nodeIssues, groups } = useBuilder();
  const issue = nodeIssues.get(props.id);
  const stroke = props.selected ? "var(--color-brand)" : issue === "error" ? "#fb7185" : issue === "warning" ? "#fcd34d" : "#c4b5fd";
  const group = props.data.groupId ? groups.get(props.data.groupId) : null;
  return (
    <div className="relative h-[124px] w-[190px]">
      <In />
      <svg className="absolute inset-0" viewBox="0 0 190 124" aria-hidden>
        <polygon
          points="95,2 188,62 95,122 2,62"
          fill="white"
          stroke={stroke}
          strokeWidth={props.selected || issue ? 2.5 : 1.5}
          style={{ filter: "drop-shadow(0 2px 6px rgba(15,23,42,0.08))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-9 text-center">
        <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-violet">Decisão</span>
        <span className="line-clamp-2 text-[12px] font-medium leading-tight text-slate-900">
          {props.data.name || <span className="text-slate-500">Sem nome</span>}
        </span>
        {group && <span className="mt-0.5 truncate text-xs text-slate-500">{group}</span>}
      </div>
      <IssueDot issue={issue} className="right-7 top-5" />
      <Out />
    </div>
  );
}

function BarNode({ node, kind }: { node: NodeProps<FlowNode>; kind: "split" | "join" }) {
  const { nodeIssues } = useBuilder();
  const issue = nodeIssues.get(node.id);
  const rule = node.data.config.join_rule ?? "all_required";
  return (
    <div
      className={`relative flex h-[46px] w-[220px] items-center gap-2 rounded-full border border-cyan-300 bg-cyan-50 px-4 ${issueRing(
        issue,
        node.selected,
      )}`}
    >
      <In />
      <IssueDot issue={issue} />
      {kind === "split" ? (
        <GitFork className="size-4 shrink-0 text-cyan-700" />
      ) : (
        <GitMerge className="size-4 shrink-0 text-cyan-700" />
      )}
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium text-slate-900">
          {node.data.name || NODE_META[node.type].label}
        </div>
        <div className="truncate text-xs text-cyan-800">
          {kind === "split"
            ? "Ramos em paralelo"
            : rule === "min_count"
              ? `Mínimo de ${node.data.config.min_count ?? "?"}`
              : JOIN_RULE_LABEL[rule]}
        </div>
      </div>
      <Out />
    </div>
  );
}

export function ParallelNode(props: NodeProps<FlowNode>) {
  return <BarNode node={props} kind="split" />;
}

export function JoinNode(props: NodeProps<FlowNode>) {
  return <BarNode node={props} kind="join" />;
}

export function EndNode(props: NodeProps<FlowNode>) {
  const { nodeIssues } = useBuilder();
  const issue = nodeIssues.get(props.id);
  return (
    <div
      className={`relative flex h-[44px] w-[160px] items-center justify-center gap-2 rounded-full bg-navy text-white shadow-md ${issueRing(
        issue,
        props.selected,
      )}`}
    >
      <In />
      <IssueDot issue={issue} />
      <CircleStop className="size-4 text-cyan-300" />
      <span className="truncate text-[12px] font-medium">{props.data.name || "Fim"}</span>
    </div>
  );
}

export const nodeTypes = {
  start: StartNode,
  stage: StageNode,
  decision: DecisionNode,
  parallel_split: ParallelNode,
  join: JoinNode,
  wait: WaitNode,
  pending: PendingNode,
  end: EndNode,
};
