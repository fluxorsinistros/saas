import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getPlatformBrand } from "@/lib/branding";
import { SaveButton } from "./save-button";
import { savePlatformBranding } from "./actions";
import { btnPrimary, input } from "./shared";

export async function MarcaTab() {
  await requirePlatformAdmin();
  const brand = await getPlatformBrand();

  return (
    <div className="space-y-6">
        <p className="max-w-xl text-[13px] text-slate-500">Nome e logo do produto, a marca padrão que os clientes veem.</p>
        <section>
          <form action={savePlatformBranding} className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-navy">
              {brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo do Storage
                <img src={brand.logoUrl} alt="Logo atual" className="size-10 object-contain" />
              ) : (
                <span className="px-1 text-center text-xs leading-tight text-slate-400">logo padrão</span>
              )}
            </div>
            <div className="min-w-[200px] flex-1">
              <label htmlFor="product_name" className="mb-1 block text-[12px] font-medium text-slate-600">
                Nome do produto
              </label>
              <input key={brand.name} id="product_name" name="product_name" required defaultValue={brand.name} className={input} />
            </div>
            <div className="min-w-[180px] flex-1">
              <label htmlFor="tagline" className="mb-1 block text-[12px] font-medium text-slate-600">
                Subtítulo (opcional)
              </label>
              <input key={brand.tagline} id="tagline" name="tagline" defaultValue={brand.tagline} className={input} />
            </div>
            <div className="min-w-[220px] flex-1">
              <label htmlFor="logo" className="mb-1 block text-[12px] font-medium text-slate-600">
                Logo (PNG, JPG ou WEBP, até 1 MB)
              </label>
              <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className={`${input} file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-[12px]`} />
              {brand.logoUrl && (
                <label className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-500">
                  <input type="checkbox" name="remove_logo" /> Remover logo e voltar ao padrão
                </label>
              )}
            </div>
            <SaveButton className={btnPrimary}>Salvar marca</SaveButton>
          </form>
          <p className="mt-2 text-[12px] text-slate-500">
            Vale para o menu lateral, a tela de login e o título da aba. A marca própria de cada cliente (white-label) é liberada
            na conta do cliente, na aba Plano e cobrança.
          </p>
        </section>
    </div>
  );
}
