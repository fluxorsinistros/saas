"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendResetMail } from "@/lib/auth-mail";

export type AuthState = { error?: string; info?: string } | undefined;

const MESSAGES: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos.",
  "Email not confirmed": "Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).",
  "User already registered": "Já existe uma conta com este e-mail.",
};

function translate(message: string) {
  if (message.toLowerCase().includes("password")) return "A senha precisa ter pelo menos 6 caracteres.";
  return MESSAGES[message] ?? message;
}

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: translate(error.message) };
  redirect("/fluxos");
}

// Autoatendimento: qualquer pessoa pode pedir, não precisa estar logada nem ser Administrador —
// é exatamente pra quando não tem Administrador por perto pra mandar pela tela de Usuários.
export async function requestPasswordReset(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Informe o e-mail." };
  const mailError = await sendResetMail(email);
  // Mesma mensagem dê certo ou não o e-mail existir — não confirma pra quem está tentando adivinhar contas.
  return mailError ? { error: mailError } : { info: `Se existir uma conta com ${email}, enviamos um código de 6 dígitos.` };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
