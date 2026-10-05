"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveUserEdit } from "../../actions";

const input =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-slate-50 disabled:text-slate-500";

type Tenant = { id: string; name: string };
type Group = { id: string; tenant_id: string; name: string };

// O Gestor da plataforma edita pessoas dos três níveis e pode mudar o tipo e a empresa de qualquer uma:
//  - tipo Gestor: não pertence a empresa nenhuma;
//  - tipo Administrador: administra a conta, não fica em grupo;
//  - tipo Operador: trabalha na conta, num único grupo (o grupo define o acesso).
export function UserEditForm({
  id,
  fullName,
  email,
  phone,
  cpf,
  tenantId,
  tipo: initialTipo,
  active,
  groupIds,
  tenants,
  roles,
  groups,
  organizations,
  organizationId,
  isSelf,
}: {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  cpf: string;
  tenantId: string;
  tipo: string;
  active: boolean;
  groupIds: string[];
  tenants: Tenant[];
  roles: string[];
  groups: Group[];
  organizations: Group[];
  organizationId: string;
  isSelf: boolean;
}) {
  const [state, action, pending] = useActionState(saveUserEdit, null);
  const [tipo, setTipo] = useState(initialTipo);
  const [tenant, setTenant] = useState(tenantId);

  const wasGestor = initialTipo === "gestor";
  const isGestor = tipo === "gestor";
  const isAdmin = tipo === "Administrador";
  const moving = !wasGestor && !isGestor && tenant !== tenantId;
  const tenantGroups = groups.filter((g) => g.tenant_id === tenant);
  const tenantOrgs = organizations.filter((o) => o.tenant_id === tenant);
  const currentOrg = tenantOrgs.some((o) => o.id === organizationId) ? organizationId : (tenantOrgs[0]?.id ?? "");
  const tipoOptions = [{ value: "gestor", label: "Gestor da plataforma" }, ...roles.map((r) => ({ value: r, label: r }))];

  return (
    <form action={action} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="email" value={email} />

      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <label htmlFor="full_name" className="mb-1 block text-[12px] font-medium text-slate-600">
            *Nome
          </label>
          <input key={fullName} id="full_name" name="full_name" required defaultValue={fullName} className={input} />
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
          <input key={cpf} id="cpf" name="cpf" defaultValue={cpf} inputMode="numeric" className={input} />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1 block text-[12px] font-medium text-slate-600">
            Telefone
          </label>
          <input key={phone} id="phone" name="phone" defaultValue={phone} inputMode="tel" className={input} />
        </div>
        <div>
          <label htmlFor="tipo" className="mb-1 block text-[12px] font-medium text-slate-600">
            *Tipo
          </label>
          <select
            id="tipo"
            name="tipo"
            required
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            disabled={isSelf}
            className={input}
          >
            {tipoOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {isSelf && <input type="hidden" name="tipo" value={tipo} />}
          {isSelf && <p className="mt-1 text-xs text-slate-500">Você não pode mudar o seu próprio tipo. Peça a outro Gestor.</p>}
        </div>
        <div>
          <label htmlFor="tenant_id" className="mb-1 block text-[12px] font-medium text-slate-600">
            {isGestor ? "Empresa" : "*Empresa"}
          </label>
          {isGestor ? (
            <input id="tenant_id" value="Plataforma — o Gestor não pertence a uma empresa" disabled readOnly className={input} />
          ) : (
            <select id="tenant_id" name="tenant_id" required value={tenant} onChange={(e) => setTenant(e.target.value)} className={input}>
              <option value="" disabled>
                Escolher…
              </option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {!isGestor && (
          <div>
            <label htmlFor="organization_id" className="mb-1 block text-[12px] font-medium text-slate-600">
              *Organização
            </label>
            <select key={`${tenant}-${currentOrg}`} id="organization_id" name="organization_id" required defaultValue={currentOrg} className={input}>
              {tenantOrgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {moving && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 ring-1 ring-inset ring-amber-200">
          Mover para outra empresa: o acesso na empresa atual é inativado (o histórico fica lá), o grupo atual é removido e a pessoa
          passa a ter este tipo na empresa escolhida. Para a pessoa ficar nas DUAS empresas, não mova: use &ldquo;Habilitar em outra
          empresa&rdquo;, logo abaixo.
        </p>
      )}
      {isGestor && !wasGestor && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 ring-1 ring-inset ring-amber-200">
          Virar Gestor: a pessoa sai de todas as empresas e passa a ver só a Administração da plataforma. Se ela for o único
          Administrador de alguma conta, o sistema recusa — adicione outro Administrador antes.
        </p>
      )}
      {!isGestor && wasGestor && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 ring-1 ring-inset ring-amber-200">
          Deixar de ser Gestor: a pessoa perde o acesso à Administração e entra na empresa escolhida com este tipo.
        </p>
      )}

      {!isGestor && (
        <label className="flex items-center gap-2 text-[13px] font-medium text-slate-700">
          <input key={String(active)} type="checkbox" name="active" defaultChecked={wasGestor ? true : active} /> Ativo
          <span className="font-normal text-slate-500">— desmarcado, o usuário perde o acesso à empresa na hora</span>
        </label>
      )}

      {isGestor ? null : isAdmin ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
          Administrador não fica em grupo de usuários: ele administra a conta, não trabalha nela. Se estava em um grupo, o vínculo é
          removido ao salvar.
        </p>
      ) : (
        <fieldset key={tenant} className="max-w-sm">
          <legend className="mb-1 block text-[12px] font-medium text-slate-600">Grupos de usuários</legend>
          <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-2">
            {tenantGroups.map((g) => (
              <label key={g.id} className="flex items-center gap-2 text-[13px] text-slate-700">
                <input type="checkbox" name="group_ids" value={g.id} defaultChecked={groupIds.includes(g.id)} /> {g.name}
              </label>
            ))}
            {tenant && tenantGroups.length === 0 && <p className="text-xs text-slate-500">A empresa escolhida ainda não tem grupos.</p>}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            O Operador pode estar em vários grupos, mas atua em um por vez (ele escolhe no menu). É o grupo que define o acesso.
          </p>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <button disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600 disabled:opacity-60">
          {pending ? "Salvando…" : "Salvar"}
        </button>
        <Link href="/admin/usuarios" className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50">
          Voltar
        </Link>
        {state && <p className={`text-[12px] ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>}
      </div>
    </form>
  );
}
