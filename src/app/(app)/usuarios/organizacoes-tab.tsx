import { Building2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createOrganization } from "./actions";

const ROLE_KIND_LABEL: Record<string, string> = {
  interno: "Interno",
  transportadora: "Transportadora",
  embarcador: "Embarcador",
  seguradora: "Seguradora",
  corretora: "Corretora",
  gerenciadora_risco: "Gerenciadora de risco",
  fornecedor: "Fornecedor",
  outro: "Outro",
};

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

export async function OrganizacoesTab({ tenantId, canManage }: { tenantId: string; canManage: boolean }) {
  const supabase = await createClient();
  const { data: tenantOrgs } = await supabase
    .from("tenant_organizations")
    .select("id, role_kind, is_owner, organizations(id, name)")
    .eq("tenant_id", tenantId);

  return (
    <section>
      <p className="mb-3 text-[13px] text-slate-500">
        Seguradoras, corretoras e outros parceiros que colaboram nesta empresa — não precisam de conta própria do
        produto, só de usuários vinculados a elas.
      </p>

      {canManage && (
        <form action={createOrganization} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="org-name" className="mb-1 block text-[12px] font-medium text-slate-600">
              Nome
            </label>
            <input id="org-name" name="name" required placeholder="Ex.: Seguradora Alfa" className={input} />
          </div>
          <div className="min-w-[180px]">
            <label htmlFor="org-role" className="mb-1 block text-[12px] font-medium text-slate-600">
              Papel
            </label>
            <select id="org-role" name="role_kind" defaultValue="seguradora" className={input}>
              {Object.entries(ROLE_KIND_LABEL)
                .filter(([k]) => k !== "interno")
                .map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
            </select>
          </div>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600">
            <Plus className="size-4" /> Adicionar organização
          </button>
        </form>
      )}

      <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {(tenantOrgs ?? []).map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-5 py-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
              <Building2 className="size-4" />
            </div>
            <div className="min-w-0 flex-1 text-[14px] font-medium text-slate-900">{t.organizations?.name}</div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {t.is_owner ? "Interno (dono)" : (ROLE_KIND_LABEL[t.role_kind] ?? t.role_kind)}
            </span>
          </li>
        ))}
        {(tenantOrgs ?? []).length === 0 && <li className="px-5 py-6 text-center text-[13px] text-slate-500">Nenhuma organização ainda.</li>}
      </ul>
    </section>
  );
}
