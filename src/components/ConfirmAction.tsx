"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Botão de ação destrutiva (remover, excluir) que NÃO envia o formulário de primeira: abre uma janela dizendo o que será
// removido e só envia depois do "Remover". Esc e clicar fora cancelam. O formulário e a ação do servidor são os mesmos.
export function ConfirmAction({
  children,
  title,
  description,
  confirmLabel = "Remover",
  className,
  ariaLabel,
  tone = "danger",
}: {
  children: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  className?: string;
  ariaLabel?: string;
  tone?: "danger" | "brand";
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function confirm() {
    const form = buttonRef.current?.form;
    setOpen(false);
    form?.requestSubmit();
  }

  return (
    <>
      <button ref={buttonRef} type="button" onClick={() => setOpen(true)} className={className} aria-label={ariaLabel} aria-haspopup="dialog">
        {children}
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setOpen(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl bg-white p-5 text-slate-800 shadow-xl"
          >
            <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
            {description && <div className="mt-1 text-[13px] text-slate-600">{description}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded-lg border border-slate-200 px-3.5 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirm}
                className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-white ${tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : "bg-brand hover:bg-brand-600"}`}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
