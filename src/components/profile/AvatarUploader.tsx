"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { removeAvatar, saveAvatar } from "@/app/(app)/perfil/actions";
import { Avatar } from "@/components/Avatar";

const SIZE = 256;
const ACCEPT = "image/png,image/jpeg,image/webp";

// Recorta o centro em quadrado, reduz para 256x256 e grava em WEBP: a foto sai pequena (poucos KB) e já em formato
// seguro, não importa o que a pessoa escolheu. Nunca aceita SVG.
async function toSquareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não conseguiu preparar a foto.");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (!blob) throw new Error("Não foi possível preparar a foto.");
  return blob;
}

export function AvatarUploader({ userId, name, url }: { userId: string; name: string; url: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) return setMessage({ tone: "error", text: "Use uma foto PNG, JPG ou WEBP." });
    setBusy(true);
    setMessage(null);
    try {
      const blob = await toSquareWebp(file);
      const path = `${userId}/avatar-${Date.now()}.webp`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/webp", upsert: false });
      if (error) throw new Error("Não foi possível enviar a foto.");
      const res = await saveAvatar(path);
      if (!res.ok) throw new Error(res.error);
      setMessage({ tone: "ok", text: "Foto atualizada." });
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Não foi possível atualizar a foto." });
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    setMessage(null);
    const res = await removeAvatar();
    setBusy(false);
    if (!res.ok) return setMessage({ tone: "error", text: res.error });
    setMessage({ tone: "ok", text: "Foto removida." });
    router.refresh();
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} url={url} className="size-20" textClassName="text-2xl" />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            <Camera className="size-3.5" /> {url ? "Trocar foto" : "Adicionar foto"}
          </button>
          {url && (
            <button
              type="button"
              disabled={busy}
              onClick={onRemove}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <Trash2 className="size-3.5" /> Remover
            </button>
          )}
        </div>
        <input ref={inputRef} type="file" accept={ACCEPT} onChange={onPick} className="hidden" />
        <p className="text-xs text-slate-500">PNG, JPG ou WEBP. A foto é recortada em quadrado e reduzida automaticamente.</p>
        {message && <p className={`text-[12px] ${message.tone === "ok" ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>}
      </div>
    </div>
  );
}
