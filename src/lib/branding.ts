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

export type TenantBrand = { brand: Brand; color: string | null; colorDark: string | null };

// Marca própria da conta (white-label): só vale se o contrato liberou e a conta tem customização de marca (cor, logo ou nome).
export const getTenantBrand = cache(async (tenantId: string): Promise<TenantBrand | null> => {
  const supabase = await createClient();
  const [{ data: contract }, { data: tenant }, platformBrand] = await Promise.all([
    supabase.from("tenant_contracts").select("white_label_enabled").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("tenants").select("name, settings").eq("id", tenantId).maybeSingle(),
    getPlatformBrand(),
  ]);
  if (!contract?.white_label_enabled) return null;
  const b = ((tenant?.settings ?? {}) as { branding?: { name?: string | null; tagline?: string | null; primary_color?: string | null; primary_color_dark?: string | null; logo_path?: string | null } })
    .branding;
  if (!b) return null;

  const logoUrl = b.logo_path ? supabase.storage.from("branding").getPublicUrl(b.logo_path).data.publicUrl : platformBrand.logoUrl;
  const color = b.primary_color && /^#[0-9a-fA-F]{6}$/.test(b.primary_color) ? b.primary_color : null;
  const colorDark = b.primary_color_dark && /^#[0-9a-fA-F]{6}$/.test(b.primary_color_dark) ? b.primary_color_dark : null;
  const name = b.name?.trim() || platformBrand.name;
  const tagline = b.tagline !== undefined && b.tagline !== null ? b.tagline : platformBrand.tagline;

  // Se não há personalização alguma, não há marca própria ativa
  if (!b.name?.trim() && (!b.tagline || !b.tagline.trim()) && !color && !colorDark && !b.logo_path) {
    return null;
  }

  return { brand: { name, tagline: tagline ?? "", logoUrl }, color, colorDark };
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

// Cor de marca da empresa (white-label) precisa sustentar texto branco nos botões primários: escurece
// até chegar a 4,5:1 (WCAG AA). Ex.: #0284c7 dava 4,1:1 e reprovava.
export function ensureWhiteContrast(hex: string): string {
  const lum = (h: string) => {
    const n = parseInt(h.slice(1), 16);
    const lin = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  let out = hex;
  for (let i = 0; i < 12 && 1.05 / (lum(out) + 0.05) < 4.5; i++) out = darkenHex(out);
  return out;
}
