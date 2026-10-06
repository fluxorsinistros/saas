"use client";

import { useActionState } from "react";
import { saveTenantBranding } from "../../actions";
import { input } from "../../shared";

// Nome, subtítulo, cor principal e logo da conta. O servidor confere se o white-label está liberado.
export function TenantBrandForm({
  tenantId,
  name,
  tagline,
  color,
  colorDark,
  logoUrl,
}: {
  tenantId: string;
  name: string;
  tagline: string;
  color: string;
  colorDark: string;
  logoUrl: string | null;
}) {
  const [state, action, pending] = useActionState(saveTenantBranding, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-4">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-navy">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo do Storage
          <img src={logoUrl} alt="Logo atual da conta" className="size-10 object-contain" />
        ) : (
          <span className="px-1 text-center text-xs leading-tight text-slate-400">sem logo</span>
        )}
      </div>
      <div className="min-w-[200px] flex-1">
        <label htmlFor="brand_name" className="mb-1 block text-[12px] font-medium text-slate-600">
          Nome exibido
        </label>
        <input key={name} id="brand_name" name="brand_name" defaultValue={name} placeholder="Vazio = marca da plataforma" className={input} />
      </div>
      <div className="min-w-[180px] flex-1">
        <label htmlFor="brand_tagline" className="mb-1 block text-[12px] font-medium text-slate-600">
          Subtítulo (opcional)
        </label>
        <input key={tagline} id="brand_tagline" name="brand_tagline" defaultValue={tagline} className={input} />
      </div>
      <div className="w-40">
        <label htmlFor="brand_color" className="mb-1 block text-[12px] font-medium text-slate-600">
          Cor no tema claro
        </label>
        <div className="flex items-center gap-2">
          <input
            key={color}
            id="brand_color"
            name="brand_color"
            defaultValue={color}
            placeholder="#577bf8"
            maxLength={7}
            className={input}
          />
          {/^#[0-9a-fA-F]{6}$/.test(color) && <span className="size-6 shrink-0 rounded-md ring-1 ring-slate-200" style={{ background: color }} />}
        </div>
      </div>
      <div className="w-40">
        <label htmlFor="brand_color_dark" className="mb-1 block text-[12px] font-medium text-slate-600">
          Cor no tema escuro
        </label>
        <div className="flex items-center gap-2">
          <input
            key={colorDark}
            id="brand_color_dark"
            name="brand_color_dark"
            defaultValue={colorDark}
            placeholder="#577bf8"
            maxLength={7}
            className={input}
          />
          {/^#[0-9a-fA-F]{6}$/.test(colorDark) && <span className="size-6 shrink-0 rounded-md ring-1 ring-slate-200" style={{ background: colorDark }} />}
        </div>
      </div>
      <div className="min-w-[220px] flex-1">
        <label htmlFor="brand_logo" className="mb-1 block text-[12px] font-medium text-slate-600">
          Logo (PNG, JPG ou WEBP, até 1 MB)
        </label>
        <input
          id="brand_logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className={`${input} file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-[12px]`}
        />
        {logoUrl && (
          <label className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-500">
            <input type="checkbox" name="remove_logo" /> Remover logo
          </label>
        )}
      </div>
      <button
        disabled={pending}
        className="rounded-lg bg-brand px-3 py-2 text-[12px] font-medium text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Salvar marca"}
      </button>
      {state && <p className={`w-full text-[12px] ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>}
    </form>
  );
}
