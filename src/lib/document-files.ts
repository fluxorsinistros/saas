// Tipos de arquivo aceitos como documento do sinistro. Vídeo, executáveis, compactados (ZIP/RAR) e
// tipos desconhecidos ficam de fora de propósito.
export const MB = 1024 * 1024;
// Teto absoluto, acima de qualquer plano ou personalização (é também o limite do bucket "documents").
export const HARD_MAX_BYTES = 50 * MB;

export const DOC_MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
};

export const ACCEPT_ATTR = Object.keys(DOC_MIME_BY_EXT)
  .map((e) => `.${e}`)
  .join(",");

export function extOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i < 0 ? "" : fileName.slice(i + 1).toLowerCase();
}

export function mimeForFile(fileName: string): string | null {
  return DOC_MIME_BY_EXT[extOf(fileName)] ?? null;
}

/** Nome seguro para o caminho no Storage (sem acento, espaço ou símbolo). */
export function safeFileName(fileName: string): string {
  const ext = extOf(fileName);
  const base = (ext ? fileName.slice(0, -(ext.length + 1)) : fileName)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return `${base || "arquivo"}${ext ? `.${ext}` : ""}`;
}

export const formatMb = (bytes: number) => `${(bytes / MB).toFixed(bytes >= 10 * MB ? 0 : 1).replace(".", ",")} MB`;
