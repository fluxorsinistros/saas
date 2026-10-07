import Link from "next/link";
import { Palette, Clock, Building2, CircleDollarSign, Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TenantMarcaTab } from "./tenant-marca-tab";
import { TenantSlaTab } from "./tenant-sla-tab";
import { TenantEmpresaTab } from "./tenant-empresa-tab";
import { TenantFinanceiroTab } from "./tenant-financeiro-tab";
import { TenantNotificacoesTab } from "./tenant-notificacoes-tab";

type SearchParams = { aba?: string | string[] };

const TABS = [
  { key: "marca", label: "Marca e White-label", icon: Palette },
  { key: "sla", label: "SLA e Horários", icon: Clock },
  { key: "financeiro", label: "Painel financeiro", icon: CircleDollarSign },
  { key: "notificacoes", label: "Notificações", icon: Bell },
  { key: "empresa", label: "Empresa", icon: Building2 },
] as const;

export async function TenantAdminView({
  tenantId,
  tenantName,
  searchParams,
}: {
  tenantId: string;
  tenantName: string;
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.aba) ? sp.aba[0] : sp.aba;
  const currentTab = TABS.find((t) => t.key === raw)?.key ?? "marca";

  const supabase = await createClient();

  const [
    { data: tenant },
    { data: contract },
    { data: calendars },
    { count: membersCount },
    { data: workflowsList },
  ] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, name, slug, operating_model, settings, created_at, status")
      .eq("id", tenantId)
      .single(),
    supabase
      .from("tenant_contracts")
      .select("id, white_label_enabled, status, started_at, plans(name)")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("sla_calendars")
      .select("id, name, business_days, business_start, business_end, timezone")
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase
      .from("tenant_memberships")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
    supabase.from("workflows").select("id, name, financial_panel").eq("tenant_id", tenantId).eq("status", "active").order("name"),
  ]);
  const [{ data: notifRules }, { data: notifGroups }] =
    currentTab === "notificacoes"
      ? await Promise.all([
          supabase.from("notification_rules").select("*").eq("tenant_id", tenantId),
          supabase.from("groups").select("id, name").eq("tenant_id", tenantId).eq("status", "active").order("name"),
        ])
      : [{ data: null }, { data: null }];

  const settings = ((tenant?.settings ?? {}) as Record<string, unknown>) ?? {};
  const branding = (settings.branding ?? {}) as {
    name?: string;
    tagline?: string;
    primary_color?: string | null;
    primary_color_dark?: string | null;
    logo_path?: string | null;
  };
  const logoUrl = branding.logo_path
    ? supabase.storage.from("branding").getPublicUrl(branding.logo_path).data.publicUrl
    : null;

  const companyIconUrl =
    (settings.company_icon_url as string | null) ??
    (settings.company_icon_path
      ? supabase.storage.from("branding").getPublicUrl(settings.company_icon_path as string).data.publicUrl
      : branding.logo_path
        ? supabase.storage.from("branding").getPublicUrl(branding.logo_path).data.publicUrl
        : null);

  const slaSettings = (settings.sla ?? {}) as {
    default_calendar_id?: string | null;
    warning_threshold_pct?: number;
    critical_threshold_pct?: number;
  };

  const whiteLabelEnabled = !!contract?.white_label_enabled;

  const planName = (contract?.plans as unknown as { name?: string } | null)?.name;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-wide px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
              Administração da Empresa
            </h1>
            <p className="mt-1 text-[14px] text-slate-500">
              Gerencie a marca e identidade visual (white-label), parâmetros de SLA e informações gerais de{" "}
              <strong className="font-semibold text-slate-800">{tenantName}</strong>.
            </p>
          </div>
          {whiteLabelEnabled && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-[12px] font-medium text-purple-700">
              <span className="size-2 rounded-full bg-purple-600" />
              White-label Ativo
            </span>
          )}
        </div>

        {/* Abas */}
        <nav className="mt-6 flex flex-wrap gap-1 border-b border-slate-200" aria-label="Abas da administração da empresa">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.key === currentTab;
            return (
              <Link
                key={t.key}
                href={t.key === "marca" ? "/admin" : `/admin?aba=${t.key}`}
                aria-current={active ? "page" : undefined}
                className={`-mb-px flex items-center gap-2 rounded-t-lg border px-4 py-2.5 text-[13px] font-medium transition ${
                  active
                    ? "border-slate-200 border-b-white bg-white text-brand shadow-[0_-1px_2px_rgba(0,0,0,0.03)]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon className={`size-4 ${active ? "text-brand" : "text-slate-500"}`} />
                {t.label}
              </Link>
            );
          })}
        </nav>

        {/* Conteúdo da Aba */}
        <div className="pt-6">
          {currentTab === "marca" && (
            <TenantMarcaTab
              tenantId={tenantId}
              whiteLabelEnabled={whiteLabelEnabled}
              initialBrand={{
                name: branding.name,
                tagline: branding.tagline,
                color: branding.primary_color,
                colorDark: branding.primary_color_dark,
                logoUrl,
              }}
            />
          )}

          {currentTab === "sla" && (
            <TenantSlaTab
              tenantId={tenantId}
              calendars={calendars ?? []}
              currentSlaSettings={slaSettings}
            />
          )}

          {currentTab === "financeiro" && <TenantFinanceiroTab workflows={workflowsList ?? []} />}

          {currentTab === "notificacoes" && <TenantNotificacoesTab tenantId={tenantId} rules={notifRules ?? []} groups={notifGroups ?? []} />}

          {currentTab === "empresa" && tenant && (
            <TenantEmpresaTab
              tenant={tenant}
              contract={{
                plan_name: planName,
                white_label_enabled: whiteLabelEnabled,
                status: contract?.status ?? "active",
                started_at: contract?.started_at ?? tenant.created_at,
              }}
              membersCount={membersCount ?? 0}
              companyIconUrl={companyIconUrl}
            />
          )}
        </div>
      </div>
    </div>
  );
}
