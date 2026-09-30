import type { Metadata } from "next";
import Link from "next/link";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes } from "@/lib/permissions";
import { UsuariosTab, type SearchParams } from "./usuarios-tab";
import { OrganizacoesTab } from "./organizacoes-tab";

export const metadata: Metadata = { title: "Usuários" };

const TABS = [
  { key: "usuarios", label: "Usuários" },
  { key: "organizacoes", label: "Organizações" },
] as const;

// Mesmo modelo da tela de Usuários do Gestor: pesquisar → lista → editar. O que muda é o nível de acesso
// (aqui só a própria empresa, sem Gestores).
export default async function UsuariosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getTenantContext();
  const perms = await getPermissionCodes(ctx.userId, ctx.tenantId);
  const canManage = perms.has("user.manage");
  const sp = await searchParams;
  const raw = Array.isArray(sp.aba) ? sp.aba[0] : sp.aba;
  const aba = TABS.find((t) => t.key === raw)?.key ?? "usuarios";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Usuários</h1>
        <p className="mt-1 max-w-xl text-[14px] text-slate-500">
          Quem participa da {ctx.tenantName}: pesquise, exporte a lista e clique no lápis para editar o acesso de cada pessoa.
        </p>

        <nav className="mt-5 flex flex-wrap gap-1 border-b border-slate-200" aria-label="Abas de usuários">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "usuarios" ? "/usuarios" : `/usuarios?aba=${t.key}`}
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
          {aba === "usuarios" && <UsuariosTab sp={sp} tenantId={ctx.tenantId} userId={ctx.userId} canManage={canManage} />}
          {aba === "organizacoes" && <OrganizacoesTab tenantId={ctx.tenantId} canManage={canManage} />}
        </div>
      </div>
    </div>
  );
}
