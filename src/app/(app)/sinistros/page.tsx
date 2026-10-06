import { GroupChip } from "@/lib/group-icons";
import { getMemberGroups } from "@/lib/active-group";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ChevronRight, Clock3, FileWarning, Layers, LayoutGrid, Plus, RotateCcw, SearchX, Table2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes } from "@/lib/permissions";
import { computeProcessProgress, computeSla, formatDuration } from "@/lib/format";
import { SinistrosFilterBar } from "./SinistrosFilterBar";

export const metadata: Metadata = { title: "Sinistros" };

const CYCLE_STATUS_LABEL: Record<string, string> = {
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

const CYCLE_STATUS_STYLE: Record<string, string> = {
  blocked: "bg-rose-50 text-rose-700 ring-rose-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  open: "bg-sky-50 text-sky-700 ring-sky-200",
  in_progress: "bg-sky-50 text-sky-700 ring-sky-200",
};

function formatRelativeDuration(isoString: string | null | undefined): string {
  if (!isoString) return "";
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (diffMs < 0) return "agora";
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "menos de 1 min";
  if (diffMin < 60) return `${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? "hora" : "horas"}`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays} ${diffDays === 1 ? "dia" : "dias"}`;
  }
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} ${diffMonths === 1 ? "mês" : "meses"}`;
}

function formatDurationBetween(startIso: string | null | undefined, endIso: string | null | undefined): string {
  if (!startIso) return "";
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);
  const diffMin = Math.floor(diffMs / 60_000);
  return formatDuration(diffMin);
}

type SearchParams = {
  grupo?: string;
  fluxo?: string;
  etapa?: string;
  sla_etapa?: string;
  sla_total?: string;
  situacao?: string;
  searched?: string;
  pagina?: string;
  visao?: string;
  agrupar?: string;
  por?: string;
};

