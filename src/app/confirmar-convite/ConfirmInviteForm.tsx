"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

type Phase = "code" | "password" | "done";

// Código de 6 dígitos em vez de link clicável: o scanner de segurança de e-mail (Gmail etc.) visita
// automaticamente links dentro da mensagem para checar se são seguros — isso consome o token de uso
// único antes da pessoa clicar de verdade, e o link vira "inválido ou expirado" sem ela ter feito nada
// errado. Um código que a pessoa digita não é visitado por scanner nenhum.
export function ConfirmInviteForm({ initialEmail }: { initialEmail: string }) {
  const [phase, setPhase] = useState<Phase>("code");
  const [email, setEmail] = useState(initialEmail);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmitCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const emailValue = String(form.get("email") ?? "").trim();
    const code = String(form.get("code") ?? "").trim();
    if (!emailValue || !code) return setError("Preencha o e-mail e o código.");

    setBusy(true);
    setError("");
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error: verifyError } = await c.auth.verifyOtp({ email: emailValue, token: code, type: "email" });
    setBusy(false);
    if (verifyError) return setError("Código inválido ou expirado. Confira o e-mail ou peça um novo convite.");
    setEmail(emailValue);
    setClient(c);
    setPhase("password");
  }

  async function onSubmitPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client || busy) return;
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As senhas não conferem.");

    setBusy(true);
    setError("");
    const { error: updateError } = await client.auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(updateError.message);
    await client.auth.signOut();
    setPhase("done");
  }

  if (phase === "done") {
    return (
      <div className="mt-10">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Senha definida</h1>
        <p className="mt-1 text-[14px] text-slate-500">Agora entre com o seu e-mail e a nova senha.</p>
        <Link href="/login" className="mt-5 inline-block rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600">
          Ir para o login
        </Link>
      </div>
    );
  }

  if (phase === "password") {
    return (
      <form onSubmit={onSubmitPassword} className="mt-10">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Crie a sua senha</h1>
        <p className="mt-1 text-[14px] text-slate-500">Use pelo menos 8 caracteres.</p>
        <div className="mt-5 space-y-3">
          <div>
            <label htmlFor="password" className="mb-1 block text-[12px] font-medium text-slate-600">
              Nova senha
            </label>
            <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className={input} />
          </div>
          <div>
            <label htmlFor="confirm" className="mb-1 block text-[12px] font-medium text-slate-600">
              Repita a senha
            </label>
            <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className={input} />
          </div>
        </div>
        {error && <p className="mt-3 text-[13px] text-rose-700">{error}</p>}
        <button disabled={busy} className="mt-5 w-full rounded-lg bg-brand py-2.5 text-[14px] font-medium text-white hover:bg-brand-600 disabled:opacity-60">
          {busy ? "Salvando…" : "Salvar senha"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmitCode} className="mt-10">
      <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Confirmar convite</h1>
      <p className="mt-1 text-[14px] text-slate-500">Digite o código de 6 dígitos que chegou no seu e-mail.</p>
      <div className="mt-5 space-y-3">
        <div>
          <label htmlFor="email" className="mb-1 block text-[12px] font-medium text-slate-600">
            E-mail
          </label>
          <input id="email" name="email" type="email" required defaultValue={email} autoComplete="email" className={input} />
        </div>
        <div>
          <label htmlFor="code" className="mb-1 block text-[12px] font-medium text-slate-600">
            Código de 6 dígitos
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoComplete="one-time-code"
            placeholder="000000"
            className={`${input} text-center text-[20px] tracking-[0.3em]`}
          />
        </div>
      </div>
      {error && <p className="mt-3 text-[13px] text-rose-700">{error}</p>}
      <button disabled={busy} className="mt-5 w-full rounded-lg bg-brand py-2.5 text-[14px] font-medium text-white hover:bg-brand-600 disabled:opacity-60">
        {busy ? "Verificando…" : "Confirmar"}
      </button>
      <p className="mt-3 text-[12px] text-slate-500">
        Não recebeu ou o código expirou? Peça ao administrador para reenviar o convite.
      </p>
    </form>
  );
}
