import "server-only";
import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// E-mails de convite e de redefinição de senha (Supabase Auth), usados pela tela do Gestor e pela do Administrador.

export const EMAIL_LIMIT_MESSAGE =
  "O limite de e-mails do Supabase foi atingido (o envio padrão é bem baixo). Tente mais tarde ou configure um SMTP próprio (ex.: Resend) em Authentication → SMTP.";

export function emailError(message: string): string {
  return /rate limit/i.test(message) ? EMAIL_LIMIT_MESSAGE : message;
}

export async function siteOrigin(): Promise<string> {
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host")}`;
}

// Cliente sem cookies e SEM PKCE. O e-mail é aberto no navegador da pessoa, que não tem o "code verifier" de um
// fluxo PKCE iniciado aqui — por isso o link volta com o token no endereço (#access_token) e a página
// /redefinir-senha o usa.
export function implicitClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Envia o link de convite (cria a conta se ainda não existir). Devolve a mensagem de erro, ou null se deu certo. */
export async function sendInviteMail(email: string): Promise<string | null> {
  const origin = await siteOrigin();
  const { error } = await implicitClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${origin}/redefinir-senha?convite=1` },
  });
  return error ? emailError(error.message) : null;
}

/** Envia o link de redefinição de senha. Devolve a mensagem de erro, ou null se deu certo. */
export async function sendResetMail(email: string): Promise<string | null> {
  const origin = await siteOrigin();
  const { error } = await implicitClient().auth.resetPasswordForEmail(email, { redirectTo: `${origin}/redefinir-senha` });
  return error ? emailError(error.message) : null;
}
