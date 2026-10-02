"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
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
  isAdmin?: boolean;
  hiddenScreens?: string[];
  brand: Brand;
  /** Administrador geral da plataforma: sem empresa, só a área de Administração. */
  platformMode?: boolean;
};

// O menu recolhe e expande pelo botão do topo e a escolha fica guardada no navegador. Sem escolha, dentro
// do editor de fluxo (a tela principal, Documento 5 §2) ele já abre recolhido para dar o máximo de espaço
// ao quadro — a crítica de design apontou o quadro como o maior gargalo.
type Pref = "collapsed" | "expanded" | null;
const PREF_KEY = "sidebar";
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
function readPref(): Pref {
  try {
    const v = window.localStorage.getItem(PREF_KEY);
    return v === "collapsed" || v === "expanded" ? v : null;
  } catch {
    return null; // navegação anônima ou armazenamento bloqueado: segue sem memória
  }
}
function writePref(v: Exclude<Pref, null>) {
  try {
    window.localStorage.setItem(PREF_KEY, v);
  } catch {}
  listeners.forEach((l) => l());
}

function useCollapsed() {
  const pathname = usePathname();
  const pref = useSyncExternalStore(subscribe, readPref, () => null);
  const collapsed = pref ? pref === "collapsed" : /^\/fluxos\/[^/]+/.test(pathname);
  return { collapsed, toggle: () => writePref(collapsed ? "expanded" : "collapsed") };
}

export function AppSidebar({ tenantId, tenantName, tenants, email, isPlatformAdmin, isAdmin = false, hiddenScreens = [], brand, platformMode = false }: Props) {
  const { collapsed, toggle } = useCollapsed();

  return (
    <aside
      className={`flex shrink-0 flex-col bg-navy text-slate-300 transition-[width] duration-150 ${
        collapsed ? "w-14" : "w-[232px]"
      }`}
    >
      <div className={`pb-4 pt-5 ${collapsed ? "flex flex-col items-center gap-3 px-2" : "flex items-start justify-between gap-2 px-4"}`}>
        <BrandMark tone="dark" compact={collapsed} brand={brand} />
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-expanded={!collapsed}
          className="rounded-md p-1.5 text-slate-400 transition hover:bg-navy-700 hover:text-white"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="px-3">
          {platformMode ? (
            <div className="rounded-lg border border-navy-700 bg-navy-800 px-2.5 py-2">
              <div className="text-[11px] text-slate-500">Acesso</div>
              <div className="truncate text-[13px] font-medium text-white">Gestor da plataforma</div>
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
        <NavLinks collapsed={collapsed} isPlatformAdmin={isPlatformAdmin} isAdmin={isAdmin} platformOnly={platformMode} hiddenScreens={hiddenScreens} />
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
