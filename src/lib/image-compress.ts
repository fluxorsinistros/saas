// Compactação de fotos no navegador, antes do upload. Só JPG/PNG/WEBP; PDF, Word e Excel seguem como vieram.
// Reduz para no máximo 2560 px no lado maior e recodifica a ~80% de qualidade. Se o resultado não ficar
// menor que o original, mantém o original.
const MAX_SIDE = 2560;
const QUALITY = 0.8;
const SKIP_BELOW_BYTES = 300 * 1024; // já é pequeno: não vale reprocessar

const COMPRESSIBLE = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function compressImage(file: File): Promise<File> {
  if (!COMPRESSIBLE.has(file.type) || file.size < SKIP_BELOW_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, { type: file.type, lastModified: file.lastModified });
  } catch {
    return file; // navegador sem suporte ou imagem estranha: envia como está
  }
}
