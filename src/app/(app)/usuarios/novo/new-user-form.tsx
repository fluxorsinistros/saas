"use client";

import { useActionState, useState } from "react";
import { UserPlus } from "lucide-react";
import { addUser } from "../actions";

const input =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

type Option = { id: string; name: string };

// Mesmo formulário do Gestor, só que dentro da própria empresa: e-mail, tipo e (para Operador) o grupo.
export function NewUserForm({
  roles,
  groups,
  tenantName,
  organizations,
}: {
  roles: Option[];
  groups: Option[];
  tenantName: string;
  organizations: Option[];
}) {
  const [state, action, pending] = useActionState(addUser, null);
  const operator = roles.find((r) => r.name === "Operador");
  const [role, setRole] = useState(operator?.id ?? roles[0]?.id ?? "");
  const isAdmin = roles.find((r) => r.id === role)?.name === "Administrador";

  return (
    <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <label htmlFor="full_name" className="mb-1 block text-[12px] font-medium text-slate-600">
            Nome
          </label>
          <input id="full_name" name="full_name" className={input} />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-[12px] font-medium text-slate-600">
            *E-mail (login)
          </label>
          <input id="email" name="email" type="email" required placeholder="pessoa@empresa.com.br" className={input} />
        </div>
        <div>
          <label htmlFor="cpf" className="mb-1 block text-[12px] font-medium text-slate-600">
            CPF
          </label>
          <input id="cpf" name="cpf" className={input} />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1 block text-[12px] font-medium text-slate-600">
            Telefone
          </label>
          <input id="phone" name="phone" className={input} />
        </div>
        <div>
          <label htmlFor="tenant" className="mb-1 block text-[12px] font-medium text-slate-600">
            Empresa
          </label>
          <input id="tenant" value={tenantName} disabled readOnly className={`${input} disabled:bg-slate-50 disabled:text-slate-500`} />
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
          <select id="organization_id" name="organization_id" required defaultValue={organizations[0]?.id} className={input}>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isAdmin ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
          Administrador administra a conta e não fica em grupo de usuários.
        </p>
      ) : (
        <div className="max-w-sm">
          <label htmlFor="group_id" className="mb-1 block text-[12px] font-medium text-slate-600">
            Grupo de usuários
          </label>
          <select id="group_id" name="group_id" defaultValue="" className={input}>
            <option value="">Sem grupo</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">O usuário pertence a um único grupo, e é o grupo que define o acesso dele.</p>
        </div>
      )}

      <label className="flex items-center gap-2 text-[13px] text-slate-700">
        <input type="checkbox" name="send_invite" defaultChecked /> Enviar convite por e-mail (se a pessoa ainda não tem conta)
      </label>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <button disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600 disabled:opacity-60">
          <UserPlus className="size-4" /> {pending ? "Adicionando…" : "Adicionar"}
        </button>
        {state && <p className={`text-[12px] ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>}
      </div>
    </form>
  );
}
