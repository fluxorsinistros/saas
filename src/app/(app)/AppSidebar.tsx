"use client";

import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { BrandMark, type Brand } from "@/components/BrandMark";
import { signOut } from "@/app/login/actions";
import { NavLinks } from "./NavLinks";
import { switchTenant } from "./tenant-actions";

type Props = {
  tenantId: string;
  tenantName: string;
  tenants: { id: string; name: string }[];
  email: string;
  isPlatformAdmin: boolean;
  brand: Brand;
  /** Administrador geral da plataforma: sem empresa, só a área de Administração. */
  platformMode?: boolean;
};

// Dentro do editor de fluxo (a tela principal, Documento 5 §2), o menu recolhe para dar
// o máximo de espaço ao quadro — a crítica de design apontou o quadro como o maior gargalo.
function useCollapsed() {
  const pathname = usePathname();
  return /^\/fluxos\/[^/]+/.test(pathname);
}

export function AppSidebar({ tenantId, tenantName, tenants, email, isPlatformAdmin, brand, platformMode = false }: Props) {
  const collapsed = useCollapsed();

  return (
    <aside
      className={`flex shrink-0 flex-col bg-navy text-slate-300 transition-[width] duration-150 ${
        collapsed ? "w-14" : "w-[232px]"
      }`}
    >
      <div className={`pb-4 pt-5 ${collapsed ? "px-2" : "px-4"}`}>
        <BrandMark tone="dark" compact={collapsed} brand={brand} />
      </div>

      {!collapsed && (
        <div className="px-3">
          {platformMode ? (
            <div className="rounded-lg border border-navy-700 bg-navy-800 px-2.5 py-2">
              <div className="text-[11px] text-slate-500">Acesso</div>
              <div className="truncate text-[13px] font-medium text-white">Administrador da plataforma</div>
            </div>
          ) : tenants.length > 1 ? (
            <form action={switchTenant}>
              <label htmlFor="tenant" className="sr-only">
                Empresa
              </label>
              <select
                id="tenant"
                name="tenant_id"
                defaultValue={tenantId}
                className="w-full rounded-lg border border-navy-700 bg-navy-800 px-2.5 py-1.5 text-[13px] text-white"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button className="mt-1 w-full text-left text-[11px] text-slate-400 hover:text-white">Trocar empresa</button>
            </form>
          ) : (
            <div className="rounded-lg border border-navy-700 bg-navy-800 px-2.5 py-2">
              <div className="text-[11px] text-slate-500">Empresa</div>
              <div className="truncate text-[13px] font-medium text-white">{tenantName}</div>
            </div>
          )}
        </div>
      )}

      <nav className={`mt-5 flex-1 ${collapsed ? "px-2" : "px-3"}`} aria-label="Principal">
        <NavLinks collapsed={collapsed} isPlatformAdmin={isPlatformAdmin} platformOnly={platformMode} />
      </nav>

      <div className={`border-t border-navy-700 py-3 ${collapsed ? "px-2" : "px-3"}`}>
        {!collapsed && (
          <div className="truncate px-2 text-[12px] text-slate-400" title={email}>
            {email}
          </div>
        )}
        <form action={signOut}>
          <button
            title="Sair"
            className={`mt-1 flex items-center gap-2 rounded-md py-1.5 text-[13px] text-slate-300 transition hover:bg-navy-700 hover:text-white ${
              collapsed ? "w-full justify-center px-0" : "w-full px-2"
            }`}
          >
            <LogOut className="size-4 shrink-0" />
            {!collapsed && "Sair"}
          </button>
        </form>
      </div>
    </aside>
  );
}
