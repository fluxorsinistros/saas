"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { ACCEPT_ATTR, formatMb, mimeForFile } from "@/lib/document-files";
import { finalizeDocumentUpload, prepareDocumentUpload } from "@/app/(app)/sinistros/documents-actions";

type Props = {
  claimId: string;
  claimCycleId: string;
  /** Presente = nova versão de um documento já solicitado; ausente = documento avulso (pede o nome). */
  documentId?: string;
  hint?: string;
  variant: "version" | "standalone";
};

const input =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

// Fluxo: compacta a foto no navegador → servidor confere os limites do plano e libera o envio → o arquivo
// sobe direto para o Storage → servidor confere o tamanho real e registra a versão.
export function DocumentUploadForm({ claimId, claimCycleId, documentId, hint, variant }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<{ tone: "info" | "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const chosen = form.get("file");
    const typeName = String(form.get("type_name") ?? "").trim();
    if (!(chosen instanceof File) || chosen.size === 0) return setStatus({ tone: "error", text: "Escolha um arquivo." });
    if (!documentId && !typeName) return setStatus({ tone: "error", text: "Informe o nome do documento." });
    if (!mimeForFile(chosen.name)) {
      return setStatus({ tone: "error", text: "Tipo não aceito. Use foto (JPG, PNG, WEBP), PDF, Word, Excel, CSV ou TXT." });
    }

    setBusy(true);
    try {
      setStatus({ tone: "info", text: "Preparando…" });
      const file = await compressImage(chosen);

      const prep = await prepareDocumentUpload({
        claimId,
        claimCycleId,
        documentId,
        fileName: file.name,
        size: file.size,
      });
      if (!prep.ok) return setStatus({ tone: "error", text: prep.error });

      setStatus({ tone: "info", text: "Enviando…" });
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from("documents")
        .uploadToSignedUrl(prep.path, prep.token, file, { contentType: prep.mime });
      if (upErr) return setStatus({ tone: "error", text: `Falha no envio: ${upErr.message}` });

      const done = await finalizeDocumentUpload({
        claimId,
        claimCycleId,
        documentId: prep.documentId,
        isNew: prep.isNew,
        typeName,
        path: prep.path,
        fileName: file.name,
      });
      if (!done.ok) return setStatus({ tone: "error", text: done.error });

      const shrunk = file.size < chosen.size ? ` (compactado de ${formatMb(chosen.size)} para ${formatMb(file.size)})` : "";
      const extra = done.overageBytes > 0 ? ` — ${formatMb(done.overageBytes)} acima da franquia do plano, cobrados como excedente` : "";
      setStatus({ tone: "ok", text: `Enviado${shrunk}${extra}` });
      formRef.current?.reset();
      router.refresh();
    } catch (err) {
      setStatus({ tone: "error", text: err instanceof Error ? err.message : "Não foi possível enviar o arquivo." });
    } finally {
      setBusy(false);
    }
  }

  const statusColor = status?.tone === "error" ? "text-rose-700" : status?.tone === "ok" ? "text-emerald-700" : "text-slate-500";

  if (variant === "version") {
    return (
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`file-${documentId}`}>
          Enviar nova versão
        </label>
        <input id={`file-${documentId}`} name="file" type="file" accept={ACCEPT_ATTR} required className="text-[12px]" />
        <button
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          <Upload className="size-3" /> {busy ? "Enviando…" : "Enviar"}
        </button>
        {status && <span className={`text-[12px] ${statusColor}`}>{status.text}</span>}
        {hint && !status && <span className="text-[11px] text-slate-400">{hint}</span>}
      </form>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="rounded-xl border border-dashed border-slate-300 bg-white p-3">
      <p className="mb-2 text-[12px] font-medium text-slate-600">Enviar documento avulso</p>
      <input name="type_name" required placeholder="Ex.: Nota fiscal" className={`${input} mb-1.5`} />
      <input name="file" type="file" accept={ACCEPT_ATTR} required className="mb-2 w-full text-[12px]" />
      <button disabled={busy} className="w-full rounded-lg bg-brand py-1.5 text-[12px] font-medium text-white hover:bg-brand-600 disabled:opacity-60">
        {busy ? "Enviando…" : "Enviar"}
      </button>
      {status ? (
        <p className={`mt-1.5 text-[12px] ${statusColor}`}>{status.text}</p>
      ) : (
        hint && <p className="mt-1.5 text-[11px] text-slate-400">{hint}</p>
      )}
    </form>
  );
}
