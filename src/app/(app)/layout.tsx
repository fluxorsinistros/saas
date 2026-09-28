import { LogOut } from "lucide-react";
import { getTenantContext } from "@/lib/tenant";
import { signOut } from "@/app/login/actions";
import { BrandMark } from "@/components/BrandMark";
import { NavLinks } from "./NavLinks";
import { switchTenant } from "./tenant-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTenantContext();

  return (
    <div className="flex h-full">
      <aside className="flex w-[232px] shrink-0 flex-col bg-navy text-slate-300">
        <div className="px-4 pb-4 pt-5">
          <BrandMark tone="dark" />
        </div>

        <div className="px-3">
          {ctx.tenants.length > 1 ? (
            <form action={switchTenant}>
              <label htmlFor="tenant" className="sr-only">
                Empresa
              </label>
              <select
                id="tenant"
                name="tenant_id"
                defaultValue={ctx.tenantId}
                className="w-full rounded-lg border border-navy-700 bg-navy-800 px-2.5 py-1.5 text-[13px] text-white"
              >
                {ctx.tenants.map((t) => (
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
              <div className="truncate text-[13px] font-medium text-white">{ctx.tenantName}</div>
            </div>
          )}
        </div>

        <nav className="mt-5 flex-1 px-3" aria-label="Principal">
          <NavLinks />
        </nav>

        <div className="border-t border-navy-700 px-3 py-3">
          <div className="truncate px-2 text-[12px] text-slate-400" title={ctx.email}>
            {ctx.email}
          </div>
          <form action={signOut}>
            <button className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-slate-300 transition hover:bg-navy-700 hover:text-white">
              <LogOut className="size-4" /> Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
