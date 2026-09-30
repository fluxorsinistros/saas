import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Plus, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getPlatformBrand } from "@/lib/branding";
import { PLAN_LIMITS, PLAN_LIMIT_KEYS, type PlanLimitDef } from "@/lib/plan-limits";
import { SaveButton } from "./save-button";
import { assignContract, createPlan, createTenantAsAdmin, removePlanLimit, savePlanLimits, savePlatformBranding, setTenantStatus, setWhiteLabel, updateContractOverrides, updatePlan } from "./actions";

export const metadata: Metadata = { title: "Administração de plataforma" };

const input =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const limitLabel = (key: string) => PLAN_LIMITS.find((d) => d.key === key)?.label ?? key;
const PAGE_SIZES = [5, 15, 30] as const;
const STATUS_FILTERS = [
  { value: "", label: "Todas" },
  { value: "active", label: "Ativas" },
  { value: "suspended", label: "Suspensas" },
  { value: "archived", label: "Arquivadas" },
] as const;
const btnPrimary = "rounded-lg bg-brand px-3 py-2 text-[12px] font-medium text-white hover:bg-brand-600";
// Texto do valor efetivo de um limite (número, sim/não ou sem limite)
function showValue(def: PlanLimitDef | undefined, v: unknown): string {
  if (def?.kind === "toggle") return Number(v) === 1 ? "permitido" : "bloqueado";
  return v === null || v === undefined ? "sem limite" : String(v).replace(".", ",");
}
const formatNumber = (v: number | string | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePlatformAdmin();
  const supabase = await createClient();

  // Filtros e paginação da lista de empresas ficam na URL (o admin pode recarregar ou compartilhar a busca)
  const sp = await searchParams;
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
    return `/admin${qs ? `?${qs}` : ""}#empresas`;
  };

  // Filtro por plano: descobre antes quais empresas têm (ou não têm) contrato com aquele plano
  let planIds: { mode: "in" | "notin"; ids: string[] } | null = null;
  if (planFilter === "none") {
    const { data } = await supabase.from("tenant_contracts").select("tenant_id");
    planIds = { mode: "notin", ids: (data ?? []).map((c) => c.tenant_id) };
  } else if (planFilter) {
    const { data } = await supabase.from("tenant_contracts").select("tenant_id").eq("plan_id", planFilter);
    planIds = { mode: "in", ids: (data ?? []).map((c) => c.tenant_id) };
  }

  let tenantQuery = supabase
    .from("tenants")
    .select("id, name, status, suspended_at, suspension_reason", { count: "exact" })
    .order("name");
  if (q) tenantQuery = tenantQuery.ilike("name", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  if (statusFilter) tenantQuery = tenantQuery.eq("status", statusFilter);
  if (planIds?.mode === "in") tenantQuery = tenantQuery.in("id", planIds.ids.length ? planIds.ids : ["00000000-0000-0000-0000-000000000000"]);
  if (planIds?.mode === "notin" && planIds.ids.length) tenantQuery = tenantQuery.not("id", "in", `(${planIds.ids.join(",")})`);

  const [{ data: plans }, { data: limits }, { data: tenants, count: tenantTotal, error: tenantError }] = await Promise.all([
    supabase.from("plans").select("id, code, name, setup_fee, monthly_fee, claim_price, status").order("claim_price"),
    supabase.from("plan_limits").select("id, plan_id, limit_key, limit_value"),
    tenantQuery.range((page - 1) * size, page * size - 1),
  ]);
  // Página além do fim (por ex. depois de filtrar): volta para a primeira
  if ((tenantError || !tenants?.length) && page > 1) redirect(pageHref(1));

  const tenantIds = (tenants ?? []).map((t) => t.id);
  const { data: contracts } = tenantIds.length
    ? await supabase.from("tenant_contracts").select("id, tenant_id, plan_id, overrides, status, white_label_enabled, white_label_surcharge_pct").in("tenant_id", tenantIds)
    : { data: [] };

  const brand = await getPlatformBrand();

  const total = tenantTotal ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const firstShown = total === 0 ? 0 : (page - 1) * size + 1;
  const lastShown = Math.min(page * size, total);
  const filtering = !!(q || statusFilter || planFilter);

  const limitsByPlan = new Map<string, typeof limits>();
  for (const l of limits ?? []) limitsByPlan.set(l.plan_id, [...(limitsByPlan.get(l.plan_id) ?? []), l]);
  const planById = new Map((plans ?? []).map((p) => [p.id, p]));
  const contractByTenant = new Map((contracts ?? []).map((c) => [c.tenant_id, c]));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-8 space-y-10">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Administração de plataforma</h1>
          <p className="mt-1 max-w-xl text-[14px] text-slate-500">
            Global, fora de qualquer tenant — planos, limites e o contrato de cada empresa cliente (Documento 1 §64: nada
            disso é constante no código).
          </p>
        </div>

        <section>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Marca do produto</h2>
          <form action={savePlatformBranding} className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-navy">
              {brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo do Storage
                <img src={brand.logoUrl} alt="Logo atual" className="size-10 object-contain" />
              ) : (
                <span className="px-1 text-center text-[10px] leading-tight text-slate-400">logo padrão</span>
              )}
            </div>
            <div className="min-w-[200px] flex-1">
              <label htmlFor="product_name" className="mb-1 block text-[12px] font-medium text-slate-600">
                Nome do produto
              </label>
              <input key={brand.name} id="product_name" name="product_name" required defaultValue={brand.name} className={input} />
            </div>
            <div className="min-w-[180px] flex-1">
              <label htmlFor="tagline" className="mb-1 block text-[12px] font-medium text-slate-600">
                Subtítulo (opcional)
              </label>
              <input key={brand.tagline} id="tagline" name="tagline" defaultValue={brand.tagline} className={input} />
            </div>
            <div className="min-w-[220px] flex-1">
              <label htmlFor="logo" className="mb-1 block text-[12px] font-medium text-slate-600">
                Logo (PNG, JPG, WEBP ou SVG, até 1 MB)
              </label>
              <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className={`${input} file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-[12px]`} />
              {brand.logoUrl && (
                <label className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-500">
                  <input type="checkbox" name="remove_logo" /> Remover logo e voltar ao padrão
                </label>
              )}
            </div>
            <SaveButton className={btnPrimary}>Salvar marca</SaveButton>
          </form>
          <p className="mt-2 text-[12px] text-slate-500">
            Vale para o menu lateral, a tela de login e o título da aba. A marca própria de cada cliente (white-label) é liberada
            no card do cliente, mais abaixo.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Planos</h2>

          <details className="mb-1">
            <summary className="cursor-pointer list-none text-[12px] font-medium text-slate-500 hover:text-slate-800">
              + Criar novo plano (raro — os planos padrão já existem)
            </summary>
          <form action={createPlan} className="mt-2 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="w-28">
              <label htmlFor="code" className="mb-1 block text-[12px] font-medium text-slate-600">
                Código
              </label>
              <input id="code" name="code" required placeholder="standard" className={input} />
            </div>
            <div className="min-w-[160px] flex-1">
              <label htmlFor="name" className="mb-1 block text-[12px] font-medium text-slate-600">
                Nome
              </label>
              <input id="name" name="name" required placeholder="Standard" className={input} />
            </div>
            <div className="w-28">
              <label htmlFor="setup_fee" className="mb-1 block text-[12px] font-medium text-slate-600">
                Implantação
              </label>
              <input id="setup_fee" name="setup_fee" type="number" step="0.01" defaultValue="0" className={input} />
            </div>
            <div className="w-28">
              <label htmlFor="monthly_fee" className="mb-1 block text-[12px] font-medium text-slate-600">
                Mensalidade
              </label>
              <input id="monthly_fee" name="monthly_fee" type="number" step="0.01" defaultValue="0" className={input} />
            </div>
            <div className="w-28">
              <label htmlFor="claim_price" className="mb-1 block text-[12px] font-medium text-slate-600">
                Por sinistro
              </label>
              <input id="claim_price" name="claim_price" type="number" step="0.01" defaultValue="0" className={input} />
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-brand-600">
              <Plus className="size-4" /> Criar plano
            </button>
          </form>
          </details>

          <div className="mt-4 space-y-3">
            {(plans ?? []).map((plan) => (
              <details key={plan.id} className="group rounded-xl border border-slate-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <span className="text-[13px] font-medium text-slate-900">{plan.name}</span>
                    <span className="ml-2 text-[11px] text-slate-400">{plan.code}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[12px] text-slate-500">
                    <span>Implantação {currency.format(plan.setup_fee)}</span>
                    <span>Mensal {currency.format(plan.monthly_fee)}</span>
                    <span>Sinistro {currency.format(plan.claim_price)}</span>
                  </div>
                </summary>
                <div className="space-y-5 border-t border-slate-100 px-4 py-4">
                  <form action={updatePlan} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="plan_id" value={plan.id} />
                    <div className="min-w-[160px] flex-1">
                      <label className="mb-1 block text-[12px] font-medium text-slate-600">Nome</label>
                      <input key={plan.name} name="name" required defaultValue={plan.name} className={input} />
                    </div>
                    <div className="w-28">
                      <label className="mb-1 block text-[12px] font-medium text-slate-600">Implantação (R$)</label>
                      <input key={plan.setup_fee} name="setup_fee" inputMode="decimal" defaultValue={formatNumber(plan.setup_fee)} className={input} />
                    </div>
                    <div className="w-28">
                      <label className="mb-1 block text-[12px] font-medium text-slate-600">Mensalidade (R$)</label>
                      <input key={plan.monthly_fee} name="monthly_fee" inputMode="decimal" defaultValue={formatNumber(plan.monthly_fee)} className={input} />
                    </div>
                    <div className="w-28">
                      <label className="mb-1 block text-[12px] font-medium text-slate-600">Por sinistro (R$)</label>
                      <input key={plan.claim_price} name="claim_price" inputMode="decimal" defaultValue={formatNumber(plan.claim_price)} className={input} />
                    </div>
                    <SaveButton className={btnPrimary}>Salvar preços</SaveButton>
                  </form>

                  <form action={savePlanLimits}>
                    <input type="hidden" name="plan_id" value={plan.id} />
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">
                      Limites — deixe vazio para não limitar
                    </p>
                    <div
                      key={JSON.stringify((limitsByPlan.get(plan.id) ?? []).map((l) => [l.limit_key, l.limit_value]))}
                      className="grid gap-x-6 gap-y-3 sm:grid-cols-2"
                    >
                      {PLAN_LIMITS.map((def) => {
                        const current = (limitsByPlan.get(plan.id) ?? []).find((l) => l.limit_key === def.key);
                        return (
                          <div key={def.key}>
                            <label className="mb-1 block text-[12px] font-medium text-slate-600">
                              {def.label} <span className="font-normal text-slate-400">({def.unit})</span>
                            </label>
                            {def.kind === "toggle" ? (
                              <select name={`limit_${def.key}`} defaultValue={Number(current?.limit_value) === 1 ? "1" : "0"} className={input}>
                                <option value="0">Bloquear</option>
                                <option value="1">Permitir (com cobrança extra)</option>
                              </select>
                            ) : (
                              <input
                                name={`limit_${def.key}`}
                                inputMode="decimal"
                                defaultValue={formatNumber(current?.limit_value)}
                                placeholder="sem limite"
                                className={input}
                              />
                            )}
                            <p className="mt-0.5 text-[11px] text-slate-400">{def.hint}</p>
                          </div>
                        );
                      })}
                    </div>
                    <SaveButton className={`mt-3 ${btnPrimary}`}>Salvar limites</SaveButton>
                  </form>

                  {(limitsByPlan.get(plan.id) ?? []).some((l) => !PLAN_LIMIT_KEYS.has(l.limit_key)) && (
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">
                        Limites antigos fora do catálogo
                      </p>
                      <ul className="space-y-1">
                        {(limitsByPlan.get(plan.id) ?? [])
                          .filter((l) => !PLAN_LIMIT_KEYS.has(l.limit_key))
                          .map((l) => (
                            <li key={l.id} className="flex items-center gap-2 text-[12px] text-slate-700">
                              <span>{l.limit_key}</span>
                              <span className="text-slate-500">{l.limit_value === null ? "ilimitado" : l.limit_value}</span>
                              <form action={removePlanLimit.bind(null, l.id)}>
                                <button className="text-slate-400 hover:text-rose-600" aria-label={`Remover limite ${l.limit_key}`}>
                                  <X className="size-3.5" />
                                </button>
                              </form>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section id="empresas" className="scroll-mt-4">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Empresas e contratos</h2>
          <p className="mb-3 text-[13px] text-slate-500">
            O efetivo aparece sempre ao lado do padrão do plano — nunca escondemos quando um contrato sobrescreveu algo
            (Documento 5 §11).
          </p>

          <form action={createTenantAsAdmin} className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="min-w-[220px] flex-1">
              <label htmlFor="tenant_name" className="mb-1 block text-[12px] font-medium text-slate-600">
                Nova empresa cliente
              </label>
              <input id="tenant_name" name="name" required placeholder="Nome da empresa" className={input} />
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-brand-600">
              <Plus className="size-4" /> Criar empresa
            </button>
          </form>

          <form method="get" action="/admin" className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="min-w-[200px] flex-1">
              <label htmlFor="q" className="mb-1 block text-[12px] font-medium text-slate-600">
                Buscar empresa
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
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
            <button className={btnPrimary}>Filtrar</button>
            {filtering && (
              <Link href={`/admin${size !== PAGE_SIZES[0] ? `?size=${size}` : ""}#empresas`} className="py-2 text-[12px] font-medium text-slate-500 hover:text-slate-800">
                Limpar filtros
              </Link>
            )}
          </form>

          <p className="mb-3 text-[12px] text-slate-500">
            {total === 0
              ? filtering
                ? "Nenhuma empresa encontrada com esses filtros."
                : "Nenhuma empresa cadastrada."
              : `Mostrando ${firstShown}–${lastShown} de ${total} ${total === 1 ? "empresa" : "empresas"}`}
          </p>

          <ul className="space-y-3">
            {(tenants ?? []).map((t) => {
              const contract = contractByTenant.get(t.id);
              const plan = contract ? planById.get(contract.plan_id) : undefined;
              const overrides = (contract?.overrides ?? {}) as Record<string, unknown>;
              const overrideKeys = Object.keys(overrides);
              return (
                <li key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="size-4 text-slate-400" />
                      <span className="text-[14px] font-medium text-slate-900">{t.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.status !== "active" && (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                          {t.status === "suspended" ? "Suspensa" : "Arquivada"}
                        </span>
                      )}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {plan ? plan.name : "Sem contrato"}
                      </span>
                    </div>
                  </div>

                  {t.status === "suspended" ? (
                    <form action={setTenantStatus} className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-rose-50/60 px-3 py-2">
                      <input type="hidden" name="tenant_id" value={t.id} />
                      <input type="hidden" name="status" value="active" />
                      <p className="min-w-0 flex-1 text-[12px] text-rose-800">
                        Conta suspensa
                        {t.suspended_at ? ` em ${new Date(t.suspended_at).toLocaleDateString("pt-BR")}` : ""}
                        {t.suspension_reason ? ` — ${t.suspension_reason}` : ""}. Ninguém da empresa consegue acessar.
                      </p>
                      <SaveButton className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-600">
                        Reativar conta
                      </SaveButton>
                    </form>
                  ) : t.status === "active" ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer list-none text-[12px] font-medium text-slate-500 hover:text-rose-700">
                        Suspender conta…
                      </summary>
                      <form action={setTenantStatus} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
                        <input type="hidden" name="tenant_id" value={t.id} />
                        <input type="hidden" name="status" value="suspended" />
                        <div className="min-w-[220px] flex-1">
                          <label className="mb-1 block text-[12px] font-medium text-slate-600">Motivo (aparece para o cliente)</label>
                          <input name="reason" placeholder="ex.: mensalidade em atraso" className={input} />
                        </div>
                        <SaveButton className="rounded-lg bg-rose-600 px-3 py-2 text-[12px] font-medium text-white hover:bg-rose-700">
                          Confirmar suspensão
                        </SaveButton>
                        <p className="w-full text-[11px] text-slate-500">
                          Os usuários perdem o acesso na hora. Os dados ficam guardados e voltam ao reativar.
                        </p>
                      </form>
                    </details>
                  ) : null}

                  <form action={assignContract} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="tenant_id" value={t.id} />
                    <select key={contract?.plan_id ?? "none"} name="plan_id" defaultValue={contract?.plan_id ?? ""} className={`${input} w-48`}>
                      <option value="" disabled>
                        Escolher plano…
                      </option>
                      {(plans ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-600">
                      {contract ? "Trocar plano" : "Atribuir plano"}
                    </button>
                  </form>

                  {contract && plan && (
                    <form action={setWhiteLabel} className="mt-3 flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                      <input type="hidden" name="contract_id" value={contract.id} />
                      <label className="flex items-center gap-2 pb-1.5 text-[12px] font-medium text-slate-700">
                        <input
                          key={String(contract.white_label_enabled)}
                          type="checkbox"
                          name="enabled"
                          defaultChecked={contract.white_label_enabled}
                        />
                        Marca própria (white-label) liberada
                      </label>
                      <div className="w-28">
                        <label className="mb-0.5 block text-[11px] text-slate-500">Acréscimo na mensalidade (%)</label>
                        <input
                          key={contract.white_label_surcharge_pct}
                          name="surcharge_pct"
                          inputMode="decimal"
                          defaultValue={formatNumber(contract.white_label_surcharge_pct)}
                          className={input}
                        />
                      </div>
                      <p className="min-w-[180px] flex-1 pb-1.5 text-[12px] text-slate-500">
                        {contract.white_label_enabled
                          ? `Mensalidade com white-label: ${currency.format(plan.monthly_fee * (1 + contract.white_label_surcharge_pct / 100))} (plano ${currency.format(plan.monthly_fee)} + ${formatNumber(contract.white_label_surcharge_pct) || "0"}%)`
                          : `Sem white-label — mensalidade do plano: ${currency.format(plan.monthly_fee)}`}
                      </p>
                      <SaveButton className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-100">
                        Salvar
                      </SaveButton>
                    </form>
                  )}

                  {contract && plan && (
                    <details className="group mt-3 border-t border-slate-100 pt-3">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[12px] font-medium text-slate-600 hover:text-slate-900">
                        <span>
                          Configurações do cliente
                          <span className="ml-2 font-normal text-slate-400">
                            {overrideKeys.length === 0
                              ? "seguindo o padrão do plano"
                              : `${overrideKeys.length} ${overrideKeys.length === 1 ? "item personalizado" : "itens personalizados"}`}
                          </span>
                        </span>
                        <span className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
                          <span className="group-open:hidden">Expandir</span>
                          <span className="hidden group-open:inline">Recolher</span>
                        </span>
                      </summary>

                      <p className="mb-1 mt-3 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">
                        Valendo hoje (padrão do plano, sobrescrito onde houver personalização)
                      </p>
                      <ul className="mb-3 flex flex-wrap gap-1.5">
                        {PLAN_LIMITS.map((def) => {
                          const overridden = Object.prototype.hasOwnProperty.call(overrides, def.key);
                          const planValue = (limitsByPlan.get(plan.id) ?? []).find((l) => l.limit_key === def.key)?.limit_value;
                          const value = overridden ? overrides[def.key] : planValue;
                          return (
                            <li
                              key={def.key}
                              className={`rounded-md px-2 py-0.5 text-[11px] ${
                                overridden ? "bg-violet/10 text-violet ring-1 ring-inset ring-violet/30" : "bg-slate-100 text-slate-600"
                              }`}
                              title={overridden ? `Padrão do plano: ${showValue(def, planValue)}` : undefined}
                            >
                              {def.label}: {showValue(def, value)}
                              {overridden && " (personalizado)"}
                            </li>
                          );
                        })}
                        {overrideKeys
                          .filter((k) => !PLAN_LIMIT_KEYS.has(k))
                          .map((k) => (
                            <li key={k} className="rounded-md bg-violet/10 px-2 py-0.5 text-[11px] text-violet ring-1 ring-inset ring-violet/30">
                              {k}: {String(overrides[k])} (personalizado, fora do catálogo)
                            </li>
                          ))}
                      </ul>

                      <form action={updateContractOverrides}>
                        <input type="hidden" name="contract_id" value={contract.id} />
                        <p className="mb-2 text-[11px] text-slate-400">
                          Preencha só o que este cliente tem de diferente do plano. Vazio = usa o padrão do plano; &quot;ilimitado&quot; libera sem limite.
                        </p>
                        <div key={`${plan.id}-${JSON.stringify(overrides)}`} className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                          {PLAN_LIMITS.map((def) => {
                            const planValue = (limitsByPlan.get(plan.id) ?? []).find((l) => l.limit_key === def.key)?.limit_value;
                            const ov = overrides[def.key];
                            return (
                              <div key={def.key}>
                                <label className="mb-0.5 block text-[12px] text-slate-600">
                                  {def.label} <span className="text-slate-400">({def.unit})</span>
                                </label>
                                {def.kind === "toggle" ? (
                                  <select name={`limit_${def.key}`} defaultValue={ov === undefined ? "" : String(Number(ov))} className={input}>
                                    <option value="">Padrão do plano ({showValue(def, planValue)})</option>
                                    <option value="1">Permitir (com cobrança extra)</option>
                                    <option value="0">Bloquear</option>
                                  </select>
                                ) : (
                                  <input
                                    name={`limit_${def.key}`}
                                    inputMode="decimal"
                                    defaultValue={ov === undefined ? "" : ov === null ? "ilimitado" : formatNumber(ov as number)}
                                    placeholder={`plano: ${showValue(def, planValue)}`}
                                    className={input}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <SaveButton className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
                          Salvar configurações do cliente
                        </SaveButton>
                      </form>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <nav className="mt-4 flex flex-wrap items-center justify-between gap-2" aria-label="Paginação das empresas">
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
        </section>
      </div>
    </div>
  );
}
