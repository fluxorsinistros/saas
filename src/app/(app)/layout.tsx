import { getTenantContext } from "@/lib/tenant";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { getPlatformBrand } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "./AppSidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [admin, brand] = await Promise.all([isPlatformAdmin(), getPlatformBrand()]);

  // Administrador de plataforma: sem empresa, só a Administração global.
  if (admin) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return (
      <div className="flex h-full">
        <AppSidebar
          platformMode
          tenantId=""
          tenantName=""
          tenants={[]}
          email={user?.email ?? ""}
          isPlatformAdmin
          brand={brand}
        />
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    );
  }

  const ctx = await getTenantContext();
  return (
    <div className="flex h-full">
      <AppSidebar
        tenantId={ctx.tenantId}
        tenantName={ctx.tenantName}
        tenants={ctx.tenants}
        email={ctx.email}
        isPlatformAdmin={false}
        brand={brand}
      />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
