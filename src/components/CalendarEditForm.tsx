"use client";

import { useActionState, type ReactNode } from "react";

type State = { error: string | null; ok?: boolean };

// Formulário de edição do calendário: mostra o erro de validação junto ao botão e confirma o salvamento ("Salvo").
export function CalendarEditForm({ action, children }: { action: (prev: State, formData: FormData) => Promise<State>; children: ReactNode }) {
  const [state, formAction] = useActionState(action, { error: null } as State);
  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
      {children}
      {state.error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-800">
          {state.error}
        </p>
      )}
      {state.ok && !state.error && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-800">
          Calendário salvo.
        </p>
      )}
    </form>
  );
}
