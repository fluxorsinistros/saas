"use client";

import { useRef, useTransition } from "react";
import { setNotificationPreference } from "@/app/(app)/notificacoes/actions";

// Liga/desliga na hora: troca o interruptor e o formulário é enviado sozinho.
export function PreferenceToggle({ ruleKey, label, hint, enabled }: { ruleKey: string; label: string; hint: string; enabled: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  return (
    <form
      ref={formRef}
      action={(fd) =>
        start(async () => {
          await setNotificationPreference(fd);
        })
      }
      className="flex items-center justify-between gap-4 px-5 py-3.5"
    >
      <input type="hidden" name="rule_key" value={ruleKey} />
      <label htmlFor={`pref-${ruleKey}`} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-[14px] font-medium text-slate-900">{label}</span>
        <span className="block text-[12px] text-slate-600">{hint}</span>
      </label>
      <input
        id={`pref-${ruleKey}`}
        type="checkbox"
        name="email_enabled"
        role="switch"
        defaultChecked={enabled}
        disabled={pending}
        onChange={() => formRef.current?.requestSubmit()}
        className="size-5 shrink-0 cursor-pointer accent-[var(--color-brand)]"
      />
    </form>
  );
}
