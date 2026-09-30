"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import { sendResetToMember } from "../actions";

// Envia ao usuário o e-mail para ele mesmo criar uma nova senha (o Administrador nunca vê nem define a senha dele).
export function ResetPasswordButton({ membershipId }: { membershipId: string }) {
  const [state, action, pending] = useActionState(sendResetToMember, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="membership_id" value={membershipId} />
      <button
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
      >
        <Mail className="size-3.5" /> {pending ? "Enviando…" : "Enviar redefinição de senha"}
      </button>
      {state && <p className={`text-[12px] ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>}
    </form>
  );
}
