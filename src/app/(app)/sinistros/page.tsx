import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ChevronRight, Clock3, FileWarning, Layers, Plus, SearchX, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes } from "@/lib/permissions";

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

function formatDuration(minutes: number): string {
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) {
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

function formatDurationBetween(startIso: string | null | undefined, endIso: string | null | undefined): string {
  if (!startIso) return "";
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);
  const diffMin = Math.floor(diffMs / 60_000);
  return formatDuration(diffMin);
}

function computeSla(startedAtIso: string | null | undefined, slaMinutes: number | undefined) {
  if (!startedAtIso || !slaMinutes || slaMinutes <= 0) return null;
  const now = Date.now();
  const start = new Date(startedAtIso).getTime();
  const slaMs = slaMinutes * 60_000;
  const elapsedMs = Math.max(0, now - start);
  const remainingMs = slaMs - elapsedMs;
  const pct = Math.round((elapsedMs / slaMs) * 100);
  const isBreached = remainingMs <= 0;
  const diffMinutes = Math.round(Math.abs(remainingMs) / 60_000);
  const formattedRemaining = isBreached
    ? `estourado há ${formatDuration(diffMinutes)}`
    : `restam ${formatDuration(diffMinutes)}`;

  return {
    pct,
    isBreached,
    isAtRisk: !isBreached && pct >= 75,
    formattedRemaining,
    formattedLimit: formatDuration(slaMinutes),
  };
}

function computeProcessProgress(
  isCompleted: boolean,
  workflowVersionId: string | undefined,
  completedNodeIds: Set<string> | undefined,
  stepsByVersion: Map<string, { id: string; name: string; sla_minutes: number }[]>,
) {
  const steps = workflowVersionId ? stepsByVersion.get(workflowVersionId) ?? [] : [];
  const totalCount = steps.length || 1;

  if (isCompleted) {
    return {
      pct: 100,
      completedCount: totalCount,
      totalCount,
      subtext: `${totalCount} de ${totalCount} etapas concluídas`,
    };
  }

  if (steps.length === 0) return null;

  const totalMinutes = steps.reduce((sum, s) => sum + s.sla_minutes, 0);
  const doneIds = completedNodeIds ?? new Set<string>();

  let completedMinutes = 0;
  let completedCount = 0;

  for (const step of steps) {
    if (doneIds.has(step.id)) {
      completedMinutes += step.sla_minutes;
      completedCount++;
    }
  }

  const pct = totalMinutes > 0 ? Math.min(100, Math.round((completedMinutes / totalMinutes) * 100)) : 0;
  const subtext = `${completedCount} de ${totalCount} etapas concluídas`;

  return {
    pct,
    completedCount,
    totalCount,
    completedMinutes,
    totalMinutes,
    subtext,
  };
}

