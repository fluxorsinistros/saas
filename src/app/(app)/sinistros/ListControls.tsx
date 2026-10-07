"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, LayoutGrid, Search, SlidersHorizontal, Table2 } from "lucide-react";

type Ordem = "criacao" | "urgencia" | "situacao" | "grupo" | "fluxo";

type Props = {
  visao: "cartoes" | "tabela";
  agrupar: "" | "situacao" | "grupo" | "fluxo";
  ordem: Ordem;
  dir: "asc" | "desc";
  por: number;
  q: string;
  // parâmetros atuais da URL (filtros etc.), preservados ao trocar uma opção
  base: Record<string, string>;
};

const DIR_TEXT: Record<Ordem, [string, string]> = {
  criacao: ["mais recentes primeiro", "mais antigos primeiro"],
  urgencia: ["mais urgentes primeiro", "menos urgentes primeiro"],
  situacao: ["de Z a A", "de A a Z"],
  grupo: ["de Z a A", "de A a Z"],
  fluxo: ["de Z a A", "de A a Z"],
};

// Controles da lista numa chapa azul escura (o mesmo material do menu): busca, visão, agrupar, ordenar e quantidade.
export function ListControls({ visao, agrupar, ordem, dir, por, q, base }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState(q);
  // no celular só a busca fica à mostra; visão, agrupar, ordenar e quantidade abrem sob demanda
  const [moreOpen, setMoreOpen] = useState(false);

  function go(over: Record<string, string>) {
    const qs = new URLSearchParams({ ...base, searched: "1", ...over });
    for (const [k, v] of [...qs.entries()]) if (v === "") qs.delete(k);
    qs.delete("pagina");
    // replace: trocar ordenação ou visão não enche o histórico do botão Voltar
    router.replace(`/sinistros?${qs.toString()}`, { scroll: false });
  }

  const select =
    "field-on-glass h-9 rounded-lg border-0 pl-2 pr-6 text-[13px] font-medium outline-none pointer-coarse:h-11";
  const label = "inline-flex items-center gap-1.5 text-[13px] text-white";
  const seg = (on: boolean) =>
    `inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition pointer-coarse:h-10 ${on ? "bg-selected text-white" : "text-white hover:bg-white/15"}`;
  const dirText = DIR_TEXT[ordem][dir === (ordem === "criacao" || ordem === "urgencia" ? "desc" : "asc") ? 0 : 1];

  return (
    <div
      className="list-toolbar mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-2.5 rounded-xl px-3 py-2.5"
    >
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: query.trim() });
        }}
        className="relative min-w-[11rem] flex-1 md:w-32 md:flex-none"
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-white/80" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Número ou placa"
          aria-label="Buscar por número do sinistro ou placa"
          className="field-on-glass h-9 w-full rounded-lg border-0 pl-8 pr-2.5 text-[13px] outline-none pointer-coarse:h-11"
        />
      </form>

      <button
        type="button"
        onClick={() => setMoreOpen((v) => !v)}
        aria-expanded={moreOpen}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-[13px] font-medium text-white hover:bg-white/25 pointer-coarse:h-11 md:hidden"
      >
        <SlidersHorizontal className="size-4" aria-hidden /> Exibição
      </button>

      <div className={`${moreOpen ? "flex" : "hidden"} w-full flex-wrap items-center gap-x-2.5 gap-y-2.5 md:contents`}>
      <div className="inline-flex rounded-lg bg-white/15 p-0.5" role="group" aria-label="Forma de exibição">
        <button type="button" onClick={() => go({ visao: "" })} aria-pressed={visao === "cartoes"} className={seg(visao === "cartoes")}>
          <LayoutGrid className="size-4" /> Cartões
        </button>
        <button type="button" onClick={() => go({ visao: "tabela" })} aria-pressed={visao === "tabela"} className={seg(visao === "tabela")}>
          <Table2 className="size-4" /> Tabela
        </button>
      </div>

      <label className={label}>
        Agrupar
        <select className={select} value={agrupar} onChange={(e) => go({ agrupar: e.target.value })}>
          <option value="">Nenhum</option>
          <option value="situacao">Situação</option>
          <option value="grupo">Grupo</option>
          <option value="fluxo">Fluxo</option>
        </select>
      </label>

      <div className="inline-flex items-center gap-1.5">
        <label className={label}>
          Ordenar
          <select className={select} value={ordem} onChange={(e) => go({ ordem: e.target.value === "criacao" ? "" : e.target.value, dir: "" })}>
            <option value="criacao">Criação</option>
            <option value="urgencia">Urgência</option>
            <option value="situacao">Situação</option>
            <option value="grupo">Grupo</option>
            <option value="fluxo">Fluxo</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => go({ ordem: ordem === "criacao" ? "" : ordem, dir: dir === "asc" ? "desc" : "asc" })}
          title={`Ordem: ${dirText}. Clique para inverter.`}
          aria-label={`Ordem: ${dirText}. Clique para inverter.`}
          className="inline-flex size-9 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25 pointer-coarse:size-11"
        >
          {dir === "asc" ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
        </button>
      </div>

      <label className={label}>
        Mostrar
        <select className={select} value={por} onChange={(e) => go({ por: e.target.value === "10" ? "" : e.target.value })}>
          <option value={10}>10</option>
          <option value={30}>30</option>
          <option value={50}>50</option>
        </select>
      </label>
      </div>
    </div>
  );
}
