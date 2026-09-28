import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { loadOperationalSnapshot } from "@/lib/reports";
import { MagnitudeBars } from "@/components/reports/Bars";

export const metadata: Metadata = { title: "Torre de Controle" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  open: "Aberto",
  in_progress: "Em andamento",
  waiting: "Aguardando",
  blocked: "Bloqueado",
  completed: "Concluído",
  cancelled: "Cancelado",
  discarded: "Descartado",
  archived: "Arquivado",
};

// Documento 5 §34 — "onde está o gargalo?". Cada card é uma leitura do mesmo agregado que o
// Dashboard usa (loadOperationalSnapshot), para nunca existirem duas contagens diferentes.
export default async function TorreDeControlePage() {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const snap = await loadOperationalSnapshot(supabase, ctx.tenantId);

  const open = (snap.statusCounts.open ?? 0) + (snap.statusCounts.in_progress ?? 0) + (snap.statusCounts.waiting ?? 0);
  const blocked = snap.statusCounts.blocked ?? 0;
  const completed = snap.statusCounts.completed ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Torre de Controle</h1>
        <p className="mt-1 max-w-xl text-[14px] text-slate-500">Onde está o gargalo, agora — não uma foto de ontem.</p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total" value={snap.totalCycles} tone="neutral" />
          <Stat label="Em andamento" value={open} tone="brand" />
          <Stat label="Bloqueados" value={blocked} tone="danger" />
          <Stat label="Concluídos" value={completed} tone="ok" />
        </div>

        <section className="mt-8">
          <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <AlertTriangle className="size-3.5" /> Precisa de atenção agora
          </h2>
          {snap.blocked.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] text-emerald-700">
              <CheckCircle2 className="size-4" /> Nenhum ciclo bloqueado.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-rose-200 bg-white">
              {snap.blocked.map((b) => (
                <li key={b.cycleId} className="px-4 py-3">
                  <Link href={`/sinistros/${b.claimId}`} className="text-[13px] font-medium text-slate-900 hover:underline">
                    {b.claimNumber}
                  </Link>
                  <p className="mt-0.5 text-[12px] text-rose-700">{b.reason ?? "Motivo não registrado."}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <Clock3 className="size-3.5" /> Aging — mais tempo em aberto
          </h2>
          {snap.aging.length === 0 ? (
            <p className="text-[13px] text-slate-400">Nada em aberto no momento.</p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {snap.aging.map((a) => (
                <li key={a.cycleId} className="flex items-center justify-between px-4 py-2.5">
                  <Link href={`/sinistros/${a.claimId}`} className="text-[13px] text-slate-800 hover:underline">
                    {a.claimNumber}
                  </Link>
                  <span className="text-[12px] text-slate-500">
                    {STATUS_LABEL[a.status] ?? a.status} · {a.days === 0 ? "hoje" : `${a.days}d`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <ListChecks className="size-3.5" /> Backlog por grupo
          </h2>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <MagnitudeBars
              items={snap.backlogByGroup.map((g) => ({ label: g.groupName, count: g.count }))}
              emptyLabel="Nenhuma atividade em aberto."
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "brand" | "danger" | "ok" }) {
  const toneClass =
    tone === "danger"
      ? "text-rose-600"
      : tone === "ok"
        ? "text-emerald-600"
        : tone === "brand"
          ? "text-brand"
          : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className={`text-[22px] font-semibold ${toneClass}`}>{value}</dd>
    </div>
  );
}
