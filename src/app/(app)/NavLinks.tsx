"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, FileWarning, Gauge, LayoutDashboard, ShieldCheck, UsersRound, Users, Workflow } from "lucide-react";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/torre-de-controle", label: "Torre de Controle", icon: Gauge },
  { href: "/fluxos", label: "Fluxos", icon: Workflow },
  { href: "/sinistros", label: "Sinistros", icon: FileWarning },
  { href: "/tarefas", label: "Tarefas", icon: CheckSquare },
  { href: "/usuarios", label: "Usuários", icon: UsersRound },
  { href: "/grupos", label: "Grupos", icon: Users },
];

const ADMIN_LINK = { href: "/admin", label: "Administração", icon: ShieldCheck };

export function NavLinks({ collapsed = false, isPlatformAdmin = false }: { collapsed?: boolean; isPlatformAdmin?: boolean }) {
  const pathname = usePathname();
  const links = isPlatformAdmin ? [...LINKS, ADMIN_LINK] : LINKS;
  return (
    <ul className="space-y-0.5">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
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
