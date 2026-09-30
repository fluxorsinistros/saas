"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { createTenantAsAdmin, type ActionState } from "./actions";

const input =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

function Message({ state }: { state: ActionState }) {
  if (!state) return null;
  return <p className={`w-full text-[12px] ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>;
}

// Nova empresa cliente, já com o e-mail de quem vai administrá-la (opcional).
export function CreateTenantForm() {
  const [state, action, pending] = useActionState(createTenantAsAdmin, null);
  return (
    <form action={action} className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="min-w-[200px] flex-1">
        <label htmlFor="tenant_name" className="mb-1 block text-[12px] font-medium text-slate-600">
          Nova empresa cliente
        </label>
        <input id="tenant_name" name="name" required placeholder="Nome da empresa" className={input} />
      </div>
      <div className="min-w-[220px] flex-1">
        <label htmlFor="tenant_admin_email" className="mb-1 block text-[12px] font-medium text-slate-600">
          E-mail do administrador (opcional)
        </label>
        <input id="tenant_admin_email" name="admin_email" type="email" placeholder="pessoa@empresa.com.br" className={input} />
      </div>
      <button
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
      >
        <Plus className="size-4" /> {pending ? "Criando…" : "Criar empresa"}
      </button>
      <Message state={state} />
    </form>
  );
}
