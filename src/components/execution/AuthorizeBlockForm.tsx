"use client";

import { ActivityForm, type ActivityFormState } from "./ActivityForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";

// Autorizar um sinistro bloqueado pelo limite de repetições: pede o motivo, confirma e só então envia.
export function AuthorizeBlockForm({ action }: { action: (prev: ActivityFormState, formData: FormData) => Promise<ActivityFormState> }) {
  return (
    <details className="mt-2">
      <summary className="inline-flex cursor-pointer list-none text-[12px] font-semibold text-rose-900 underline underline-offset-2">Autorizar e continuar</summary>
      <ActivityForm action={action} className="mt-2 space-y-2 rounded-lg border border-rose-200 bg-white p-3">
        <label className="block text-[12px] font-medium text-slate-700">
          Motivo da autorização
          <textarea
            name="reason"
            required
            minLength={3}
            rows={2}
            placeholder="Por que mais uma passagem é aceitável?"
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </label>
        <p className="text-xs text-slate-600">O sinistro volta a andar na etapa que estava barrada pelo limite, e a autorização fica registrada.</p>
        <ConfirmSubmit
          title="Autorizar a continuação?"
          description="O sinistro volta a andar e o limite de repetições é ultrapassado nesta vez."
          confirmLabel="Autorizar"
          className="rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-600"
        >
          Autorizar e continuar
        </ConfirmSubmit>
      </ActivityForm>
    </details>
  );
}
