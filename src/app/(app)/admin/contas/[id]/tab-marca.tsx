import { createClient } from "@/lib/supabase/server";
import { TenantBrandForm } from "./brand-form";

type Branding = { name?: string; tagline?: string; primary_color?: string | null; logo_path?: string | null };

export async function TabMarca({ tenantId, settings }: { tenantId: string; settings: unknown }) {
  const branding = (((settings ?? {}) as { branding?: Branding }).branding ?? {}) as Branding;
  const supabase = await createClient();
  const logoUrl = branding.logo_path ? supabase.storage.from("branding").getPublicUrl(branding.logo_path).data.publicUrl : null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Marca da conta (white-label)</h2>
      <p className="mb-4 text-[12px] text-slate-500">
        Com a marca preenchida, os usuários desta conta veem o nome, o logo e a cor principal abaixo no menu lateral. Deixe o nome vazio
        para voltar à marca da plataforma.
      </p>
      <TenantBrandForm
        tenantId={tenantId}
        name={branding.name ?? ""}
        tagline={branding.tagline ?? ""}
        color={branding.primary_color ?? ""}
        logoUrl={logoUrl}
      />
    </section>
  );
}
