"use client";

import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { GroupIcon } from "@/lib/group-icons";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Building2, Sun, Moon, X, Bell, UserRound, ChevronUp } from "lucide-react";
import { BrandMark, type Brand } from "@/components/BrandMark";
import { signOut } from "@/app/login/actions";
import { toggleQuickTheme } from "./admin/actions";
import { NavLinks } from "./NavLinks";
import { switchGroup, switchTenant } from "./tenant-actions";

type Props = {
  tenantId: string;
  tenantName: string;
  companyIconUrl?: string | null;
  tenants: { id: string; name: string; iconUrl?: string | null }[];
  email: string;
  /** Nome e foto de quem está logado (a foto é opcional; sem ela aparecem as iniciais). */
  personName?: string;
  avatarUrl?: string | null;
  isPlatformAdmin: boolean;
  isAdmin?: boolean;
  hiddenScreens?: string[];
  brand: Brand;
  /** Administrador geral da plataforma: sem empresa, só a área de Administração. */
  platformMode?: boolean;
  currentTheme?: "light" | "dark";
  /** Grupos do Operador (só quando há mais de um a escolher) e o que está ativo agora. */
  groups?: { id: string; name: string; icon?: string | null; color?: string | null }[];
  activeGroupId?: string | null;
  /** Pendências em Tarefas (etapas e documentos) no momento em que a tela foi montada; o menu atualiza sozinho depois. */
  taskCount?: number;
};

// O menu recolhe e expande pelo botão do topo e a escolha fica guardada no navegador. Sem escolha, dentro
// do editor de fluxo (a tela principal, Documento 5 §2) ele já abre recolhido para dar o máximo de espaço
// ao quadro, a crítica de design apontou o quadro como o maior gargalo.
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

