import { getTenantContext } from "@/lib/tenant";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { AppSidebar } from "./AppSidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [ctx, admin] = await Promise.all([getTenantContext(), isPlatformAdmin()]);

  return (
    <div className="flex h-full">
      <AppSidebar
        tenantId={ctx.tenantId}
        tenantName={ctx.tenantName}
        tenants={ctx.tenants}
        email={ctx.email}
        isPlatformAdmin={admin}
      />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
