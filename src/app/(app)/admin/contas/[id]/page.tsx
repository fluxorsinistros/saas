import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { TENANT_STATUS_LABEL } from "../../shared";
import { TabDados } from "./tab-dados";
import { TabPlano } from "./tab-plano";
import { TabLimites } from "./tab-limites";
import { TabUsuarios } from "./tab-usuarios";
import { TabMarca } from "./tab-marca";
import { TabHistorico } from "./tab-historico";

export const metadata: Metadata = { title: "Conta" };

const UUID = /^[0-9a-f-]{36}$/i;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AccountPage({ params, searchParams }: Props) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const abaParam = Array.isArray(sp.aba) ? sp.aba[0] : sp.aba;

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, status, suspended_at, suspension_reason, settings, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!tenant) notFound();

  const [{ data: contract }, { data: plans }] = await Promise.all([
    supabase
      .from("tenant_contracts")
      .select("id, plan_id, overrides, status, white_label_enabled, white_label_surcharge_pct")
      .eq("tenant_id", id)
      .maybeSingle(),
    supabase.from("plans").select("id, code, name, setup_fee, monthly_fee, claim_price").order("claim_price"),
  ]);
  const plan = contract ? (plans ?? []).find((p) => p.id === contract.plan_id) : undefined;

  // A aba Marca só existe quando o white-label foi liberado para a conta
  const tabs = [
    { key: "dados", label: "Dados da conta" },
    { key: "plano", label: "Plano e cobrança" },
    { key: "limites", label: "Limites" },
    { key: "usuarios", label: "Usuários" },
    ...(contract?.white_label_enabled ? [{ key: "marca", label: "Marca" }] : []),
    { key: "historico", label: "Histórico" },
  ];
  const aba = tabs.some((t) => t.key === abaParam) ? (abaParam as string) : "dados";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-8">
        <Link href="/admin" className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-3.5" /> Administração · Contas
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{tenant.name}</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
              tenant.status === "active" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-rose-50 text-rose-700 ring-rose-200"
            }`}
          >
            {TENANT_STATUS_LABEL[tenant.status] ?? tenant.status}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {plan ? plan.name : "Sem contrato"}
          </span>
        </div>

        <nav className="mt-5 flex flex-wrap gap-1 border-b border-slate-200" aria-label="Abas da conta">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/admin/contas/${id}?aba=${t.key}`}
              aria-current={t.key === aba ? "page" : undefined}
              className={`-mb-px rounded-t-lg border px-3.5 py-2 text-[13px] font-medium transition ${
                t.key === aba
                  ? "border-slate-200 border-b-slate-50 bg-slate-50 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <div className="pt-6">
          {aba === "dados" && <TabDados tenant={tenant} />}
          {aba === "plano" && <TabPlano tenantId={id} plans={plans ?? []} contract={contract} plan={plan} />}
          {aba === "limites" && <TabLimites contract={contract} plan={plan} />}
          {aba === "usuarios" && <TabUsuarios tenantId={id} tenantName={tenant.name} />}
          {aba === "marca" && contract?.white_label_enabled && <TabMarca tenantId={id} settings={tenant.settings} />}
          {aba === "historico" && <TabHistorico tenantId={id} />}
        </div>
      </div>
    </div>
  );
}
