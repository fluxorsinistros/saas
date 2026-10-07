"use client";

import { useActionState, type ReactNode } from "react";

export type ActivityFormState = { error: string | null };

// Formulário de uma etapa com a mensagem de erro na própria tela. Antes, qualquer regra de campo quebrada (ex.: "Placa precisa
// ter exatamente 7 caracteres") derrubava a página inteira com um erro genérico; agora a mensagem aparece junto ao botão.
export function ActivityForm({
  action,
  className,
  children,
}: {
  action: (prev: ActivityFormState, formData: FormData) => Promise<ActivityFormState>;
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, { error: null } as ActivityFormState);
  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-800">
          {state.error}
        </p>
      )}
    </form>
  );
}
