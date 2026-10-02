import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { UserActions } from "./users-forms";

export const metadata: Metadata = { title: "Usuários" };

const PAGE_SIZES = [5, 15, 30] as const;
const STATUS_FILTERS = [
  { value: "", label: "Todos" },
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
  { value: "pending", label: "Convite pendente" },
] as const;

const input =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";
const UUID = /^[0-9a-f-]{36}$/i;

type SearchParams = Record<string, string | string[] | undefined>;

// Passo 1 e 2: pesquisar e listar (exportável). O passo 3, editar, fica em /admin/usuarios/[id].
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const q = one("q").trim();
  const tenantFilter = UUID.test(one("tenant")) ? one("tenant") : "";
  const roleParam = one("role").trim();
  const groupFilter = one("group").trim();
  const orgFilter = one("org").trim();
  const statusFilter = STATUS_FILTERS.some((f) => f.value === one("status")) ? one("status") : "";
  const size = PAGE_SIZES.find((n) => n === Number(one("size"))) ?? PAGE_SIZES[0];
  const page = Math.max(1, parseInt(one("page"), 10) || 1);

  // "Tipo" filtra pelo nome do papel (vale para o papel de sistema e para o papel próprio da empresa)
  const { data: roles } = await supabase.from("roles").select("id, name").is("tenant_id", null).order("name");
  const roleFilter = roleParam === "Gestor da plataforma" || (roles ?? []).some((r) => r.name === roleParam) ? roleParam : "";

  const filterParams = () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (tenantFilter) params.set("tenant", tenantFilter);
    if (roleFilter) params.set("role", roleFilter);
    if (groupFilter) params.set("group", groupFilter);
    if (orgFilter) params.set("org", orgFilter);
    if (statusFilter) params.set("status", statusFilter);
    return params;
  };
  const pageHref = (p: number) => {
    const params = filterParams();
    if (size !== PAGE_SIZES[0]) params.set("size", String(size));
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/admin/usuarios${qs ? `?${qs}` : ""}`;
  };
  const exportHref = `/admin/usuarios/exportar?${filterParams().toString()}`;

  const [{ data: tenants }, { data: groupNames }, { data: allOrgs }, { data: rows, error }] = await Promise.all([
    supabase.from("tenants").select("id, name").order("name"),
    supabase.rpc("admin_group_names"),
    supabase.rpc("admin_all_organizations"),
    supabase.rpc("admin_search_users", {
      p_q: q || undefined,
      p_tenant_id: tenantFilter || undefined,
      p_role_name: roleFilter || undefined,
      p_status: statusFilter || undefined,
      p_group_name: groupFilter || undefined,
      p_organization_name: orgFilter || undefined,
      p_limit: size,
      p_offset: (page - 1) * size,
    }),
  ]);
  if ((error || !rows?.length) && page > 1) redirect(pageHref(1));

  const total = Number(rows?.[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const firstShown = total === 0 ? 0 : (page - 1) * size + 1;
  const lastShown = Math.min(page * size, total);
  const filtering = !!(q || tenantFilter || roleFilter || groupFilter || orgFilter || statusFilter);
  const orgNames = [...new Set((allOrgs ?? []).filter((o) => !tenantFilter || o.tenant_id === tenantFilter).map((o) => o.name))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-wide space-y-5 px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Usuários</h1>
            <p className="mt-1 max-w-xl text-[14px] text-slate-500">
              Pesquise, exporte a lista e clique no lápis para editar um usuário: dados, tipo, situação e grupos.
            </p>
          </div>
          <Link href="/admin/usuarios/novo" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-brand-600">
            <Plus className="size-4" /> Novo usuário
          </Link>
        </div>

        <details open className="rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer list-none rounded-t-xl bg-navy px-4 py-2 text-[13px] font-semibold text-white">Filtro</summary>
          <form method="get" action="/admin/usuarios" className="grid gap-x-5 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="q" className="mb-1 block text-[12px] font-medium text-slate-600">
                Nome ou e-mail
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                <input id="q" name="q" defaultValue={q} placeholder="Digite para buscar" className={`${input} pl-8`} />
              </div>
            </div>
            <div>
              <label htmlFor="tenant" className="mb-1 block text-[12px] font-medium text-slate-600">
                Empresa
              </label>
              <select id="tenant" name="tenant" defaultValue={tenantFilter} className={input}>
                <option value="">Todas</option>
                {(tenants ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="role" className="mb-1 block text-[12px] font-medium text-slate-600">
                Tipo
              </label>
              <select id="role" name="role" defaultValue={roleFilter} className={input}>
                <option value="">Todos</option>
                <option value="Gestor da plataforma">Gestor da plataforma</option>
                {(roles ?? []).map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="group" className="mb-1 block text-[12px] font-medium text-slate-600">
                Grupo de usuários
              </label>
              <select id="group" name="group" defaultValue={groupFilter} className={input}>
                <option value="">Todos</option>
                {(groupNames ?? []).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="org" className="mb-1 block text-[12px] font-medium text-slate-600">
                Organização
              </label>
              <select id="org" name="org" defaultValue={orgFilter} className={input}>
                <option value="">Todas</option>
                {orgNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <fieldset>
              <legend className="mb-1 block text-[12px] font-medium text-slate-600">Situação</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                {STATUS_FILTERS.map((f) => (
                  <label key={f.value} className="flex items-center gap-1.5 text-[13px] text-slate-700">
                    <input type="radio" name="status" value={f.value} defaultChecked={statusFilter === f.value} /> {f.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="w-28">
              <label htmlFor="size" className="mb-1 block text-[12px] font-medium text-slate-600">
                Por página
              </label>
              <select id="size" name="size" defaultValue={String(size)} className={input}>
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-brand-600 cursor-pointer">
                <Search className="size-4" /> Pesquisar
              </button>
              <Link
                href="/admin/usuarios"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
              >
                <RotateCcw className="size-3.5 text-slate-400" />
                Limpar filtros
              </Link>
            </div>
          </form>
        </details>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-slate-500">
            {total === 0
              ? filtering
                ? "Nenhum usuário encontrado com esses filtros."
                : "Nenhum usuário cadastrado."
              : `Mostrando ${firstShown}–${lastShown} de ${total} ${total === 1 ? "usuário" : "usuários"}`}
          </p>
          {total > 0 && (
            <a
              href={exportHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
              title="Baixa a lista completa (com os filtros aplicados) em CSV, que abre no Excel"
            >
              <Download className="size-3.5" /> Exportar lista (CSV)
            </a>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className="bg-navy text-[12px] font-semibold text-white">
              <tr>
                <th className="w-12 px-3 py-2.5" aria-label="Editar" />
                <th className="px-3 py-2.5">Nome</th>
                <th className="px-3 py-2.5">E-mail</th>
                <th className="px-3 py-2.5">Empresa</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Organização</th>
                <th className="px-3 py-2.5">Grupo</th>
                <th className="px-3 py-2.5">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(rows ?? []).map((u) => (
                <tr key={u.membership_id ?? u.invite_id} className="align-top odd:bg-white even:bg-slate-50/60">
                  <td className="px-3 py-2.5">
                    {u.pending ? (
                      <details className="relative">
                        <summary className="flex size-8 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100" title="Ações do convite">
                          …
                        </summary>
                        <div className="absolute left-0 z-10 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                          <UserActions
                            row={{
                              tenant_id: u.tenant_id,
                              membership_id: null,
                              invite_id: u.invite_id,
                              user_id: null,
                              email: u.email,
                              pending: true,
                              status: u.status,
                            }}
                          />
                        </div>
                      </details>
                    ) : (
                      <Link
                        href={`/admin/usuarios/${u.membership_id ?? u.user_id}`}
                        aria-label={`Editar ${u.full_name || u.email}`}
                        title="Editar usuário"
                        className="flex size-8 items-center justify-center rounded-lg bg-navy text-white hover:bg-navy-700"
                      >
                        <Pencil className="size-3.5" />
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-900">{u.full_name || <span className="font-normal text-slate-400">—</span>}</td>
                  <td className="px-3 py-2.5 text-slate-600">{u.email}</td>
                  <td className="px-3 py-2.5 text-slate-600">{u.tenant_name}</td>
                  <td className="px-3 py-2.5 text-slate-600">{u.role_name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600">{u.organization_name ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-3 py-2.5 text-slate-600">{u.groups ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-3 py-2.5">
                    {u.pending ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">convite pendente</span>
                    ) : u.status !== "active" ? (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">Inativo</span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">Ativo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <nav className="flex flex-wrap items-center justify-between gap-2" aria-label="Paginação dos usuários">
            <div className="flex items-center gap-1">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
                  Anterior
                </Link>
              ) : (
                <span className="rounded-lg border border-slate-100 px-3 py-1.5 text-[12px] text-slate-300">Anterior</span>
              )}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                .map((n, idx, arr) => (
                  <span key={n} className="flex items-center gap-1">
                    {idx > 0 && n - arr[idx - 1] > 1 && <span className="px-1 text-slate-400">…</span>}
                    <Link
                      href={pageHref(n)}
                      aria-current={n === page ? "page" : undefined}
                      className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium ${
                        n === page ? "bg-brand text-white" : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {n}
                    </Link>
                  </span>
                ))}
              {page < totalPages ? (
                <Link href={pageHref(page + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
                  Próxima
                </Link>
              ) : (
                <span className="rounded-lg border border-slate-100 px-3 py-1.5 text-[12px] text-slate-300">Próxima</span>
              )}
            </div>
            <span className="text-[12px] text-slate-500">
              Página {page} de {totalPages}
            </span>
          </nav>
        )}
      </div>
    </div>
  );
}
