"use client";

import { useState, useActionState } from "react";
import { Palette, Image as ImageIcon, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { saveTenantBranding, type ActionState } from "./actions";

type Props = {
  tenantId: string;
  whiteLabelEnabled: boolean;
  initialBrand: {
    name?: string;
    tagline?: string;
    color?: string | null;
    logoUrl?: string | null;
  };
};

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-slate-50 disabled:text-slate-500";

export function TenantMarcaTab({ tenantId, whiteLabelEnabled, initialBrand }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveTenantBranding, null);

  const [previewName, setPreviewName] = useState(initialBrand.name ?? "");
  const [previewTagline, setPreviewTagline] = useState(initialBrand.tagline ?? "");
  const [previewColor, setPreviewColor] = useState(initialBrand.color ?? "#2563eb");
  const [logoPreview, setLogoPreview] = useState<string | null>(initialBrand.logoUrl ?? null);

  // Ressincroniza quando o servidor devolve a marca salva (ajuste durante o render, sem efeito).
  const brandKey = `${initialBrand.name}|${initialBrand.tagline}|${initialBrand.color}|${initialBrand.logoUrl}`;
  const [seenBrandKey, setSeenBrandKey] = useState(brandKey);
  if (seenBrandKey !== brandKey) {
    setSeenBrandKey(brandKey);
    if (initialBrand.name !== undefined) setPreviewName(initialBrand.name ?? "");
    if (initialBrand.tagline !== undefined) setPreviewTagline(initialBrand.tagline ?? "");
    if (initialBrand.color) setPreviewColor(initialBrand.color);
    if (initialBrand.logoUrl !== undefined) setLogoPreview(initialBrand.logoUrl);
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setLogoPreview(url);
    }
  };

  return (
    <div className="space-y-6">
      {!whiteLabelEnabled && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-[13px] text-amber-900">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-950">Módulo White-label não contratado</p>
            <p className="text-amber-800">
              A personalização de marca própria (logo exclusiva, cores no sistema e nome da empresa) é liberada sob demanda no contrato da sua conta.
              Entre em contato com o suporte ou gestor da plataforma para habilitar este recurso.
            </p>
          </div>
        </div>
      )}

      {/* Grid: Formulário + Prévia ao Vivo */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Coluna do Formulário (2 cols) */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Palette className="size-5 text-brand" />
            <h2 className="text-[15px] font-semibold text-slate-900">Identidade Visual da Empresa</h2>
          </div>

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="tenant_id" value={tenantId} />

            {/* Logo */}
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                Logotipo da Empresa
              </label>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-navy p-1 shadow-inner">
                  {logoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoPreview} alt="Logo" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <ImageIcon className="size-6 text-slate-500" />
                  )}
                </div>
                <div className="min-w-[200px] flex-1">
                  <input
                    id="brand_logo"
                    name="logo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    disabled={!whiteLabelEnabled}
                    onChange={handleLogoChange}
                    className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-2.5 file:py-1 file:text-[12px] file:font-medium file:text-slate-700 hover:file:bg-slate-200`}
                  />
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Formatos aceitos: PNG, SVG, WEBP ou JPG (até 1MB)</span>
                    {initialBrand.logoUrl && (
                      <label className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700">
                        <input type="checkbox" name="remove_logo" disabled={!whiteLabelEnabled} /> Remover logo atual
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Nome da Marca e Subtítulo */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="brand_name" className="mb-1 block text-[12px] font-medium text-slate-700">
                  Nome da Marca no Sistema
                </label>
                <input
                  id="brand_name"
                  name="brand_name"
                  value={previewName}
                  onChange={(e) => setPreviewName(e.target.value)}
                  placeholder="Ex: Minha Seguradora"
                  disabled={!whiteLabelEnabled}
                  className={inputClass}
                />
                <span className="mt-1 block text-xs text-slate-400">
                  Substitui o nome do produto no menu e cabeçalhos. Deixe vazio para manter o nome padrão da plataforma.
                </span>
              </div>

              <div>
                <label htmlFor="brand_tagline" className="mb-1 block text-[12px] font-medium text-slate-700">
                  Subtítulo ou Slogan (Opcional)
                </label>
                <input
                  id="brand_tagline"
                  name="brand_tagline"
                  value={previewTagline}
                  onChange={(e) => setPreviewTagline(e.target.value)}
                  placeholder="Ex: Gestão de Sinistros"
                  disabled={!whiteLabelEnabled}
                  className={inputClass}
                />
                <span className="mt-1 block text-xs text-slate-400">
                  Exibido abaixo do nome no topo do menu lateral.
                </span>
              </div>
            </div>

            {/* Cor Principal (Theme Brand Color) */}
            <div className="border-t border-slate-100 pt-4">
              <label htmlFor="brand_color" className="mb-1 block text-[12px] font-medium text-slate-700">
                Cor Principal do Sistema
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={previewColor.startsWith("#") && previewColor.length === 7 ? previewColor : "#2563eb"}
                  onChange={(e) => setPreviewColor(e.target.value)}
                  disabled={!whiteLabelEnabled}
                  className="size-10 cursor-pointer rounded-lg border border-slate-300 p-0.5"
                  title="Escolha a cor da sua marca"
                />
                <input
                  id="brand_color"
                  name="brand_color"
                  value={previewColor}
                  onChange={(e) => setPreviewColor(e.target.value)}
                  placeholder="#2563eb"
                  maxLength={7}
                  disabled={!whiteLabelEnabled}
                  className={`${inputClass} w-36 font-mono uppercase`}
                />
                <div className="flex flex-wrap gap-1.5">
                  {["#2563eb", "#0284c7", "#059669", "#7c3aed", "#d97706", "#dc2626"].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={!whiteLabelEnabled}
                      onClick={() => setPreviewColor(preset)}
                      className="size-6 rounded-md border border-slate-200 transition hover:scale-110 disabled:opacity-50"
                      style={{ backgroundColor: preset }}
                      title={`Cor pré-definida ${preset}`}
                    />
                  ))}
                </div>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Esta cor personalizada será aplicada aos botões principais, links ativos e destaques visuais do sistema para todos os membros da sua empresa.
              </p>
            </div>

            {/* Feedback e Botão de Salvar */}
            {state && (
              <div
                className={`flex items-center gap-2 rounded-lg p-3 text-[13px] ${
                  state.ok ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {state.ok ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : <AlertCircle className="size-4 shrink-0 text-rose-600" />}
                <span>{state.message}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="submit"
                disabled={!whiteLabelEnabled || pending}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles className="size-4" />
                {pending ? "Salvando alterações…" : "Salvar Configurações de Marca"}
              </button>

              {(initialBrand.name || initialBrand.logoUrl || (initialBrand.color && initialBrand.color.toLowerCase() !== "#2563eb")) && (
                <label className="flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-rose-600 cursor-pointer">
                  <input type="checkbox" name="reset_branding" disabled={!whiteLabelEnabled || pending} />
                  <span>Restaurar marca padrão da plataforma</span>
                </label>
              )}
            </div>
          </form>
        </div>

        {/* Coluna da Prévia Interativa */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-slate-500">
              Prévia Visual da Sua Marca
            </h3>

            {/* Simulação do Cabeçalho do Menu Lateral */}
            <div className="space-y-3 rounded-lg bg-navy p-4 text-slate-200 shadow-md">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-navy-800 border border-navy-700">
                  {logoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoPreview} alt="Logo Preview" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <div
                      className="size-5 rounded"
                      style={{ backgroundColor: previewColor }}
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-white">
                    {previewName || "Fluxor (Padrão)"}
                  </div>
                  <div className="truncate text-xs text-slate-400">
                    {previewTagline || "Workflow de sinistros"}
                  </div>
                </div>
              </div>

              {/* Botão de Menu Ativo com a Cor da Marca */}
              <div
                className="mt-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-white shadow-sm"
                style={{ backgroundColor: previewColor }}
              >
                <span className="size-2 rounded-full bg-white/70" />
                <span>Item de Menu Selecionado</span>
              </div>
            </div>

            {/* Simulação de Botão de Ação */}
            <div className="mt-4 space-y-2">
              <div className="text-[12px] text-slate-600 font-medium">Botões e Ações Principais:</div>
              <button
                type="button"
                className="w-full rounded-lg py-2 text-[12px] font-medium text-white shadow-sm transition"
                style={{ backgroundColor: previewColor }}
              >
                Novo Sinistro
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
