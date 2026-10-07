"use client";

import { ActivityForm, type ActivityFormState } from "./ActivityForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";

// Abortar uma via (caminho simultâneo) no meio do caminho: pede o motivo, confirma e só então envia.
export function AbortBranchForm({
  action,
  viaName,
}: {
  action: (prev: ActivityFormState, formData: FormData) => Promise<ActivityFormState>;
  viaName: string;
}) {
  return (
    <details className="mt-2.5 [&[open]]:basis-full">
      <summary className="inline-flex cursor-pointer list-none text-[12px] font-medium text-rose-700 underline-offset-2 hover:underline dark:text-rose-300">
        Abortar esta via
      </summary>
      <ActivityForm action={action} className="mt-2 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <label className="block text-[12px] font-medium text-slate-700">
          Motivo para abortar a via &quot;{viaName}&quot;
          <textarea
            name="reason"
            required
            minLength={3}
            rows={2}
            placeholder="Por que esta via não segue mais?"
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </label>
        <p className="text-xs text-slate-600">As etapas em andamento desta via são canceladas e o motivo fica registrado. As outras vias continuam.</p>
        <ConfirmSubmit
          title={`Abortar a via "${viaName}"?`}
          description="As etapas em andamento desta via serão canceladas. Isso não pode ser desfeito por aqui."
          confirmLabel="Abortar via"
          className="rounded-md bg-rose-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-rose-700"
        >
          Abortar via
        </ConfirmSubmit>
      </ActivityForm>
    </details>
  );
}
