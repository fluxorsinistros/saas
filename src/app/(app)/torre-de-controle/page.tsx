import { formatDuration } from "@/lib/format";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BarChart3, CheckCircle2, Clock3, GitBranch, ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { loadOperationalSnapshot } from "@/lib/reports";
import { MagnitudeBars } from "@/components/reports/Bars";
import { loadGraph } from "@/lib/workflow/load-graph";
import type { ExecutionEdge, ExecutionNode } from "@/components/execution/ExecutionGraph";
import {
  ControlTowerFlowView,
  type FlowClaim,
  type FlowVersionOption,
  type WorkflowGroupOption,
} from "./ControlTowerFlowView";

export const metadata: Metadata = { title: "Torre de Controle" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  open: "Aberto",
  in_progress: "Em andamento",
  waiting: "Aguardando",
  blocked: "Bloqueado",
  completed: "Concluído",
  cancelled: "Cancelado",
  discarded: "Descartado",
  archived: "Arquivado",
};

const TABS = [
  { key: "numeros", label: "Indicadores e Prazos", icon: BarChart3 },
  { key: "fluxo", label: "Fluxo Visual", icon: GitBranch },
] as const;

export default async function TorreDeControlePage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; fluxo?: string; versao?: string; carregar?: string }>;
}) {
  const sp = await searchParams;
  const currentTab = sp.aba === "fluxo" ? "fluxo" : "numeros";

  const ctx = await getTenantContext();
  const supabase = await createClient();

  // Se a aba for "fluxo", carrega o grafo e as posições de cada sinistro nas etapas
  let flowViewProps = null;
  if (currentTab === "fluxo") {
    const { data: rawWorkflows } = await supabase
      .from("workflows")
      .select(`
        id,
        name,
        description,
        workflow_versions (
          id,
          version_number,
          status,
          published_at
        )
      `)
      .eq("tenant_id", ctx.tenantId)
      .order("name");

    const allVersions: FlowVersionOption[] = [];
    const workflowGroups: WorkflowGroupOption[] = [];

    for (const wf of rawWorkflows ?? []) {
      const versions: FlowVersionOption[] = [...(wf.workflow_versions ?? [])]
        .sort((a, b) => b.version_number - a.version_number)
        .map((v) => ({
          versionId: v.id,
          workflowId: wf.id,
          workflowName: wf.name,
          versionNumber: v.version_number,
          status: v.status,
          isPublished: v.status === "published",
        }));

      if (versions.length > 0) {
        workflowGroups.push({
          id: wf.id,
          name: wf.name,
          versions,
        });
        allVersions.push(...versions);
      }
    }

    const targetId = sp.versao || sp.fluxo;
    const selectedVersion =
      (targetId ? allVersions.find((v) => v.versionId === targetId) : undefined) ??
      (targetId ? allVersions.find((v) => v.workflowId === targetId && v.isPublished) : undefined) ??
      (targetId ? allVersions.find((v) => v.workflowId === targetId) : undefined) ??
      allVersions.find((v) => v.isPublished) ??
      allVersions[0];

    if (selectedVersion) {
      const graph = await loadGraph(supabase, selectedVersion.versionId);

      const { data: nodePositions } = await supabase
        .from("workflow_nodes")
        .select("id, position")
        .eq("workflow_version_id", selectedVersion.versionId);
      const positionById = new Map((nodePositions ?? []).map((n) => [n.id, n.position as unknown as { x: number; y: number }]));

      const { data: cycles } = await supabase
        .from("claim_cycles")
        .select(`
          id,
          claim_id,
          workflow_version_id,
          cycle_number,
          status,
          created_at,
          completed_at,
          claims (
            id,
            claim_number,
            created_at
          )
        `)
        .eq("workflow_version_id", selectedVersion.versionId)
        .neq("status", "discarded");

      const activeCycles = (cycles ?? []).filter((c) => c.status !== "completed");
      const activeCycleIds = activeCycles.map((c) => c.id);

      const { data: stageInstances } = activeCycleIds.length
        ? await supabase
            .from("stage_instances")
            .select("id, claim_cycle_id, node_id, status, entered_at, pass_number")
            .in("claim_cycle_id", activeCycleIds)
            .order("entered_at", { ascending: false })
        : { data: [] as { id: string; claim_cycle_id: string; node_id: string; status: string; entered_at: string; pass_number: number }[] };

      const claimsByNode: Record<string, FlowClaim[]> = {};
      for (const n of graph.nodes) {
        claimsByNode[n.id] = [];
      }

      const endNode = graph.nodes.find((n) => n.type === "end");
      const startNode = graph.nodes.find((n) => n.type === "start");

      for (const cycle of cycles ?? []) {
        const claim = cycle.claims as unknown as { id: string; claim_number: string } | null;
        if (!claim) continue;

        const flowClaim: FlowClaim = {
          claimId: claim.id,
          claimNumber: claim.claim_number,
          cycleId: cycle.id,
          cycleNumber: cycle.cycle_number,
          status: cycle.status,
          isBlocked: cycle.status === "blocked",
          enteredAt: null,
        };

        if (cycle.status === "completed") {
          if (endNode) {
            flowClaim.enteredAt = cycle.completed_at || cycle.created_at;
            claimsByNode[endNode.id].push(flowClaim);
          }
        } else {
          const cycleStages = (stageInstances ?? []).filter((s) => s.claim_cycle_id === cycle.id);
          const inProgressStages = cycleStages.filter((s) => s.status === "in_progress");

          if (inProgressStages.length > 0) {
            for (const stg of inProgressStages) {
              if (!claimsByNode[stg.node_id]) claimsByNode[stg.node_id] = [];
              claimsByNode[stg.node_id].push({
                ...flowClaim,
                enteredAt: stg.entered_at,
              });
            }
          } else if (cycleStages.length > 0) {
            const latest = cycleStages[0];
            if (!claimsByNode[latest.node_id]) claimsByNode[latest.node_id] = [];
            claimsByNode[latest.node_id].push({
              ...flowClaim,
              enteredAt: latest.entered_at,
            });
          } else if (startNode) {
            flowClaim.enteredAt = cycle.created_at;
            if (!claimsByNode[startNode.id]) claimsByNode[startNode.id] = [];
            claimsByNode[startNode.id].push(flowClaim);
          }
        }
      }

      const execNodes: ExecutionNode[] = graph.nodes.map((n) => {
        const pos = positionById.get(n.id) ?? { x: 0, y: 0 };
        const nodeClaims = claimsByNode[n.id] ?? [];
        const claimCount = nodeClaims.length;
        const blockedCount = nodeClaims.filter((c) => c.isBlocked).length;
        let status: ExecutionNode["status"] = "pending";
        if (claimCount > 0) {
          if (blockedCount > 0) status = "blocked";
          else if (n.type === "end") status = "completed";
          else status = "in_progress";
        }
        return {
          id: n.id,
          type: n.type,
          name: n.name,
          x: pos.x ?? 0,
          y: pos.y ?? 0,
          status,
          claimCount,
          blockedCount,
        };
      });

      const execEdges: ExecutionEdge[] = graph.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label || undefined,
      }));

      const totalClaims = (cycles ?? []).length;
      const totalActive = (cycles ?? []).filter((c) => c.status !== "completed").length;
      const totalBlocked = (cycles ?? []).filter((c) => c.status === "blocked").length;
      const totalCompleted = (cycles ?? []).filter((c) => c.status === "completed").length;

      flowViewProps = {
        workflowGroups,
        selectedVersionId: selectedVersion.versionId,
        selectedWorkflowName: selectedVersion.workflowName,
        selectedVersionNumber: selectedVersion.versionNumber,
        selectedVersionIsPublished: selectedVersion.isPublished,
        selectedVersionStatus: selectedVersion.status,
        execNodes,
        execEdges,
        claimsByNode,
        totalClaims,
        totalActive,
        totalBlocked,
        totalCompleted,
      };
    }
  }

  // Carrega snapshot se estiver na aba de números/indicadores
  // Os indicadores varrem todos os ciclos do tenant: só carregam depois de pedir, nunca sozinhos ao abrir a tela.
  const snap = currentTab === "numeros" && sp.carregar === "1" ? await loadOperationalSnapshot(supabase, ctx.tenantId) : null;
  const open = snap
    ? (snap.statusCounts.open ?? 0) + (snap.statusCounts.in_progress ?? 0) + (snap.statusCounts.waiting ?? 0)
    : 0;
  const blocked = snap?.statusCounts.blocked ?? 0;
  const completed = snap?.statusCounts.completed ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-wide px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Torre de Controle</h1>
        <p className="mt-1 max-w-xl text-[14px] text-slate-500">Onde está o gargalo, agora — não uma foto de ontem.</p>

        {/* Abas da Torre de Controle: Dividindo números e fluxo visual */}
        <nav className="mt-6 flex flex-wrap gap-1 border-b border-slate-200" aria-label="Abas da Torre de Controle">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.key === currentTab;
            return (
              <Link
                key={t.key}
                href={t.key === "numeros" ? "/torre-de-controle" : `/torre-de-controle?aba=${t.key}`}
                className={`-mb-px flex items-center gap-2 rounded-t-lg border px-4 py-2.5 text-[13px] font-medium transition cursor-pointer ${
                  active
                    ? "border-slate-200 border-b-white bg-white text-brand shadow-[0_-1px_2px_rgba(0,0,0,0.03)]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon className={`size-4 ${active ? "text-brand" : "text-slate-500"}`} />
                {t.label}
              </Link>
            );
          })}
        </nav>

        {/* Aba 1: Indicadores e Prazos (Números) */}
        {currentTab === "numeros" && !snap && (
          <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <BarChart3 className="size-8 text-slate-300" />
            <p className="text-[15px] font-medium text-slate-800">Os indicadores não carregam sozinhos</p>
            <p className="max-w-sm text-[13px] text-slate-500">Eles somam todos os sinistros da empresa. Carregue quando precisar.</p>
            <Link
              href="/torre-de-controle?carregar=1"
              className="rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600"
            >
              Carregar indicadores
            </Link>
          </div>
        )}

        {currentTab === "numeros" && snap && (
          <div className="mt-6 space-y-8">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Total" value={snap.totalCycles} tone="neutral" />
              <Stat label="Em andamento" value={open} tone="brand" />
              <Stat label="Bloqueados" value={blocked} tone="danger" />
              <Stat label="Concluídos" value={completed} tone="ok" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Atrasados (SLA)" value={snap.slaOverdue.length} tone="danger" />
              <Stat label="Próximos do prazo" value={snap.slaAtRisk.length} tone="warning" />
            </div>

            {(snap.slaOverdue.length > 0 || snap.slaAtRisk.length > 0) && (
              <section>
                <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  <Clock3 className="size-3.5" /> Prazos (SLA)
                </h2>
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {snap.slaOverdue.map((s) => (
                    <li key={s.cycleId} className="flex items-center justify-between px-4 py-2.5">
                      <Link href={`/sinistros/${s.claimId}`} className="text-[13px] text-slate-800 hover:underline">
                        {s.claimNumber}
                      </Link>
                      <span className="text-[12px] font-medium text-rose-700">{formatDuration(s.minutesOverdue)} em atraso</span>
                    </li>
                  ))}
                  {snap.slaAtRisk.map((s) => (
                    <li key={s.cycleId} className="flex items-center justify-between px-4 py-2.5">
                      <Link href={`/sinistros/${s.claimId}`} className="text-[13px] text-slate-800 hover:underline">
                        {s.claimNumber}
                      </Link>
                      <span className="text-[12px] font-medium text-amber-700">faltam {formatDuration(Math.abs(s.minutesOverdue))}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                <AlertTriangle className="size-3.5" /> Precisa de atenção agora
              </h2>
              {snap.blocked.length === 0 ? (
                <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] text-emerald-700">
                  <CheckCircle2 className="size-4" /> Nenhum ciclo bloqueado.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-rose-200 bg-white">
                  {snap.blocked.map((b) => (
                    <li key={b.cycleId} className="px-4 py-3">
                      <Link href={`/sinistros/${b.claimId}`} className="text-[13px] font-medium text-slate-900 hover:underline">
                        {b.claimNumber}
                      </Link>
                      <p className="mt-0.5 text-[12px] text-rose-700">{b.reason ?? "Motivo não registrado."}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                <Clock3 className="size-3.5" /> Aging — mais tempo em aberto
              </h2>
              {snap.aging.length === 0 ? (
                <p className="text-[13px] text-slate-500">Nada em aberto no momento.</p>
              ) : (
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {snap.aging.map((a) => (
                    <li key={a.cycleId} className="flex items-center justify-between px-4 py-2.5">
                      <Link href={`/sinistros/${a.claimId}`} className="text-[13px] text-slate-800 hover:underline">
                        {a.claimNumber}
                      </Link>
                      <span className="text-[12px] text-slate-500">
                        {STATUS_LABEL[a.status] ?? a.status} · {a.days === 0 ? "hoje" : `${a.days}d`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                <ListChecks className="size-3.5" /> Backlog por grupo
              </h2>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <MagnitudeBars
                  items={snap.backlogByGroup.map((g) => ({ label: g.groupName, count: g.count }))}
                  emptyLabel="Nenhuma atividade em aberto."
                />
              </div>
            </section>
          </div>
        )}

        {/* Aba 2: Fluxo Visual (Grafo do processo com bolinhas de quantidade de sinistros) */}
        {currentTab === "fluxo" && (
          <div className="mt-6">
            {flowViewProps ? (
              <ControlTowerFlowView {...flowViewProps} />
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
                <GitBranch className="mx-auto size-8 text-slate-500" />
                <h3 className="mt-3 text-[15px] font-semibold text-slate-800">Nenhum fluxo encontrado</h3>
                <p className="mt-1 text-[13px] text-slate-500">
                  Crie ou publique um fluxo de processo para visualizar a distribuição dos sinistros no grafo.
                </p>
                <div className="mt-4">
                  <Link
                    href="/fluxos"
                    className="inline-flex items-center rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-xs hover:bg-brand-hover"
                  >
                    Ir para Fluxos
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "brand" | "danger" | "ok" | "warning" }) {
  const toneClass =
    tone === "danger"
      ? "text-rose-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "ok"
          ? "text-emerald-600"
          : tone === "brand"
            ? "text-brand"
            : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[12px] text-slate-500">{label}</div>
      <div className={`mt-1 text-[22px] font-semibold tracking-tight ${toneClass}`}>{value}</div>
    </div>
  );
}
