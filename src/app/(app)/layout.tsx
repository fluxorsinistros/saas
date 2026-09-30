import { getTenantContext } from "@/lib/tenant";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { getPlatformBrand } from "@/lib/branding";
import { AppSidebar } from "./AppSidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [ctx, admin, brand] = await Promise.all([getTenantContext(), isPlatformAdmin(), getPlatformBrand()]);

  return (
    <div className="flex h-full">
      <AppSidebar
        tenantId={ctx.tenantId}
        tenantName={ctx.tenantName}
        tenants={ctx.tenants}
        email={ctx.email}
        isPlatformAdmin={admin}
        brand={brand}
      />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
