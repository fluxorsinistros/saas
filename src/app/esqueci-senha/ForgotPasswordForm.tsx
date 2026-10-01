"use client";

import { useState } from "react";
import { requestPasswordReset } from "@/app/login/actions";
import { OtpPasswordForm } from "@/components/auth/OtpPasswordForm";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (sent) {
    return <OtpPasswordForm initialEmail={email} otpType="recovery" title="Digite o código" />;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const emailValue = String(form.get("email") ?? "").trim();
    setBusy(true);
    setError("");
    const res = await requestPasswordReset(undefined, form);
    setBusy(false);
    if (res?.error) return setError(res.error);
    setEmail(emailValue);
    setSent(true);
  }

  return (
    <form onSubmit={onSubmit} className="mt-10">
      <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Esqueci minha senha</h1>
      <p className="mt-1 text-[14px] text-slate-500">Mandamos um código de 6 dígitos para o seu e-mail.</p>
      <div className="mt-5">
        <label htmlFor="email" className="mb-1 block text-[12px] font-medium text-slate-600">
          E-mail
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className={input} />
      </div>
      {error && <p className="mt-3 text-[13px] text-rose-700">{error}</p>}
      <button disabled={busy} className="mt-5 w-full rounded-lg bg-brand py-2.5 text-[14px] font-medium text-white hover:bg-brand-600 disabled:opacity-60">
        {busy ? "Enviando…" : "Enviar código"}
      </button>
    </form>
  );
}
