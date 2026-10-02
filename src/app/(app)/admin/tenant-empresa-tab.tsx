"use client";

import { useState, useRef, useActionState, useTransition, useEffect } from "react";
import Link from "next/link";
import {
  Building2,
  Shield,
  UsersRound,
  ArrowRight,
  CheckCircle2,
  Upload,
  Image as ImageIcon,
  Sparkles,
  AlertCircle,
  Zap,
  Info,
  Check,
  Sun,
  Moon,
} from "lucide-react";
import { saveCompanyIcon, saveTenantTheme, type ActionState } from "./actions";

type Props = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    operating_model: string | null;
    settings?: Record<string, unknown> | unknown;
    created_at: string;
    status: string;
  };
  contract: {
    plan_name?: string;
    white_label_enabled: boolean;
    status: string;
    started_at: string;
  } | null;
  membersCount: number;
  companyIconUrl?: string | null;
};

// Compactador de imagem no navegador (Canvas -> WebP 85% de qualidade)
async function compressImageToWebp(file: File): Promise<{
  optimizedFile: File;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
  savingsPct: number;
}> {
  // SVG já é texto vetorial leve, mantém como está
  if (file.type === "image/svg+xml") {
    return {
      optimizedFile: file,
      previewUrl: URL.createObjectURL(file),
      originalSize: file.size,
      compressedSize: file.size,
      savingsPct: 0,
    };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIMENSION = 512;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIMENSION) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          }
        } else {
          if (height > MAX_DIMENSION) {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return resolve({
            optimizedFile: file,
            previewUrl: URL.createObjectURL(file),
            originalSize: file.size,
            compressedSize: file.size,
            savingsPct: 0,
          });
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return resolve({
                optimizedFile: file,
                previewUrl: URL.createObjectURL(file),
                originalSize: file.size,
                compressedSize: file.size,
                savingsPct: 0,
              });
            }
            const cleanName = file.name.replace(/\.[^.]+$/, "") + ".webp";
            const optimizedFile = new File([blob], cleanName, { type: "image/webp" });
            const savings = Math.max(0, Math.round((1 - blob.size / file.size) * 100));

            resolve({
              optimizedFile,
              previewUrl: URL.createObjectURL(blob),
              originalSize: file.size,
              compressedSize: blob.size,
              savingsPct: savings,
            });
          },
          "image/webp",
          0.85
        );
      };
      img.onerror = () => reject(new Error("Falha ao ler dimensões da imagem"));
      img.src = readerEvent.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo de imagem"));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function TenantEmpresaTab({ tenant, contract, membersCount, companyIconUrl }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveCompanyIcon, null);
  const [themeState, themeAction, themePending] = useActionState<ActionState, FormData>(saveTenantTheme, null);

  const initialTheme = (((tenant.settings ?? {}) as Record<string, unknown>).theme as "light" | "dark") || "light";
  const [selectedTheme, setSelectedTheme] = useState<"light" | "dark">(initialTheme);

  useEffect(() => {
    const t = (((tenant.settings ?? {}) as Record<string, unknown>).theme as "light" | "dark") || "light";
    setSelectedTheme(t);
  }, [tenant.settings]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [, startTransition] = useTransition();

  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(null);
  const [optimizedFile, setOptimizedFile] = useState<File | null>(null);
  const [compressionStats, setCompressionStats] = useState<{
    originalSize: number;
    compressedSize: number;
    savingsPct: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const formattedCreated = new Date(tenant.created_at).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressing(true);
      const res = await compressImageToWebp(file);
      setOptimizedFile(res.optimizedFile);
      setSelectedPreviewUrl(res.previewUrl);
      setCompressionStats({
        originalSize: res.originalSize,
        compressedSize: res.compressedSize,
        savingsPct: res.savingsPct,
      });
    } catch (err) {
      console.error("Erro na compressão:", err);
      // Fallback para arquivo original
      setOptimizedFile(file);
      setSelectedPreviewUrl(URL.createObjectURL(file));
      setCompressionStats(null);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    // Se temos um arquivo otimizado via canvas/webp, substitui no FormData
    if (optimizedFile) {
      formData.set("company_icon", optimizedFile);
    }

    startTransition(() => {
      formAction(formData);
    });
  };

  const activeIcon = selectedPreviewUrl ?? companyIconUrl ?? null;

  return (
    <div className="space-y-6">
      {/* 3 Cards de Visão Geral */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Card Empresa com o Ícone Dinâmico */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-inner">
              {activeIcon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activeIcon} alt={tenant.name} className="max-h-full max-w-full object-contain p-1" />
              ) : (
                <Building2 className="size-6 text-brand" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[14px] font-semibold text-slate-900" title={tenant.name}>
                {tenant.name}
              </h3>
              <p className="truncate text-[12px] text-slate-500">Identificador: @{tenant.slug}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-[12px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Situação da Conta:</span>
              <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                <CheckCircle2 className="size-3.5" />
                Ativa
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Membro desde:</span>
              <span className="font-medium text-slate-700">{formattedCreated}</span>
            </div>
            {tenant.operating_model && (
              <div className="flex justify-between">
                <span className="text-slate-500">Modelo Operacional:</span>
                <span className="font-medium capitalize text-slate-700">{tenant.operating_model}</span>
              </div>
            )}
          </div>
        </div>

        {/* Card Plano e Contrato */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <Shield className="size-5" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                Plano: {contract?.plan_name ?? "Padrão"}
              </h3>
              <p className="text-[12px] text-slate-500">
                Status: {contract?.status === "active" ? "Contrato Ativo" : "Em análise"}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-[12px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Módulo White-label:</span>
              <span
                className={`font-semibold ${
                  contract?.white_label_enabled ? "text-emerald-600" : "text-slate-400"
                }`}
              >
                {contract?.white_label_enabled ? "Liberado" : "Não contratado"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Vigência:</span>
              <span className="font-medium text-slate-700">Contínuo</span>
            </div>
          </div>
        </div>

        {/* Card Equipe e Membros */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <UsersRound className="size-5" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">Usuários da Empresa</h3>
              <p className="text-[12px] text-slate-500">{membersCount} membro(s) cadastrado(s)</p>
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <Link
              href="/usuarios"
              className="flex items-center justify-between text-[12px] font-medium text-brand hover:text-brand-600"
            >
              <span>Gerenciar Membros e Acessos</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Seção de Aparência e Tema do Sistema */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              {selectedTheme === "dark" ? <Moon className="size-5 text-cyan" /> : <Sun className="size-5 text-amber-500" />}
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">Aparência e Tema do Sistema</h2>
              <p className="text-[12px] text-slate-500">
                Configure se a interface de <strong>{tenant.name}</strong> será exibida no modo claro clássico ou no modo escuro moderno.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
            Tema ativo: <strong className="capitalize">{selectedTheme === "dark" ? "Escuro" : "Claro"}</strong>
          </span>
        </div>

        <form action={themeAction} className="mt-5 space-y-5">
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <input type="hidden" name="theme" value={selectedTheme} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Opção Tema Claro */}
            <div
              onClick={() => {
                setSelectedTheme("light");
                document.documentElement.classList.remove("dark");
                document.documentElement.setAttribute("data-theme", "light");
              }}
              className={`group relative flex cursor-pointer flex-col justify-between rounded-xl border-2 p-4.5 transition-all ${
                selectedTheme === "light"
                  ? "border-brand bg-blue-50/20 ring-2 ring-brand/10 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-200">
                      <Sun className="size-4" />
                    </div>
                    <span className="text-[14px] font-semibold text-slate-900">Tema Claro</span>
                  </div>
                  {selectedTheme === "light" && (
                    <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
                      Selecionado
                    </span>
                  )}
                </div>

                <p className="text-[12px] text-slate-500 leading-relaxed">
                  Design clássico com fundo claro (#F8FAFC) e cartões brancos com contraste suave. Ideal para ambientes bem iluminados.
                </p>

                {/* Miniatura do layout claro */}
                <div className="rounded-lg border border-slate-200 bg-slate-100 p-2 text-xs space-y-1.5 shadow-inner">
                  <div className="flex items-center justify-between bg-white px-2 py-1 rounded border border-slate-200">
                    <span className="font-semibold text-slate-800">Menu Principal</span>
                    <span className="size-2 rounded-full bg-blue-600" />
                  </div>
                  <div className="flex gap-1.5">
                    <div className="h-5 flex-1 rounded bg-white border border-slate-200" />
                    <div className="h-5 flex-1 rounded bg-white border border-slate-200" />
                  </div>
                </div>
              </div>
            </div>

            {/* Opção Tema Escuro */}
            <div
              onClick={() => {
                setSelectedTheme("dark");
                document.documentElement.classList.add("dark");
                document.documentElement.setAttribute("data-theme", "dark");
              }}
              className={`group relative flex cursor-pointer flex-col justify-between rounded-xl border-2 p-4.5 transition-all ${
                selectedTheme === "dark"
                  ? "border-brand bg-slate-900 ring-2 ring-brand/20 shadow-md text-white"
                  : "border-slate-200 bg-slate-900/90 text-slate-100 hover:border-slate-400"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-navy-800 text-cyan border border-navy-700">
                      <Moon className="size-4" />
                    </div>
                    <span className="text-[14px] font-semibold text-white">Tema Escuro</span>
                  </div>
                  {selectedTheme === "dark" && (
                    <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
                      Selecionado
                    </span>
                  )}
                </div>

                <p className="text-[12px] text-slate-300 leading-relaxed">
                  Visual moderno em tons obsidian e navy profundo (#090D16). Reduz o cansaço visual e destaca fluxos e indicadores coloridos.
                </p>

                {/* Miniatura do layout escuro */}
                <div className="rounded-lg border border-navy-700 bg-navy p-2 text-xs space-y-1.5 shadow-inner">
                  <div className="flex items-center justify-between bg-navy-800 px-2 py-1 rounded border border-navy-700">
                    <span className="font-semibold text-slate-200">Menu Principal</span>
                    <span className="size-2 rounded-full bg-cyan" />
                  </div>
                  <div className="flex gap-1.5">
                    <div className="h-5 flex-1 rounded bg-navy-800 border border-navy-700" />
                    <div className="h-5 flex-1 rounded bg-navy-800 border border-navy-700" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feedback */}
          {themeState && (
            <div
              className={`flex items-center gap-2 rounded-lg p-3 text-[13px] ${
                themeState.ok ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              {themeState.ok ? <Check className="size-4 text-emerald-600 shrink-0" /> : <AlertCircle className="size-4 text-rose-600 shrink-0" />}
              <span>{themeState.message}</span>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={themePending}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-50"
            >
              <Sparkles className="size-4" />
              {themePending ? "Salvando tema…" : "Salvar Tema da Empresa"}
            </button>
          </div>
        </form>
      </div>

      {/* Seção Principal: Ícone e Logotipo da Empresa */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-brand">
              <ImageIcon className="size-5" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">Ícone e Logotipo da Empresa</h2>
              <p className="text-[12px] text-slate-500">
                Atribua o ícone exclusivo de <strong>{tenant.name}</strong> para identificá-la no menu lateral e nos seletores do sistema.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            <Sparkles className="size-3 text-brand" />
            Identidade da Conta
          </span>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <input type="hidden" name="tenant_id" value={tenant.id} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Lado Esquerdo: Upload e Ações (7 cols) */}
            <div className="space-y-4 lg:col-span-7">
              <label className="block text-[12px] font-semibold uppercase tracking-wider text-slate-600">
                Arquivo do Ícone / Logo
              </label>

              {/* Área de Seleção de Arquivo */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-6 text-center transition hover:border-brand hover:bg-blue-50/30"
              >
                <input
                  ref={fileInputRef}
                  id="company_icon_input"
                  name="company_icon"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="flex size-12 items-center justify-center rounded-full bg-white shadow-sm transition group-hover:scale-105 group-hover:text-brand">
                  <Upload className="size-5 text-slate-500 group-hover:text-brand" />
                </div>
                <div className="mt-3 text-[13px] font-medium text-slate-800">
                  <span className="text-brand underline underline-offset-2">Clique para escolher</span> ou arraste a imagem aqui
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Formatos aceitos: PNG, SVG, WEBP ou JPG (redimensionado e otimizado automaticamente)
                </p>
              </div>

              {/* Status de Compactação Instantânea */}
              {isCompressing && (
                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-[12px] text-blue-700">
                  <span className="size-2 animate-ping rounded-full bg-blue-600" />
                  <span>Compactando e otimizando imagem no navegador…</span>
                </div>
              )}

              {compressionStats && !isCompressing && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/90 p-2.5 text-[12px] text-emerald-800">
                  <Zap className="size-4 shrink-0 text-emerald-600" />
                  <span>
                    <strong>Otimizado com sucesso:</strong> {formatBytes(compressionStats.originalSize)} →{" "}
                    <strong>{formatBytes(compressionStats.compressedSize)}</strong>
                    {compressionStats.savingsPct > 0 && (
                      <span className="ml-1 rounded bg-emerald-200/70 px-1.5 py-0.5 text-xs font-bold text-emerald-900">
                        -{compressionStats.savingsPct}% de tamanho
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* Opção para remover logo existente */}
              {companyIconUrl && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="remove_icon_check"
                    name="remove_icon"
                    type="checkbox"
                    className="size-4 rounded border-slate-300 text-brand focus:ring-brand"
                  />
                  <label htmlFor="remove_icon_check" className="text-[12px] text-rose-600 hover:text-rose-700 cursor-pointer">
                    Remover ícone personalizado (voltar ao ícone padrão)
                  </label>
                </div>
              )}

              {/* Feedback de envio */}
              {state && (
                <div
                  className={`flex items-center gap-2 rounded-lg p-3 text-[13px] ${
                    state.ok
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  {state.ok ? (
                    <Check className="size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="size-4 shrink-0 text-rose-600" />
                  )}
                  <span>{state.message}</span>
                </div>
              )}

              {/* Botão de Salvar */}
              <div>
                <button
                  type="submit"
                  disabled={pending || isCompressing}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles className="size-4" />
                  {pending ? "Salvando ícone…" : "Salvar Ícone da Empresa"}
                </button>
              </div>
            </div>

            {/* Lado Direito: Prévia Visual Realista (5 cols) */}
            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 lg:col-span-5">
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                Prévia da Exibição
              </h3>

              {/* 1. Mockup no Menu Lateral (Dark Mode) */}
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">
                  Como aparecerá no menu lateral (sidebar):
                </span>
                <div className="rounded-lg border border-navy-700 bg-navy p-3 text-slate-200 shadow-md">
                  <div className="text-xs font-medium text-slate-400">Empresa</div>
                  <div className="mt-1.5 flex items-center gap-2.5">
                    <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-navy-600 bg-navy-900/60 p-0.5 shadow-sm">
                      {activeIcon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={activeIcon} alt={tenant.name} className="max-h-full max-w-full object-contain" />
                      ) : (
                        <Building2 className="size-4 text-slate-400" />
                      )}
                    </div>
                    <div className="truncate text-[13px] font-semibold text-white">{tenant.name}</div>
                  </div>
                </div>
              </div>

              {/* 2. Mockup em Fundo Claro */}
              <div className="space-y-1.5 pt-2">
                <span className="text-xs font-medium text-slate-500">
                  Em cartões e cabeçalhos claros:
                </span>
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-1 shadow-inner">
                    {activeIcon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={activeIcon} alt={tenant.name} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <Building2 className="size-5 text-brand" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-slate-900">{tenant.name}</div>
                    <div className="truncate text-xs text-slate-500">@{tenant.slug}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Banner de Garantia de Otimização e Banco de Dados */}
          <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-[12px] text-slate-700">
            <Info className="mt-0.5 size-4 shrink-0 text-brand" />
            <div className="space-y-1">
              <p className="font-semibold text-slate-900">
                Garantia de Otimização e Compactação
              </p>
              <p className="text-slate-600 leading-relaxed">
                Todas as imagens enviadas passam por compressão automática inteligente (Canvas WebP 85%) diretamente no seu navegador antes do envio. Os arquivos otimizados são armazenados em Storage distribuído de alta velocidade, e o <strong>Banco de Dados (PostgreSQL)</strong> armazena exclusivamente a referência textual indexada (sem BLOBs pesados), assegurando consultas instantâneas e zero lentidão na plataforma.
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
