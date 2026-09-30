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
