"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GitBranch, List } from "lucide-react";

const STORAGE_KEY = "sinistro-execution-view";

// Documento 5 §15: alternância entre "linha do tempo simplificada" (modo padrão, mais fácil de ler)
// e o grafo completo (modo avançado, mostra bifurcação/convergência de verdade) é preferência do
// usuário, guardada no navegador — nunca dado de configuração do tenant.
export function ExecutionViewToggle({ timeline, graph }: { timeline: ReactNode; graph: ReactNode }) {
  const [mode, setMode] = useState<"timeline" | "graph">("timeline");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Leitura de localStorage não pode acontecer no render (SSR não tem `window`) — só depois de
    // montado, uma vez só, é um efeito legítimo de sincronizar com um sistema externo ao React.
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "graph" || saved === "timeline") setMode(saved);
    } catch {
      // localStorage indisponível (aba privada, etc.) — fica no padrão.
    }
    setHydrated(true);
  }, []);

  const choose = (next: "timeline" | "graph") => {
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // idem — preferência só não persiste entre sessões, não quebra a tela.
    }
  };

  return (
    <div>
      <div className="mb-2 inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[12px]">
        <button
          type="button"
          onClick={() => choose("timeline")}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
            mode === "timeline" ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <List className="size-3.5" /> Linha do tempo
        </button>
        <button
          type="button"
          onClick={() => choose("graph")}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
            mode === "graph" ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <GitBranch className="size-3.5" /> Grafo completo
        </button>
      </div>
      {!hydrated || mode === "timeline" ? timeline : graph}
    </div>
  );
}
