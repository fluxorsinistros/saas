"use client";

import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, LayoutGrid, Table2 } from "lucide-react";

type Props = {
  visao: "cartoes" | "tabela";
  agrupar: "" | "situacao" | "grupo" | "fluxo";
  ordem: "criacao" | "situacao" | "grupo" | "fluxo";
  dir: "asc" | "desc";
  por: number;
  // parâmetros atuais da URL (filtros etc.), preservados ao trocar uma opção
  base: Record<string, string>;
};

// Controles da lista numa linha só: visão (cartões/tabela) e três menus compactos (agrupar, ordenar, quantidade).
export function ListControls({ visao, agrupar, ordem, dir, por, base }: Props) {
  const router = useRouter();

  function go(over: Record<string, string>) {
    const qs = new URLSearchParams({ ...base, searched: "1", ...over });
    for (const [k, v] of [...qs.entries()]) if (v === "") qs.delete(k);
    qs.delete("pagina");
    router.push(`/sinistros?${qs.toString()}`, { scroll: false });
  }

  const select =
    "field-on-glass rounded-lg border-0 py-1.5 pl-2.5 pr-7 text-[12px] font-medium outline-none focus:ring-2 focus:ring-white/40";
  const label = "inline-flex items-center gap-1.5 text-[12px] text-white/90";
  const seg = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition ${on ? "bg-selected text-white" : "text-white/90 hover:bg-white/15"}`;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="inline-flex rounded-lg bg-white/15 p-0.5" role="group" aria-label="Forma de exibição">
        <button type="button" onClick={() => go({ visao: "" })} aria-pressed={visao === "cartoes"} className={seg(visao === "cartoes")}>
          <LayoutGrid className="size-3.5" /> Cartões
        </button>
        <button type="button" onClick={() => go({ visao: "tabela" })} aria-pressed={visao === "tabela"} className={seg(visao === "tabela")}>
          <Table2 className="size-3.5" /> Tabela
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
            <option value="criacao">Data de criação</option>
            <option value="situacao">Situação</option>
            <option value="grupo">Grupo</option>
            <option value="fluxo">Fluxo</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => go({ ordem: ordem === "criacao" ? "" : ordem, dir: dir === "asc" ? "desc" : "asc" })}
          title={ordem === "criacao" ? (dir === "desc" ? "Mais recentes primeiro (clique para inverter)" : "Mais antigos primeiro (clique para inverter)") : dir === "asc" ? "A a Z (clique para inverter)" : "Z a A (clique para inverter)"}
          aria-label="Inverter a ordem"
          className="inline-flex size-7 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25"
        >
          {dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
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
  );
}
