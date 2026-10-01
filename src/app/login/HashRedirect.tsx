"use client";

import { useEffect } from "react";

// Se o endereço do link do e-mail não estiver na lista de redirecionamentos do Supabase, ele devolve a pessoa para a
// página inicial (login) com o token no endereço. Aqui o token é encaminhado para a tela de definir a senha.
export function HashRedirect() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token=")) return;
    const type = new URLSearchParams(hash.replace(/^#/, "")).get("type");
    const invite = type !== "recovery";
    window.location.replace(`/redefinir-senha${invite ? "?convite=1" : ""}${hash}`);
  }, []);
  return null;
}
