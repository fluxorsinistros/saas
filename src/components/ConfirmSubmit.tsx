"use client";

import { useRef, useState, type ReactNode } from "react";

type Summary = { label: string; value: string };

// Botão que NÃO envia o formulário de primeira: valida os campos, abre uma janela com o resumo do que está sendo
// feito (e os dados preenchidos) e só envia depois do "Confirmar". Evita concluir etapa ou escolher decisão por clique
// sem querer, a ação do servidor é a mesma, só passa por uma conferência antes.
export function ConfirmSubmit({
  children,
  title,
  description,
  confirmLabel = "Confirmar",
  className,
}: {
  children: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  className?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary[]>([]);

  function collect(form: HTMLFormElement): Summary[] {
    const rows: Summary[] = [];
    for (const el of Array.from(form.elements)) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
      if (!el.name.startsWith("field_")) continue;
      const label = el.id ? form.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent?.replace("*", "").trim() : "";
      let value = "";
      if (el instanceof HTMLSelectElement) value = el.selectedOptions[0]?.text ?? "";
      else if (el instanceof HTMLInputElement && el.type === "file") value = el.files?.[0]?.name ?? "";
      else if (el instanceof HTMLInputElement && el.type === "checkbox") value = el.checked ? "Sim" : "Não";
      else value = el.value;
      rows.push({ label: label || el.name.replace("field_", ""), value: value.trim() || "-" });
    }
    return rows;
  }

  function ask() {
    const form = buttonRef.current?.form;
    if (!form) return;
    if (!form.reportValidity()) return; // campo obrigatório vazio: o navegador aponta antes de qualquer confirmação
    setSummary(collect(form));
    setOpen(true);
  }

  function confirm() {
    const form = buttonRef.current?.form;
    setOpen(false);
    form?.requestSubmit();
  }

  return (
    <>
      <button ref={buttonRef} type="button" onClick={ask} className={className}>
        {children}
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl bg-white p-5 text-slate-800 shadow-xl"
          >
            <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
            {description && <div className="mt-1 text-[13px] text-slate-600">{description}</div>}
            {summary.length > 0 && (
              <dl className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 text-[13px]">
                {summary.map((r) => (
                  <div key={r.label} className="flex justify-between gap-4 px-3 py-1.5">
                    <dt className="text-slate-500">{r.label}</dt>
                    <dd className="text-right font-medium text-slate-900">{r.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mt-3 text-xs text-slate-500">Confira antes de continuar. Depois de confirmar, a etapa segue o fluxo.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Voltar e revisar
              </button>
              <button
                type="button"
                onClick={confirm}
                className="rounded-lg bg-brand px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600"
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
