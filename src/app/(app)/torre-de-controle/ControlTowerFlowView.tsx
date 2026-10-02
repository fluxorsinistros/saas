"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitBranch,
  Layers,
  RotateCcw,
  Workflow,
} from "lucide-react";
import { ExecutionGraph, type ExecutionEdge, type ExecutionNode } from "@/components/execution/ExecutionGraph";

export type FlowClaim = {
  claimId: string;
  claimNumber: string;
  cycleId: string;
  cycleNumber: number;
  status: string;
  isBlocked: boolean;
  enteredAt: string | null;
};

export type FlowVersionOption = {
  versionId: string;
  workflowId: string;
  workflowName: string;
  versionNumber: number;
  status: string;
  isPublished: boolean;
};

export type WorkflowGroupOption = {
  id: string;
  name: string;
  versions: FlowVersionOption[];
};

export type WorkflowOption = FlowVersionOption;

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  open: "Aberto",
  in_progress: "Em andamento",
  waiting: "Aguardando",
  blocked: "Bloqueado",
  completed: "Concluído",
  cancelled: "Cancelado",
  discarded: "Descartado",
};

export function ControlTowerFlowView({
  workflowGroups,
  selectedVersionId,
  selectedWorkflowName,
  selectedVersionNumber,
  selectedVersionIsPublished,
  selectedVersionStatus,
  execNodes,
  execEdges,
  claimsByNode,
  totalClaims,
  totalActive,
  totalBlocked,
  totalCompleted,
}: {
  workflowGroups: WorkflowGroupOption[];
  selectedVersionId: string;
  selectedWorkflowName: string;
  selectedVersionNumber: number;
  selectedVersionIsPublished: boolean;
  selectedVersionStatus: string;
  execNodes: ExecutionNode[];
  execEdges: ExecutionEdge[];
  claimsByNode: Record<string, FlowClaim[]>;
  totalClaims: number;
  totalActive: number;
  totalBlocked: number;
  totalCompleted: number;
}) {
  const router = useRouter();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectedNode = execNodes.find((n) => n.id === selectedNodeId);
  const selectedNodeClaims = selectedNodeId ? claimsByNode[selectedNodeId] ?? [] : [];

  // Lista de todos os sinistros caso nenhuma etapa esteja selecionada
  const allClaimsWithNode = Object.entries(claimsByNode).flatMap(([nodeId, claims]) => {
    const node = execNodes.find((n) => n.id === nodeId);
    return claims.map((c) => ({
      ...c,
      nodeId,
      nodeName: node?.name ?? "Etapa desconhecida",
      nodeType: node?.type ?? "stage",
    }));
  });

  const nodesWithClaims = execNodes.filter((n) => (claimsByNode[n.id]?.length ?? 0) > 0);

  const handleVersionChange = (versionId: string) => {
    setSelectedNodeId(null);
    router.push(`/torre-de-controle?aba=fluxo&versao=${versionId}`);
  };

  return (
    <div className="space-y-6">
      {/* Seletor de Fluxo & Métricas Rápidas */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
            <Workflow className="size-4 text-brand" />
            <span>Fluxo monitorado:</span>
          </div>

          <select
            value={selectedVersionId}
            onChange={(e) => handleVersionChange(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-800 shadow-xs outline-hidden focus:border-brand focus:ring-1 focus:ring-brand cursor-pointer"
          >
            {workflowGroups.map((group) =>
              workflowGroups.length > 1 ? (
                <optgroup key={group.id} label={group.name}>
                  {group.versions.map((v) => (
                    <option key={v.versionId} value={v.versionId}>
                      {v.workflowName} · v{v.versionNumber} {v.isPublished ? "(publicada)" : v.status === "draft" ? "(rascunho)" : `(${v.status})`}
                    </option>
                  ))}
                </optgroup>
              ) : (
                group.versions.map((v) => (
                  <option key={v.versionId} value={v.versionId}>
                    {v.workflowName} · v{v.versionNumber} {v.isPublished ? "(publicada)" : v.status === "draft" ? "(rascunho)" : `(${v.status})`}
                  </option>
                ))
              )
            )}
          </select>

          <span className="text-[12px] text-slate-500">
            {selectedVersionIsPublished
              ? `Versão ativa v${selectedVersionNumber}`
              : `Versão v${selectedVersionNumber} (${selectedVersionStatus === "draft" ? "rascunho" : selectedVersionStatus})`}
          </span>
        </div>

        {/* Indicadores rápidos deste fluxo */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[12px]">
            <span className="text-slate-500">Total:</span>
            <span className="font-semibold text-slate-900">{totalClaims}</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[12px]">
            <span className="text-sky-700">Em andamento:</span>
            <span className="font-semibold text-sky-800">{totalActive}</span>
          </div>

          {totalBlocked > 0 ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[12px]">
              <span className="text-rose-700">Bloqueados:</span>
              <span className="font-bold text-rose-800">{totalBlocked}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[12px]">
              <span className="text-slate-500">Bloqueados:</span>
              <span className="font-medium text-slate-600">0</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[12px]">
            <span className="text-emerald-700">Concluídos:</span>
            <span className="font-semibold text-emerald-800">{totalCompleted}</span>
          </div>
        </div>
      </div>

      {/* Canvas do Grafo com Bolinhas de Quantidade */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold text-slate-800">
              Distribuição Visual de Sinistros no Fluxo
            </h2>
            <span className="text-[12px] text-slate-500">
              (Clique em uma etapa para filtrar)
            </span>
          </div>

          {selectedNodeId && (
            <button
              type="button"
              onClick={() => setSelectedNodeId(null)}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline cursor-pointer"
            >
              <RotateCcw className="size-3" />
              Limpar seleção de etapa
            </button>
          )}
        </div>

        {/* Grafo Interativo */}
        <div className="relative">
          <ExecutionGraph
            nodes={execNodes}
            edges={execEdges}
            height={460}
            selectedNodeId={selectedNodeId}
            onNodeClick={(id) => setSelectedNodeId(selectedNodeId === id ? null : id)}
          />

          {/* Legenda visual sutil sobre o grafo */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-brand" />
                <span className="font-medium text-slate-700">Bolinha com número:</span> Qtd. de sinistros na etapa
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-sky-500" /> Em andamento
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-rose-500" /> Bloqueado
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-emerald-500" /> Concluído
              </span>
            </div>

            <div className="text-xs text-slate-500">
              Use a roda do mouse para dar zoom e arraste para navegar no fluxo
            </div>
          </div>
        </div>
      </div>

      {/* Atalhos Rápidos por Etapa */}
      {nodesWithClaims.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Etapas com sinistros no momento:
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedNodeId(null)}
              className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition cursor-pointer ${
                selectedNodeId === null
                  ? "bg-slate-800 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Todas as etapas ({totalClaims})
            </button>

            {nodesWithClaims.map((node) => {
              const count = claimsByNode[node.id]?.length ?? 0;
              const hasBlocked = claimsByNode[node.id]?.some((c) => c.isBlocked);
              const isSelected = selectedNodeId === node.id;

              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium transition cursor-pointer ${
                    isSelected
                      ? "bg-brand text-white shadow-xs"
                      : hasBlocked
                        ? "border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span>{node.name}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-xs font-bold ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : hasBlocked
                          ? "bg-rose-200 text-rose-900"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Detalhamento dos Sinistros da Etapa Selecionada (ou Todos) */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-slate-500" />
            <h3 className="text-[14px] font-semibold text-slate-800">
              {selectedNode
                ? `Sinistros na etapa: ${selectedNode.name}`
                : "Todos os Sinistros ativos neste Fluxo"}
            </h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {selectedNode ? selectedNodeClaims.length : allClaimsWithNode.length}
            </span>
          </div>

          <Link
            href="/sinistros"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"
          >
            Ver todos no painel de sinistros
            <ExternalLink className="size-3" />
          </Link>
        </div>

        {selectedNode && selectedNodeClaims.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-slate-500">
            Nenhum sinistro aguardando nesta etapa no momento.
          </div>
        ) : allClaimsWithNode.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-slate-500">
            Nenhum sinistro cadastrado para este fluxo.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {(selectedNode ? selectedNodeClaims : allClaimsWithNode).map((c) => {
              const nodeInfo = "nodeName" in c ? (c as { nodeName: string }) : null;
              return (
                <div
                  key={c.cycleId}
                  className="flex flex-col gap-2 px-5 py-3.5 transition hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/sinistros/${c.claimId}`}
                        className="text-[13px] font-semibold text-brand hover:underline"
                      >
                        {c.claimNumber}
                      </Link>

                      {c.isBlocked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                          <AlertTriangle className="size-3" />
                          Bloqueado
                        </span>
                      ) : c.status === "completed" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          <CheckCircle2 className="size-3" />
                          Concluído
                        </span>
                      ) : (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
                          {STATUS_LABELS[c.status] ?? c.status}
                        </span>
                      )}

                      {nodeInfo && !selectedNode && (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          Etapa: {nodeInfo.nodeName}
                        </span>
                      )}
                    </div>

                    {c.enteredAt && (
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="size-3" />
                        <span>Entrou em: {new Date(c.enteredAt).toLocaleString("pt-BR")}</span>
                      </div>
                    )}
                  </div>

                  <Link
                    href={`/sinistros/${c.claimId}`}
                    className="inline-flex items-center gap-1 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 sm:self-center cursor-pointer"
                  >
                    Abrir sinistro
                    <ArrowRight className="size-3 text-slate-500" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
