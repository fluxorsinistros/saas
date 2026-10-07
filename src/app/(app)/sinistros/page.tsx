import { GroupChip } from "@/lib/group-icons";
import { getMemberGroups } from "@/lib/active-group";
import type { Metadata } from "next";
import Link from "next/link";
import { Clock3, FileWarning, RotateCcw, SearchX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes } from "@/lib/permissions";
import { computeProcessProgress, computeSla, formatDuration } from "@/lib/format";
import { loadCalendarBundles, flowDeadlineIso } from "@/lib/sla-load";
import type { CalendarBundle } from "@/lib/sla";
import { SinistrosFilterBar } from "./SinistrosFilterBar";
import { FormalizeButton } from "./FormalizeButton";
import { ListControls } from "./ListControls";

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
  ordem?: string;
  dir?: string;
  q?: string;
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
  // Classificação: padrão = data de criação, mais recentes primeiro.
  const ordem = (["criacao", "urgencia", "situacao", "grupo", "fluxo"].includes(sp.ordem ?? "") ? sp.ordem : "criacao") as
    | "criacao"
    | "urgencia"
    | "situacao"
    | "grupo"
    | "fluxo";
  // criação e urgência abrem do mais recente / mais urgente; as demais, de A a Z
  const newestFirst = ordem === "criacao" || ordem === "urgencia";
  const dir = sp.dir === "asc" ? "asc" : sp.dir === "desc" ? "desc" : newestFirst ? "desc" : "asc";
  const busca = (sp.q ?? "").trim().slice(0, 60);
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
  const stagesByCycle = new Map<string, { id: string; name: string; entered_at: string; sla_minutes?: number; target_at?: string; bundle?: CalendarBundle }[]>();
  // Calendário por versão do fluxo, quando as etapas usam dias úteis: o prazo total é contado nele, não em horas seguidas.
  const flowCalByVersion = new Map<string, CalendarBundle>();
  const flowSlaFor = (cycle: { workflow_version_id: string; formalized_at: string | null }, createdAt: string, minutes: number | undefined) => {
    const start = cycle.formalized_at || createdAt;
    const bundle = flowCalByVersion.get(cycle.workflow_version_id);
    return computeSla(start, minutes, bundle && minutes ? flowDeadlineIso(start, minutes, bundle) : undefined, bundle);
  };
  const completedStagesByCycle = new Map<string, Set<string>>();
  const stepsByVersion = new Map<string, { id: string; name: string; sla_minutes: number }[]>();
  const totalSlaByVersion = new Map<string, number>();
  const fieldLabelByWorkflowKey = new Map<string, string>();
  let groupNameById = new Map<string, string>();
  let groupMetaById = new Map<string, { icon: string | null; color: string | null }>();
  let visibleClaims: typeof claims = [];
  const CLAIM_FETCH_CAP = 300;
  let capped = false;
  let loadFailed = false;

  if (searched) {
    const { data: claimRows, error: claimsError } = await supabase
      .from("claims")
      .select("id, claim_number, status, created_at, custom_fields, claim_cycles(id, status, cycle_number, formalized_at, completed_at, workflow_version_id)")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false })
      .limit(CLAIM_FETCH_CAP);
    claims = claimRows ?? [];
    loadFailed = Boolean(claimsError);
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
    const calIdByVersion = new Map<string, string>();
    const calIdByNode = new Map<string, string>();
    for (const n of allVersionNodes ?? []) {
      const cfg = (n.config ?? {}) as { sla_unit?: string; sla_calendar_id?: string };
      if (cfg.sla_calendar_id) calIdByNode.set(n.id, cfg.sla_calendar_id);
      if (cfg.sla_unit === "bd" && cfg.sla_calendar_id && !calIdByVersion.has(n.workflow_version_id)) calIdByVersion.set(n.workflow_version_id, cfg.sla_calendar_id);
    }
    const bundles = await loadCalendarBundles(supabase, [...new Set([...calIdByVersion.values(), ...calIdByNode.values()])]);
    for (const [versionId, calId] of calIdByVersion) {
      const bundle = bundles.get(calId);
      if (bundle) flowCalByVersion.set(versionId, bundle);
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

    // Prazo real de cada etapa aberta (calendário, dias úteis e feriados), gravado quando a etapa começa.
    const { data: openTracking } = openStages.length
      ? await supabase.from("sla_tracking").select("stage_instance_id, target_at").in("stage_instance_id", openStages.map((x) => x.id)).neq("status", "completed")
      : { data: [] as { stage_instance_id: string; target_at: string }[] };
    const targetByStage = new Map((openTracking ?? []).map((t) => [t.stage_instance_id, t.target_at]));

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
        target_at: targetByStage.get(s.id),
        bundle: bundles.get(calIdByNode.get(s.node_id) ?? ""),
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
      const totalFlowSla = !isCompleted && cycle ? flowSlaFor(cycle, c.created_at, totalFlowSlaMinutes) : null;

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
        const hasBreachedStage = activeStages.some((st) => computeSla(st.entered_at, st.sla_minutes, st.target_at, st.bundle)?.isBreached);
        if (isCompleted || !hasBreachedStage) return false;
      } else if (requestedSlaEtapa === "no_prazo") {
        const hasBreachedStage = activeStages.some((st) => computeSla(st.entered_at, st.sla_minutes, st.target_at, st.bundle)?.isBreached);
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
  if (busca) {
    const needle = busca.toLowerCase();
    visibleClaims = visibleClaims.filter(
      (c) =>
        c.claim_number.toLowerCase().includes(needle) ||
        Object.values((c.custom_fields ?? {}) as Record<string, unknown>).some((v) => typeof v === "string" && v.toLowerCase().includes(needle)),
    );
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
  // Urgência: a etapa em andamento com o maior consumo do prazo. Sinistro fechado ou sem prazo definido não tem urgência.
  const urgencyOf = (c: (typeof visibleClaims)[number]) => {
    const cycle = currentCycleByClaim.get(c.id);
    const status = cycle?.status ?? c.status;
    if (!cycle || closedStatuses.includes(status)) return null;
    let worst: { sla: NonNullable<ReturnType<typeof computeSla>>; name: string } | null = null;
    for (const st of stagesByCycle.get(cycle.id) ?? []) {
      const sla = computeSla(st.entered_at, st.sla_minutes, st.target_at, st.bundle);
      if (sla && (!worst || sla.pct > worst.sla.pct)) worst = { sla, name: st.name };
    }
    return worst;
  };
  const sortValue = (c: (typeof visibleClaims)[number]): string | number => {
    const cycle = currentCycleByClaim.get(c.id);
    if (ordem === "urgencia") return urgencyOf(c)?.sla.pct ?? -1;
    if (ordem === "criacao") return new Date(c.created_at).getTime();
    if (ordem === "situacao") return CYCLE_STATUS_LABEL[cycle?.status ?? c.status] ?? "";
    if (ordem === "grupo") return cycle ? ([...(groupsByCycle.get(cycle.id) ?? [])].map((id) => groupNameById.get(id) ?? "").sort()[0] ?? "~") : "~";
    const wf = cycle ? workflowById.get(versionToWorkflow.get(cycle.workflow_version_id) ?? "") : undefined;
    return wf?.name ?? "~";
  };
  const sortedClaims = [...visibleClaims].sort((a, b) => {
    const x = sortValue(a);
    const y = sortValue(b);
    const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR");
    const byCreated = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return (dir === "asc" ? cmp : -cmp) || byCreated;
  });
  const orderedClaims = agrupar
    ? sortedClaims
        .map((c) => ({ c, g: groupOf(c) }))
        .sort((a, b) => a.g.order - b.g.order || a.g.key.localeCompare(b.g.key, "pt-BR"))
    : sortedClaims.map((c) => ({ c, g: { key: "", order: 0 } }));
  const shownClaims = orderedClaims.slice(0, page * PAGE_SIZE);
  const groupCounts = new Map<string, number>();
  for (const { g } of orderedClaims) groupCounts.set(g.key, (groupCounts.get(g.key) ?? 0) + 1);
  const listItems: ({ kind: "header"; key: string; count: number } | { kind: "claim"; claim: (typeof visibleClaims)[number] })[] = [];
  shownClaims.forEach(({ c, g }, i) => {
    if (agrupar && (i === 0 || shownClaims[i - 1].g.key !== g.key)) listItems.push({ kind: "header", key: g.key, count: groupCounts.get(g.key) ?? 0 });
    listItems.push({ kind: "claim", claim: c });
  });
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-wide px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Sinistros</h1>
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
            <FormalizeButton options={options.map((w) => ({ id: w.id, name: w.name }))} />
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
            searched={searched}
          />
        </div>

        {searched && visibleClaims.length > 0 && (
          <ListControls
            visao={visao}
            agrupar={agrupar}
            ordem={ordem}
            dir={dir}
            por={PAGE_SIZE}
            q={busca}
            base={Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")) as Record<string, string>}
          />
        )}

        {searched && capped && (
          <p className="mt-3 text-[12px] text-white">Mostrando só os {CLAIM_FETCH_CAP} sinistros mais recentes. Use os filtros para refinar.</p>
        )}

        {searched && loadFailed ? (
          <div role="alert" className="mt-6 rounded-xl bg-white px-6 py-8 text-center">
            <FileWarning className="mx-auto size-8 text-rose-700" />
            <p className="mt-3 text-[15px] font-medium text-slate-900">Não foi possível carregar os sinistros agora.</p>
            <p className="mt-1 text-[13px] text-slate-700">Tente de novo em instantes. Se continuar, avise o suporte.</p>
            <Link href="/sinistros?searched=1" className="mt-4 inline-flex rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600">
              Tentar de novo
            </Link>
          </div>
        ) : !searched ? (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <SearchX className="mx-auto size-8 text-slate-300" />
            <p className="text-[15px] font-medium text-slate-800">Escolha os filtros e clique em Filtrar</p>
            <p className="max-w-sm text-[13px] text-slate-600">Assim a lista abre rápida, mesmo com muitos sinistros.</p>
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
                  <th className="px-3 py-2.5">Prazo da etapa</th>
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
                        <td colSpan={9} className="px-3 py-2 text-[12px] font-semibold text-slate-800">
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
                      <td className="tabular whitespace-nowrap px-3 py-2.5 font-semibold text-slate-900">
                        <Link href={`/sinistros/${c.id}`} className="hover:text-brand hover:underline">
                          {c.claim_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{idValues.length ? idValues.map((v) => v.value).join(" · ") : "-"}</td>
                      <td className="px-3 py-2.5 text-slate-700">{wfId ? (workflowById.get(wfId)?.name ?? "-") : "-"}</td>
                      <td className="px-3 py-2.5 text-slate-700">{stageNames.length ? stageNames.join(", ") : "-"}</td>
                      <td className="px-3 py-2.5">{closedStatuses.includes(status) ? <span className="text-slate-600">-</span> : <SlaChip u={urgencyOf(c)} />}</td>
                      <td className="px-3 py-2.5 text-slate-700">{groupNames.length ? groupNames.join(", ") : "-"}</td>
                      <td className="tabular px-3 py-2.5 font-medium text-slate-800">{prog ? `${prog.pct}%` : "-"}</td>
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
              const activeGroups = cycle ? [...(groupsByCycle.get(cycle.id) ?? [])].map((id) => groupNameById.get(id)).filter(Boolean) : [];
              const activeStages = cycle ? (stagesByCycle.get(cycle.id) ?? []) : [];
              const totalFlowSlaMinutes = cycle ? totalSlaByVersion.get(cycle.workflow_version_id) : undefined;
              const totalFlowSla = !isCompleted && cycle ? flowSlaFor(cycle, c.created_at, totalFlowSlaMinutes) : null;
              const completedNodeIds = cycle ? completedStagesByCycle.get(cycle.id) : undefined;
              const progressStats = computeProcessProgress(
                isCompleted,
                cycle?.workflow_version_id,
                completedNodeIds,
                stepsByVersion,
              );
              const executionDuration = isCompleted ? formatDurationBetween(cycle?.formalized_at || c.created_at, cycle?.completed_at) : "";

              const wfIdCard = cycle ? versionToWorkflow.get(cycle.workflow_version_id) : undefined;
              const idValuesCard = Object.entries((c.custom_fields ?? {}) as Record<string, string>)
                .map(([key, value]) => ({ label: wfIdCard ? fieldLabelByWorkflowKey.get(`${wfIdCard}:${key}`) : undefined, value }))
                .filter((v): v is { label: string; value: string } => !!v.label && !!v.value)
                .slice(0, 3);
              const urgency = urgencyOf(c);
              const flowAlert = totalFlowSla && (totalFlowSla.isBreached || totalFlowSla.isAtRisk) ? totalFlowSla : null;

              return (
                <div key={c.id} className="group relative rounded-xl bg-white px-4 py-3 shadow-xs transition-shadow hover:shadow-md">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <Link
                      href={`/sinistros/${c.id}`}
                      className="tabular text-[15px] font-bold text-slate-900 transition-colors after:absolute after:inset-0 after:rounded-xl hover:text-brand"
                    >
                      {c.claim_number}
                    </Link>
                    {idValuesCard.length > 0 && (
                      <span className="text-[13px] text-slate-700">
                        {idValuesCard.map((v, i) => (
                          <span key={v.label} title={v.label}>
                            {i > 0 && <span aria-hidden className="mx-1.5 text-slate-400">·</span>}
                            {v.value}
                          </span>
                        ))}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      {isCompleted ? (
                        <span className="sla-chip sla-ok" title="Tempo total do fluxo, da abertura ao encerramento.">
                          Concluído em {executionDuration}
                        </span>
                      ) : (
                        <SlaChip u={urgency} />
                      )}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          CYCLE_STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600 ring-slate-200"
                        }`}
                      >
                        {CYCLE_STATUS_LABEL[status] ?? status}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-slate-700">
                    {!isCompleted &&
                      activeStages.map((st) => (
                        <span key={st.id}>
                          Etapa <strong className="font-semibold text-slate-900">{st.name}</strong>, há {formatRelativeDuration(st.entered_at)}
                        </span>
                      ))}
                    {!isCompleted && activeGroups.length > 0 && (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        Aguardando
                        {[...(groupsByCycle.get(cycle?.id ?? "") ?? [])].map((gid) => (
                          <span key={gid} className="rounded bg-slate-900/[0.06] px-1.5 py-0.5 font-semibold text-slate-900">
                            <GroupChip name={groupNameById.get(gid) ?? "-"} icon={groupMetaById.get(gid)?.icon} color={groupMetaById.get(gid)?.color} />
                          </span>
                        ))}
                      </span>
                    )}
                    {isCompleted && cycle?.completed_at && <span>Encerrado há {formatRelativeDuration(cycle.completed_at)}</span>}
                    {progressStats && (
                      <span className="inline-flex items-center gap-1.5" title={progressStats.subtext}>
                        <span
                          role="progressbar"
                          aria-label="Andamento do processo"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={progressStats.pct}
                          className="progress-track h-1.5 w-20 overflow-hidden rounded-full"
                        >
                          <span className={`block h-full rounded-full ${progressStats.pct === 100 ? "bg-emerald-600" : "bg-brand"}`} style={{ width: `${progressStats.pct}%` }} />
                        </span>
                        <span className="tabular font-semibold text-slate-900">{progressStats.pct}%</span>
                      </span>
                    )}
                    {flowAlert && (
                      <span className={`sla-chip ${flowAlert.isBreached ? "sla-urgent" : "sla-risk"}`} title="Prazo para concluir o fluxo inteiro, contado desde a abertura.">
                        Fluxo: {flowAlert.isBreached ? "estourado há" : "restam"} {flowAlert.daysText} · até {flowAlert.targetLabel}
                      </span>
                    )}
                  </div>
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
          </div>
        )}
      </div>
    </div>
  );
}

// Chip do prazo da etapa em andamento: atrasado, em risco ou no prazo (tokens .sla-*). Texto sempre diz o estado, a cor só reforça.
function SlaChip({ u }: { u: { sla: { isBreached: boolean; isAtRisk: boolean; formattedRemaining: string; daysText: string; targetLabel: string }; name: string } | null }) {
  if (!u) return <span className="text-[12px] text-slate-600">Sem prazo definido</span>;
  const { sla } = u;
  const tone = sla.isBreached ? "sla-urgent" : sla.isAtRisk ? "sla-risk" : "sla-ok";
  const state = sla.isBreached ? "Atrasada" : sla.isAtRisk ? "Em risco" : "No prazo";
  return (
    <span className={`sla-chip ${tone}`} title={`Prazo da etapa "${u.name}", contado desde que ela começou.`}>
      <Clock3 className="size-3.5 shrink-0" aria-hidden />
      {state} · {sla.isBreached ? "estourado há" : "restam"} {sla.daysText} · até {sla.targetLabel}
    </span>
  );
}
