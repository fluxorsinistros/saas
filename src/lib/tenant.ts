import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platform-admin";

export const TENANT_COOKIE = "tenant_id";

export type TenantContext = {
  userId: string;
  email: string;
  tenantId: string;
  tenantName: string;
  theme: "light" | "dark";
  companyIconUrl?: string | null;
  tenants: { id: string; name: string; iconUrl?: string | null; theme?: "light" | "dark" }[];
};

// Autorização real fica no banco (RLS) — aqui só resolvemos qual tenant está ativo para o usuário.
export const getTenantContext = cache(async (): Promise<TenantContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // O Gestor da plataforma é global: não pertence a empresa nenhuma e só usa /admin.
  if (await isPlatformAdmin()) redirect("/admin");

  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, tenants(id, name, settings)")
    .eq("user_id", user.id)
    .eq("status", "active");

  const tenants = (memberships ?? [])
    .map((m) => {
      const t = m.tenants;
      if (!t) return null;
      const settings = ((t.settings ?? {}) as Record<string, unknown>) ?? {};
      const directUrl = (settings.company_icon_url as string | null) ?? null;
      const iconPath =
        (settings.company_icon_path as string | null) ??
        ((settings.branding as { logo_path?: string | null } | undefined)?.logo_path ?? null);
      const iconUrl =
        directUrl ??
        (iconPath ? supabase.storage.from("branding").getPublicUrl(iconPath).data.publicUrl : null);
      const theme = (settings.theme as "light" | "dark" | undefined) ?? "light";
      return { id: t.id, name: t.name, iconUrl, theme };
    })
    .filter((t): t is { id: string; name: string; iconUrl: string | null; theme: "light" | "dark" } => !!t);

  if (tenants.length === 0) {
    // Convite pendente para este e-mail (o admin da plataforma deu acesso antes de a pessoa ter conta)?
    const { data: claimed } = await supabase.rpc("claim_pending_invites");
    if (claimed && claimed > 0) redirect("/dashboard");

    // RLS esconde contas suspensas: antes de mandar para o onboarding, ver se o problema é suspensão.
    const { data: blocked } = await supabase.rpc("my_blocked_tenants");
    if (!blocked?.length) redirect("/onboarding");
    redirect("/conta-suspensa");
  }

  const cookieStore = await cookies();
  const preferred = cookieStore.get(TENANT_COOKIE)?.value;
  const current = tenants.find((t) => t.id === preferred) ?? tenants[0];
  const cookieTheme = cookieStore.get("app_theme")?.value as "light" | "dark" | undefined;
  const theme = cookieTheme || current.theme || "light";

  return {
    userId: user.id,
    email: user.email ?? "",
    tenantId: current.id,
    tenantName: current.name,
    theme,
    companyIconUrl: current.iconUrl,
    tenants,
  };
});
