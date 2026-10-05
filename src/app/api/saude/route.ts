import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Verificação de saúde: faz uma consulta mínima ao banco. É chamada de tempos em tempos pela automação do GitHub
// (.github/workflows/supabase-keepalive.yml) para o projeto Supabase gratuito não ser pausado por inatividade.
// Pública de propósito e sem dado nenhum: só diz se o banco respondeu.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("platform_settings").select("id").limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
