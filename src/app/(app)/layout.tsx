import { cookies } from "next/headers";
import { getTenantContext } from "@/lib/tenant";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { isTenantAdmin } from "@/lib/permissions";
import { darkenHex, ensureWhiteContrast, getPlatformBrand, getTenantBrand } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { getHiddenScreensForMember } from "@/lib/screens";
import { AppSidebar } from "./AppSidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [admin, brand] = await Promise.all([isPlatformAdmin(), getPlatformBrand()]);

  // Gestor da plataforma: sem empresa, só a Administração global.
  if (admin) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const cookieStore = await cookies();
    const theme = (cookieStore.get("app_theme")?.value as "light" | "dark") || "light";
    return (
      <div className={`flex h-screen h-[100dvh] w-full overflow-hidden ${theme === "dark" ? "dark" : ""}`} data-theme={theme}>
        <AppSidebar
          platformMode
          tenantId=""
          tenantName=""
          tenants={[]}
          email={user?.email ?? ""}
          isPlatformAdmin
          isAdmin
          brand={brand}
          currentTheme={theme}
        />
        <main className="min-w-0 flex-1 h-full overflow-hidden pt-12 md:pt-0">{children}</main>
      </div>
    );
  }

  const ctx = await getTenantContext();
  const [own, hiddenScreens, tenantAdmin] = await Promise.all([
    getTenantBrand(ctx.tenantId),
    getHiddenScreensForMember(ctx.userId, ctx.tenantId),
    isTenantAdmin(ctx.userId, ctx.tenantId),
  ]);
  const themeVars = own?.color
    ? ({ "--color-brand": ensureWhiteContrast(own.color), "--color-brand-600": darkenHex(ensureWhiteContrast(own.color)) } as React.CSSProperties)
    : undefined;

  return (
    <div className={`flex h-screen h-[100dvh] w-full overflow-hidden ${ctx.theme === "dark" ? "dark" : ""}`} data-theme={ctx.theme} style={themeVars}>
      <AppSidebar
        tenantId={ctx.tenantId}
        tenantName={ctx.tenantName}
        companyIconUrl={ctx.companyIconUrl}
        tenants={ctx.tenants}
        email={ctx.email}
        isPlatformAdmin={false}
        isAdmin={tenantAdmin}
        hiddenScreens={hiddenScreens}
        brand={own?.brand ?? brand}
        currentTheme={ctx.theme}
      />
      <main className="min-w-0 flex-1 h-full overflow-hidden pt-12 md:pt-0">{children}</main>
    </div>
  );
}
