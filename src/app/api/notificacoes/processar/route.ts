import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { buildEmail, NOTIFICATION_FROM, type DeliveryItem } from "@/lib/notifications";

// Chamada de tempos em tempos pelo próprio banco (pg_cron + pg_net). Fluxo: o banco detecta SLA e prepara as entregas
// (notif_tick), esta rota busca as pendentes, envia pelo Resend e devolve o resultado de cada uma (notif_mark).
// Pública no proxy, mas só funciona com o segredo certo no cabeçalho: quem confere é o banco (notif_check), que rejeita
// qualquer outro valor. A chave do Resend fica só aqui, no servidor.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const APP_URL = (process.env.APP_URL ?? "https://fluxor.elsem.com.br").replace(/\/$/, "");

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-notif-secret") ?? "";
  const resendKey = process.env.RESEND_API_KEY;
  if (!secret) return NextResponse.json({ ok: false }, { status: 401 });
  if (!resendKey) return NextResponse.json({ ok: false, error: "RESEND_API_KEY ausente" }, { status: 503 });

  const db = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tick = await db.rpc("notif_tick", { p_secret: secret });
  if (tick.error) return NextResponse.json({ ok: false }, { status: tick.error.message.includes("acesso negado") ? 401 : 500 });

  const batch = await db.rpc("notif_next_batch", { p_secret: secret, p_limit: 25 });
  if (batch.error) return NextResponse.json({ ok: false }, { status: 500 });
  const items = (batch.data ?? []) as unknown as DeliveryItem[];

  let sent = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const mail = buildEmail(item, APP_URL);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": item.id },
        body: JSON.stringify({ from: NOTIFICATION_FROM, to: [item.email], subject: mail.subject, html: mail.html, text: mail.text }),
      });
      if (res.ok) {
        await db.rpc("notif_mark", { p_secret: secret, p_id: item.id, p_ok: true });
        sent++;
      } else {
        const body = await res.text().catch(() => "");
        await db.rpc("notif_mark", { p_secret: secret, p_id: item.id, p_ok: false, p_error: `Resend ${res.status}: ${body}` });
        failed++;
      }
    } catch (e) {
      await db.rpc("notif_mark", { p_secret: secret, p_id: item.id, p_ok: false, p_error: e instanceof Error ? e.message : "erro" });
      failed++;
    }
  }
  return NextResponse.json({ ok: true, sent, failed }, { headers: { "Cache-Control": "no-store" } });
}
