"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

// Botão "Formalizar sinistro": abre um pop-up para escolher o fluxo e, ao confirmar, vai para a tela de abertura.
export function FormalizeButton({ options }: { options: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [flow, setFlow] = useState("");
  const [going, setGoing] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    selectRef.current?.focus();
    const trigger = triggerRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      // foco preso no pop-up: Tab e Shift+Tab circulam só entre os controles dele
      if (e.key === "Tab" && dialogRef.current) {
        const items = [...dialogRef.current.querySelectorAll<HTMLElement>("select, button:not([disabled])")];
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      trigger?.focus(); // devolve o foco ao botão que abriu o pop-up
    };
  }, [open]);

  function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!flow) return;
    setGoing(true);
    router.push(`/sinistros/novo?fluxo=${encodeURIComponent(flow)}`);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setFlow(options.length === 1 ? options[0].id : "");
          setGoing(false);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600 max-md:fixed max-md:bottom-4 max-md:right-4 max-md:z-30 max-md:py-3 max-md:shadow-lg"
      >
        <Plus className="size-4" /> Formalizar sinistro
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[3px]" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <form
            ref={dialogRef}
            onSubmit={confirm}
            role="dialog"
            aria-modal="true"
            aria-labelledby="formalize-title"
            className="dialog-glass w-full max-w-md rounded-2xl p-5"
          >
            <h2 id="formalize-title" className="text-[16px] font-semibold text-slate-900">
              Formalizar sinistro
            </h2>
            <p className="mt-1 text-[13px] text-slate-600">Escolha o fluxo que o sinistro vai seguir. Depois você preenche os dados da abertura.</p>
            <label htmlFor="formalize-flow" className="mt-4 block text-[12px] font-medium text-slate-700">
              Fluxo publicado
            </label>
            <select
              id="formalize-flow"
              ref={selectRef}
              required
              value={flow}
              onChange={(e) => setFlow(e.target.value)}
              className="mt-1 w-full rounded-lg border-0 px-3 py-2 text-[14px] outline-none"
            >
              <option value="">Selecione…</option>
              {options.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-100">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!flow || going}
                className="rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {going ? "Abrindo…" : "OK"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
