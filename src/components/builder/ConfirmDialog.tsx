"use client";

import { useEffect, useId, useRef } from "react";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "brand" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
};

// Diálogo de confirmação para ações sensíveis (publicar uma versão imutável, excluir).
// A crítica de design apontou que essas ações hoje não têm cerimônia nenhuma.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  tone = "brand",
  busy = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" role="presentation" onClick={onCancel}>
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
      >
        <h2 id={titleId} className="text-[16px] font-semibold text-slate-900">
          {title}
        </h2>
        <div className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{description}</div>
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-3.5 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-autofocus
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-lg px-3.5 py-2 text-[13px] font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
              tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : "bg-brand hover:bg-brand-600"
            }`}
          >
            {busy ? "Aguarde…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
