"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

// Botão de submit com retorno visual: "Salvando…" enquanto a action roda e "✓ Salvo" logo depois.
export function SaveButton({ children, className }: { children: React.ReactNode; className: string }) {
  const { pending } = useFormStatus();
  const [saved, setSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;
    const show = setTimeout(() => setSaved(true), 0);
    const hide = setTimeout(() => setSaved(false), 2500);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [pending]);

  return (
    <button disabled={pending} className={`${className} disabled:opacity-60`}>
      {pending ? "Salvando…" : saved ? "✓ Salvo" : children}
    </button>
  );
}