export function AppSidebar({
  tenantId,
  tenantName,
  companyIconUrl,
  tenants,
  email,
  personName,
  avatarUrl = null,
  isPlatformAdmin,
  isAdmin = false,
  hiddenScreens = [],
  brand,
  platformMode = false,
  currentTheme = "light",
  groups = [],
  activeGroupId = null,
  taskCount = 0,
}: Props) {
  const { collapsed: desktopCollapsed, toggle } = useCollapsed();
  // Abaixo de md o menu é uma gaveta: fechada some, aberta sempre expandida (a preferência de recolher é só do desktop).
  const [drawerOpen, setDrawerOpen] = useState(false);
  const collapsed = desktopCollapsed && !drawerOpen;
  const router = useRouter();
  const [groupOpen, setGroupOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  // menu do usuário: fecha ao clicar fora ou com Esc
  useEffect(() => {
    if (!userOpen) return;
    const onDown = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [userOpen]);
  const canPickGroup = groups.length > 1;
  const activeGroupData = groups.find((g) => g.id === activeGroupId) ?? groups[0];
  const activeGroupName = activeGroupData?.name ?? "";

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 flex h-12 items-center gap-3 border-b border-navy-700 sidebar-glass bg-navy px-3 md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={drawerOpen}
          className="flex size-10 items-center justify-center rounded-md text-slate-300 transition hover:bg-navy-700 hover:text-white"
        >
          <Menu className="size-5" />
        </button>
        <BrandMark tone="dark" compact brand={brand} />
      </header>
      {drawerOpen && <div className="fixed inset-0 z-40 bg-slate-950/60 md:hidden" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
    <aside
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) setDrawerOpen(false);
      }}
      className={`sidebar-scrollbar fixed inset-y-0 left-0 z-50 flex h-full w-[260px] shrink-0 flex-col sidebar-glass bg-navy text-slate-300 transition-transform duration-200 select-none md:static md:z-20 md:translate-x-0 md:transition-[width] md:duration-150 ${
        drawerOpen ? "translate-x-0" : "-translate-x-full"
      } ${collapsed ? "md:w-14" : "md:w-[232px]"}`}
    >
      <div className={`pb-4 pt-5 ${collapsed ? "flex flex-col items-center gap-3 px-2" : "flex items-start justify-between gap-2 px-4"}`}>
        <BrandMark tone="dark" compact={collapsed} brand={brand} />
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label="Fechar menu"
          className="flex size-10 items-center justify-center rounded-md text-slate-400 transition hover:bg-navy-700 hover:text-white md:hidden"
        >
          <X className="size-5" />
        </button>
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-expanded={!collapsed}
          className="hidden rounded-md p-1.5 text-slate-400 transition hover:bg-navy-700 hover:text-white md:block"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      {collapsed && !platformMode && (
        <div className="my-1 flex justify-center px-2">
          <div
            title={`Empresa: ${tenantName}`}
            className="flex size-9 items-center justify-center overflow-hidden rounded-lg border border-navy-700 bg-navy-800 p-1 text-slate-300 transition hover:border-navy-600"
          >
            {companyIconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={companyIconUrl} alt={tenantName} className="max-h-full max-w-full object-contain" />
            ) : (
              <Building2 className="size-4 text-slate-400" />
            )}
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="px-3">
          {platformMode ? (
            <div className="rounded-lg border border-navy-700 bg-navy-800 px-2.5 py-2">
              <div className="text-xs text-slate-500">Acesso</div>
              <div className="truncate text-[13px] font-medium text-white">Gestor da plataforma</div>
            </div>
          ) : tenants.length > 1 ? (
            <form action={switchTenant}>
              <label htmlFor="tenant" className="sr-only">
                Empresa
              </label>
              <div className="rounded-lg border border-navy-700 bg-navy-800 px-2 py-1.5" title="Empresa">
                <div className="flex items-center gap-2">
                  <div className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-navy-600 bg-navy-900/60 p-0.5">
                    {companyIconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={companyIconUrl} alt={tenantName} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <Building2 className="size-4 text-slate-400" />
                    )}
                  </div>
                  <select
                    id="tenant"
                    name="tenant_id"
                    defaultValue={tenantId}
                    onChange={(e) => e.currentTarget.form?.requestSubmit()}
                    className="w-full truncate bg-transparent text-[13px] font-medium text-white outline-none cursor-pointer"
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id} className="bg-navy-800 text-white">
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </form>
          ) : (
            <div className="rounded-lg border border-navy-700 bg-navy-800 px-2 py-1.5" title="Empresa">
              <span className="sr-only">Empresa</span>
              <div className="flex items-center gap-2">
                <div className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-navy-600 bg-navy-900/60 p-0.5">
                  {companyIconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={companyIconUrl} alt={tenantName} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <Building2 className="size-4 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white" title={tenantName}>
                  {tenantName}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {groups.length > 0 && (
        <div className={`mt-3 ${collapsed ? "flex justify-center px-2" : "px-3"}`}>
          {canPickGroup ? (
            <button
              type="button"
              onClick={() => setGroupOpen(true)}
              title={`Grupo atual: ${activeGroupName}, clique para trocar`}
              aria-label={`Grupo atual: ${activeGroupName}. Trocar grupo`}
              className={`flex items-center gap-2 rounded-lg border border-navy-700 bg-navy-800 text-left transition hover:border-navy-600 ${
                collapsed ? "size-9 justify-center" : "w-full px-2.5 py-2"
              }`}
            >
              <GroupIcon icon={activeGroupData?.icon} color={activeGroupData?.color} className="size-6" iconClassName="size-3.5" />
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-slate-400">Atuando no grupo</span>
                  <span className="block truncate text-[13px] font-medium text-white">{activeGroupName}</span>
                </span>
              )}
            </button>
          ) : (
            // Um grupo só: sempre visível, mas não é botão, quem tem um único grupo não troca.
            <div
              title={`Seu grupo: ${activeGroupName}`}
              className={`flex items-center gap-2 rounded-lg border border-navy-700 bg-navy-800 ${
                collapsed ? "size-9 justify-center" : "w-full px-2.5 py-2"
              }`}
            >
              <GroupIcon icon={activeGroupData?.icon} color={activeGroupData?.color} className="size-6" iconClassName="size-3.5" />
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-slate-400">Seu grupo</span>
                  <span className="block truncate text-[13px] font-medium text-white">{activeGroupName}</span>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <nav className={`sidebar-scrollbar mt-4 flex-1 overflow-y-auto overflow-x-hidden ${collapsed ? "px-2" : "px-3"}`} aria-label="Principal">
        <NavLinks collapsed={collapsed} isPlatformAdmin={isPlatformAdmin} isAdmin={isAdmin} platformOnly={platformMode} hiddenScreens={hiddenScreens} taskCount={taskCount} />
      </nav>

      <div data-sidebar-footer className={`shrink-0 border-t border-navy-700 bg-navy py-3 space-y-1 ${collapsed ? "px-2" : "px-3"}`}>
        {/* Alternador Rápido de Tema (Claro / Escuro) */}
        <form action={toggleQuickTheme.bind(null, currentTheme, tenantId)}>
          <button
            type="submit"
            title={currentTheme === "dark" ? "Mudar para Modo Claro" : "Mudar para Modo Escuro"}
            aria-label={currentTheme === "dark" ? "Mudar para Modo Claro" : "Mudar para Modo Escuro"}
            className={`flex items-center gap-2 rounded-md py-1.5 text-[12px] font-medium text-slate-300 transition hover:bg-navy-700 hover:text-white ${
              collapsed ? "w-full justify-center px-0" : "w-full px-2"
            }`}
          >
            {currentTheme === "dark" ? (
              <Sun className="size-4 shrink-0 text-amber-400" />
            ) : (
              <Moon className="size-4 shrink-0 text-cyan" />
            )}
            {!collapsed && (currentTheme === "dark" ? "Modo Claro" : "Modo Escuro")}
          </button>
        </form>

        <div ref={userMenuRef} className="relative">
          {userOpen && (
            <div
              role="menu"
              aria-label="Menu do usuário"
              className="absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-navy p-1 shadow-xl backdrop-blur-xl"
              style={{ backgroundColor: "rgba(11, 27, 58, 0.96)" }}
            >
              <Link
                href="/perfil"
                role="menuitem"
                onClick={() => setUserOpen(false)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-slate-200 transition hover:bg-white/10 hover:text-white"
              >
                <UserRound className="size-4 shrink-0" /> Meu perfil
              </Link>
              <Link
                href="/notificacoes"
                role="menuitem"
                onClick={() => setUserOpen(false)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-slate-200 transition hover:bg-white/10 hover:text-white"
              >
                <Bell className="size-4 shrink-0" /> Minhas notificações
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  role="menuitem"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-slate-200 transition hover:bg-white/10 hover:text-white"
                >
                  <LogOut className="size-4 shrink-0" /> Sair
                </button>
              </form>
            </div>
          )}
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={userOpen}
            title={email}
            onClick={() => setUserOpen((v) => !v)}
            className={`flex w-full cursor-pointer items-center gap-2 rounded-md py-1.5 text-xs text-slate-300 transition hover:bg-navy-700 hover:text-white ${collapsed ? "justify-center px-0" : "px-2"}`}
          >
            <Avatar name={personName || email} url={avatarUrl} className="size-6" />
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate text-left">{email}</span>
                <ChevronUp className={`size-3.5 shrink-0 transition ${userOpen ? "" : "rotate-180"}`} aria-hidden />
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
      {groupOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setGroupOpen(false)}>
          <form
            action={async (fd) => {
              await switchGroup(fd);
              setGroupOpen(false);
              router.refresh();
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-dialog-title"
            className="w-full max-w-sm rounded-xl bg-white p-5 text-slate-800 shadow-xl"
          >
            <h2 id="group-dialog-title" className="text-[15px] font-semibold text-slate-900">
              Em qual grupo você vai atuar agora?
            </h2>
            <p className="mt-1 text-[12px] text-slate-500">
              Cada grupo tem telas e ações próprias. Você atua em um por vez e pode trocar quando quiser.
            </p>
            <label htmlFor="group_id" className="mt-4 block text-[12px] font-medium text-slate-600">
              Grupo
            </label>
            <select
              id="group_id"
              name="group_id"
              defaultValue={activeGroupId ?? groups[0]?.id}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGroupOpen(false)}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button className="rounded-lg bg-brand px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600">Atuar neste grupo</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
