import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Pencil, RotateCcw, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { CreateTenantForm } from "./admin-forms";
import { TENANT_STATUS_LABEL, btnPrimary, input } from "./shared";

const PAGE_SIZES = [5, 15, 30] as const;
const STATUS_FILTERS = [
  { value: "", label: "Todas" },
  { value: "active", label: "Ativas" },
  { value: "suspended", label: "Suspensas" },
  { value: "archived", label: "Arquivadas" },
] as const;

export type SearchParams = Record<string, string | string[] | undefined>;

export async function ContasTab({ sp }: { sp: SearchParams }) {
  await requirePlatformAdmin();
  const supabase = await createClient();

  // Filtros e paginação ficam na URL (dá para recarregar ou compartilhar a busca)
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const q = one("q").trim();
  const statusFilter = STATUS_FILTERS.some((f) => f.value === one("status")) ? one("status") : "";
  const planFilter = one("plan"); // id do plano, "none" (sem contrato) ou vazio
  const size = PAGE_SIZES.find((n) => n === Number(one("size"))) ?? PAGE_SIZES[0];
  const page = Math.max(1, parseInt(one("page"), 10) || 1);

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (statusFilter) params.set("status", statusFilter);
    if (planFilter) params.set("plan", planFilter);
    if (size !== PAGE_SIZES[0]) params.set("size", String(size));
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/admin${qs ? `?${qs}` : ""}`;
  };

  // Filtro por plano: descobre antes quais contas têm (ou não têm) contrato com aquele plano
  let planIds: { mode: "in" | "notin"; ids: string[] } | null = null;
  if (planFilter === "none") {
    const { data } = await supabase.from("tenant_contracts").select("tenant_id");
    planIds = { mode: "notin", ids: (data ?? []).map((c) => c.tenant_id) };
  } else if (planFilter) {
    const { data } = await supabase.from("tenant_contracts").select("tenant_id").eq("plan_id", planFilter);
    planIds = { mode: "in", ids: (data ?? []).map((c) => c.tenant_id) };
  }

  let tenantQuery = supabase.from("tenants").select("id, name, status", { count: "exact" }).order("name");
  if (q) tenantQuery = tenantQuery.ilike("name", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  if (statusFilter) tenantQuery = tenantQuery.eq("status", statusFilter);
  if (planIds?.mode === "in") tenantQuery = tenantQuery.in("id", planIds.ids.length ? planIds.ids : ["00000000-0000-0000-0000-000000000000"]);
  if (planIds?.mode === "notin" && planIds.ids.length) tenantQuery = tenantQuery.not("id", "in", `(${planIds.ids.join(",")})`);

  const [{ data: plans }, { data: tenants, count: tenantTotal, error: tenantError }] = await Promise.all([
    supabase.from("plans").select("id, name").order("claim_price"),
    tenantQuery.range((page - 1) * size, page * size - 1),
  ]);
  // Página além do fim (por ex. depois de filtrar): volta para a primeira
  if ((tenantError || !tenants?.length) && page > 1) redirect(pageHref(1));

  const tenantIds = (tenants ?? []).map((t) => t.id);
  const { data: contracts } = tenantIds.length
    ? await supabase.from("tenant_contracts").select("tenant_id, plan_id, white_label_enabled").in("tenant_id", tenantIds)
    : { data: [] };
  const planName = new Map((plans ?? []).map((p) => [p.id, p.name]));
  const contractByTenant = new Map((contracts ?? []).map((c) => [c.tenant_id, c]));

  const total = tenantTotal ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const firstShown = total === 0 ? 0 : (page - 1) * size + 1;
  const lastShown = Math.min(page * size, total);
  const filtering = !!(q || statusFilter || planFilter);

  return (
    <>
        <section>
          <CreateTenantForm />

          <form method="get" action="/admin" className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="min-w-[200px] flex-1">
              <label htmlFor="q" className="mb-1 block text-[12px] font-medium text-slate-600">
                Buscar conta
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
                <input id="q" name="q" defaultValue={q} placeholder="Nome da empresa" className={`${input} pl-8`} />
              </div>
            </div>
            <div className="w-36">
              <label htmlFor="status" className="mb-1 block text-[12px] font-medium text-slate-600">
                Situação
              </label>
              <select id="status" name="status" defaultValue={statusFilter} className={input}>
                {STATUS_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-40">
              <label htmlFor="plan" className="mb-1 block text-[12px] font-medium text-slate-600">
                Plano
              </label>
              <select id="plan" name="plan" defaultValue={planFilter} className={input}>
                <option value="">Todos</option>
                {(plans ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="none">Sem contrato</option>
              </select>
            </div>
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
            <button className={`${btnPrimary} cursor-pointer`}>Filtrar</button>
            <Link
              href={`/admin${size !== PAGE_SIZES[0] ? `?size=${size}` : ""}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
            >
              <RotateCcw className="size-3.5 text-slate-500" />
              Limpar filtros
            </Link>
          </form>

          <p className="mb-3 text-[12px] text-slate-500">
            {total === 0
              ? filtering
                ? "Nenhuma conta encontrada com esses filtros."
                : "Nenhuma conta cadastrada."
              : `Mostrando ${firstShown} a ${lastShown} de ${total} ${total === 1 ? "conta" : "contas"}`}
          </p>

          <ul className="space-y-2">
            {(tenants ?? []).map((t) => {
              const contract = contractByTenant.get(t.id);
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Building2 className="size-4 shrink-0 text-slate-500" />
                    <span className="truncate text-[14px] font-medium text-slate-900">{t.name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        t.status === "active"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : "bg-rose-50 text-rose-700 ring-rose-200"
                      }`}
                    >
                      {TENANT_STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {contract ? (planName.get(contract.plan_id) ?? "Plano") : "Sem contrato"}
                    </span>
                    {contract?.white_label_enabled && (
                      <span className="rounded-full bg-violet/10 px-2 py-0.5 text-xs font-medium text-violet">white-label</span>
                    )}
                    <Link
                      href={`/admin/contas/${t.id}`}
                      aria-label={`Editar a conta ${t.name}`}
                      className="ml-1 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <Pencil className="size-3" /> Editar
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <nav className="mt-4 flex flex-wrap items-center justify-between gap-2" aria-label="Paginação das contas">
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
                      {idx > 0 && n - arr[idx - 1] > 1 && <span className="px-1 text-slate-500">…</span>}
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
        </section>
    </>
  );
}
