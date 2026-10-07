"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getTaskCount } from "./tarefas/actions";
import { CheckSquare, FileWarning, Gauge, LayoutDashboard, ShieldCheck, UploadCloud, UsersRound, Users, Workflow } from "lucide-react";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/torre-de-controle", label: "Torre de Controle", icon: Gauge },
  { href: "/fluxos", label: "Fluxos", icon: Workflow },
  { href: "/sinistros", label: "Sinistros", icon: FileWarning },
  { href: "/importacao", label: "Importação", icon: UploadCloud },
  { href: "/tarefas", label: "Tarefas", icon: CheckSquare },
  { href: "/usuarios", label: "Usuários", icon: UsersRound },
  { href: "/grupos", label: "Grupos", icon: Users },
];

const ADMIN_LINK = { href: "/admin", label: "Administração", icon: ShieldCheck };
// Menu do administrador geral da plataforma (sem empresa). Contas, Planos e Marca são abas de Administração.
const PLATFORM_LINKS = [
  { href: "/admin", label: "Administração", icon: ShieldCheck },
  { href: "/admin/usuarios", label: "Usuários", icon: UsersRound },
];

export function NavLinks({
  collapsed = false,
  isAdmin = false,
  isPlatformAdmin = false,
  platformOnly = false,
  hiddenScreens = [],
  taskCount = 0,
}: {
  collapsed?: boolean;
  isAdmin?: boolean;
  isPlatformAdmin?: boolean;
  platformOnly?: boolean;
  // Chaves de groups.hidden_screens do grupo da pessoa, Administração nunca entra aqui, é
  // exclusiva de administradores e não depende de grupo nenhum.
  hiddenScreens?: string[];
  // Pendências de Tarefas na montagem; depois o número é pedido de novo a cada mudança de tela e a cada minuto.
  taskCount?: number;
}) {
  const pathname = usePathname();
  const [count, setCount] = useState(taskCount);
  useEffect(() => {
    if (platformOnly) return;
    let alive = true;
    const refresh = () => {
      getTaskCount().then((n) => {
        if (alive) setCount(n);
      });
    };
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pathname, platformOnly]);
  const showAdmin = isPlatformAdmin || isAdmin;
  const base = platformOnly ? PLATFORM_LINKS : showAdmin ? [...LINKS, ADMIN_LINK] : LINKS;
  const links = base.filter((l) => l === ADMIN_LINK || !hiddenScreens.includes(l.href.slice(1)));
  return (
    <ul className="space-y-0.5">
      {links.map(({ href, label, icon: Icon }) => {
        // "/admin" só fica ativo nele mesmo, para não acender junto com "/admin/usuarios"
        const active = href === "/admin" ? pathname.startsWith("/admin") && !pathname.startsWith("/admin/usuarios") : pathname.startsWith(href);
        return (
          <li key={href}>
            <Link
              href={href}
              title={collapsed ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-lg py-2 text-[13px] font-medium transition ${
                collapsed ? "justify-center px-0" : "px-2.5"
              } ${active ? "sidebar-active text-white" : "text-slate-300 hover:bg-navy-700 hover:text-white"}`}
            >
              <span className="relative inline-flex">
                <Icon className="size-4 shrink-0" />
                {collapsed && href === "/tarefas" && count > 0 && (
                  <span aria-hidden className="absolute -right-1.5 -top-1.5 size-2.5 rounded-full bg-rose-500 ring-2 ring-[#12306a]" />
                )}
              </span>
              {!collapsed && label}
              {!collapsed && href === "/tarefas" && count > 0 && (
                <span
                  className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold leading-5 text-white"
                  aria-label={`${count} pendências`}
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
