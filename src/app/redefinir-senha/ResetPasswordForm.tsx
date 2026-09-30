"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

type Phase = "loading" | "ready" | "invalid" | "done";

// O link do e-mail (redefinição ou convite) volta para cá com o token no endereço (#access_token=...).
// Usamos um cliente sem cookies só para definir a senha; depois a pessoa entra normalmente pelo login.
export function ResetPasswordForm() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [invite, setInvite] = useState(false);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const isInvite = new URLSearchParams(window.location.search).has("convite");
      // tira o token do endereço para não ficar no histórico nem em compartilhamento de tela
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (cancelled) return;
      setInvite(isInvite);

      if (!accessToken || !refreshToken) return setPhase("invalid");
      const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
        auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { error: sessionError } = await c.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (cancelled) return;
      if (sessionError) return setPhase("invalid");
      setClient(c);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
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

  if (phase === "loading") return <p className="mt-10 text-[14px] text-slate-500">Verificando o link…</p>;

  if (phase === "invalid") {
    return (
      <div className="mt-10">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Link inválido ou expirado</h1>
        <p className="mt-1 text-[14px] text-slate-500">
          Peça ao administrador para enviar um novo link de {invite ? "convite" : "redefinição de senha"}.
        </p>
        <Link href="/login" className="mt-5 inline-block text-[13px] font-medium text-brand hover:underline">
          Ir para o login
        </Link>
      </div>
    );
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

  return (
    <form onSubmit={onSubmit} className="mt-10">
      <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{invite ? "Crie a sua senha" : "Defina a nova senha"}</h1>
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
