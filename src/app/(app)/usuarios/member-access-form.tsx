"use client";

import { useActionState, useState } from "react";
import { updateMemberAccess } from "./actions";

const select = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

type Option = { id: string; name: string };

// Acesso de um membro, editado pelo Administrador da conta: tipo (Administrador/Operador), grupo e situação.
// O Operador pertence a um único grupo e é o grupo que define o acesso dele; o Administrador não fica em grupo.
export function MemberAccessForm({
  membershipId,
  roleId,
  groupId,
  active,
  roles,
  groups,
}: {
  membershipId: string;
  roleId: string;
  groupId: string;
  active: boolean;
  roles: Option[];
  groups: Option[];
}) {
  const [state, action, pending] = useActionState(updateMemberAccess, null);
  const [role, setRole] = useState(roleId);
  const isAdmin = roles.find((r) => r.id === role)?.name === "Administrador";

  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3">
      <input type="hidden" name="membership_id" value={membershipId} />
      <div className="w-44">
        <label className="mb-1 block text-[11px] text-slate-500">Tipo</label>
        <select name="role_id" value={role} onChange={(e) => setRole(e.target.value)} className={select}>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      {isAdmin ? (
        <p className="max-w-xs pb-2 text-[11px] text-slate-500">Administrador administra a conta e não fica em grupo.</p>
      ) : (
        <div className="w-48">
          <label className="mb-1 block text-[11px] text-slate-500">Grupo (define o acesso)</label>
          <select key={groupId} name="group_id" defaultValue={groupId} className={select}>
            <option value="">Sem grupo</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <label className="flex items-center gap-1.5 pb-2 text-[12px] text-slate-700">
        <input key={String(active)} type="checkbox" name="active" defaultChecked={active} /> Ativo
      </label>
      <button disabled={pending} className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-600 disabled:opacity-60">
        {pending ? "Salvando…" : "Salvar"}
      </button>
      {state && <p className={`w-full text-[12px] ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>}
    </form>
  );
}
