"use client";

import { useActionState } from "react";
import { KeyRound, Mail, UserPlus, X } from "lucide-react";
import {
  addTenantUser,
  revokeTenantAccess,
  sendInviteEmail,
  sendPasswordReset,
  setMemberActive,
  setUserPassword,
  type ActionState,
} from "../actions";

const input =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";
const smallBtn =
  "inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60";

function Message({ state }: { state: ActionState }) {
  if (!state) return null;
  return <p className={`text-[12px] ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>;
}

type Option = { id: string; name: string };

// Adicionar usuário a uma empresa, escolhendo o tipo (papel). Sem conta ainda = convite (com e-mail opcional).
export function AddUserForm({ tenants, roles, defaultTenantId }: { tenants: Option[]; roles: Option[]; defaultTenantId?: string }) {
  const [state, action, pending] = useActionState(addTenantUser, null);
  const defaultRole = roles.find((r) => r.name === "Operador")?.id ?? roles[0]?.id ?? "";
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="min-w-[200px] flex-1">
        <label htmlFor="add_email" className="mb-1 block text-[12px] font-medium text-slate-600">
          E-mail
        </label>
        <input id="add_email" name="email" type="email" required placeholder="pessoa@empresa.com.br" className={input} />
      </div>
      <div className="w-52">
        <label htmlFor="add_tenant" className="mb-1 block text-[12px] font-medium text-slate-600">
          Empresa
        </label>
        <select id="add_tenant" name="tenant_id" required defaultValue={defaultTenantId ?? ""} className={input}>
          <option value="" disabled>
            Escolher…
          </option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="w-40">
        <label htmlFor="add_role" className="mb-1 block text-[12px] font-medium text-slate-600">
          Tipo
        </label>
        <select id="add_role" name="role_id" required defaultValue={defaultRole} className={input}>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-1.5 pb-2 text-[12px] text-slate-600">
        <input type="checkbox" name="send_invite" defaultChecked /> Enviar convite por e-mail
      </label>
      <button
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-brand-600 disabled:opacity-60"
      >
        <UserPlus className="size-4" /> {pending ? "Adicionando…" : "Adicionar"}
      </button>
      <div className="w-full">
        <Message state={state} />
      </div>
    </form>
  );
}

export type UserRow = {
  tenant_id: string | null;
  membership_id: string | null;
  invite_id: string | null;
  user_id: string | null;
  email: string;
  pending: boolean;
  status: string;
};

// Ações de um usuário: inativar/reativar, enviar redefinição de senha, definir senha; e, para convites, reenviar/cancelar.
export function UserActions({ row, hideStatus = false, hideSetPassword = false }: { row: UserRow; hideStatus?: boolean; hideSetPassword?: boolean }) {
  const [resetState, resetAction, resetPending] = useActionState(sendPasswordReset, null);
  const [inviteState, inviteAction, invitePending] = useActionState(sendInviteEmail, null);
  const [pwState, pwAction, pwPending] = useActionState(setUserPassword, null);
  const [statusState, statusAction, statusPending] = useActionState(setMemberActive, null);

  if (row.pending) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <form action={inviteAction}>
          <input type="hidden" name="email" value={row.email} />
          <button disabled={invitePending} className={smallBtn}>
            <Mail className="size-3" /> {invitePending ? "Enviando…" : "Reenviar convite"}
          </button>
        </form>
        <form action={revokeTenantAccess}>
          <input type="hidden" name="invite_id" value={row.invite_id ?? ""} />
          <button className={`${smallBtn} text-rose-700`} title="Cancelar convite">
            <X className="size-3" /> Cancelar convite
          </button>
        </form>
        <div className="w-full">
          <Message state={inviteState} />
        </div>
      </div>
    );
  }

  const active = row.status === "active";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!hideStatus && (
        <form action={statusAction}>
          <input type="hidden" name="membership_id" value={row.membership_id ?? ""} />
          <input type="hidden" name="active" value={active ? "false" : "true"} />
          <button disabled={statusPending} className={`${smallBtn} ${active ? "text-rose-700" : "text-emerald-700"}`}>
            {statusPending ? "Salvando…" : active ? "Inativar" : "Reativar"}
          </button>
        </form>
      )}
      <form action={resetAction}>
        <input type="hidden" name="email" value={row.email} />
        <button disabled={resetPending} className={smallBtn}>
          <Mail className="size-3" /> {resetPending ? "Enviando…" : "Enviar redefinição de senha"}
        </button>
      </form>
      {!hideSetPassword && (
      <details className="relative">
        <summary className={`${smallBtn} cursor-pointer list-none`}>
          <KeyRound className="size-3" /> Definir senha
        </summary>
        <form action={pwAction} className="mt-1.5 flex items-center gap-1.5">
          <input type="hidden" name="user_id" value={row.user_id ?? ""} />
          <input name="password" type="password" minLength={8} required placeholder="Nova senha (mín. 8)" autoComplete="new-password" className={`${input} w-44`} />
          <button disabled={pwPending} className={smallBtn}>
            {pwPending ? "Salvando…" : "Salvar"}
          </button>
        </form>
      </details>
      )}
      <div className="w-full">
        <Message state={statusState} />
        <Message state={resetState} />
        <Message state={pwState} />
      </div>
    </div>
  );
}
