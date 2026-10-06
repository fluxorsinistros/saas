import { Clock3 } from "lucide-react";
import { computeSla } from "@/lib/format";

// Selo "SLA da Etapa: 22% (restam 18h 43min)", verde no prazo, âmbar a partir de 75%, vermelho estourado.
export function StageSlaBadge({ enteredAt, slaMinutes }: { enteredAt: string | null | undefined; slaMinutes: number | undefined }) {
  const sla = computeSla(enteredAt, slaMinutes);
  if (!sla) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${
        sla.isBreached
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : sla.isAtRisk
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      <Clock3 className="size-3.5" />
      <span title="Prazo da etapa atual, contado desde que ela começou.">SLA da Etapa:</span> {sla.pct}% ({sla.formattedRemaining})
    </span>
  );
}
