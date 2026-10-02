"use client";

import dynamic from "next/dynamic";

// O grafo puxa o @xyflow/react inteiro (pesado). Só é baixado quando alguém abre a visão de grafo.
export const ExecutionGraph = dynamic(() => import("./ExecutionGraph").then((m) => m.ExecutionGraph), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-xl border border-slate-200 bg-slate-50" aria-busy="true" />,
});
