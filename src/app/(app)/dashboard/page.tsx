import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { loadOperationalSnapshot } from "@/lib/reports";
import { getMemberGroups } from "@/lib/active-group";
import { MagnitudeBars } from "@/components/reports/Bars";

export const metadata: Metadata = { title: "Dashboard" };

// Documento 5 §61 — diferença de propósito em relação à Torre de Controle (§6, "agir agora"):
// aqui é "entender tendência", mas lê o mesmo agregado (loadOperationalSnapshot) para as duas
// telas nunca divergirem em quantos sinistros estão atrasados.
export default async function DashboardPage() {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  // Administrador vê a empresa inteira; Operador, só o grupo em que está atuando.
  const { isAdmin, active } = await getMemberGroups(ctx.userId, ctx.tenantId);
  const snap = await loadOperationalSnapshot(supabase, ctx.tenantId, isAdmin ? undefined : { groupId: active?.id ?? null });

  const open = (snap.statusCounts.open ?? 0) + (snap.statusCounts.in_progress ?? 0) + (snap.statusCounts.waiting ?? 0);
  const blocked = snap.statusCounts.blocked ?? 0;
  const completed = snap.statusCounts.completed ?? 0;
  const completionRate = snap.totalCycles > 0 ? Math.round((completed / snap.totalCycles) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-wide px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 max-w-xl text-[14px] text-slate-500">
          {isAdmin ? "Visão geral da empresa." : `Visão do seu grupo${active ? ` (${active.name})` : ""}.`} Para agir agora, use a{" "}
          <Link href="/torre-de-controle" className="text-brand hover:underline">
            Torre de Controle
          </Link>
          .
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card label="Total de sinistros" value={snap.totalCycles} />
          <Card label="Em andamento" value={open} />
          <Card label="Bloqueados" value={blocked} accent={blocked > 0 ? "text-rose-600" : undefined} />
          <Card label="Taxa de conclusão" value={`${completionRate}%`} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Card label="Atrasados (SLA)" value={snap.slaOverdue.length} accent={snap.slaOverdue.length > 0 ? "text-rose-600" : undefined} />
          <Card label="Próximos do prazo" value={snap.slaAtRisk.length} accent={snap.slaAtRisk.length > 0 ? "text-amber-600" : undefined} />
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Sinistros por tipo</h2>
            <MagnitudeBars
              items={snap.byCategory.map((c) => ({ label: c.categoryName, count: c.count }))}
              emptyLabel="Nenhum sinistro formalizado ainda."
            />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Backlog por grupo</h2>
            <MagnitudeBars
              items={snap.backlogByGroup.map((g) => ({ label: g.groupName, count: g.count }))}
              emptyLabel="Nenhuma atividade em aberto."
            />
          </section>
        </div>

        {snap.blocked.length > 0 && (
          <section className="mt-8 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-rose-700">
              <AlertTriangle className="size-3.5" /> {snap.blocked.length} sinistro(s) bloqueado(s)
            </h2>
            <ul className="space-y-1">
              {snap.blocked.slice(0, 5).map((b) => (
                <li key={b.cycleId}>
                  <Link href={`/sinistros/${b.claimId}`} className="text-[13px] text-rose-800 hover:underline">
                    {b.claimNumber}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-[22px] font-semibold ${accent ?? "text-slate-900"}`}>{value}</dd>
    </div>
  );
}
