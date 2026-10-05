"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

// A foto é só da própria pessoa: o caminho precisa estar na pasta dela e o arquivo precisa existir no Storage.
export async function saveAvatar(path: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre de novo." };
  if (!path.startsWith(`${user.id}/`) || path.includes("..") || !/\.(webp|jpe?g|png)$/i.test(path)) {
    return { ok: false, error: "Arquivo de foto inválido." };
  }

  const folder = user.id;
  const name = path.slice(folder.length + 1);
  const { data: found } = await supabase.storage.from("avatars").list(folder, { search: name, limit: 5 });
  if (!found?.some((o) => o.name === name)) return { ok: false, error: "A foto não chegou ao armazenamento. Tente de novo." };

  const { data: current } = await supabase.from("user_profiles").select("avatar_path").eq("id", user.id).maybeSingle();
  const { error } = await supabase.from("user_profiles").update({ avatar_path: path }).eq("id", user.id);
  if (error) return { ok: false, error: "Não foi possível salvar a foto." };

  if (current?.avatar_path && current.avatar_path !== path) await supabase.storage.from("avatars").remove([current.avatar_path]);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeAvatar(): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre de novo." };
  const { data: current } = await supabase.from("user_profiles").select("avatar_path").eq("id", user.id).maybeSingle();
  const { error } = await supabase.from("user_profiles").update({ avatar_path: null }).eq("id", user.id);
  if (error) return { ok: false, error: "Não foi possível remover a foto." };
  if (current?.avatar_path) await supabase.storage.from("avatars").remove([current.avatar_path]);
  revalidatePath("/", "layout");
  return { ok: true };
}
