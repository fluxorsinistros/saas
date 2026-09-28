"use client";

import { useActionState } from "react";
import { createTenant } from "./actions";

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createTenant, undefined);
  return (
    <form action={action} className="mt-8 space-y-4">
      <div>
        <label htmlFor="name" className="mb-1 block text-[13px] font-medium text-slate-700">
          Nome da empresa
        </label>
        <input
          id="name"
          name="name"
          required
          autoFocus
          placeholder="Ex.: Transportadora Exemplo"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
      >
        {pending ? "Criando ambiente…" : "Continuar"}
      </button>
    </form>
  );
}
