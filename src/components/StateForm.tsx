"use client";

import { useActionState, type ReactNode } from "react";

export type StateFormState = { error: string | null; ok?: boolean; message?: string };

// Formulário cuja ação devolve o resultado em vez de lançar erro: a mensagem de erro (ou de sucesso) aparece na própria tela,
// junto ao botão, e uma regra quebrada nunca derruba a página com o erro genérico de produção.
export function StateForm({
  action,
  className,
  successMessage = "Salvo.",
  children,
}: {
  action: (prev: StateFormState, formData: FormData) => Promise<StateFormState>;
  className?: string;
  successMessage?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, { error: null } as StateFormState);
  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && (
        <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-800">
          {state.error}
        </p>
      )}
      {state.ok && !state.error && (
        <p role="status" className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-800">
          {state.message ?? successMessage}
        </p>
      )}
    </form>
  );
}
