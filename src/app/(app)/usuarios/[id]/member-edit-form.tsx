"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { updateMemberAccess } from "../actions";

const input =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-slate-50 disabled:text-slate-500";

type Option = { id: string; name: string };

// Mesmo formulário do Gestor, no nível do Administrador da conta: os dados pessoais são só leitura (valem em
// todas as empresas da pessoa); ele define o tipo (Administrador/Operador), o grupo e se está ativo.
export function MemberEditForm({
  membershipId,
  fullName,
  email,
  phone,
  cpf,
  tenantName,
  roleId,
  groupId,
  active,
  roles,
  groups,
  organizations,
  organizationId,
}: {
  membershipId: string;
  fullName: string;
  email: string;
  phone: string;
  cpf: string;
  tenantName: string;
  roleId: string;
  groupId: string;
  active: boolean;
  roles: Option[];
  groups: Option[];
  organizations: Option[];
  organizationId: string;
}) {
  const [state, action, pending] = useActionState(updateMemberAccess, null);
  const [role, setRole] = useState(roleId);
  const isAdmin = roles.find((r) => r.id === role)?.name === "Administrador";

  return (
    <form action={action} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <input type="hidden" name="membership_id" value={membershipId} />

      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <label htmlFor="full_name" className="mb-1 block text-[12px] font-medium text-slate-600">
            Nome
          </label>
          <input id="full_name" value={fullName} disabled readOnly className={input} />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-[12px] font-medium text-slate-600">
            E-mail (login)
          </label>
          <input id="email" value={email} disabled readOnly className={input} />
        </div>
        <div>
          <label htmlFor="cpf" className="mb-1 block text-[12px] font-medium text-slate-600">
            CPF
          </label>
          <input id="cpf" value={cpf} disabled readOnly className={input} />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1 block text-[12px] font-medium text-slate-600">
            Telefone
          </label>
          <input id="phone" value={phone} disabled readOnly className={input} />
        </div>
        <div>
          <label htmlFor="tenant" className="mb-1 block text-[12px] font-medium text-slate-600">
            Empresa
          </label>
          <input id="tenant" value={tenantName} disabled readOnly className={input} />
        </div>
        <div>
          <label htmlFor="role_id" className="mb-1 block text-[12px] font-medium text-slate-600">
            *Tipo
          </label>
          <select id="role_id" name="role_id" required value={role} onChange={(e) => setRole(e.target.value)} className={input}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="organization_id" className="mb-1 block text-[12px] font-medium text-slate-600">
            *Organização
          </label>
          <select id="organization_id" name="organization_id" required defaultValue={organizationId} className={input}>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Nome, CPF e telefone pertencem à pessoa e valem em todas as empresas dela; quem os altera é o Gestor da plataforma.
      </p>

      <label className="flex items-center gap-2 text-[13px] font-medium text-slate-700">
        <input key={String(active)} type="checkbox" name="active" defaultChecked={active} /> Ativo
        <span className="font-normal text-slate-500">— desmarcado, o usuário perde o acesso à empresa na hora</span>
      </label>

      {isAdmin ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
          Administrador não fica em grupo de usuários: ele administra a conta, não trabalha nela. Se estava em um grupo, o vínculo é
          removido ao salvar.
        </p>
      ) : (
        <div className="max-w-sm">
          <label htmlFor="group_id" className="mb-1 block text-[12px] font-medium text-slate-600">
            Grupo de usuários
          </label>
          <select key={groupId} id="group_id" name="group_id" defaultValue={groupId} className={input}>
            <option value="">Sem grupo</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            O usuário pertence a um único grupo, e é o grupo que define o acesso dele.
            {groups.length === 0 && " A empresa ainda não tem grupos."}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <button disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600 disabled:opacity-60">
          {pending ? "Salvando…" : "Salvar"}
        </button>
        <Link href="/usuarios" className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50">
          Voltar
        </Link>
        {state && <p className={`text-[12px] ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>}
      </div>
    </form>
  );
}
