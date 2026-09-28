"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/15";

export function LoginForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "in" ? signIn : signUp, undefined);

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
        {mode === "in" ? "Entrar" : "Criar conta"}
      </h1>
      <p className="mt-1 text-[14px] text-slate-500">
        {mode === "in" ? "Acesse sua conta para continuar." : "Leva menos de um minuto."}
      </p>

      <form action={action} className="mt-6 space-y-4" key={mode}>
        {mode === "up" && (
          <div>
            <label htmlFor="full_name" className="mb-1 block text-[13px] font-medium text-slate-700">
              Nome
            </label>
            <input id="full_name" name="full_name" required autoComplete="name" className={input} />
          </div>
        )}
        <div>
          <label htmlFor="email" className="mb-1 block text-[13px] font-medium text-slate-700">
            E-mail
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" className={input} />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-[13px] font-medium text-slate-700">
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            className={input}
          />
        </div>

        {state?.error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
            {state.error}
          </p>
        )}
        {state?.info && (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
            {state.info}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand px-4 py-2.5 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
        >
          {pending ? "Aguarde…" : mode === "in" ? "Entrar" : "Criar conta"}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-slate-500">
        {mode === "in" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
        <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="font-medium text-brand hover:underline">
          {mode === "in" ? "Criar conta" : "Entrar"}
        </button>
      </p>
    </div>
  );
}
