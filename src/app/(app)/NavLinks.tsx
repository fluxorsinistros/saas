"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, CheckSquare, FileWarning, Gauge, LayoutDashboard, ShieldCheck, UploadCloud, UsersRound, Users, Workflow } from "lucide-react";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/torre-de-controle", label: "Torre de Controle", icon: Gauge },
  { href: "/fluxos", label: "Fluxos", icon: Workflow },
  { href: "/sinistros", label: "Sinistros", icon: FileWarning },
  { href: "/importacao", label: "Importação", icon: UploadCloud },
  { href: "/tarefas", label: "Tarefas", icon: CheckSquare },
  { href: "/usuarios", label: "Usuários", icon: UsersRound },
  { href: "/grupos", label: "Grupos", icon: Users },
  { href: "/calendarios", label: "Calendários", icon: CalendarClock },
];

const ADMIN_LINK = { href: "/admin", label: "Administração", icon: ShieldCheck };
// Menu do administrador geral da plataforma (sem empresa). Contas, Planos e Marca são abas de Administração.
const PLATFORM_LINKS = [
  { href: "/admin", label: "Administração", icon: ShieldCheck },
  { href: "/admin/usuarios", label: "Usuários", icon: UsersRound },
];

export function NavLinks({
  collapsed = false,
  isPlatformAdmin = false,
  platformOnly = false,
  hiddenScreens = [],
}: {
  collapsed?: boolean;
  isPlatformAdmin?: boolean;
  platformOnly?: boolean;
  // Chaves de groups.hidden_screens do grupo da pessoa — Administração nunca entra aqui, é
  // exclusiva de platform admin e não depende de grupo nenhum.
  hiddenScreens?: string[];
}) {
  const pathname = usePathname();
  const base = platformOnly ? PLATFORM_LINKS : isPlatformAdmin ? [...LINKS, ADMIN_LINK] : LINKS;
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
              } ${active ? "bg-brand text-white shadow-sm" : "text-slate-300 hover:bg-navy-700 hover:text-white"}`}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
