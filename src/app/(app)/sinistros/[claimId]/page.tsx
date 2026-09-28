import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Download, FileText, PauseCircle, PlayCircle, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { loadGraph } from "@/lib/workflow/load-graph";
import { NODE_META, type NodeType } from "@/lib/workflow/types";
import { computeLiveSlaStatus, formatMinutesRemaining } from "@/lib/sla";
import { chooseDecision, completeActivity, discardCycle, pauseSla, reopenCycle, resumeSla } from "../actions";
import { requestDocument, reviewDocument, uploadDocumentVersion } from "../documents-actions";

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
  "cycle.reopened": "Ciclo reaberto",
  "cycle.discarded": "Ciclo descartado",
  "stage.entered": "Etapa iniciada",
  "activity.completed": "Atividade concluída",
  "decision.made": "Decisão registrada",
  "document.requested": "Documento solicitado",
  "document.received": "Documento recebido",
  "document.validated": "Documento validado",
  "document.rejected": "Documento rejeitado",
  "sla.paused": "Prazo pausado",
  "sla.resumed": "Prazo retomado",
};

const SLA_STATUS_STYLE: Record<string, string> = {
  on_track: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  at_risk: "bg-amber-50 text-amber-700 ring-amber-200",
  breached: "bg-rose-50 text-rose-700 ring-rose-200",
  paused: "bg-slate-100 text-slate-600 ring-slate-200",
  completed: "bg-slate-100 text-slate-500 ring-slate-200",
};

const SLA_STATUS_LABEL: Record<string, string> = {
  on_track: "No prazo",
  at_risk: "Perto do prazo",
  breached: "Atrasado",
  paused: "Pausado",
  completed: "Encerrado",
};

