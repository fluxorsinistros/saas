"use client";

import { useActionState, useState } from "react";
import { enableInTenant } from "../../actions";

const input =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

type Option = { id: string; name: string };
type TenantScoped = Option & { tenant_id: string };

// Habilita a mesma pessoa em outra empresa. Cada empresa tem o papel, os grupos e a organização dela para a pessoa.
export function EnableInTenantForm({
  email,
  tenants,
  groups,
  organizations,
}: {
  email: string;
  tenants: Option[];
  groups: TenantScoped[];
  organizations: TenantScoped[];
}) {
  const [state, action, pending] = useActionState(enableInTenant, null);
  const [tenant, setTenant] = useState(tenants[0]?.id ?? "");
  const [tipo, setTipo] = useState("Operador");
  const tenantGroups = groups.filter((g) => g.tenant_id === tenant);
  const tenantOrgs = organizations.filter((o) => o.tenant_id === tenant);

  if (tenants.length === 0) {
    return <p className="text-[12px] text-slate-500">A pessoa já está habilitada em todas as empresas.</p>;
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="email" value={email} />
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <label htmlFor="en_tenant" className="mb-1 block text-[12px] font-medium text-slate-600">
            *Empresa
          </label>
          <select id="en_tenant" name="tenant_id" value={tenant} onChange={(e) => setTenant(e.target.value)} className={input}>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="en_tipo" className="mb-1 block text-[12px] font-medium text-slate-600">
            *Tipo nesta empresa
          </label>
          <select id="en_tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className={input}>
            <option value="Administrador">Administrador</option>
            <option value="Operador">Operador</option>
          </select>
        </div>
        {tenantOrgs.length > 0 && (
          <div>
            <label htmlFor="en_org" className="mb-1 block text-[12px] font-medium text-slate-600">
              *Organização
            </label>
            <select key={tenant} id="en_org" name="organization_id" defaultValue={tenantOrgs[0].id} className={input}>
              {tenantOrgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {tipo === "Operador" && (
        <fieldset key={tenant} className="max-w-sm">
          <legend className="mb-1 block text-[12px] font-medium text-slate-600">Grupos de usuários</legend>
          <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-2">
            {tenantGroups.map((g) => (
              <label key={g.id} className="flex items-center gap-2 text-[13px] text-slate-700">
                <input type="checkbox" name="group_ids" value={g.id} /> {g.name}
              </label>
            ))}
            {tenantGroups.length === 0 && <p className="text-xs text-slate-500">A empresa escolhida ainda não tem grupos.</p>}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600 disabled:opacity-60">
          {pending ? "Habilitando…" : "Habilitar nesta empresa"}
        </button>
        {state && <p className={`text-[12px] ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>}
      </div>
    </form>
  );
}
