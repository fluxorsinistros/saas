"use client";

import { AlertTriangle } from "lucide-react";

// Erros lançados por Server Actions (ex.: addMember rejeitando e-mail sem conta) caem aqui em vez
// de na tela de erro genérica do Next — mostra a mensagem de verdade, com um jeito de tentar de novo.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-2xl border border-rose-200 bg-rose-50 px-6 py-5 text-center">
        <AlertTriangle className="mx-auto size-6 text-rose-500" />
        <p className="mt-2 text-[14px] font-medium text-rose-900">{error.message || "Algo deu errado."}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg bg-rose-600 px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-rose-700"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