const DOC_STATUS_LABEL: Record<string, string> = {
  requested: "Solicitado",
  received: "Recebido",
  in_validation: "Em validação",
  validated: "Validado",
  rejected: "Rejeitado",
  substituted: "Substituído",
};

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ claimId: string }>;
  searchParams: Promise<{ ciclo?: string }>;
}) {
  const { claimId } = await params;
  const { ciclo } = await searchParams;
  const ctx = await getTenantContext();
  const supabase = await createClient();

  const { data: claim } = await supabase
    .from("claims")
    .select("id, claim_number, status, occurred_at, created_at")
    .eq("id", claimId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!claim) notFound();

  const { data: allCycles } = await supabase
    .from("claim_cycles")
    .select("id, status, cycle_number, workflow_version_id, formalized_at, completed_at")
    .eq("claim_id", claim.id)
    .order("cycle_number", { ascending: false });
  if (!allCycles?.length) notFound();
  const cycle = (ciclo ? allCycles.find((c) => c.id === ciclo) : null) ?? allCycles[0];

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

  // SLA (Documento 4): relógio por etapa, status calculado ao vivo (sem esperar o scheduler
  // periódico do §7, ainda não implementado). Pausa em aberto (sla_pauses.resumed_at is null)
  // decide se mostramos "Retomar" em vez de "Pausar".
  const { data: slaTracking } = stageIds.length
    ? await supabase
        .from("sla_tracking")
        .select("id, stage_instance_id, status, started_at, target_at, workflow_slas(alert_thresholds)")
        .in("stage_instance_id", stageIds)
    : { data: [] as never[] };
  const slaByStage = new Map((slaTracking ?? []).map((s) => [s.stage_instance_id, s]));
  const trackingIds = (slaTracking ?? []).map((s) => s.id);
  const { data: openPauses } = trackingIds.length
    ? await supabase.from("sla_pauses").select("sla_tracking_id").in("sla_tracking_id", trackingIds).is("resumed_at", null)
    : { data: [] as { sla_tracking_id: string }[] };
  const pausedTrackingIds = new Set((openPauses ?? []).map((p) => p.sla_tracking_id));

  const { data: documents } = await supabase
    .from("documents")
    .select("id, status, is_required, document_type_id, requested_at")
    .eq("claim_cycle_id", cycle.id)
    .order("requested_at", { ascending: true, nullsFirst: false });
  const docIds = (documents ?? []).map((d) => d.id);

  const { data: docTypes } = await supabase.from("document_types").select("id, name").eq("tenant_id", ctx.tenantId);
  const docTypeName = new Map((docTypes ?? []).map((t) => [t.id, t.name]));

  const { data: docVersions } = docIds.length
    ? await supabase
        .from("document_versions")
        .select("id, document_id, version_number, file_name, size_bytes, storage_path, uploaded_at, validated_at, rejection_reason")
        .in("document_id", docIds)
        .order("version_number", { ascending: false })
    : { data: [] as { id: string; document_id: string; version_number: number; file_name: string; size_bytes: number; storage_path: string; uploaded_at: string; validated_at: string | null; rejection_reason: string | null }[] };
  const versionsByDoc = new Map<string, typeof docVersions>();
  for (const v of docVersions ?? []) {
    versionsByDoc.set(v.document_id, [...(versionsByDoc.get(v.document_id) ?? []), v]);
  }

  const allPaths = (docVersions ?? []).map((v) => v.storage_path);
  const { data: signedUrls } = allPaths.length
    ? await supabase.storage.from("documents").createSignedUrls(allPaths, 300)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const urlByPath = new Map((signedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  const entityIds = [
    cycle.id,
    ...stageIds,
    ...(activities ?? []).map((a) => a.id),
    ...(decisions ?? []).map((d) => d.id),
    ...docIds,
    ...trackingIds,
  ];
  const { data: auditLogs } = await supabase
    .from("audit_logs")
    .select("id, action, reason, created_at")
    .in("entity_id", entityIds)
    .order("created_at", { ascending: false })
    .limit(50);

  const blockedReason = auditLogs?.find((a) => a.action === "cycle.blocked")?.reason;

  // Convergências (Documento 3 §5): mostra "aguardando N de M" enquanto o join não libera — sem
  // isso o usuário vê uma etapa "Convergência" concluída na trilha sem entender por que o processo
  // não seguiu ainda para o próximo passo.
  const { data: joins } = await supabase
    .from("joins")
    .select("id, node_id, branch_id, rule_type, min_count, status")
    .eq("claim_cycle_id", cycle.id)
    .eq("status", "waiting");
  const branchIds = (joins ?? []).map((j) => j.branch_id).filter((b): b is string => !!b);
  const { data: branchInstances } = branchIds.length
    ? await supabase.from("branch_instances").select("branch_id, status, is_required, target_node_id").in("branch_id", branchIds)
    : { data: [] as { branch_id: string; status: string; is_required: boolean; target_node_id: string }[] };
  const joinProgressByNode = new Map<
    string,
    { completed: number; total: number; ruleLabel: string; branches: { name: string; done: boolean }[] }
  >();
  for (const j of joins ?? []) {
    const siblings = (branchInstances ?? []).filter((b) => b.branch_id === j.branch_id);
    const relevant = j.rule_type === "all_required" ? siblings.filter((b) => b.is_required) : siblings;
    const completed = relevant.filter((b) => b.status === "completed").length;
    const ruleLabel =
      j.rule_type === "any" ? "qualquer um" : j.rule_type === "all" ? "todos" : j.rule_type === "min_count" ? `mín. ${j.min_count}` : "obrigatórios";
    joinProgressByNode.set(j.node_id, {
      completed,
      total: j.rule_type === "min_count" ? (j.min_count ?? relevant.length) : relevant.length,
      ruleLabel,
      branches: siblings.map((b) => ({ name: nodeById.get(b.target_node_id)?.name ?? "—", done: b.status === "completed" })),
    });
  }

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
          {allCycles.length > 1 && (
            <div className="flex items-center gap-1">
              {allCycles.map((c) => (
                <Link
                  key={c.id}
                  href={c.id === allCycles[0].id ? `/sinistros/${claim.id}` : `/sinistros/${claim.id}?ciclo=${c.id}`}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                    c.id === cycle.id ? "bg-brand text-white ring-brand" : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Ciclo {c.cycle_number}
                </Link>
              ))}
            </div>
          )}
        </div>

        {cycle.status === "completed" && cycle.id === allCycles[0].id && (
          <details className="mt-3 group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-slate-700">
              Reabrir este ciclo
            </summary>
            <form
              action={reopenCycle.bind(null, cycle.id)}
              className="mt-2 flex max-w-md items-start gap-2 rounded-lg border border-slate-200 bg-white p-3"
            >
              <input name="reason" required placeholder="Motivo da reabertura" className={`${input} text-[12px]`} />
              <button className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-600">
                Reabrir
              </button>
            </form>
          </details>
        )}

        {cycle.status !== "completed" && cycle.status !== "discarded" && cycle.id === allCycles[0].id && (
          <details className="mt-3 group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] font-medium text-rose-600 hover:text-rose-700">
              Descartar e reiniciar este ciclo
            </summary>
            <form
              action={discardCycle.bind(null, cycle.id)}
              className="mt-2 flex max-w-md items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3"
            >
              <input name="reason" required placeholder="Motivo do descarte" className={`${input} text-[12px]`} />
              <button className="shrink-0 rounded-md bg-rose-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-rose-700">
                Descartar e abrir novo ciclo
              </button>
            </form>
          </details>
        )}

        {cycle.status === "discarded" && (
          <p className="mt-3 text-[12px] text-slate-500">Ciclo descartado — motivo registrado no histórico abaixo.</p>
        )}

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
              const joinProgress = type === "join" ? joinProgressByNode.get(stage.node_id) : undefined;
              const tracking = slaByStage.get(stage.id);
              const isPaused = tracking ? pausedTrackingIds.has(tracking.id) : false;
              const liveSla = tracking
                ? computeLiveSlaStatus(
                    { status: isPaused ? "paused" : tracking.status, started_at: tracking.started_at, target_at: tracking.target_at },
                    (tracking.workflow_slas as unknown as { alert_thresholds: number[] } | null)?.alert_thresholds ?? undefined,
                  )
                : null;
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
                    <div className="flex items-center gap-1.5">
                      {liveSla && liveSla.status !== "completed" && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${SLA_STATUS_STYLE[liveSla.status]}`}
                          title={tracking ? formatMinutesRemaining(tracking.target_at) : undefined}
                        >
                          {SLA_STATUS_LABEL[liveSla.status]}
                        </span>
                      )}
                      <StageBadge status={stage.status} />
                    </div>
                  </div>

                  {liveSla && liveSla.status !== "completed" && tracking && (
                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                      <span className="text-[12px] text-slate-500">
                        {isPaused ? "Prazo pausado" : formatMinutesRemaining(tracking.target_at)}
                      </span>
                      {cycle.status === "discarded" ? null : isPaused ? (
                        <form action={resumeSla.bind(null, tracking.id, claim.id)}>
                          <button className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                            <PlayCircle className="size-3.5" /> Retomar prazo
                          </button>
                        </form>
                      ) : (
                        <details className="relative">
                          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                            <PauseCircle className="size-3.5" /> Pausar prazo
                          </summary>
                          <form
                            action={pauseSla.bind(null, tracking.id)}
                            className="absolute right-0 z-10 mt-2 w-64 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
                          >
                            <input type="hidden" name="claim_id" value={claim.id} />
                            <select name="pause_type" required className={`${input} text-[12px]`}>
                              <option value="">Tipo de pausa…</option>
                              <option value="waiting_third_party">Aguardando terceiro</option>
                              <option value="waiting_document">Aguardando documento</option>
                              <option value="other">Outro</option>
                            </select>
                            <input name="reason" required placeholder="Motivo" className={`${input} text-[12px]`} />
                            <button className="w-full rounded-md bg-brand py-1.5 text-[12px] font-medium text-white hover:bg-brand-600">
                              Pausar
                            </button>
                          </form>
                        </details>
                      )}
                    </div>
                  )}

                  {activity && type !== "end" && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <span className="text-[12px] text-slate-500">
                        Grupo: <span className="font-medium text-slate-700">{groupName.get(activity.group_id ?? "") ?? "—"}</span>
                      </span>
                      {activity.status === "in_progress" && cycle.status !== "discarded" ? (
                        <form action={completeActivity.bind(null, activity.id)}>
                          <button className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition hover:bg-brand-600">
                            Concluir
                          </button>
                        </form>
                      ) : activity.status === "in_progress" ? (
                        <span className="text-[12px] text-slate-400">Ciclo descartado</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] text-emerald-700">
                          <CheckCircle2 className="size-3.5" /> Concluída
                        </span>
                      )}
                    </div>
                  )}

                  {joinProgress && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <p className="text-[12px] font-medium text-amber-700">
                        Aguardando ramos ({joinProgress.ruleLabel}) — {joinProgress.completed} de {joinProgress.total}
                      </p>
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {joinProgress.branches.map((b, i) => (
                          <li
                            key={i}
                            className={`rounded-md px-2 py-0.5 text-[11px] ring-1 ring-inset ${
                              b.done ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-slate-200"
                            }`}
                          >
                            {b.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {decision && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <p className="text-[13px] text-slate-700">{decision.question}</p>
                      {decision.selected_option ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-emerald-700">
                          <CheckCircle2 className="size-3.5" /> Escolhido: {decision.selected_option}
                        </p>
                      ) : cycle.status === "discarded" ? (
                        <p className="mt-2 text-[12px] text-slate-400">Ciclo descartado</p>
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
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Documentos</h2>

          <div className="space-y-3">
            {(documents ?? []).map((doc) => {
              const versions = versionsByDoc.get(doc.id) ?? [];
              const canReview = doc.status === "received" || doc.status === "in_validation";
              return (
                <div key={doc.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-slate-400" />
                      <span className="text-[13px] font-medium text-slate-900">{docTypeName.get(doc.document_type_id) ?? "—"}</span>
                      {doc.is_required && (
                        <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                          obrigatório
                        </span>
                      )}
                    </div>
                    <DocStatusBadge status={doc.status} />
                  </div>

                  {versions.length === 0 ? (
                    <p className="mt-2 text-[12px] text-slate-400">Nenhum arquivo enviado ainda.</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {versions.map((v) => {
                        const url = urlByPath.get(v.storage_path);
                        return (
                        <li key={v.id} className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
                          <span className="text-slate-400">v{v.version_number}</span>
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                            >
                              <Download className="size-3" /> {v.file_name}
                            </a>
                          ) : (
                            v.file_name
                          )}
                          <span className="text-slate-400">{(v.size_bytes / 1024).toFixed(0)} KB</span>
                          {v.rejection_reason && <span className="text-rose-700">— {v.rejection_reason}</span>}
                          {v.validated_at && !v.rejection_reason && (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <CheckCircle2 className="size-3" /> validado
                            </span>
                          )}
                        </li>
                        );
                      })}
                    </ul>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <form action={uploadDocumentVersion} className="flex items-center gap-2">
                      <input type="hidden" name="claim_id" value={claim.id} />
                      <input type="hidden" name="claim_cycle_id" value={cycle.id} />
                      <input type="hidden" name="document_id" value={doc.id} />
                      <label className="sr-only" htmlFor={`file-${doc.id}`}>
                        Enviar nova versão de {docTypeName.get(doc.document_type_id)}
                      </label>
                      <input id={`file-${doc.id}`} name="file" type="file" required className="text-[12px]" />
                      <button className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white hover:bg-brand-600">
                        <Upload className="size-3" /> Enviar
                      </button>
                    </form>

                    {canReview && (
                      <>
                        <form action={reviewDocument}>
                          <input type="hidden" name="claim_id" value={claim.id} />
                          <input type="hidden" name="document_id" value={doc.id} />
                          <input type="hidden" name="decision" value="validated" />
                          <button className="rounded-md px-2.5 py-1 text-[12px] font-medium text-emerald-700 hover:bg-emerald-50">
                            Validar
                          </button>
                        </form>
                        <form action={reviewDocument} className="flex items-center gap-1">
                          <input type="hidden" name="claim_id" value={claim.id} />
                          <input type="hidden" name="document_id" value={doc.id} />
                          <input type="hidden" name="decision" value="rejected" />
                          <input
                            name="reason"
                            required
                            placeholder="Motivo da rejeição"
                            className="rounded-md border border-slate-200 px-2 py-1 text-[12px]"
                          />
                          <button className="rounded-md px-2.5 py-1 text-[12px] font-medium text-rose-700 hover:bg-rose-50">
                            Rejeitar
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <form action={requestDocument} className="rounded-xl border border-dashed border-slate-300 bg-white p-3">
              <p className="mb-2 text-[12px] font-medium text-slate-600">Solicitar documento</p>
              <input type="hidden" name="claim_id" value={claim.id} />
              <input type="hidden" name="claim_cycle_id" value={cycle.id} />
              <input name="type_name" required placeholder="Ex.: Boletim de ocorrência" className={`${input} mb-1.5`} />
              <label className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                <input type="checkbox" name="is_required" className="size-3.5 accent-[var(--color-brand)]" /> Obrigatório
              </label>
              <button className="w-full rounded-lg border border-slate-200 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
                Solicitar
              </button>
            </form>

            <form action={uploadDocumentVersion} className="rounded-xl border border-dashed border-slate-300 bg-white p-3">
              <p className="mb-2 text-[12px] font-medium text-slate-600">Enviar documento avulso</p>
              <input type="hidden" name="claim_id" value={claim.id} />
              <input type="hidden" name="claim_cycle_id" value={cycle.id} />
              <input name="type_name" required placeholder="Ex.: Nota fiscal" className={`${input} mb-1.5`} />
              <input name="file" type="file" required className="mb-2 w-full text-[12px]" />
              <button className="w-full rounded-lg bg-brand py-1.5 text-[12px] font-medium text-white hover:bg-brand-600">
                Enviar
              </button>
            </form>
          </div>
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

function DocStatusBadge({ status }: { status: string }) {
  const style =
    status === "validated"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "rejected"
        ? "bg-rose-50 text-rose-700 ring-rose-200"
        : status === "received" || status === "in_validation"
          ? "bg-sky-50 text-sky-700 ring-sky-200"
          : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${style}`}>
      {DOC_STATUS_LABEL[status] ?? status}
    </span>
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
