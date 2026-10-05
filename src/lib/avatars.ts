import "server-only";
import { createClient } from "@/lib/supabase/server";

// Links temporários (1 hora) das fotos, gerados com o login de quem está vendo: só funcionam para quem a regra do
// Storage deixa ler (a própria pessoa e quem divide empresa com ela). Uma chamada só para qualquer quantidade de fotos.
export async function signedAvatarUrls(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("avatars").createSignedUrls(unique, 3600);
  for (const s of data ?? []) if (s.path && s.signedUrl) out.set(s.path, s.signedUrl);
  return out;
}
