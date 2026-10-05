import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { isTenantAdmin } from "@/lib/permissions";
import { getTenantContext } from "@/lib/tenant";
import { ContasTab, type SearchParams } from "./contas-tab";
import { PlanosTab } from "./planos-tab";
import { MarcaTab } from "./marca-tab";
import { TenantAdminView } from "./tenant-admin-view";

export const metadata: Metadata = { title: "Administração" };

const PLATFORM_TABS = [
  { key: "contas", label: "Contas" },
  { key: "planos", label: "Planos" },
  { key: "marca", label: "Marca do produto" },
] as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const isPlatform = await isPlatformAdmin();

  if (!isPlatform) {
    const ctx = await getTenantContext();
    const isCompanyAdmin = await isTenantAdmin(ctx.userId, ctx.tenantId);
    if (!isCompanyAdmin) {
      redirect("/dashboard");
    }
    return (
      <TenantAdminView
        tenantId={ctx.tenantId}
        tenantName={ctx.tenantName}
        searchParams={searchParams}
      />
    );
  }

  const sp = await searchParams;
  const raw = Array.isArray(sp.aba) ? sp.aba[0] : sp.aba;
  const aba = PLATFORM_TABS.find((t) => t.key === raw)?.key ?? "contas";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-wide px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Administração</h1>
        <p className="mt-1 max-w-xl text-[14px] text-slate-600">
          Contas dos clientes, planos e a marca do produto. Os usuários de todas as contas ficam no menu Usuários.
        </p>

        <nav className="mt-5 flex flex-wrap gap-1 border-b border-slate-200" aria-label="Abas da administração">
          {PLATFORM_TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "contas" ? "/admin" : `/admin?aba=${t.key}`}
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
          {aba === "contas" && <ContasTab sp={sp} />}
          {aba === "planos" && <PlanosTab />}
          {aba === "marca" && <MarcaTab />}
        </div>
      </div>
    </div>
  );
}
