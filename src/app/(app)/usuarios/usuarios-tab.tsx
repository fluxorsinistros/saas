import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Pencil, Plus, RotateCcw, Search, SearchX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantOrganizations } from "@/lib/tenant-organizations";
import { InviteActions } from "./invite-actions";

export type SearchParams = Record<string, string | string[] | undefined>;

const PAGE_SIZES = [5, 15, 30] as const;
const ROLE_NAMES = ["Administrador", "Operador"] as const;
const STATUS_FILTERS = [
  { value: "", label: "Todos" },
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
  { value: "pending", label: "Convite pendente" },
] as const;

const input =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

// Passo 1 e 2: pesquisar e listar (exportável). O passo 3, editar, fica em /usuarios/[id].
export async function UsuariosTab({
  sp,
  tenantId,
  userId,
  canManage,
}: {
  sp: SearchParams;
  tenantId: string;
  userId: string;
  canManage: boolean;
}) {
  const supabase = await createClient();
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const q = one("q").trim();
  const roleFilter = (ROLE_NAMES as readonly string[]).includes(one("role")) ? one("role") : "";
  const groupFilter = one("group").trim();
  const orgFilter = one("org").trim();
  const statusFilter = STATUS_FILTERS.some((f) => f.value === one("status")) ? one("status") : "";
  const size = PAGE_SIZES.find((n) => n === Number(one("size"))) ?? PAGE_SIZES[0];
  const page = Math.max(1, parseInt(one("page"), 10) || 1);

  const filterParams = () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (roleFilter) params.set("role", roleFilter);
    if (groupFilter) params.set("group", groupFilter);
    if (orgFilter) params.set("org", orgFilter);
    if (statusFilter) params.set("status", statusFilter);
    params.set("searched", "1");
    return params;
  };
  const pageHref = (p: number) => {
    const params = filterParams();
    if (size !== PAGE_SIZES[0]) params.set("size", String(size));
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/usuarios${qs ? `?${qs}` : ""}`;
  };
  const exportHref = `/usuarios/exportar?${filterParams().toString()}`;
  // A lista só consulta o banco depois de clicar "Pesquisar" (campo oculto "searched" no form),
  // abrir a tela não dispara a busca pesada sozinha, só os combos de filtro (grupos/organizações,
  // que são baratos). Página pede isso pra não ficar lenta sem necessidade.
  const searched = one("searched") === "1";

  const [{ data: groups }, organizations, searchResult] = await Promise.all([
    supabase.from("groups").select("id, name").eq("tenant_id", tenantId).eq("status", "active").order("name"),
    getTenantOrganizations(supabase, tenantId),
    searched
      ? supabase.rpc("tenant_search_users", {
          p_tenant_id: tenantId,
          p_q: q || undefined,
          p_role_name: roleFilter || undefined,
          p_status: statusFilter || undefined,
          p_group_name: groupFilter || undefined,
          p_organization_name: orgFilter || undefined,
          p_limit: size,
          p_offset: (page - 1) * size,
        })
      : Promise.resolve({ data: null, error: null }),
  ]);
  const { data: rows, error } = searchResult;
  if (searched && (error || !rows?.length) && page > 1) redirect(pageHref(1));

  // Subgrupo de cada pessoa na lista ("Transportador · TecPet"): a busca devolve só o nome do grupo
  const membershipIds = (rows ?? []).map((r) => r.membership_id).filter((x): x is string => !!x);
  const { data: subRows } = membershipIds.length
    ? await supabase.from("group_members").select("membership_id, groups(name), group_subgroups(name)").in("membership_id", membershipIds).not("subgroup_id", "is", null)
    : { data: [] as { membership_id: string; groups: { name: string } | null; group_subgroups: { name: string } | null }[] };
  const subgroupLabel = new Map<string, string[]>();
  for (const r of (subRows ?? []) as unknown as { membership_id: string; groups: { name: string } | null; group_subgroups: { name: string } | null }[]) {
    if (!r.groups || !r.group_subgroups) continue;
    subgroupLabel.set(r.membership_id, [...(subgroupLabel.get(r.membership_id) ?? []), `${r.groups.name} · ${r.group_subgroups.name}`]);
  }

  const total = Number(rows?.[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const firstShown = total === 0 ? 0 : (page - 1) * size + 1;
  const lastShown = Math.min(page * size, total);
  const filtering = !!(q || roleFilter || groupFilter || orgFilter || statusFilter);

  return (
    <div className="space-y-5">
      {canManage && (
        <div className="flex justify-end">
          <Link href="/usuarios/novo" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-brand-600">
            <Plus className="size-4" /> Novo usuário
          </Link>
        </div>
      )}

      <details open className="rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none rounded-t-xl bg-navy px-4 py-2 text-[13px] font-semibold text-white">Filtro</summary>
        <form method="get" action="/usuarios" className="grid gap-x-5 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="searched" value="1" />
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
            <label htmlFor="role" className="mb-1 block text-[12px] font-medium text-slate-600">
              Tipo
            </label>
            <select id="role" name="role" defaultValue={roleFilter} className={input}>
              <option value="">Todos</option>
              {ROLE_NAMES.map((r) => (
                <option key={r} value={r}>
                  {r}
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
              {(groups ?? []).map((g) => (
                <option key={g.id} value={g.name}>
                  {g.name}
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
              {organizations.map((o) => o.name).map((n) => (
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
              href="/usuarios"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
            >
              <RotateCcw className="size-3.5 text-slate-400" />
              Limpar filtros
            </Link>
          </div>
        </form>
      </details>

      {!searched ? (
        <div className="mt-2 flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <SearchX className="size-8 text-slate-300" />
          <p className="text-[15px] font-medium text-slate-800">Ajuste os filtros e clique em Pesquisar</p>
          <p className="max-w-sm text-[13px] text-slate-500">A lista não carrega sozinha ao abrir a tela, isso mantém a página leve mesmo com muitos usuários.</p>
        </div>
      ) : (
        <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-slate-500">
          {total === 0
            ? filtering
              ? "Nenhum usuário encontrado com esses filtros."
              : "Nenhum usuário cadastrado."
            : `Mostrando ${firstShown} a ${lastShown} de ${total} ${total === 1 ? "usuário" : "usuários"}`}
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
        <table className="w-full min-w-[780px] text-left text-[13px]">
          <thead className="bg-navy text-[12px] font-semibold text-white">
            <tr>
              <th className="w-12 px-3 py-2.5" aria-label="Editar" />
              <th className="px-3 py-2.5">Nome</th>
              <th className="px-3 py-2.5">E-mail</th>
              <th className="px-3 py-2.5">Tipo</th>
              <th className="px-3 py-2.5">Organização</th>
              <th className="px-3 py-2.5">Grupo</th>
              <th className="px-3 py-2.5">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows ?? []).map((u) => {
              const isSelf = u.user_id === userId;
              return (
                <tr key={u.membership_id ?? u.invite_id} className="align-top odd:bg-white even:bg-slate-50/60">
                  <td className="px-3 py-2.5">
                    {!canManage ? null : u.pending ? (
                      <details className="relative">
                        <summary className="flex size-8 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100" title="Ações do convite">
                          …
                        </summary>
                        <div className="absolute left-0 z-10 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                          <InviteActions email={u.email} inviteId={u.invite_id ?? ""} />
                        </div>
                      </details>
                    ) : isSelf ? (
                      <span title="Você não edita o próprio acesso" className="flex size-8 items-center justify-center text-xs text-slate-400">
                        -
                      </span>
                    ) : (
                      <Link
                        href={`/usuarios/${u.membership_id}`}
                        aria-label={`Editar ${u.full_name || u.email}`}
                        title="Editar usuário"
                        className="flex size-8 items-center justify-center rounded-lg bg-navy text-white hover:bg-navy-700"
                      >
                        <Pencil className="size-3.5" />
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-900">
                    {u.full_name || <span className="font-normal text-slate-400">-</span>}
                    {isSelf && <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">Você</span>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{u.email}</td>
                  <td className="px-3 py-2.5 text-slate-600">{u.role_name ?? "-"}</td>
                  <td className="px-3 py-2.5 text-slate-600">{u.organization_name ?? <span className="text-slate-400">-</span>}</td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {(u.membership_id ? subgroupLabel.get(u.membership_id)?.join(", ") : undefined) ?? u.groups ??
                      (u.role_name === "Administrador" ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        <span className="sla-chip sla-risk" title="Sem grupo a pessoa entra, mas não consegue usar o sistema. Edite o usuário e escolha um grupo.">
                          Sem grupo
                        </span>
                      ))}
                  </td>
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
              );
            })}
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
        </>
      )}
    </div>
  );
}
