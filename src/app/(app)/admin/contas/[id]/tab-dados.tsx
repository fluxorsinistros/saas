import { SaveButton } from "../../save-button";
import { renameTenant, setTenantStatus } from "../../actions";
import { btnPrimary, input } from "../../shared";

type Tenant = {
  id: string;
  name: string;
  status: string;
  suspended_at: string | null;
  suspension_reason: string | null;
  created_at: string;
};

export function TabDados({ tenant }: { tenant: Tenant }) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Dados da conta</h2>
        <form action={renameTenant} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <div className="min-w-[240px] flex-1">
            <label htmlFor="tenant_name" className="mb-1 block text-[12px] font-medium text-slate-600">
              Nome da conta
            </label>
            <input key={tenant.name} id="tenant_name" name="name" required defaultValue={tenant.name} className={input} />
          </div>
          <SaveButton className={btnPrimary}>Salvar nome</SaveButton>
        </form>
        <p className="mt-3 text-[12px] text-slate-500">Conta criada em {new Date(tenant.created_at).toLocaleDateString("pt-BR")}.</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Situação da conta</h2>
        {tenant.status === "suspended" ? (
          <form action={setTenantStatus} className="flex flex-wrap items-center gap-3 rounded-lg bg-rose-50/60 px-3 py-2.5">
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <input type="hidden" name="status" value="active" />
            <p className="min-w-0 flex-1 text-[13px] text-rose-800">
              Conta suspensa
              {tenant.suspended_at ? ` em ${new Date(tenant.suspended_at).toLocaleDateString("pt-BR")}` : ""}
              {tenant.suspension_reason ? ` — ${tenant.suspension_reason}` : ""}. Ninguém da empresa consegue acessar.
            </p>
            <SaveButton className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-600">
              Reativar conta
            </SaveButton>
          </form>
        ) : tenant.status === "active" ? (
          <>
            <p className="mb-3 text-[13px] text-emerald-700">Conta ativa.</p>
            <details>
              <summary className="cursor-pointer list-none text-[12px] font-medium text-slate-500 hover:text-rose-700">Suspender conta…</summary>
              <form action={setTenantStatus} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
                <input type="hidden" name="tenant_id" value={tenant.id} />
                <input type="hidden" name="status" value="suspended" />
                <div className="min-w-[220px] flex-1">
                  <label className="mb-1 block text-[12px] font-medium text-slate-600">Motivo (aparece para o cliente)</label>
                  <input name="reason" placeholder="ex.: mensalidade em atraso" className={input} />
                </div>
                <SaveButton className="rounded-lg bg-rose-600 px-3 py-2 text-[12px] font-medium text-white hover:bg-rose-700">
                  Confirmar suspensão
                </SaveButton>
                <p className="w-full text-xs text-slate-500">
                  Os usuários perdem o acesso na hora. Os dados ficam guardados e voltam ao reativar.
                </p>
              </form>
            </details>
          </>
        ) : (
          <p className="text-[13px] text-slate-600">Conta arquivada.</p>
        )}
      </section>
    </div>
  );
}
