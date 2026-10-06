import { GroupChip } from "@/lib/group-icons";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Pencil, Plus, RotateCcw, Search, SearchX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes } from "@/lib/permissions";

export const metadata: Metadata = { title: "Grupos" };

type SearchParams = Record<string, string | string[] | undefined>;

const PAGE_SIZES = [5, 15, 30] as const;
const STATUS_FILTERS = [
  { value: "", label: "Todos" },
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
] as const;

const input =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

// Mesmo modelo da tela de Usuários (Documento 5 §9): cadastrar numa tela própria (/grupos/novo),
// pesquisar/filtrar/listar aqui, editar numa terceira (/grupos/[id]), em vez do formulário e a
// lista inteira numa página só, como era antes.
export default async function GruposPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getTenantContext();
  const perms = await getPermissionCodes(ctx.userId, ctx.tenantId);
  const canManage = perms.has("user.manage");
  const supabase = await createClient();

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const q = one("q").trim();
  const statusFilter = STATUS_FILTERS.some((f) => f.value === one("status")) ? one("status") : "";
  const size = PAGE_SIZES.find((n) => n === Number(one("size"))) ?? PAGE_SIZES[0];
  const page = Math.max(1, parseInt(one("page"), 10) || 1);

  const searched = one("searched") === "1";
  const filterParams = () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (statusFilter) params.set("status", statusFilter);
    params.set("searched", "1");
    return params;
  };
  const pageHref = (p: number) => {
    const params = filterParams();
    if (size !== PAGE_SIZES[0]) params.set("size", String(size));
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/grupos${qs ? `?${qs}` : ""}`;
  };

  let query = supabase
    .from("groups")
    .select("id, name, description, status, icon, color, group_members(count)", { count: "exact" })
    .eq("tenant_id", ctx.tenantId);
  if (q) query = query.ilike("name", `%${q}%`);
  if (statusFilter) query = query.eq("status", statusFilter);
  const { data: groups, count, error } = searched
    ? await query.order("status").order("name").range((page - 1) * size, page * size - 1)
    : { data: null, count: null, error: null };
  if (searched && (error || !groups?.length) && page > 1) redirect(pageHref(1));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const firstShown = total === 0 ? 0 : (page - 1) * size + 1;
  const lastShown = Math.min(page * size, total);
  const filtering = !!(q || statusFilter);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-wide space-y-5 px-4 py-6 md:px-8 md:py-8">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Grupos</h1>
          <p className="mt-1 max-w-xl text-[14px] text-slate-700">
            Unidades operacionais que respondem pelas etapas do fluxo. A etapa aponta para o grupo, e qualquer membro ativo pode
            atuar nela.
          </p>
        </div>

        {canManage && (
          <div className="flex justify-end">
            <Link href="/grupos/novo" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-brand-600">
              <Plus className="size-4" /> Novo grupo
            </Link>
          </div>
        )}

        <details open className="rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer list-none rounded-t-xl bg-navy px-4 py-2 text-[13px] font-semibold text-white">Filtro</summary>
          <form method="get" action="/grupos" className="grid gap-x-5 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <input type="hidden" name="searched" value="1" />
            <div>
              <label htmlFor="q" className="mb-1 block text-[12px] font-medium text-slate-600">
                Nome do grupo
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                <input id="q" name="q" defaultValue={q} placeholder="Digite para buscar" className={`${input} pl-8`} />
              </div>
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
                href="/grupos"
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
            <p className="max-w-sm text-[13px] text-slate-500">A lista não carrega sozinha ao abrir a tela.</p>
          </div>
        ) : (
        <>
        <p className="text-[12px] text-slate-500">
          {total === 0
            ? filtering
              ? "Nenhum grupo encontrado com esses filtros."
              : "Nenhum grupo cadastrado."
            : `Mostrando ${firstShown} a ${lastShown} de ${total} ${total === 1 ? "grupo" : "grupos"}`}
        </p>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="bg-navy text-[12px] font-semibold text-white">
              <tr>
                <th className="w-12 px-3 py-2.5" aria-label="Editar" />
                <th className="px-3 py-2.5">Nome</th>
                <th className="px-3 py-2.5">Descrição</th>
                <th className="px-3 py-2.5">Membros</th>
                <th className="px-3 py-2.5">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(groups ?? []).map((g) => {
                const members = g.group_members?.[0]?.count ?? 0;
                const active = g.status === "active";
                return (
                  <tr key={g.id} className={`align-top odd:bg-white even:bg-slate-50/60 ${active ? "" : "opacity-70"}`}>
                    <td className="px-3 py-2.5">
                      {canManage ? (
                        <Link
                          href={`/grupos/${g.id}`}
                          aria-label={`Editar ${g.name}`}
                          title="Editar grupo"
                          className="flex size-8 items-center justify-center rounded-lg bg-navy text-white hover:bg-navy-700"
                        >
                          <Pencil className="size-3.5" />
                        </Link>
                      ) : (
                        <span className="flex size-8 items-center justify-center text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">
                      <GroupChip name={g.name} icon={g.icon} color={g.color} />
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{g.description || <span className="text-slate-400">-</span>}</td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {members} membro{members === 1 ? "" : "s"}
                    </td>
                    <td className="px-3 py-2.5">
                      {active ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">Ativo</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">Inativo</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <nav className="flex flex-wrap items-center justify-between gap-2" aria-label="Paginação dos grupos">
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
    </div>
  );
}
