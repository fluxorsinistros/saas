import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AddUserForm, UserActions } from "../../usuarios/users-forms";

// Usuários só desta conta: mesma lógica da tela global de Usuários, já filtrada.
export async function TabUsuarios({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const supabase = await createClient();
  const [{ data: roles }, { data: rows }, { data: groups }, { data: organizations }] = await Promise.all([
    supabase.from("roles").select("id, name").is("tenant_id", null).order("name"),
    supabase.rpc("admin_search_users", { p_tenant_id: tenantId, p_limit: 100, p_offset: 0 }),
    supabase.rpc("admin_all_groups"),
    supabase.rpc("admin_all_organizations"),
  ]);
  const total = Number(rows?.[0]?.total ?? 0);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Adicionar usuário</h2>
        <AddUserForm tenants={[{ id: tenantId, name: tenantName }]} roles={roles ?? []} groups={groups ?? []} organizations={organizations ?? []} defaultTenantId={tenantId} />
      </section>

      <section>
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          Usuários da conta {total > 0 && <span className="font-normal normal-case tracking-normal text-slate-500">({total})</span>}
        </h2>
        {total === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-500">Ninguém nesta conta ainda — adicione alguém acima.</p>
        ) : (
          <ul className="space-y-3">
            {(rows ?? []).map((u) => (
              <li key={u.membership_id ?? u.invite_id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-slate-900">{u.full_name || u.email}</p>
                    {u.full_name && <p className="truncate text-[12px] text-slate-500">{u.email}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-violet/10 px-2 py-0.5 text-xs font-medium text-violet">{u.role_name ?? "Sem tipo"}</span>
                    {u.pending ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                        aguardando criar conta
                      </span>
                    ) : u.status !== "active" ? (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">Inativo</span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">Ativo</span>
                    )}
                  </div>
                </div>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <UserActions
                    row={{
                      tenant_id: u.tenant_id,
                      membership_id: u.membership_id,
                      invite_id: u.invite_id,
                      user_id: u.user_id,
                      email: u.email,
                      pending: u.pending,
                      status: u.status,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {total > 100 && (
          <p className="mt-3 text-[12px] text-slate-500">
            Mostrando os 100 primeiros.{" "}
            <Link href={`/admin/usuarios?tenant=${tenantId}`} className="font-medium text-brand hover:underline">
              Ver todos na tela de Usuários
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
