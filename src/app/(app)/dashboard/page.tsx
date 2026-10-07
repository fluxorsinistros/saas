import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, FolderOpen, Hourglass, Loader2, OctagonAlert, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { loadOperationalSnapshot, loadOperationalTrend } from "@/lib/reports";
import { getMemberGroups } from "@/lib/active-group";
import { MagnitudeBars } from "@/components/reports/Bars";
import { Sparkline } from "@/components/reports/Sparkline";

export const metadata: Metadata = { title: "Dashboard" };

// Documento 5 §61, diferença de propósito em relação à Torre de Controle (§6, "agir agora"):
// aqui é "entender tendência", mas lê o mesmo agregado (loadOperationalSnapshot) para as duas
// telas nunca divergirem em quantos sinistros estão atrasados.
export default async function DashboardPage() {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  // Administrador vê a empresa inteira; Operador, só o grupo em que está atuando.
  const { isAdmin, active } = await getMemberGroups(ctx.userId, ctx.tenantId);
  const scope = isAdmin ? undefined : { groupId: active?.id ?? null, subgroupId: active?.subgroup_id ?? null };
  const [snap, trend] = await Promise.all([loadOperationalSnapshot(supabase, ctx.tenantId, scope), loadOperationalTrend(supabase, ctx.tenantId, scope, 30)]);

  const open = (snap.statusCounts.open ?? 0) + (snap.statusCounts.in_progress ?? 0) + (snap.statusCounts.waiting ?? 0);
  const blocked = snap.statusCounts.blocked ?? 0;
  const completed = snap.statusCounts.completed ?? 0;
  const completionRate = snap.totalCycles > 0 ? Math.round((completed / snap.totalCycles) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-wide px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 max-w-xl text-[14px] text-slate-700">
          {isAdmin ? "Visão geral da empresa." : `Visão do seu grupo${active ? ` (${active.name})` : ""}.`} Para agir agora, use a{" "}
          <Link href="/torre-de-controle" className="text-brand hover:underline">
            Torre de Controle
          </Link>
          .
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card label="Total de sinistros" value={snap.totalCycles} icon={FolderOpen} tone="blue" series={trend?.total} />
          <Card label="Em andamento" value={open} icon={Loader2} tone="sky" series={trend?.open} />
          <Card label="Bloqueados" value={blocked} accent={blocked > 0 ? "text-rose-600" : undefined} icon={OctagonAlert} tone="rose" series={trend?.blocked} />
          <Card label="Taxa de conclusão" value={`${completionRate}%`} icon={CheckCircle2} tone="emerald" series={trend?.completed} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Card label="Atrasados (SLA)" value={snap.slaOverdueCount} accent={snap.slaOverdueCount > 0 ? "text-rose-600" : undefined} icon={Clock3} tone="rose" series={trend?.overdue} />
          <Card label="Próximos do prazo" value={snap.slaAtRiskCount} accent={snap.slaAtRiskCount > 0 ? "text-amber-600" : undefined} icon={Hourglass} tone="amber" series={trend?.atRisk} />
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <section className="glass-card p-5">
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-700">Sinistros por tipo</h2>
            <MagnitudeBars
              items={snap.byCategory.map((c) => ({ label: c.categoryName, count: c.count }))}
              emptyLabel="Nenhum sinistro formalizado ainda."
            />
          </section>

          <section className="glass-card p-5">
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Backlog por grupo</h2>
            <MagnitudeBars
              items={snap.backlogByGroup.map((g) => ({ label: g.groupName, count: g.count }))}
              emptyLabel="Nenhuma atividade em aberto."
            />
          </section>
        </div>

        {snap.blockedCount > 0 && (
          <section className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-rose-700">
              <AlertTriangle className="size-3.5" /> {snap.blockedCount} sinistro(s) bloqueado(s)
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

const TONES: Record<string, string> = {
  blue: "bg-blue-100/80 text-blue-700",
  sky: "bg-sky-100/80 text-sky-700",
  rose: "bg-rose-100/80 text-rose-700",
  emerald: "bg-emerald-100/80 text-emerald-700",
  amber: "bg-amber-100/80 text-amber-700",
};

const LINE: Record<string, string> = {
  blue: "text-blue-500",
  sky: "text-sky-500",
  rose: "text-rose-500",
  emerald: "text-emerald-500",
  amber: "text-amber-500",
};

// `series`: um valor por dia, pela data de abertura do sinistro (últimos 30 dias), sempre quantos dos abertos naquele dia
// estão hoje na situação do card.
function Card({ label, value, accent, icon: Icon, tone, series }: { label: string; value: number | string; accent?: string; icon: LucideIcon; tone: keyof typeof TONES; series?: number[] }) {
  const sum = series?.reduce((a, b) => a + b, 0) ?? 0;
  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <dt className="text-[12px] font-medium text-slate-700">{label}</dt>
          <dd className={`mt-1.5 text-[28px] font-semibold leading-none tracking-tight ${accent ?? "text-slate-900"}`}>{value}</dd>
        </div>
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${TONES[tone]}`} aria-hidden="true">
          <Icon className="size-5" />
        </span>
      </div>
      {series && series.length > 1 ? (
        <Sparkline
          values={series}
          id={label.replace(/\W+/g, "-")}
          className={`mt-2 block h-9 w-full ${LINE[tone]}`}
          summary={`Por data de abertura, últimos 30 dias: ${sum} sinistro(s) nesta situação`}
        />
      ) : (
        <div className="h-4" />
      )}
    </div>
  );
}
