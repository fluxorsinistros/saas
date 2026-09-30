"use client";

import { useActionState } from "react";
import { Mail, X } from "lucide-react";
import { cancelInvite, resendInvite, type AccessState } from "./actions";

const smallBtn =
  "inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60";

function Message({ state }: { state: AccessState }) {
  if (!state) return null;
  return <p className={`w-full text-[12px] ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>;
}

// Ações de um convite pendente: reenviar o e-mail ou cancelar.
export function InviteActions({ email, inviteId }: { email: string; inviteId: string }) {
  const [resendState, resendAction, resending] = useActionState(resendInvite, null);
  const [cancelState, cancelAction, cancelling] = useActionState(cancelInvite, null);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <form action={resendAction}>
        <input type="hidden" name="email" value={email} />
        <button disabled={resending} className={smallBtn}>
          <Mail className="size-3" /> {resending ? "Enviando…" : "Reenviar convite"}
        </button>
      </form>
      <form action={cancelAction}>
        <input type="hidden" name="invite_id" value={inviteId} />
        <button disabled={cancelling} className={`${smallBtn} text-rose-700`}>
          <X className="size-3" /> Cancelar convite
        </button>
      </form>
      <Message state={resendState} />
      <Message state={cancelState} />
    </div>
  );
}
