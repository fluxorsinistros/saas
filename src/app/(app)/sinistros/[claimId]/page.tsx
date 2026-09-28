import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { loadGraph } from "@/lib/workflow/load-graph";
import { NODE_META, type NodeType } from "@/lib/workflow/types";
import { chooseDecision, completeActivity } from "../actions";

export const metadata: Metadata = { title: "Sinistro" };

const CYCLE_STATUS_LABEL: Record<string, string> = {
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

const AUDIT_LABEL: Record<string, string> = {
  "claim.created": "Sinistro criado",
  "cycle.created": "Ciclo aberto",
  "cycle.blocked": "Ciclo bloqueado",
  "stage.entered": "Etapa iniciada",
  "activity.completed": "Atividade concluída",
  "decision.made": "Decisão registrada",
};

export default async function ClaimPage({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params;
  const ctx = await getTenantContext();
  const supabase = await createClient();

  const { data: claim } = await supabase
    .from("claims")
    .select("id, claim_number, status, occurred_at, created_at")
    .eq("id", claimId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!claim) notFound();

  const { data: cycle } = await supabase
    .from("claim_cycles")
    .select("id, status, workflow_version_id, formalized_at, completed_at")
    .eq("claim_id", claim.id)
    .order("cycle_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cycle) notFound();

  const { data: version } = await supabase
    .from("workflow_versions")
    .select("workflow_id, version_number")
    .eq("id", cycle.workflow_version_id)
    .single();
  const { data: workflow } = await supabase.from("workflows").select("name").eq("id", version!.workflow_id).single();

  const graph = await loadGraph(supabase, cycle.workflow_version_id);
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  const { data: stages } = await supabase
    .from("stage_instances")
    .select("id, node_id, pass_number, status, entered_at, exited_at")
    .eq("claim_cycle_id", cycle.id)
    .order("entered_at", { ascending: false });
  const stageIds = (stages ?? []).map((s) => s.id);

  const [{ data: activities }, { data: decisions }, { data: groups }] = await Promise.all([
    stageIds.length
      ? supabase
          .from("activity_instances")
          .select("id, stage_instance_id, status, group_id, started_at, completed_at")
          .in("stage_instance_id", stageIds)
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("decisions").select("id, stage_instance_id, question, options, selected_option, decided_at").eq("claim_cycle_id", cycle.id),
    supabase.from("groups").select("id, name").eq("tenant_id", ctx.tenantId),
  ]);

  const activityByStage = new Map((activities ?? []).map((a) => [a.stage_instance_id, a]));
  const decisionByStage = new Map((decisions ?? []).filter((d) => d.stage_instance_id).map((d) => [d.stage_instance_id as string, d]));
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));

  const entityIds = [
    cycle.id,
    ...stageIds,
    ...(activities ?? []).map((a) => a.id),
    ...(decisions ?? []).map((d) => d.id),
  ];
  const { data: auditLogs } = await supabase
    .from("audit_logs")
    .select("id, action, reason, created_at")
    .in("entity_id", entityIds)
    .order("created_at", { ascending: false })
    .limit(50);

  const blockedReason = auditLogs?.find((a) => a.action === "cycle.blocked")?.reason;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-8">
        <Link href="/sinistros" className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> Sinistros
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{claim.claim_number}</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {workflow?.name} · v{version?.version_number}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
              cycle.status === "blocked"
                ? "bg-rose-50 text-rose-700 ring-rose-200"
                : cycle.status === "completed"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-sky-50 text-sky-700 ring-sky-200"
            }`}
          >
            {CYCLE_STATUS_LABEL[cycle.status] ?? cycle.status}
          </span>
        </div>

        {cycle.status === "blocked" && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Este ciclo está bloqueado.</p>
              <p className="mt-0.5">{blockedReason ?? "Motivo não registrado."}</p>
            </div>
          </div>
        )}

        <section className="mt-6">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Execução</h2>
          <ol className="space-y-3">
            {(stages ?? []).map((stage) => {
              const node = nodeById.get(stage.node_id);
              const type = (node?.type ?? "stage") as NodeType;
              const activity = activityByStage.get(stage.id);
              const decision = decisionByStage.get(stage.id);
              return (
                <li key={stage.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                        {NODE_META[type]?.label ?? type}
                        {stage.pass_number > 1 && ` · ${stage.pass_number}ª passagem`}
                      </span>
                      <h3 className="text-[14px] font-medium text-slate-900">{node?.name ?? "—"}</h3>
                    </div>
                    <StageBadge status={stage.status} />
                  </div>

                  {activity && type !== "end" && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <span className="text-[12px] text-slate-500">
                        Grupo: <span className="font-medium text-slate-700">{groupName.get(activity.group_id ?? "") ?? "—"}</span>
                      </span>
                      {activity.status === "in_progress" ? (
                        <form action={completeActivity.bind(null, activity.id)}>
                          <button className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition hover:bg-brand-600">
                            Concluir
                          </button>
                        </form>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] text-emerald-700">
                          <CheckCircle2 className="size-3.5" /> Concluída
                        </span>
                      )}
                    </div>
                  )}

                  {decision && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <p className="text-[13px] text-slate-700">{decision.question}</p>
                      {decision.selected_option ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-emerald-700">
                          <CheckCircle2 className="size-3.5" /> Escolhido: {decision.selected_option}
                        </p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {((decision.options as string[]) ?? []).map((opt) => (
                            <form key={opt} action={chooseDecision.bind(null, decision.id, opt, "")}>
                              <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-700 transition hover:border-brand/40 hover:bg-brand/[0.03]">
                                {opt}
                              </button>
                            </form>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <section className="mt-8">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Histórico</h2>
          <ul className="space-y-1.5 border-l border-slate-200 pl-4">
            {(auditLogs ?? []).map((log) => (
              <li key={log.id} className="relative text-[12px] text-slate-600">
                <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-slate-300" />
                <span className="font-medium text-slate-800">{AUDIT_LABEL[log.action] ?? log.action}</span>
                {log.reason && <span className="text-rose-700"> — {log.reason}</span>}
                <span className="ml-1.5 inline-flex items-center gap-1 text-slate-400">
                  <Clock3 className="size-3" /> {new Date(log.created_at).toLocaleString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function StageBadge({ status }: { status: string }) {
  const style =
    status === "completed"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "in_progress"
        ? "bg-sky-50 text-sky-700 ring-sky-200"
        : "bg-slate-100 text-slate-600 ring-slate-200";
  const label = status === "completed" ? "Concluída" : status === "in_progress" ? "Em andamento" : status;
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${style}`}>{label}</span>;
}
