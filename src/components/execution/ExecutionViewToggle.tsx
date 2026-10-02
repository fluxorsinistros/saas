"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GitBranch, List, History, DollarSign, FileText } from "lucide-react";

const STORAGE_KEY = "sinistro-execution-view";

type Mode = "timeline" | "graph" | "history" | "financial" | "documents";

// Documento 5 §15: alternância entre as visões do processo (linha do tempo, grafo, histórico, financeiro e documentos)
// é preferência do usuário, guardada no navegador — nunca dado de configuração do tenant.
export function ExecutionViewToggle({
  timeline,
  graph,
  history,
  historyCount,
  financial,
  financialCount,
  documents,
  documentsCount,
}: {
  timeline: ReactNode;
  graph: ReactNode;
  history?: ReactNode;
  historyCount?: number;
  financial?: ReactNode;
  financialCount?: number;
  documents?: ReactNode;
  documentsCount?: number;
}) {
  const [mode, setMode] = useState<Mode>("timeline");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Leitura de localStorage não pode acontecer no render (SSR não tem `window`) — só depois de
    // montado, uma vez só, é um efeito legítimo de sincronizar com um sistema externo ao React.
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const validModes: Mode[] = ["timeline", "graph", "history", "financial", "documents"];
      if (validModes.includes(saved as Mode)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage só existe no cliente; sincroniza uma vez após montar
        setMode(saved as Mode);
      }
    } catch {
      // localStorage indisponível (aba privada, etc.) — fica no padrão.
    }
    setHydrated(true);
  }, []);

  const choose = (next: Mode) => {
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // idem — preferência só não persiste entre sessões, não quebra a tela.
    }
  };

  return (
    <div>
      <div className="mb-3 inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 text-[12px] shadow-xs">
        <button
          type="button"
          onClick={() => choose("timeline")}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
            mode === "timeline" ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <List className="size-3.5" /> Linha do tempo
        </button>
        <button
          type="button"
          onClick={() => choose("graph")}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
            mode === "graph" ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <GitBranch className="size-3.5" /> Grafo completo
        </button>
        {history && (
          <button
            type="button"
            onClick={() => choose("history")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
              mode === "history" ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <History className="size-3.5" /> Histórico
            {typeof historyCount === "number" && historyCount > 0 && (
              <span
                className={`ml-0.5 rounded-full px-1.5 py-0.2 text-xs font-semibold ${
                  mode === "history"
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {historyCount}
              </span>
            )}
          </button>
        )}
        {financial && (
          <button
            type="button"
            onClick={() => choose("financial")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
              mode === "financial" ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <DollarSign className="size-3.5" /> Financeiro
            {typeof financialCount === "number" && financialCount > 0 && (
              <span
                className={`ml-0.5 rounded-full px-1.5 py-0.2 text-xs font-semibold ${
                  mode === "financial"
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {financialCount}
              </span>
            )}
          </button>
        )}
        {documents && (
          <button
            type="button"
            onClick={() => choose("documents")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
              mode === "documents" ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <FileText className="size-3.5" /> Documentos
            {typeof documentsCount === "number" && documentsCount > 0 && (
              <span
                className={`ml-0.5 rounded-full px-1.5 py-0.2 text-xs font-semibold ${
                  mode === "documents"
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {documentsCount}
              </span>
            )}
          </button>
        )}
      </div>
      {!hydrated || mode === "timeline"
        ? timeline
        : mode === "graph"
          ? graph
          : mode === "history"
            ? (history ?? timeline)
            : mode === "financial"
              ? (financial ?? timeline)
              : mode === "documents"
                ? (documents ?? timeline)
                : timeline}
    </div>
  );
}
