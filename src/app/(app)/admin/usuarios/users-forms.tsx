"use client";

import { useActionState, useState } from "react";
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

// Novo usuário: mesmos campos da edição (nome, e-mail, CPF, telefone, empresa, tipo, grupo). Sem conta ainda = convite.
export function AddUserForm({
  tenants,
  roles,
  groups,
  organizations,
  defaultTenantId,
}: {
  tenants: Option[];
  roles: Option[];
  groups: { id: string; tenant_id: string; name: string }[];
  organizations: { id: string; tenant_id: string; name: string }[];
  defaultTenantId?: string;
}) {
  const [state, action, pending] = useActionState(addTenantUser, null);
  const [tenant, setTenant] = useState(defaultTenantId ?? "");
  const [role, setRole] = useState(roles.find((r) => r.name === "Operador")?.id ?? roles[0]?.id ?? "");
  const isOperator = roles.find((r) => r.id === role)?.name === "Operador";
  const tenantGroups = groups.filter((g) => g.tenant_id === tenant);
  const tenantOrgs = organizations.filter((o) => o.tenant_id === tenant);
  const label = "mb-1 block text-[12px] font-medium text-slate-600";
  return (
    <form action={action} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <label htmlFor="add_name" className={label}>
            Nome
          </label>
          <input id="add_name" name="full_name" className={input} />
        </div>
        <div>
          <label htmlFor="add_email" className={label}>
            *E-mail (login)
          </label>
          <input id="add_email" name="email" type="email" required placeholder="pessoa@empresa.com.br" className={input} />
        </div>
        <div>
          <label htmlFor="add_cpf" className={label}>
            CPF
          </label>
          <input id="add_cpf" name="cpf" className={input} />
        </div>
        <div>
          <label htmlFor="add_phone" className={label}>
            Telefone
          </label>
          <input id="add_phone" name="phone" className={input} />
        </div>
        <div>
          <label htmlFor="add_tenant" className={label}>
            *Empresa
          </label>
          <select id="add_tenant" name="tenant_id" required value={tenant} onChange={(e) => setTenant(e.target.value)} className={input}>
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
        <div>
          <label htmlFor="add_role" className={label}>
            *Tipo
          </label>
          <select id="add_role" name="role_id" required value={role} onChange={(e) => setRole(e.target.value)} className={input}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="add_org" className={label}>
            *Organização
          </label>
          <select key={tenant} id="add_org" name="organization_id" required defaultValue={tenantOrgs[0]?.id ?? ""} className={input}>
            {tenantOrgs.length === 0 && <option value="">Escolha a empresa primeiro</option>}
            {tenantOrgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isOperator ? (
        <div className="max-w-sm">
          <label htmlFor="add_group" className={label}>
            Grupo de usuários
          </label>
          <select key={tenant} id="add_group" name="group_id" defaultValue="" className={input}>
            <option value="">Sem grupo</option>
            {tenantGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-400">O usuário pertence a um único grupo, e é o grupo que define o acesso dele.</p>
        </div>
      ) : (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
          Administrador administra a conta e não fica em grupo de usuários.
        </p>
      )}

      <div className="max-w-sm">
        <label htmlFor="add_password" className="mb-1 block text-[12px] font-medium text-slate-600">
          Senha inicial
        </label>
        <input id="add_password" name="password" type="password" minLength={8} autoComplete="new-password" className={input} />
        <p className="mt-1 text-[11px] text-slate-400">
          Opcional. Preenchida, a pessoa já entra com esta senha, sem depender de e-mail. Vazia, enviamos o convite por e-mail.
        </p>
      </div>

      <label className="flex items-center gap-2 text-[13px] text-slate-700">
        <input type="checkbox" name="send_invite" defaultChecked /> Enviar convite por e-mail (se a pessoa ainda não tem conta)
      </label>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <button
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          <UserPlus className="size-4" /> {pending ? "Adicionando…" : "Adicionar"}
        </button>
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
