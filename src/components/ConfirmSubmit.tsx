"use client";

import { useRef, useState, type ReactNode } from "react";
import { splitFieldValues } from "@/lib/workflow/types";

type Summary = { label: string; value: string };

// Para onde o sinistro vai ao concluir uma etapa que segue conforme um campo: cada opção do campo leva a um próximo passo.
export type RoutePreview = {
  fieldKey: string;
  fieldLabel: string;
  // Valor já guardado no sinistro, usado quando o campo não aparece neste formulário (preenchido antes)
  stored: string;
  options: { option: string; target: string }[];
};

// Botão que NÃO envia o formulário de primeira: valida os campos, abre uma janela com o resumo do que está sendo
// feito (e os dados preenchidos) e só envia depois do "Confirmar". Evita concluir etapa ou escolher decisão por clique
// sem querer, a ação do servidor é a mesma, só passa por uma conferência antes.
export function ConfirmSubmit({
  children,
  title,
  description,
  confirmLabel = "Confirmar",
  className,
  route,
}: {
  children: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  className?: string;
  route?: RoutePreview;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [destinations, setDestinations] = useState<string[] | null>(null);

  function collect(form: HTMLFormElement): Summary[] {
    const rows: Summary[] = [];
    const checkboxRows = new Map<string, Summary>();
    for (const el of Array.from(form.elements)) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
      if (!el.name.startsWith("field_")) continue;
      const label = el.id ? form.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent?.replace("*", "").trim() : "";
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        // lista com várias opções: junta as marcadas numa só linha
        let row = checkboxRows.get(el.name);
        if (!row) {
          const groupLabel = el.closest("[role=group]")?.id ? form.querySelector(`label[for="${CSS.escape(el.closest("[role=group]")!.id)}"]`)?.textContent?.replace("*", "").trim() : "";
          row = { label: groupLabel || el.name.replace("field_", ""), value: "" };
          checkboxRows.set(el.name, row);
          rows.push(row);
        }
        if (el.checked) row.value = row.value ? `${row.value}, ${el.value}` : el.value;
        continue;
      }
      let value = "";
      if (el instanceof HTMLSelectElement) value = el.selectedOptions[0]?.text ?? "";
      else if (el instanceof HTMLInputElement && el.type === "file") value = el.files?.[0]?.name ?? "";
      else value = el.value;
      rows.push({ label: label || el.name.replace("field_", ""), value: value.trim() || "-" });
    }
    for (const row of rows) if (!row.value) row.value = "-";
    return rows;
  }

  // Valores escolhidos agora no campo que decide o caminho, ou o valor guardado antes se o campo não está neste formulário
  function chosenValues(form: HTMLFormElement, r: RoutePreview): string[] {
    const els = Array.from(form.elements).filter((e) => (e as HTMLInputElement).name === `field_${r.fieldKey}`) as (HTMLInputElement | HTMLSelectElement)[];
    if (els.length === 0) return splitFieldValues(r.stored);
    const values: string[] = [];
    for (const el of els) {
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        if (el.checked) values.push(el.value);
      } else if (el.value) values.push(el.value);
    }
    return values;
  }

  function ask() {
    const form = buttonRef.current?.form;
    if (!form) return;
    if (!form.reportValidity()) return; // campo obrigatório vazio: o navegador aponta antes de qualquer confirmação
    setSummary(collect(form));
    if (route) {
      const values = chosenValues(form, route);
      setDestinations(values.map((v) => route.options.find((o) => o.option === v)?.target ?? `(sem caminho para "${v}")`));
    } else setDestinations(null);
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
            {destinations && destinations.length > 0 && (
              <div className="mt-3 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2.5 text-[13px]">
                {destinations.length === 1 ? (
                  <p>
                    Com essa escolha, o sinistro segue para: <span className="font-semibold text-slate-900">{destinations[0]}</span>.
                  </p>
                ) : (
                  <>
                    <p className="font-medium text-slate-900">Com essa escolha, o fluxo se divide em {destinations.length} caminhos ao mesmo tempo:</p>
                    <ul className="mt-1 list-disc pl-5 text-slate-800">
                      {destinations.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
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
