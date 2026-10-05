// Foto da pessoa; sem foto, círculo colorido com as iniciais. A cor sai do nome, então a mesma pessoa tem sempre a mesma cor.
const TONES = [
  "bg-blue-100 text-blue-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-teal-100 text-teal-800",
  "bg-orange-100 text-orange-800",
  "bg-sky-100 text-sky-800",
];

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function toneOf(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function Avatar({
  name,
  url,
  className = "size-6",
  textClassName = "text-[10px]",
}: {
  name: string;
  url?: string | null;
  className?: string;
  textClassName?: string;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className={`${className} shrink-0 rounded-full object-cover`} />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${className} ${textClassName} inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${toneOf(name || "?")}`}
    >
      {initialsOf(name)}
    </span>
  );
}
