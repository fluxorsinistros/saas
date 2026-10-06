"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Filter,
  RotateCcw,
  GitBranch,
  Layers,
  Users,
  Clock,
  Timer,
  Activity,
  Search,
  SlidersHorizontal,
  ChevronUp,
} from "lucide-react";

type Props = {
  workflows: { id: string; name: string }[];
  workflowStagesMap: Record<string, string[]>;
  allStages: string[];
  groups: { id: string; name: string }[];
  isAdmin: boolean;
  currentFilters: {
    fluxo?: string;
    etapa?: string;
    grupo?: string;
    sla_etapa?: string;
    sla_total?: string;
    situacao?: string;
  };
  totalCount: number;
  // Já listou os resultados: a barra se recolhe numa linha-resumo para dar espaço à lista.
  searched: boolean;
};

const selectClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

export function SinistrosFilterBar({
  workflows,
  workflowStagesMap,
  allStages,
  groups,
  isAdmin,
  currentFilters,
  totalCount,
  searched,
}: Props) {
  const [expanded, setExpanded] = useState(!searched);
  const [selectedWorkflow, setSelectedWorkflow] = useState(currentFilters.fluxo ?? "");
  const [selectedStage, setSelectedStage] = useState(currentFilters.etapa ?? "");
  const [selectedGroup, setSelectedGroup] = useState(
    currentFilters.grupo ?? (isAdmin ? "todos" : (groups[0]?.id ?? ""))
  );
  const [selectedSlaEtapa, setSelectedSlaEtapa] = useState(currentFilters.sla_etapa ?? "");
  const [selectedSlaTotal, setSelectedSlaTotal] = useState(currentFilters.sla_total ?? "");
  const [selectedSituacao, setSelectedSituacao] = useState(currentFilters.situacao ?? "");
  // Etapa e prazos são filtros finos: ficam recolhidos até alguém precisar (ou já estarem aplicados).
  const [moreOpen, setMoreOpen] = useState(Boolean(currentFilters.etapa || currentFilters.sla_etapa || currentFilters.sla_total));

  // Etapas disponíveis dependem do fluxo selecionado
  const availableStages = selectedWorkflow
    ? workflowStagesMap[selectedWorkflow] ?? []
    : allStages;

  const handleWorkflowChange = (newWorkflowId: string) => {
    setSelectedWorkflow(newWorkflowId);
    // Se a etapa atualmente selecionada não existir no novo fluxo, limpa a etapa
    if (newWorkflowId) {
      const stagesInNewWf = workflowStagesMap[newWorkflowId] ?? [];
      if (selectedStage && !stagesInNewWf.includes(selectedStage)) {
        setSelectedStage("");
      }
    }
  };

  const hasActiveFilters = Boolean(
    selectedWorkflow ||
      selectedStage ||
      (selectedGroup && selectedGroup !== "todos") ||
      selectedSlaEtapa ||
      selectedSlaTotal ||
      selectedSituacao
  );

  const SITUACAO_LABEL: Record<string, string> = { aberto: "Abertos", pausado: "Bloqueados", fechado: "Fechados" };
  const plural = (n: number) => `${n} ${n === 1 ? "sinistro" : "sinistros"}`;
  const summary: string[] = [];
  if (selectedWorkflow) summary.push(`Fluxo: ${workflows.find((w) => w.id === selectedWorkflow)?.name ?? selectedWorkflow}`);
  if (selectedStage) summary.push(`Etapa: ${selectedStage}`);
  if (selectedGroup && selectedGroup !== "todos") summary.push(`Grupo: ${groups.find((g) => g.id === selectedGroup)?.name ?? selectedGroup}`);
  if (selectedSlaEtapa) summary.push(`Prazo da etapa: ${selectedSlaEtapa === "atrasado" ? "Atrasada" : "No prazo"}`);
  if (selectedSlaTotal) summary.push(`Prazo do fluxo: ${selectedSlaTotal === "atrasado" ? "Atrasado" : "No prazo"}`);
  if (selectedSituacao) summary.push(`Situação: ${SITUACAO_LABEL[selectedSituacao] ?? selectedSituacao}`);

  return (
    <>
    {!expanded && (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
        <Filter className="size-4 shrink-0 text-brand" />
        <span className="text-[13px] text-slate-700" aria-live="polite">
          <strong className="font-semibold text-slate-900">{plural(totalCount)}</strong>
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {summary.length === 0 ? (
            <span className="text-xs text-slate-600">Sem filtros</span>
          ) : (
            summary.map((t) => (
              <span key={t} className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {t}
              </span>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-800 hover:bg-slate-50"
        >
          <SlidersHorizontal className="size-3.5" /> Alterar filtros
        </button>
      </div>
    )}
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${expanded ? "" : "hidden"}`}>
      <form method="get" action="/sinistros" className="space-y-4">
        <input type="hidden" name="searched" value="1" />

        {/* Cabeçalho da Barra de Filtros */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-brand" />
            <h2 className="text-[14px] font-semibold text-slate-900">Filtrar Sinistros</h2>
            {hasActiveFilters && (
              <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">
                Filtros aplicados
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[12px] text-slate-500">
            <span aria-live="polite">
              Encontrados: <strong className="font-semibold text-slate-800">{plural(totalCount)}</strong>
            </span>
            {searched && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-expanded
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
              >
                <ChevronUp className="size-3.5" /> Recolher
              </button>
            )}
          </div>
        </div>

        {/* Grid de Controles de Filtros */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* 1. Filtro de Fluxo */}
          <div>
            <label htmlFor="filter_fluxo" className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-slate-600">
              <GitBranch className="size-3.5 text-slate-500" />
              Fluxo
            </label>
            <select
              id="filter_fluxo"
              name="fluxo"
              value={selectedWorkflow}
              onChange={(e) => handleWorkflowChange(e.target.value)}
              className={selectClass}
            >
              <option value="">Todos os fluxos</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Filtro de Etapa */}
          <div className={moreOpen ? undefined : "hidden"}>
            <label htmlFor="filter_etapa" className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-slate-600">
              <Layers className="size-3.5 text-slate-500" />
              Etapa atual
            </label>
            <select
              id="filter_etapa"
              name="etapa"
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className={selectClass}
            >
              <option value="">Todas as etapas</option>
              {availableStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Filtro de Grupo Responsável */}
          <div>
            <label htmlFor="filter_grupo" className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-slate-600">
              <Users className="size-3.5 text-slate-500" />
              Grupo da etapa
            </label>
            <select
              id="filter_grupo"
              name="grupo"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className={selectClass}
            >
              {isAdmin && <option value="todos">Todos os grupos</option>}
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Filtro de SLA da Etapa */}
          <div className={moreOpen ? undefined : "hidden"}>
            <label htmlFor="filter_sla_etapa" className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-slate-600">
              <Clock className="size-3.5 text-slate-500" />
              Prazo da etapa
            </label>
            <select
              id="filter_sla_etapa"
              name="sla_etapa"
              value={selectedSlaEtapa}
              onChange={(e) => setSelectedSlaEtapa(e.target.value)}
              className={selectClass}
            >
              <option value="">Todos</option>
              <option value="atrasado">Etapa atrasada</option>
              <option value="no_prazo">Etapa no prazo</option>
            </select>
          </div>

          {/* 5. Filtro de SLA Total do Fluxo */}
          <div className={moreOpen ? undefined : "hidden"}>
            <label htmlFor="filter_sla_total" className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-slate-600">
              <Timer className="size-3.5 text-slate-500" />
              Prazo do fluxo
            </label>
            <select
              id="filter_sla_total"
              name="sla_total"
              value={selectedSlaTotal}
              onChange={(e) => setSelectedSlaTotal(e.target.value)}
              className={selectClass}
            >
              <option value="">Todos</option>
              <option value="atrasado">Fluxo atrasado</option>
              <option value="no_prazo">Fluxo no prazo</option>
            </select>
          </div>

          {/* 6. Filtro de Situação / Status */}
          <div>
            <label htmlFor="filter_situacao" className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-slate-600">
              <Activity className="size-3.5 text-slate-500" />
              Situação
            </label>
            <select
              id="filter_situacao"
              name="situacao"
              value={selectedSituacao}
              onChange={(e) => setSelectedSituacao(e.target.value)}
              className={selectClass}
            >
              <option value="">Todas</option>
              <option value="aberto">Abertos</option>
              <option value="pausado">Bloqueados</option>
              <option value="fechado">Fechados</option>
            </select>
          </div>
        </div>

        {/* Rodapé: Botões de Ação */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-brand-600 cursor-pointer"
            >
              <Search className="size-4" />
              Filtrar
            </button>

            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              {moreOpen ? "Menos filtros" : "Mais filtros"}
            </button>

            <Link
              href="/sinistros?searched=1"
              onClick={() => {
                setSelectedWorkflow("");
                setSelectedStage("");
                setSelectedGroup("todos");
                setSelectedSlaEtapa("");
                setSelectedSlaTotal("");
                setSelectedSituacao("");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
            >
              <RotateCcw className="size-3.5 text-slate-500" />
              Limpar filtros
            </Link>
          </div>

        </div>
      </form>
    </div>
    </>
  );
}
