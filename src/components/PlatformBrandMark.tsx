import { BrandMark } from "@/components/BrandMark";
import { getPlatformBrand } from "@/lib/branding";

// BrandMark para páginas de servidor: já busca o nome e o logo configurados.
export async function PlatformBrandMark(props: { tone?: "dark" | "light"; compact?: boolean }) {
  const brand = await getPlatformBrand();
  return <BrandMark {...props} brand={brand} />;
}
