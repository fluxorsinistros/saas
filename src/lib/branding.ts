import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_BRAND, type Brand } from "@/components/BrandMark";

// Marca da plataforma (nome, subtítulo e logo) configurada em Administração. Leitura pública: aparece
// até na tela de login.
export const getPlatformBrand = cache(async (): Promise<Brand> => {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("product_name, tagline, logo_path").eq("id", true).maybeSingle();
  if (!data) return DEFAULT_BRAND;
  const logoUrl = data.logo_path ? supabase.storage.from("branding").getPublicUrl(data.logo_path).data.publicUrl : null;
  return { name: data.product_name, tagline: data.tagline, logoUrl };
});

export type TenantBrand = { brand: Brand; color: string | null };

// Marca própria da conta (white-label): só vale se o contrato liberou e a conta preencheu um nome.
export const getTenantBrand = cache(async (tenantId: string): Promise<TenantBrand | null> => {
  const supabase = await createClient();
  const [{ data: contract }, { data: tenant }] = await Promise.all([
    supabase.from("tenant_contracts").select("white_label_enabled").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("tenants").select("settings").eq("id", tenantId).maybeSingle(),
  ]);
  if (!contract?.white_label_enabled) return null;
  const b = ((tenant?.settings ?? {}) as { branding?: { name?: string; tagline?: string; primary_color?: string | null; logo_path?: string | null } })
    .branding;
  if (!b?.name) return null;
  const logoUrl = b.logo_path ? supabase.storage.from("branding").getPublicUrl(b.logo_path).data.publicUrl : null;
  const color = b.primary_color && /^#[0-9a-fA-F]{6}$/.test(b.primary_color) ? b.primary_color : null;
  return { brand: { name: b.name, tagline: b.tagline ?? "", logoUrl }, color };
});

/** Escurece uma cor #RRGGBB em ~15% (para o estado de hover dos botões). */
export function darkenHex(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((n >> shift) & 255) * 0.85)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}
