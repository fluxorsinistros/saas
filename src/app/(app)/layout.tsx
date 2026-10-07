import { cookies } from "next/headers";
import { getTenantContext } from "@/lib/tenant";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { isTenantAdmin } from "@/lib/permissions";
import { darkenHex, ensureWhiteContrast, getPlatformBrand, getTenantBrand } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { getHiddenScreensForMember } from "@/lib/screens";
import { getMemberGroups } from "@/lib/active-group";
import { signedAvatarUrls } from "@/lib/avatars";
import { loadTaskCount } from "@/lib/task-count";
import { AppSidebar } from "./AppSidebar";
import { AppBackdrop } from "@/components/AppBackdrop";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [admin, brand] = await Promise.all([isPlatformAdmin(), getPlatformBrand()]);

  // Gestor da plataforma: sem empresa, só a Administração global.
  if (admin) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: me } = user ? await supabase.from("user_profiles").select("full_name, avatar_path").eq("id", user.id).maybeSingle() : { data: null };
    const myUrls = await signedAvatarUrls([me?.avatar_path]);
    const cookieStore = await cookies();
    const theme = (cookieStore.get("app_theme")?.value as "light" | "dark") || "light";
    return (
      <div className={`flex h-screen h-[100dvh] w-full overflow-hidden ${theme === "dark" ? "dark" : ""}`} data-theme={theme}>
        <AppBackdrop />
        <AppSidebar
          platformMode
          tenantId=""
          tenantName=""
          tenants={[]}
          email={user?.email ?? ""}
          isPlatformAdmin
          personName={me?.full_name || user?.email || ""}
          avatarUrl={me?.avatar_path ? (myUrls.get(me.avatar_path) ?? null) : null}
          isAdmin
          brand={brand}
          currentTheme={theme}
        />
        <main className="app-content-bg min-w-0 flex-1 h-full overflow-hidden pt-12 md:pt-0">{children}</main>
      </div>
    );
  }

  const ctx = await getTenantContext();
  const [own, hiddenScreens, tenantAdmin, memberGroups] = await Promise.all([
    getTenantBrand(ctx.tenantId),
    getHiddenScreensForMember(ctx.userId, ctx.tenantId),
    isTenantAdmin(ctx.userId, ctx.tenantId),
    getMemberGroups(ctx.userId, ctx.tenantId),
  ]);
  const supabaseMe = await createClient();
  const { data: me } = await supabaseMe.from("user_profiles").select("full_name, avatar_path").eq("id", ctx.userId).maybeSingle();
  const myUrls = await signedAvatarUrls([me?.avatar_path]);
  const taskCount = await loadTaskCount(supabaseMe, ctx.tenantId, ctx.userId, tenantAdmin, memberGroups.active?.id ?? null).catch(() => 0);
  // Cor da marca própria por tema: sem cor escolhida para o tema atual, vale o azul padrão do produto.
  const themeColor = ctx.theme === "dark" ? own?.colorDark : own?.color;
  const themeVars = themeColor
    ? ({ "--color-brand": ensureWhiteContrast(themeColor), "--color-brand-600": darkenHex(ensureWhiteContrast(themeColor)) } as React.CSSProperties)
    : undefined;

  return (
    <div className={`flex h-screen h-[100dvh] w-full overflow-hidden ${ctx.theme === "dark" ? "dark" : ""}`} data-theme={ctx.theme} style={themeVars}>
      <AppBackdrop />
      <AppSidebar
        tenantId={ctx.tenantId}
        tenantName={ctx.tenantName}
        companyIconUrl={ctx.companyIconUrl}
        tenants={ctx.tenants}
        email={ctx.email}
        personName={me?.full_name || ctx.email}
        avatarUrl={me?.avatar_path ? (myUrls.get(me.avatar_path) ?? null) : null}
        isPlatformAdmin={false}
        isAdmin={tenantAdmin}
        hiddenScreens={hiddenScreens}
        brand={own?.brand ?? brand}
        currentTheme={ctx.theme}
        groups={tenantAdmin ? [] : memberGroups.groups.map((g) => ({ id: g.id, name: g.name, icon: g.icon, color: g.color }))}
        activeGroupId={memberGroups.active?.id ?? null}
        taskCount={taskCount}
      />
      <main className="app-content-bg min-w-0 flex-1 h-full overflow-hidden pt-12 md:pt-0">{children}</main>
    </div>
  );
}