export default async function SinistrosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const perms = await getPermissionCodes(ctx.userId, ctx.tenantId);

  // Quem é Administrador vê e escolhe qualquer grupo (inclusive "Todos"); Operador só enxerga os
  // próprios grupos, grupo é conceito de Operador (decisão do usuário), igual à visibilidade de
  // menu em src/lib/screens.ts.
  const { isAdmin, active: activeGroup } = await getMemberGroups(ctx.userId, ctx.tenantId);
  // Operador atua num grupo por vez (o ativo na sessão); só ele aparece e vale nos filtros.
  const myGroupsFull = activeGroup ? [activeGroup] : [];
  const myGroups = myGroupsFull.map((g) => ({ id: g.id, name: g.name, icon: g.icon, color: g.color }));
  // Restrição adicional do grupo sobre claim.formalize (Documento 1 §32 + aba "Ações" do grupo):
  // Administrador nunca é afetado; Operador precisa do grupo ativo liberar a ação.
  const canFormalize = isAdmin || myGroupsFull.some((g) => !g.disabled_actions.includes("claim.formalize"));

  const { data: allGroups } = isAdmin
    ? await supabase.from("groups").select("id, name, icon, color").eq("tenant_id", ctx.tenantId).eq("status", "active").order("name")
    : { data: [] as { id: string; name: string; icon: string | null; color: string | null }[] };
  const groupOptions = isAdmin ? allGroups ?? [] : myGroups;

  const sp = await searchParams;
  const requestedGroup = sp.grupo ?? "";
  const requestedWorkflow = sp.fluxo ?? "";
  const requestedStage = sp.etapa ?? "";
  const requestedSlaEtapa = sp.sla_etapa ?? "";
  const requestedSlaTotal = sp.sla_total ?? "";
  const requestedSituacao = sp.situacao ?? "";

  // Operador sem grupo escolhido vê só o(s) próprio(s); "todos" só existe pra Administrador.
  const groupFilter = isAdmin
    ? requestedGroup === "todos" || !requestedGroup
      ? null
      : (groupOptions.find((g) => g.id === requestedGroup)?.id ?? null)
    : (groupOptions.find((g) => g.id === requestedGroup)?.id ?? groupOptions[0]?.id ?? null);

  const hasActiveFilters = Boolean(
    requestedWorkflow ||
      requestedStage ||
      (requestedGroup && requestedGroup !== "todos") ||
      requestedSlaEtapa ||
      requestedSlaTotal ||
      requestedSituacao
  );
  // A lista só consulta o banco depois de "Filtrar" (ou com filtro na URL), nunca sozinha ao abrir a tela.
  const searched = sp.searched === "1" || hasActiveFilters;
  // Quantos sinistros aparecem por vez (10, 30 ou 50): a lista nunca monta centenas de linhas de uma vez.
  const PAGE_SIZE = [10, 30, 50].includes(Number(sp.por)) ? Number(sp.por) : 10;
  const visao = sp.visao === "tabela" ? "tabela" : "cartoes";
  const agrupar = ["situacao", "grupo", "fluxo"].includes(sp.agrupar ?? "") ? (sp.agrupar as "situacao" | "grupo" | "fluxo") : "";
  const page = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);

  // Carrega fluxos, versões e etapas ativas para os filtros dinâmicos
  const [
    { data: allWorkflows },
    { data: allVersions },
  ] = await Promise.all([
    supabase
      .from("workflows")
      .select("id, name")
      .eq("tenant_id", ctx.tenantId)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("workflow_versions")
      .select("id, workflow_id, status")
      .eq("tenant_id", ctx.tenantId),
  ]);
  // Opções de etapa só vêm das versões publicadas: carregar o histórico inteiro de nós do tenant só pesa a tela.
  const publishedVersionIds = (allVersions ?? []).filter((v) => v.status === "published").map((v) => v.id);
  const { data: allNodes } = publishedVersionIds.length
    ? await supabase
        .from("workflow_nodes")
        .select("id, workflow_version_id, name, node_type")
        .in("workflow_version_id", publishedVersionIds)
        .in("node_type", ["stage", "wait", "decision"])
    : { data: [] as { id: string; workflow_version_id: string; name: string; node_type: string }[] };

  const versionToWorkflow = new Map<string, string>();
  const workflowById = new Map<string, { id: string; name: string }>();
  const stagesByWorkflowId = new Map<string, Set<string>>();
  const allStageNamesSet = new Set<string>();

  for (const w of allWorkflows ?? []) {
    workflowById.set(w.id, { id: w.id, name: w.name });
    stagesByWorkflowId.set(w.id, new Set());
  }

  for (const v of allVersions ?? []) {
    versionToWorkflow.set(v.id, v.workflow_id);
  }

  for (const node of allNodes ?? []) {
    const stageName = node.name?.trim();
    if (!stageName) continue;
    allStageNamesSet.add(stageName);

    const wfId = versionToWorkflow.get(node.workflow_version_id);
    if (wfId && stagesByWorkflowId.has(wfId)) {
      stagesByWorkflowId.get(wfId)!.add(stageName);
    }
  }

  const workflowStagesMap: Record<string, string[]> = {};
  for (const [wfId, set] of stagesByWorkflowId.entries()) {
    workflowStagesMap[wfId] = [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }
  const allStageNames = [...allStageNamesSet].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const options = (allWorkflows ?? []).filter((w) =>
    (allVersions ?? []).some((v) => v.workflow_id === w.id && v.status === "published"),
  );

  let claims: {
    id: string;
    claim_number: string;
    status: string;
    created_at: string;
    custom_fields: unknown;
    claim_cycles: {
      id: string;
      status: string;
      cycle_number: number;
      formalized_at: string | null;
      completed_at: string | null;
      workflow_version_id: string;
    }[];
  }[] = [];
  let currentCycleByClaim = new Map<
    string,
    | {
        id: string;
        status: string;
        cycle_number: number;
        formalized_at: string | null;
        completed_at: string | null;
        workflow_version_id: string;
      }
    | undefined
  >();
  const groupsByCycle = new Map<string, Set<string>>();
  const stagesByCycle = new Map<string, { id: string; name: string; entered_at: string; sla_minutes?: number }[]>();
  const completedStagesByCycle = new Map<string, Set<string>>();
  const stepsByVersion = new Map<string, { id: string; name: string; sla_minutes: number }[]>();
  const totalSlaByVersion = new Map<string, number>();
  const fieldLabelByWorkflowKey = new Map<string, string>();
  let groupNameById = new Map<string, string>();
  let groupMetaById = new Map<string, { icon: string | null; color: string | null }>();
  let visibleClaims: typeof claims = [];
  const CLAIM_FETCH_CAP = 300;
  let capped = false;

  if (searched) {
    const { data: claimRows } = await supabase
      .from("claims")
      .select("id, claim_number, status, created_at, custom_fields, claim_cycles(id, status, cycle_number, formalized_at, completed_at, workflow_version_id)")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false })
      .limit(CLAIM_FETCH_CAP);
    claims = claimRows ?? [];
    capped = claims.length >= CLAIM_FETCH_CAP;

    // Identidade do sinistro na lista: os primeiros valores dos campos de abertura (placa, segurado...)
    //, sem isso o operador só tem o número e precisa abrir cada cartão.
    const { data: fieldDefs } = await supabase
      .from("workflow_fields")
      .select("workflow_id, key, label")
      .eq("tenant_id", ctx.tenantId)
      .in("field_type", ["text", "number", "date", "select"]);
    for (const f of fieldDefs ?? []) fieldLabelByWorkflowKey.set(`${f.workflow_id}:${f.key}`, f.label);

    // Grupo "responsável agora" = grupo da(s) atividade(s) em aberto do ciclo atual de cada
    // sinistro (pode ter mais de um em paralelo), é isso que responde "o que está na fila do meu grupo".
    currentCycleByClaim = new Map(claims.map((c) => [c.id, [...c.claim_cycles].sort((a, b) => b.cycle_number - a.cycle_number)[0]]));
    const cycleIds = [...currentCycleByClaim.values()].filter(Boolean).map((c) => c!.id);
    
    // Versões de workflow utilizadas pelos ciclos
    const versionIds = [
      ...new Set(
        [...currentCycleByClaim.values()]
          .filter(Boolean)
          .map((c) => c!.workflow_version_id)
          .filter(Boolean),
      ),
    ];

    // Carrega todos os nós das versões para obter nomes, tipo e SLA de cada etapa
    const { data: allVersionNodes } = versionIds.length
      ? await supabase
          .from("workflow_nodes")
          .select("id, workflow_version_id, node_type, name, config")
          .in("workflow_version_id", versionIds)
      : { data: [] as { id: string; workflow_version_id: string; node_type: string; name: string; config: unknown }[] };

    const nodeById = new Map<string, { id: string; name: string; node_type: string; sla_minutes?: number }>();
    const STEP_NODE_TYPES = new Set(["stage", "wait", "decision"]);

    for (const n of allVersionNodes ?? []) {
      const cfg = (n.config ?? {}) as { sla_minutes?: number };
      const slaMin = typeof cfg.sla_minutes === "number" && cfg.sla_minutes > 0 ? cfg.sla_minutes : undefined;
      nodeById.set(n.id, { id: n.id, name: n.name, node_type: n.node_type, sla_minutes: slaMin });

      if (STEP_NODE_TYPES.has(n.node_type)) {
        if (!stepsByVersion.has(n.workflow_version_id)) {
          stepsByVersion.set(n.workflow_version_id, []);
        }
        stepsByVersion.get(n.workflow_version_id)!.push({
          id: n.id,
          name: n.name,
          sla_minutes: slaMin ?? 60, // peso padrão caso a etapa não tenha sla_minutes
        });
      }

      if (slaMin) {
        totalSlaByVersion.set(n.workflow_version_id, (totalSlaByVersion.get(n.workflow_version_id) ?? 0) + slaMin);
      }
    }

    // Carrega todas as etapas dos ciclos para saber quais foram concluídas e quais estão em andamento
    const { data: allCycleStages } = cycleIds.length
      ? await supabase
          .from("stage_instances")
          .select("id, claim_cycle_id, node_id, status, entered_at")
          .in("claim_cycle_id", cycleIds)
      : { data: [] as { id: string; claim_cycle_id: string; node_id: string; status: string; entered_at: string }[] };

    const openStages = (allCycleStages ?? []).filter((s) => s.status === "in_progress");

    for (const s of allCycleStages ?? []) {
      if (s.status === "completed") {
        if (!completedStagesByCycle.has(s.claim_cycle_id)) {
          completedStagesByCycle.set(s.claim_cycle_id, new Set());
        }
        completedStagesByCycle.get(s.claim_cycle_id)!.add(s.node_id);
      }
    }

    for (const s of openStages) {
      if (!stagesByCycle.has(s.claim_cycle_id)) {
        stagesByCycle.set(s.claim_cycle_id, []);
      }
      const node = nodeById.get(s.node_id);
      stagesByCycle.get(s.claim_cycle_id)!.push({
        id: s.id,
        name: node?.name || "Etapa",
        entered_at: s.entered_at,
        sla_minutes: node?.sla_minutes,
      });
    }

    const stageIds = openStages.map((s) => s.id);
    const { data: openActivities } = stageIds.length
      ? await supabase.from("activity_instances").select("stage_instance_id, group_id").in("stage_instance_id", stageIds).in("status", ["not_started", "in_progress"])
      : { data: [] as { stage_instance_id: string; group_id: string | null }[] };
    const cycleOfStage = new Map(openStages.map((s) => [s.id, s.claim_cycle_id]));
    for (const a of openActivities ?? []) {
      if (!a.group_id) continue;
      const cycleId = cycleOfStage.get(a.stage_instance_id);
      if (!cycleId) continue;
      if (!groupsByCycle.has(cycleId)) groupsByCycle.set(cycleId, new Set());
      groupsByCycle.get(cycleId)!.add(a.group_id);
    }
    groupNameById = new Map(groupOptions.map((g) => [g.id, g.name]));
    groupMetaById = new Map(groupOptions.map((g) => [g.id, { icon: g.icon, color: g.color }]));

    visibleClaims = claims.filter((c) => {
      const cycle = currentCycleByClaim.get(c.id);
      const status = cycle?.status ?? c.status;
      const isCompleted = status === "completed";
      const cycleWfId = cycle ? versionToWorkflow.get(cycle.workflow_version_id) : undefined;
      const activeStages = cycle ? (stagesByCycle.get(cycle.id) ?? []) : [];
      const activeGroups = cycle ? (groupsByCycle.get(cycle.id) ?? new Set()) : new Set();
      const totalFlowSlaMinutes = cycle ? totalSlaByVersion.get(cycle.workflow_version_id) : undefined;
      const totalFlowSla = !isCompleted && cycle ? computeSla(cycle.formalized_at || c.created_at, totalFlowSlaMinutes) : null;

      // 1. Filtro de Fluxo (independente da versão)
      if (requestedWorkflow && cycleWfId !== requestedWorkflow) {
        return false;
      }

      // 2. Filtro de Etapa Atual
      if (requestedStage) {
        const inStage = activeStages.some((st) => st.name.toLowerCase() === requestedStage.toLowerCase());
        if (!inStage) return false;
      }

      // 3. Filtro de Grupo Responsável Agora
      if (groupFilter && !activeGroups.has(groupFilter)) {
        return false;
      }

      // 4. Filtro de SLA da Etapa
      if (requestedSlaEtapa === "atrasado") {
        const hasBreachedStage = activeStages.some((st) => computeSla(st.entered_at, st.sla_minutes)?.isBreached);
        if (isCompleted || !hasBreachedStage) return false;
      } else if (requestedSlaEtapa === "no_prazo") {
        const hasBreachedStage = activeStages.some((st) => computeSla(st.entered_at, st.sla_minutes)?.isBreached);
        if (isCompleted || activeStages.length === 0 || hasBreachedStage) return false;
      }

      // 5. Filtro de SLA Total Geral do Fluxo
      if (requestedSlaTotal === "atrasado") {
        if (isCompleted || !totalFlowSla?.isBreached) return false;
      } else if (requestedSlaTotal === "no_prazo") {
        if (isCompleted || !totalFlowSla || totalFlowSla.isBreached) return false;
      }

      // 6. Filtro de Situação / Status
      if (requestedSituacao === "aberto") {
        if (isCompleted || status === "cancelled" || status === "discarded" || status === "archived") return false;
      } else if (requestedSituacao === "pausado") {
        if (status !== "blocked" && status !== "waiting") return false;
      } else if (requestedSituacao === "fechado") {
        if (!["completed", "cancelled", "discarded", "archived"].includes(status)) return false;
      }

      return true;
    });
  }

  // Agrupamento: cada sinistro ganha uma chave (situação, grupo responsável agora ou fluxo) e a lista sai ordenada por ela.
  const closedStatuses = ["completed", "cancelled", "discarded", "archived"];
  const groupOf = (c: (typeof visibleClaims)[number]): { key: string; order: number } => {
    const cycle = currentCycleByClaim.get(c.id);
    const status = cycle?.status ?? c.status;
    if (agrupar === "situacao") {
      if (status === "blocked") return { key: "Bloqueados", order: 1 };
      if (closedStatuses.includes(status)) return { key: "Fechados", order: 2 };
      return { key: "Abertos", order: 0 };
    }
    if (agrupar === "grupo") {
      const names = cycle ? [...(groupsByCycle.get(cycle.id) ?? [])].map((id) => groupNameById.get(id)).filter(Boolean) : [];
      return names.length ? { key: names.join(", "), order: 0 } : { key: "Sem grupo responsável", order: 1 };
    }
    if (agrupar === "fluxo") {
      const wf = cycle ? workflowById.get(versionToWorkflow.get(cycle.workflow_version_id) ?? "") : undefined;
      return { key: wf?.name ?? "Sem fluxo", order: 0 };
    }
    return { key: "", order: 0 };
  };
  const orderedClaims = agrupar
    ? visibleClaims
        .map((c) => ({ c, g: groupOf(c) }))
        .sort((a, b) => a.g.order - b.g.order || a.g.key.localeCompare(b.g.key, "pt-BR"))
    : visibleClaims.map((c) => ({ c, g: { key: "", order: 0 } }));
  const shownClaims = orderedClaims.slice(0, page * PAGE_SIZE);
  const groupCounts = new Map<string, number>();
  for (const { g } of orderedClaims) groupCounts.set(g.key, (groupCounts.get(g.key) ?? 0) + 1);
  const listItems: ({ kind: "header"; key: string; count: number } | { kind: "claim"; claim: (typeof visibleClaims)[number] })[] = [];
  shownClaims.forEach(({ c, g }, i) => {
    if (agrupar && (i === 0 || shownClaims[i - 1].g.key !== g.key)) listItems.push({ kind: "header", key: g.key, count: groupCounts.get(g.key) ?? 0 });
    listItems.push({ kind: "claim", claim: c });
  });
  const paramsWith = (over: Record<string, string>) => {
    const base = Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    delete base.pagina;
    const qs = new URLSearchParams({ ...base, searched: "1", ...over });
    for (const [k, v] of [...qs.entries()]) if (v === "") qs.delete(k);
    return `/sinistros?${qs.toString()}`;
  };
  const seg = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition ${active ? "bg-selected text-white" : "text-slate-700 hover:bg-white/60"}`;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-wide px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Sinistros</h1>
            <p className="mt-1 max-w-xl text-[14px] text-slate-700">
              Cada sinistro formalizado abre um ciclo preso à versão publicada do fluxo escolhido, mudanças futuras no fluxo não
              afetam ciclos já abertos.
            </p>
          </div>

          {!perms.has("claim.formalize") || !canFormalize ? null : options.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-[13px] text-slate-500">
              Nenhum fluxo publicado ainda.{" "}
              <Link href="/fluxos" className="font-medium text-brand hover:underline">
                Publique um fluxo
              </Link>{" "}
              antes de abrir um sinistro.
            </div>
          ) : (
            <form action="/sinistros/novo" className="flex w-full items-center gap-2 sm:w-auto">
              <label htmlFor="workflow_id" className="sr-only">
                Fluxo publicado
              </label>
              <select
                id="workflow_id"
                name="fluxo"
                required
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 sm:w-64 sm:flex-none"
              >
                <option value="">Selecione o fluxo publicado…</option>
                {options.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <button className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600">
                <Plus className="size-4" /> Formalizar sinistro
              </button>
            </form>
          )}
        </div>

        <div className="mt-6">
          <SinistrosFilterBar
            workflows={allWorkflows ?? []}
            workflowStagesMap={workflowStagesMap}
            allStages={allStageNames}
            groups={groupOptions}
            isAdmin={isAdmin}
            currentFilters={{
              fluxo: requestedWorkflow,
              etapa: requestedStage,
              grupo: requestedGroup,
              sla_etapa: requestedSlaEtapa,
              sla_total: requestedSlaTotal,
              situacao: requestedSituacao,
            }}
            totalCount={visibleClaims.length}
          />
        </div>

        {searched && visibleClaims.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-slate-700">
            <div className="flex items-center gap-1.5" role="group" aria-label="Forma de exibição">
              <span className="font-medium">Ver como</span>
              <Link href={paramsWith({ visao: "" })} scroll={false} className={seg(visao === "cartoes")}>
                <LayoutGrid className="size-3.5" /> Cartões
              </Link>
              <Link href={paramsWith({ visao: "tabela" })} scroll={false} className={seg(visao === "tabela")}>
                <Table2 className="size-3.5" /> Tabela
              </Link>
            </div>
            <div className="flex items-center gap-1.5" role="group" aria-label="Agrupar por">
              <span className="font-medium">Agrupar por</span>
              {([["", "Nenhum"], ["situacao", "Situação"], ["grupo", "Grupo"], ["fluxo", "Fluxo"]] as const).map(([v, label]) => (
                <Link key={v} href={paramsWith({ agrupar: v })} scroll={false} className={seg(agrupar === v)}>
                  {label}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-1.5" role="group" aria-label="Quantidade por vez">
              <span className="font-medium">Mostrar</span>
              {[10, 30, 50].map((n) => (
                <Link key={n} href={paramsWith({ por: n === 10 ? "" : String(n) })} scroll={false} className={seg(PAGE_SIZE === n)}>
                  {n}
                </Link>
              ))}
            </div>
          </div>
        )}

        {!searched ? (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <SearchX className="mx-auto size-8 text-slate-300" />
            <p className="text-[15px] font-medium text-slate-800">Clique em Filtrar para ver os sinistros</p>
            <p className="max-w-sm text-[13px] text-slate-500">A lista não carrega sozinha ao abrir a tela.</p>
          </div>
        ) : !visibleClaims.length ? (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <FileWarning className="mx-auto size-8 text-slate-300" />
            <p className="mt-3 text-[15px] font-medium text-slate-800">
              {claims?.length ? "Nenhum sinistro encontrado com os filtros selecionados." : "Nenhum sinistro cadastrado ainda."}
            </p>
            {hasActiveFilters && (
              <div className="mt-3">
                <Link
                  href="/sinistros?searched=1"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  <RotateCcw className="size-3.5 text-slate-500" />
                  Limpar todos os filtros
                </Link>
              </div>
            )}
          </div>
        ) : visao === "tabela" ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">Sinistro</th>
                  <th className="px-3 py-2.5">Identificação</th>
                  <th className="px-3 py-2.5">Fluxo</th>
                  <th className="px-3 py-2.5">Etapa atual</th>
                  <th className="px-3 py-2.5">Grupo</th>
                  <th className="px-3 py-2.5">Progresso</th>
                  <th className="px-3 py-2.5">Situação</th>
                  <th className="px-3 py-2.5">Criado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listItems.map((it) => {
                  if (it.kind === "header")
                    return (
                      <tr key={`h-${it.key}`} className="bg-slate-100/70">
                        <td colSpan={8} className="px-3 py-2 text-[12px] font-semibold text-slate-800">
                          {it.key} <span className="font-normal text-slate-600">({it.count})</span>
                        </td>
                      </tr>
                    );
                  const c = it.claim;
                  const cycle = currentCycleByClaim.get(c.id);
                  const status = cycle?.status ?? c.status;
                  const wfId = cycle ? versionToWorkflow.get(cycle.workflow_version_id) : undefined;
                  const idValues = Object.entries((c.custom_fields ?? {}) as Record<string, string>)
                    .map(([key, value]) => ({ label: wfId ? fieldLabelByWorkflowKey.get(`${wfId}:${key}`) : undefined, value }))
                    .filter((v): v is { label: string; value: string } => !!v.label && !!v.value)
                    .slice(0, 2);
                  const stageNames = cycle ? (stagesByCycle.get(cycle.id) ?? []).map((st) => st.name) : [];
                  const groupNames = cycle ? [...(groupsByCycle.get(cycle.id) ?? [])].map((id) => groupNameById.get(id)).filter(Boolean) : [];
                  const prog = computeProcessProgress(
                    status === "completed",
                    cycle?.workflow_version_id,
                    cycle ? completedStagesByCycle.get(cycle.id) : undefined,
                    stepsByVersion,
                  );
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2.5 font-semibold text-slate-900">
                        <Link href={`/sinistros/${c.id}`} className="hover:text-brand hover:underline">
                          {c.claim_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{idValues.length ? idValues.map((v) => v.value).join(" · ") : "-"}</td>
                      <td className="px-3 py-2.5 text-slate-700">{wfId ? (workflowById.get(wfId)?.name ?? "-") : "-"}</td>
                      <td className="px-3 py-2.5 text-slate-700">{stageNames.length ? stageNames.join(", ") : "-"}</td>
                      <td className="px-3 py-2.5 text-slate-700">{groupNames.length ? groupNames.join(", ") : "-"}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-800">{prog ? `${prog.pct}%` : "-"}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${CYCLE_STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                          {CYCLE_STATUS_LABEL[status] ?? status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visibleClaims.length > page * PAGE_SIZE && (
              <div className="border-t border-slate-100 p-3 text-center">
                <Link
                  scroll={false}
                  href={`/sinistros?${new URLSearchParams({
                    ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")) as Record<string, string>),
                    searched: "1",
                    pagina: String(page + 1),
                  }).toString()}`}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Mostrar mais ({visibleClaims.length - page * PAGE_SIZE} restantes)
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {listItems.map((it) => {
              if (it.kind === "header")
                return (
                  <h2 key={`h-${it.key}`} className="mt-2 text-[13px] font-semibold text-slate-900 first:mt-0">
                    {it.key} <span className="font-normal text-slate-700">({it.count})</span>
                  </h2>
                );
              const c = it.claim;
              const cycle = currentCycleByClaim.get(c.id);
              const status = cycle?.status ?? c.status;
              const isCompleted = status === "completed";
              const isBlocked = status === "blocked";
              const activeGroups = cycle ? [...(groupsByCycle.get(cycle.id) ?? [])].map((id) => groupNameById.get(id)).filter(Boolean) : [];
              const activeStages = cycle ? (stagesByCycle.get(cycle.id) ?? []) : [];
              const totalFlowSlaMinutes = cycle ? totalSlaByVersion.get(cycle.workflow_version_id) : undefined;
              const totalFlowSla = !isCompleted && cycle ? computeSla(cycle.formalized_at || c.created_at, totalFlowSlaMinutes) : null;
              const completedNodeIds = cycle ? completedStagesByCycle.get(cycle.id) : undefined;
              const progressStats = computeProcessProgress(
                isCompleted,
                cycle?.workflow_version_id,
                completedNodeIds,
                stepsByVersion,
              );
              const executionDuration = isCompleted ? formatDurationBetween(cycle?.formalized_at || c.created_at, cycle?.completed_at) : "";

              return (
                <div
                  key={c.id}
                  className={`group rounded-xl border bg-white shadow-xs transition-all hover:shadow-md hover:border-slate-300 overflow-hidden ${
                    isCompleted
                      ? "border-slate-200 border-l-4 border-l-emerald-500"
                      : isBlocked
                        ? "border-rose-200 border-l-4 border-l-rose-500"
                        : "border-slate-200 border-l-4 border-l-sky-500"
                  }`}
                >
                  <Link href={`/sinistros/${c.id}`} className="block">
                    {/* CABEÇALHO DO CARD */}
                    <div
                      className={`px-5 py-3 border-b flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 ${
                        isCompleted
                          ? "bg-emerald-50/40 border-emerald-100/60"
                          : isBlocked
                            ? "bg-rose-50/40 border-rose-100/60"
                            : "bg-slate-50/80 border-slate-100"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <div
                          className={`grid size-7 place-items-center rounded-md ${
                            isCompleted
                              ? "bg-emerald-100 text-emerald-700"
                              : isBlocked
                                ? "bg-rose-100 text-rose-700"
                                : "bg-brand/10 text-brand"
                          }`}
                        >
                          <FileWarning className="size-4" />
                        </div>
                        <span className="text-[15px] font-bold text-slate-900 group-hover:text-brand transition-colors">
                          {c.claim_number}
                        </span>
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                            <Clock3 className="size-3 text-emerald-700" />
                            Duração total: {executionDuration}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[12px] text-slate-500">
                            <Clock3 className="size-3 text-slate-500" />
                            Criado há {formatRelativeDuration(c.created_at)}
                          </span>
                        )}
                      </div>

                      {/* GRÁFICO DE BARRA DE PROGRESSO DO PROCESSO */}
                      {progressStats ? (
                        <div className="flex flex-col gap-1 min-w-[150px] max-w-[240px] flex-1 px-2">
                          <div className="flex items-center justify-between text-xs font-medium leading-none">
                            <span className="text-slate-500">Progresso</span>
                            <span
                              className={`font-bold ${
                                progressStats.pct === 100 ? "text-emerald-700" : "text-brand"
                              }`}
                            >
                              {progressStats.pct}%
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-slate-200/80 overflow-hidden relative border border-slate-300/40">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                progressStats.pct === 100 ? "bg-emerald-500" : "bg-brand"
                              }`}
                              style={{ width: `${progressStats.pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-500 leading-none">
                            {progressStats.subtext}
                          </span>
                        </div>
                      ) : null}

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            CYCLE_STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600 ring-slate-200"
                          }`}
                        >
                          {CYCLE_STATUS_LABEL[status] ?? status}
                        </span>
                        <ChevronRight className="size-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600" />
                      </div>
                    </div>

                    {/* CORPO DO CARD */}
                    <div className="p-4 space-y-3">
                      {(() => {
                        const wfId = cycle ? versionToWorkflow.get(cycle.workflow_version_id) : undefined;
                        const values = Object.entries((c.custom_fields ?? {}) as Record<string, string>)
                          .map(([key, value]) => ({ label: wfId ? fieldLabelByWorkflowKey.get(`${wfId}:${key}`) : undefined, value }))
                          .filter((v): v is { label: string; value: string } => !!v.label && !!v.value)
                          .slice(0, 3);
                        return values.length ? (
                          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
                            {values.map((v) => (
                              <div key={v.label} className="flex gap-1.5">
                                <dt className="text-slate-500">{v.label}:</dt>
                                <dd className="font-medium text-slate-900">{v.value}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : null;
                      })()}
                      {isCompleted ? (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-slate-600">
                          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                            <CheckCircle2 className="size-4 text-emerald-600" />
                            Ciclo finalizado com sucesso
                          </span>
                          {totalFlowSlaMinutes ? (
                            <span className="text-slate-500">
                              • SLA previsto no fluxo:{" "}
                              <strong className="font-semibold text-slate-800">
                                {formatDuration(totalFlowSlaMinutes)}
                              </strong>
                            </span>
                          ) : null}
                          {cycle?.completed_at && (
                            <span className="text-slate-500">
                              • Encerrado há {formatRelativeDuration(cycle.completed_at)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <>
                          {/* BLOCO DA ETAPA ATUAL */}
                          {activeStages.length > 0 && (
                            <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Etapa Atual
                                  </span>
                                  {activeStages.map((st) => (
                                    <div key={st.id} className="flex flex-wrap items-center gap-1.5">
                                      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-slate-900">
                                        <Layers className="size-3.5 text-brand" />
                                        {st.name}
                                      </span>
                                      <span className="text-[12px] text-slate-500 font-normal">
                                        (parado há {formatRelativeDuration(st.entered_at)})
                                      </span>
                                    </div>
                                  ))}
                                </div>

                                {/* BADGE DO SLA DA ETAPA */}
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {activeStages.map((st) => {
                                    const stageSla = computeSla(st.entered_at, st.sla_minutes);
                                    if (!stageSla) return null;
                                    return (
                                      <span
                                        key={st.id}
                                        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold border ${
                                          stageSla.isBreached
                                            ? "bg-rose-50 text-rose-700 border-rose-200"
                                            : stageSla.isAtRisk
                                              ? "bg-amber-50 text-amber-700 border-amber-200"
                                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        }`}
                                      >
                                        <Clock3 className="size-3.5" />
                                        <span title="Prazo da etapa atual, contado desde que ela começou.">SLA da Etapa:</span> {stageSla.pct}% ({stageSla.formattedRemaining})
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* SLA TOTAL DO FLUXO E GRUPO RESPONSÁVEL */}
                          <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5 text-[12px]">
                            {totalFlowSla ? (
                              <div className="flex items-center gap-2">
                                <span title="Prazo para concluir o fluxo inteiro, contado desde a abertura do sinistro." className="font-medium text-slate-500">SLA Total do Fluxo:</span>
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold border ${
                                    totalFlowSla.isBreached
                                      ? "bg-rose-50 text-rose-700 border-rose-200"
                                      : totalFlowSla.isAtRisk
                                        ? "bg-amber-50 text-amber-700 border-amber-200"
                                        : "bg-sky-50 text-sky-700 border-sky-200"
                                  }`}
                                >
                                  <Clock3 className="size-3" />
                                  {totalFlowSla.pct}% consumido • {totalFlowSla.formattedRemaining} (limite:{" "}
                                  {totalFlowSla.formattedLimit})
                                </span>
                              </div>
                            ) : (
                              <div />
                            )}

                            {activeGroups.length > 0 && (
                              <div className="flex items-center gap-1.5 text-slate-500">
                                <Users className="size-3.5 text-slate-500" />
                                <span>Aguardando:</span>
                                <span className="inline-flex flex-wrap items-center gap-1.5 font-semibold text-slate-800 bg-slate-100 border border-slate-200/60 px-2 py-0.5 rounded text-xs">
                                  {[...(groupsByCycle.get(cycle?.id ?? "") ?? [])].map((gid) => (
                                    <GroupChip key={gid} name={groupNameById.get(gid) ?? "-"} icon={groupMetaById.get(gid)?.icon} color={groupMetaById.get(gid)?.color} />
                                  ))}
                                </span>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </Link>
                </div>
              );
            })}
            {visibleClaims.length > page * PAGE_SIZE && (
              <Link
                scroll={false}
                href={`/sinistros?${new URLSearchParams({
                  ...Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]),
                  searched: "1",
                  pagina: String(page + 1),
                }).toString()}`}
                className="self-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Mostrar mais ({visibleClaims.length - page * PAGE_SIZE} restantes)
              </Link>
            )}
            {capped && (
              <p className="text-center text-[12px] text-slate-500">
                Mostrando só os {CLAIM_FETCH_CAP} sinistros mais recentes. Use os filtros para refinar.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
