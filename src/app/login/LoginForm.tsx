"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { signIn, type AuthState } from "./actions";

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/15";

// Sem autocadastro aqui: toda empresa nova entra pela Administração da plataforma (Documento 1
// §56) — quem já faz parte de uma empresa só pode chegar aqui por convite. "Criar conta" existia
// antes como autocadastro público, mas isso deixava qualquer e-mail criar uma empresa nova sozinho.
export function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Entrar</h1>
      <p className="mt-1 text-[14px] text-slate-500">Acesse sua conta para continuar.</p>

      <form action={action} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-[13px] font-medium text-slate-700">
            E-mail
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" className={input} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="mb-1 block text-[13px] font-medium text-slate-700">
              Senha
            </label>
            <Link href="/esqueci-senha" className="mb-1 text-[12px] font-medium text-brand hover:underline">
              Esqueci minha senha
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              autoComplete="current-password"
              className={`${input} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:text-slate-600 focus:outline-none"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
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
          {pending ? "Aguarde…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