export default async function SinistrosPage({ searchParams }: { searchParams: Promise<{ grupo?: string; searched?: string }> }) {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const perms = await getPermissionCodes(ctx.userId, ctx.tenantId);

  // Quem é Administrador vê e escolhe qualquer grupo (inclusive "Todos"); Operador só enxerga os
  // próprios grupos — grupo é conceito de Operador (decisão do usuário), igual à visibilidade de
  // menu em src/lib/screens.ts.
  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("id, membership_roles(roles(name))")
    .eq("tenant_id", ctx.tenantId)
    .eq("user_id", ctx.userId)
    .eq("status", "active")
    .maybeSingle();
  const isAdmin = (membership?.membership_roles ?? []).some(
    (mr) => (mr as unknown as { roles: { name: string } | null }).roles?.name === "Administrador",
  );
  const { data: myGroupRows } = membership
    ? await supabase.from("group_members").select("groups(id, name, disabled_actions)").eq("membership_id", membership.id)
    : { data: [] as { groups: { id: string; name: string; disabled_actions: string[] } | null }[] };
  const myGroupsFull = (myGroupRows ?? [])
    .map((g) => g.groups)
    .filter((g): g is { id: string; name: string; disabled_actions: string[] } => !!g);
  const myGroups = myGroupsFull.map((g) => ({ id: g.id, name: g.name }));
  // Restrição adicional do grupo sobre claim.formalize (Documento 1 §32 + aba "Ações" do grupo):
  // Administrador nunca é afetado; Operador precisa de pelo menos um grupo que libere a ação.
  const canFormalize = isAdmin || myGroupsFull.some((g) => !g.disabled_actions.includes("claim.formalize"));

  const { data: allGroups } = isAdmin
    ? await supabase.from("groups").select("id, name").eq("tenant_id", ctx.tenantId).eq("status", "active").order("name")
    : { data: [] as { id: string; name: string }[] };
  const groupOptions = isAdmin ? allGroups ?? [] : myGroups;

  const sp = await searchParams;
  const requestedGroup = sp.grupo ?? "";
  // Operador sem grupo escolhido vê só o(s) próprio(s); "todos" só existe pra Administrador.
  const groupFilter = isAdmin
    ? requestedGroup === "todos"
      ? null
      : (groupOptions.find((g) => g.id === requestedGroup)?.id ?? null)
    : (groupOptions.find((g) => g.id === requestedGroup)?.id ?? groupOptions[0]?.id ?? null);

  // A listagem só consulta o banco depois de clicar "Filtrar" (campo oculto "searched") — abrir a
  // tela não carrega todos os sinistros + ciclos + atividades em aberto sozinha.
  const searched = sp.searched === "1";

  const { data: publishedWorkflows } = await supabase
    .from("workflows")
    .select("id, name, workflow_versions(status)")
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "active");

  let claims: {
    id: string;
    claim_number: string;
    status: string;
    created_at: string;
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
  let groupNameById = new Map<string, string>();
  let visibleClaims: typeof claims = [];

  if (searched) {
    const { data: claimRows } = await supabase
      .from("claims")
      .select("id, claim_number, status, created_at, claim_cycles(id, status, cycle_number, formalized_at, completed_at, workflow_version_id)")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false });
    claims = claimRows ?? [];

    // Grupo "responsável agora" = grupo da(s) atividade(s) em aberto do ciclo atual de cada
    // sinistro (pode ter mais de um em paralelo) — é isso que responde "o que está na fila do meu grupo".
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

    visibleClaims = claims.filter((c) => {
      if (!groupFilter) return true;
      const cycle = currentCycleByClaim.get(c.id);
      return !!cycle && (groupsByCycle.get(cycle.id)?.has(groupFilter) ?? false);
    });
  }

  const options = (publishedWorkflows ?? []).filter((w) => w.workflow_versions.some((v) => v.status === "published"));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Sinistros</h1>
        <p className="mt-1 max-w-xl text-[14px] text-slate-500">
          Cada sinistro formalizado abre um ciclo preso à versão publicada do fluxo escolhido — mudanças futuras no fluxo não
          afetam ciclos já abertos.
        </p>

        {!perms.has("claim.formalize") || !canFormalize ? null : options.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-4 text-[13px] text-slate-500">
            Nenhum fluxo publicado ainda.{" "}
            <Link href="/fluxos" className="font-medium text-brand hover:underline">
              Publique um fluxo
            </Link>{" "}
            antes de abrir um sinistro.
          </div>
        ) : (
          <form action="/sinistros/novo" className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="min-w-[220px] flex-1">
              <label htmlFor="workflow_id" className="mb-1 block text-[12px] font-medium text-slate-600">
                Fluxo publicado
              </label>
              <select
                id="workflow_id"
                name="fluxo"
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
              >
                <option value="">Selecione…</option>
                {options.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600">
              <Plus className="size-4" /> Formalizar sinistro
            </button>
          </form>
        )}

        {groupOptions.length > 0 && (
          <form method="get" className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <input type="hidden" name="searched" value="1" />
            <div className="min-w-[220px]">
              <label htmlFor="grupo" className="mb-1 block text-[12px] font-medium text-slate-600">
                Grupo responsável agora
              </label>
              <select
                id="grupo"
                name="grupo"
                defaultValue={isAdmin ? (groupFilter ?? "todos") : groupFilter ?? ""}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
              >
                {isAdmin && <option value="todos">Todos</option>}
                {groupOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50">
              Filtrar
            </button>
          </form>
        )}

        {!searched ? (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <SearchX className="mx-auto size-8 text-slate-300" />
            <p className="text-[15px] font-medium text-slate-800">Clique em Filtrar para ver os sinistros</p>
            <p className="max-w-sm text-[13px] text-slate-500">A lista não carrega sozinha ao abrir a tela.</p>
          </div>
        ) : !visibleClaims.length ? (
          <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <FileWarning className="mx-auto size-8 text-slate-300" />
            <p className="mt-3 text-[15px] font-medium text-slate-800">
              {claims?.length ? "Nenhum sinistro parado no grupo selecionado agora." : "Nenhum sinistro ainda"}
            </p>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {visibleClaims.map((c) => {
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
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                            <Clock3 className="size-3 text-emerald-700" />
                            Duração total: {executionDuration}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[12px] text-slate-500">
                            <Clock3 className="size-3 text-slate-400" />
                            Criado há {formatRelativeDuration(c.created_at)}
                          </span>
                        )}
                      </div>

                      {/* GRÁFICO DE BARRA DE PROGRESSO DO PROCESSO */}
                      {progressStats ? (
                        <div className="flex flex-col gap-1 min-w-[150px] max-w-[240px] flex-1 px-2">
                          <div className="flex items-center justify-between text-[11px] font-medium leading-none">
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
                          <span className="text-[10px] text-slate-400 leading-none">
                            {progressStats.subtext}
                          </span>
                        </div>
                      ) : null}

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
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
                            <span className="text-slate-400">
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
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
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
                                        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold border ${
                                          stageSla.isBreached
                                            ? "bg-rose-50 text-rose-700 border-rose-200"
                                            : stageSla.isAtRisk
                                              ? "bg-amber-50 text-amber-700 border-amber-200"
                                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        }`}
                                      >
                                        <Clock3 className="size-3.5" />
                                        SLA da Etapa: {stageSla.pct}% ({stageSla.formattedRemaining})
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
                                <span className="font-medium text-slate-500">SLA Total do Fluxo:</span>
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold border ${
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
                                <Users className="size-3.5 text-slate-400" />
                                <span>Aguardando:</span>
                                <span className="font-semibold text-slate-800 bg-slate-100 border border-slate-200/60 px-2 py-0.5 rounded text-[11px]">
                                  {activeGroups.join(", ")}
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
          </div>
        )}
      </div>
    </div>
  );
}
