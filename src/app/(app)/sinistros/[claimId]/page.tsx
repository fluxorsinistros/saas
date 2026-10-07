import { signedAvatarUrls } from "@/lib/avatars";
import { GroupChip } from "@/lib/group-icons";
import { ActivityForm } from "@/components/execution/ActivityForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { UNDO_WINDOW_MINUTES } from "@/lib/undo";
import { getMemberGroups } from "@/lib/active-group";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileText, PauseCircle, PlayCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { loadGraph } from "@/lib/workflow/load-graph";
import { NODE_META, type NodeType } from "@/lib/workflow/types";
import { computeLiveSlaStatus, formatMinutesRemaining } from "@/lib/sla";
import { computeProcessProgress, computeSla, formatDuration, isPastIso, minutesSince } from "@/lib/format";
import { computeCalculatedValues } from "@/lib/formula";
import { readPanel } from "@/lib/financial-panel";
import { formatNumberField, VALUE_FIELD_TYPES } from "@/lib/field-rules";
import { StageSlaBadge } from "@/components/StageSlaBadge";
import { getPermissionCodes } from "@/lib/permissions";
import { ExecutionViewToggle } from "@/components/execution/ExecutionViewToggle";
import { ExecutionGraph } from "@/components/execution/ExecutionGraphLazy";
import {
  cancelPendingItem,
  chooseDecision,
  completeActivityWithState,
  undoActivityCompletion,
  createPendingItem,
  decideDuplicate,
  discardCycle,
  pauseSla,
  reopenCycle,
  resolvePendingItem,
  resumeSla,
} from "../actions";
import { requestExtraDocument, reviewDocument } from "../documents-actions";
import { DocumentUploadForm } from "@/components/documents/DocumentUploadForm";
import { getLimits, isAllowed, limitOf } from "@/lib/limits";
import { saveFinancialFields } from "../financial-actions";
import { ClaimHistoryTimeline, type HistoryItem } from "./ClaimHistoryTimeline";

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
  "pending_item.created": "Pendência aberta",
  "pending_item.resolved": "Pendência resolvida",
  "pending_item.cancelled": "Pendência cancelada",
  "duplicate_check.flagged": "Possível duplicidade identificada",
  "duplicate_check.decided": "Duplicidade avaliada",
  "claim.declared_value_set": "Valor declarado atualizado",
  "claim.financial_fields_saved": "Valores financeiros atualizados",
  "financial_entry.created": "Lançamento financeiro criado",
  "financial_entry.paid": "Lançamento marcado como pago",
  "financial_entry.cancelled": "Lançamento cancelado",
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

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

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
  const [limits, perms, { isAdmin, active: activeGroup }, { data: claim }] = await Promise.all([
    getLimits(supabase, ctx.tenantId),
    getPermissionCodes(ctx.userId, ctx.tenantId),
    getMemberGroups(ctx.userId, ctx.tenantId),
    supabase
      .from("claims")
      .select("id, claim_number, status, occurred_at, created_at, declared_value, custom_fields, created_by")
      .eq("id", claimId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle(),
  ]);
  if (!claim) notFound();
  const fileMaxMb = limitOf(limits, "file_max_mb");
  const uploadHint =
    fileMaxMb === null
      ? "Fotos são compactadas antes do envio."
      : `Máx. ${fileMaxMb} MB por arquivo${isAllowed(limits, "allow_file_overage") ? " (acima disso, com cobrança extra)" : ""}. Fotos são compactadas antes do envio.`;

  // Etapa aponta pro grupo responsável, não pra pessoa (Documento 1 §5.3): ter claim.execute não
  // basta, só quem é do grupo da etapa (ou Administrador, que nunca é travado por grupo) pode agir
  // nela. completeActivity/chooseDecision já barram isso no servidor; aqui só escondemos o botão.
  // Operador age só na etapa do grupo em que está atuando agora (o ativo na sessão).
  const myGroupIds = new Set(activeGroup ? [activeGroup.id] : []);
  const canActOnGroup = (groupId: string | null) => isAdmin || !groupId || myGroupIds.has(groupId);

  const customFields = (claim.custom_fields ?? {}) as Record<string, string>;

  // Duplicidade (Documento 2 §28): avisa, nunca bloqueia, mostra o `pending` mais recente (se houver)
  // com os candidatos e a evidência, pro usuário decidir. Roda só uma vez, na formalização.
  const [{ data: allDuplicateChecks }, { data: allCycles }] = await Promise.all([
    supabase.from("duplicate_checks").select("id, evidence, decision").eq("claim_id", claim.id).order("created_at", { ascending: false }),
    supabase
      .from("claim_cycles")
      .select("id, status, cycle_number, workflow_version_id, formalized_at, completed_at, created_by")
      .eq("claim_id", claim.id)
      .order("cycle_number", { ascending: false }),
  ]);
  const duplicateCheck = (allDuplicateChecks ?? []).find((d) => d.decision === "pending");
  let duplicateCandidates: { confidence: number | null; matched_fields: unknown; claim_number: string }[] = [];
  if (duplicateCheck) {
    const { data: cands } = await supabase
      .from("duplicate_candidates")
      .select("confidence, matched_fields, claims:candidate_claim_id(claim_number)")
      .eq("duplicate_check_id", duplicateCheck.id);
    duplicateCandidates = (cands ?? []).map((c) => ({
      confidence: c.confidence,
      matched_fields: c.matched_fields,
      claim_number: (c.claims as unknown as { claim_number: string } | null)?.claim_number ?? "-",
    }));
  }

  if (!allCycles?.length) notFound();

  // Operador só abre sinistro em que o grupo dele atua (ou que ele mesmo abriu). Administrador abre qualquer um da empresa.
  if (!isAdmin && claim.created_by !== ctx.userId) {
    const { data: cycleStages } = await supabase.from("stage_instances").select("id").in("claim_cycle_id", allCycles.map((c) => c.id));
    const stageIdList = (cycleStages ?? []).map((x) => x.id);
    const { data: mine } =
      stageIdList.length && activeGroup
        ? await supabase.from("activity_instances").select("id").in("stage_instance_id", stageIdList).eq("group_id", activeGroup.id).limit(1)
        : { data: [] as { id: string }[] };
    if (!mine?.length) notFound();
  }
  const cycle = (ciclo ? allCycles.find((c) => c.id === ciclo) : null) ?? allCycles[0];

  // Tudo o que só depende do ciclo corrente vai em paralelo (antes eram ~10 idas seguidas ao banco).
  const [
    { data: version },
    graph,
    { data: nodePositions },
    { data: stages },
    { data: decisions },
    { data: groups },
    { data: documents },
    { data: docTypes },
    { data: joins },
  ] = await Promise.all([
    supabase.from("workflow_versions").select("workflow_id, version_number").eq("id", cycle.workflow_version_id).single(),
    loadGraph(supabase, cycle.workflow_version_id),
    // Posições dos nós (Documento 5 §5, modo "grafo completo"), loadGraph não carrega isso porque o
    // motor de execução não precisa; aqui é só pra desenhar.
    supabase.from("workflow_nodes").select("id, position").eq("workflow_version_id", cycle.workflow_version_id),
    supabase
      .from("stage_instances")
      .select("id, node_id, pass_number, status, entered_at, exited_at")
      .eq("claim_cycle_id", cycle.id)
      .order("entered_at", { ascending: false }),
    supabase.from("decisions").select("id, stage_instance_id, question, options, selected_option, decided_at").eq("claim_cycle_id", cycle.id),
    supabase.from("groups").select("id, name, icon, color, status").eq("tenant_id", ctx.tenantId),
    supabase
      .from("documents")
      .select("id, status, is_required, is_extra, instructions, document_type_id, requested_at, pending_items(requested_by, responsible_group_id, due_at, status)")
      .eq("claim_cycle_id", cycle.id)
      .order("requested_at", { ascending: true, nullsFirst: false }),
    supabase.from("document_types").select("id, name").eq("tenant_id", ctx.tenantId),
    supabase
      .from("joins")
      .select("id, node_id, branch_id, rule_type, min_count, status")
      .eq("claim_cycle_id", cycle.id)
      .eq("status", "waiting"),
  ]);
  const [{ data: workflow }, { data: workflowFields }] = await Promise.all([
    supabase.from("workflows").select("name, financial_panel").eq("id", version!.workflow_id).single(),
    supabase
      .from("workflow_fields")
      .select("id, key, label, field_type, options, required, is_unique, default_value, min_length, max_length, min_value, max_value, formula, position")
      .order("position")
      .eq("workflow_id", version!.workflow_id),
  ]);

  // Campos personalizados (Documento 1, "estilo SHARP"): cada etapa pede um subconjunto do
  // catálogo do fluxo; os valores caem todos em claims.custom_fields, nunca por etapa.
  const fieldByKey = new Map((workflowFields ?? []).map((f) => [f.key, f]));
  // Campos calculados: valor sai da fórmula, na leitura (nunca é gravado). viewFields = digitados + calculados.
  const calcValues = computeCalculatedValues(workflowFields ?? [], customFields);
  const viewFields: Record<string, string> = { ...customFields };
  for (const [k, v] of Object.entries(calcValues)) if (v !== null) viewFields[k] = String(v);
  // Número como a pessoa lê: R$ 1.234,50, 30%, 12,5.
  const fmtValue = (f: { field_type: string }, raw: string) => (f.field_type === "calculated" || VALUE_FIELD_TYPES.includes(f.field_type) ? formatNumberField(f.field_type === "calculated" ? (f as { default_value?: string | null }).default_value || "number" : f.field_type, Number(raw)) : String(raw));
  // Painel financeiro desenhado no fluxo: campos numéricos (digitados ou calculados) na ordem escolhida.
  const panelItems = readPanel(workflow?.financial_panel)
    .map((it) => ({ it, f: fieldByKey.get(it.key) }))
    .filter((x): x is { it: ReturnType<typeof readPanel>[number]; f: NonNullable<typeof x.f> } => !!x.f);
  const canEditFinancial = perms.has("financial.manage");
  const hasPersonField = (workflowFields ?? []).some((f) => f.field_type === "person");
  const hasAttachmentField = (workflowFields ?? []).some((f) => f.field_type === "attachment");

  // tenant_memberships e user_profiles não têm FK direta entre si (mesma situação de
  // membership_roles/role_permissions), busca em duas etapas.
  let memberOptions: { id: string; name: string }[] = [];
  if (hasPersonField) {
    const { data: tenantMembers } = await supabase
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_id", ctx.tenantId)
      .eq("status", "active");
    const memberIds = (tenantMembers ?? []).map((m) => m.user_id);
    const { data: profiles } = memberIds.length
      ? await supabase.from("user_profiles").select("id, full_name, email").in("id", memberIds)
      : { data: [] as { id: string; full_name: string | null; email: string }[] };
    memberOptions = (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || p.id }));
  }

  // Anexo (Documento 1): custom_fields guarda o caminho no Storage, não o arquivo, precisa de URL
  // assinada pra exibir, igual ao GED.
  const attachmentPaths = hasAttachmentField
    ? Object.values((customFields ?? {}) as Record<string, string>).filter((v) => v.includes("/custom-fields/"))
    : [];
  const { data: signedAttachments } = attachmentPaths.length
    ? await supabase.storage.from("documents").createSignedUrls(attachmentPaths, 300)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const attachmentUrlByPath = new Map((signedAttachments ?? []).filter((s) => s.path).map((s) => [s.path as string, s.signedUrl]));

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  const positionById = new Map((nodePositions ?? []).map((n) => [n.id, n.position as unknown as { x: number; y: number }]));

  const stageIds = (stages ?? []).map((s) => s.id);
  const { data: activities } = stageIds.length
    ? await supabase
        .from("activity_instances")
        .select("id, stage_instance_id, status, group_id, started_at, completed_at, completed_by")
        .in("stage_instance_id", stageIds)
    : { data: [] as never[] };

  // Só a ÚLTIMA etapa concluída pode ser desfeita (de trás para frente), ver undoActivityCompletion.
  const lastDoneStageId = [...(stages ?? [])]
    .filter((st) => st.status === "completed" && (activities ?? []).some((a) => a.stage_instance_id === st.id && a.status === "completed"))
    .sort((a, b) => (b.exited_at ?? "").localeCompare(a.exited_at ?? ""))[0]?.id;
  const activityByStage = new Map((activities ?? []).map((a) => [a.stage_instance_id, a]));
  const decisionByStage = new Map((decisions ?? []).filter((d) => d.stage_instance_id).map((d) => [d.stage_instance_id as string, d]));

  // Pendências (Documento 3 §2.2, caso H): não movem o processo, são solicitações dentro da
  // atividade atual, por isso vivem agrupadas por activity_instance_id, não por stage.
  const activityIds = (activities ?? []).map((a) => a.id);
  const docIds = (documents ?? []).map((d) => d.id);
  // Pendências, SLA e versões de documento só dependem de ids já conhecidos: vão juntas, não uma depois da outra.
  const [{ data: pendingItems }, { data: slaTracking }, { data: docVersions }] = await Promise.all([
    activityIds.length
      ? supabase
          .from("pending_items")
          .select("id, activity_instance_id, title, description, status, due_at, responsible_group_id, created_at")
          .in("activity_instance_id", activityIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; activity_instance_id: string | null; title: string; description: string | null; status: string; due_at: string | null; responsible_group_id: string | null; created_at: string }[] }),
    stageIds.length
      ? supabase
          .from("sla_tracking")
          .select("id, stage_instance_id, status, started_at, target_at, workflow_slas(alert_thresholds)")
          .in("stage_instance_id", stageIds)
      : Promise.resolve({ data: [] as never[] }),
    docIds.length
      ? supabase
          .from("document_versions")
          .select("id, document_id, version_number, file_name, size_bytes, storage_path, uploaded_at, validated_at, rejection_reason")
          .in("document_id", docIds)
          .order("version_number", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; document_id: string; version_number: number; file_name: string; size_bytes: number; storage_path: string; uploaded_at: string; validated_at: string | null; rejection_reason: string | null }[] }),
  ]);
  const pendingByActivity = new Map<string, typeof pendingItems>();
  for (const p of pendingItems ?? []) {
    if (!p.activity_instance_id) continue;
    pendingByActivity.set(p.activity_instance_id, [...(pendingByActivity.get(p.activity_instance_id) ?? []), p]);
  }
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const groupMeta = new Map((groups ?? []).map((g) => [g.id, g]));

  // SLA (Documento 4): relógio por etapa, status calculado ao vivo (sem esperar o scheduler
  // periódico do §7, ainda não implementado). Pausa em aberto (sla_pauses.resumed_at is null)
  // decide se mostramos "Retomar" em vez de "Pausar".
  const slaByStage = new Map((slaTracking ?? []).map((s) => [s.stage_instance_id, s]));
  const trackingIds = (slaTracking ?? []).map((s) => s.id);


  const docTypeName = new Map((docTypes ?? []).map((t) => [t.id, t.name]));

  const versionsByDoc = new Map<string, typeof docVersions>();
  for (const v of docVersions ?? []) {
    versionsByDoc.set(v.document_id, [...(versionsByDoc.get(v.document_id) ?? []), v]);
  }

  const allPaths = (docVersions ?? []).map((v) => v.storage_path);

  const entityIds = [
    cycle.id,
    ...stageIds,
    ...(activities ?? []).map((a) => a.id),
    ...(decisions ?? []).map((d) => d.id),
    ...docIds,
    ...trackingIds,
    ...(pendingItems ?? []).map((p) => p.id),
    ...(allDuplicateChecks ?? []).map((d) => d.id),
    claim.id,
  ];
  // Pausas de SLA, URLs assinadas e trilha de auditoria são independentes entre si: uma ida só ao banco/storage.
  const [{ data: openPauses }, { data: signedUrls }, { data: auditLogs }] = await Promise.all([
    trackingIds.length
      ? supabase.from("sla_pauses").select("sla_tracking_id").in("sla_tracking_id", trackingIds).is("resumed_at", null)
      : Promise.resolve({ data: [] as { sla_tracking_id: string }[] }),
    allPaths.length
      ? supabase.storage.from("documents").createSignedUrls(allPaths, 300)
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
    supabase
      .from("audit_logs")
      .select("id, actor_id, action, entity_type, entity_id, previous_value, new_value, reason, created_at")
      .in("entity_id", entityIds)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const pausedTrackingIds = new Set((openPauses ?? []).map((p) => p.sla_tracking_id));
  const urlByPath = new Map((signedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  const actorIds = Array.from(
    new Set(
      [
        ...(auditLogs ?? []).map((l) => l.actor_id),
        claim.created_by,
        cycle.created_by,
      ].filter((id): id is string => Boolean(id))
    )
  );

  const { data: actorProfiles } = actorIds.length
    ? await supabase.from("user_profiles").select("id, full_name, email, avatar_path").in("id", actorIds)
    : { data: [] as { id: string; full_name: string | null; email: string; avatar_path: string | null }[] };

  const actorNameMap = new Map((actorProfiles ?? []).map((p) => [p.id, p.full_name || p.email]));
  const actorAvatarUrls = await signedAvatarUrls((actorProfiles ?? []).map((p) => p.avatar_path));
  const actorAvatarById = new Map((actorProfiles ?? []).map((p) => [p.id, p.avatar_path ? (actorAvatarUrls.get(p.avatar_path) ?? null) : null]));

  // Aba "Dados": todos os campos do catálogo do fluxo, com o valor preenchido (ou "Não preenchido") e onde cada um é pedido.
  const fieldWhere = new Map<string, string[]>();
  for (const n of graph.nodes) {
    if (n.type !== "start" && n.type !== "stage") continue;
    for (const k of n.config.field_keys ?? []) {
      fieldWhere.set(k, [...(fieldWhere.get(k) ?? []), n.type === "start" ? "Abertura" : n.name]);
    }
  }
  const dataRows = (workflowFields ?? []).map((f) => {
    const raw = viewFields[f.key];
    const filled = raw !== undefined && raw !== null && String(raw) !== "";
    const href = f.field_type === "attachment" && filled ? (attachmentUrlByPath.get(raw) ?? null) : null;
    const display = !filled
      ? "Não preenchido"
      : f.field_type === "boolean"
        ? raw === "true"
          ? "Sim"
          : "Não"
        : f.field_type === "person"
          ? (memberOptions.find((m) => m.id === raw)?.name ?? raw)
          : f.field_type === "date"
            ? new Date(`${raw}T00:00:00`).toLocaleDateString("pt-BR")
            : f.field_type === "attachment"
              ? "Arquivo anexado"
              : fmtValue(f, raw);
    return { key: f.key, label: f.label, required: f.required, where: fieldWhere.get(f.key) ?? [], filled, href, display };
  });

  // Resumo do topo: andamento pelas etapas, etapa atual, prazo da etapa e prazo total do fluxo (mesmas contas da lista).
  const stepNodes = graph.nodes.filter((n) => n.type === "stage" || n.type === "wait" || n.type === "decision");
  const slaOf = (n: { config: { sla_minutes?: number | null } }) => (typeof n.config.sla_minutes === "number" && n.config.sla_minutes > 0 ? n.config.sla_minutes : undefined);
  const stepsForProgress = new Map([[cycle.workflow_version_id, stepNodes.map((n) => ({ id: n.id, name: n.name, sla_minutes: slaOf(n) ?? 60 }))]]);
  const doneNodeIds = new Set((stages ?? []).filter((st) => st.status === "completed").map((st) => st.node_id));
  const cycleDone = cycle.status === "completed";
  const progress = computeProcessProgress(cycleDone, cycle.workflow_version_id, doneNodeIds, stepsForProgress);
  const flowLimitMinutes = stepNodes.reduce((sum, n) => sum + (slaOf(n) ?? 0), 0) || undefined;
  const flowStartedAt = cycle.formalized_at || claim.created_at;
  const runningFlowSla = !cycleDone ? computeSla(flowStartedAt, flowLimitMinutes) : null;
  const flowTookMinutes =
    cycleDone && cycle.completed_at ? Math.max(0, Math.round((new Date(cycle.completed_at).getTime() - new Date(flowStartedAt).getTime()) / 60000)) : null;
  const currentStages = (stages ?? [])
    .filter((st) => st.status === "in_progress")
    .map((st) => ({ id: st.id, node: nodeById.get(st.node_id), enteredAt: st.entered_at }))
    .filter((x) => x.node && x.node.type !== "end");
  const waitingGroupIds = [
    ...new Set(
      (activities ?? [])
        .filter((a) => a.group_id && (a.status === "in_progress" || a.status === "not_started"))
        .map((a) => a.group_id as string),
    ),
  ];

  const blockedReason = auditLogs?.find((a) => a.action === "cycle.blocked")?.reason;

  // Convergências (Documento 3 §5): mostra "aguardando N de M" enquanto o join não libera, sem
  // isso o usuário vê uma etapa "Convergência" concluída na trilha sem entender por que o processo
  // não seguiu ainda para o próximo passo.
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
      branches: siblings.map((b) => ({ name: nodeById.get(b.target_node_id)?.name ?? "-", done: b.status === "completed" })),
    });
  }

  // Grafo completo (Documento 5 §5/§15): status por nó derivado da passagem mais recente por ele,
  // mesma fonte de dados da trilha linear, só desenhada como grafo em vez de lista cronológica.
  const latestStageByNode = new Map<string, { id: string; status: string }>();
  for (const s of [...(stages ?? [])].reverse()) latestStageByNode.set(s.node_id, { id: s.id, status: s.status });
  const mostRecentStageId = stages?.[0]?.id;
  const execNodes = graph.nodes.map((n) => {
    const pos = positionById.get(n.id) ?? { x: 0, y: 0 };
    const latest = latestStageByNode.get(n.id);
    let status: "pending" | "in_progress" | "completed" | "blocked" = "pending";
    if (latest) {
      if (latest.status === "completed") status = "completed";
      else status = "in_progress";
      if (cycle.status === "blocked" && latest.id === mostRecentStageId) status = "blocked";
    }
    return { id: n.id, type: n.type, name: n.name, x: pos.x ?? 0, y: pos.y ?? 0, status };
  });
  const execEdges = graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label || undefined }));

  const historyItems: HistoryItem[] = (auditLogs ?? []).map((log) => {
    const newVal = (log.new_value ?? {}) as Record<string, unknown>;

    // Autor da ação
    let authorId: string | null = log.actor_id ?? null;
    let author = authorId ? actorNameMap.get(authorId) : null;
    if (!author) {
      if (log.action === "claim.created" && claim.created_by) {
        authorId = claim.created_by;
        author = actorNameMap.get(claim.created_by);
      } else if (log.action === "cycle.created" && cycle.created_by) {
        authorId = cycle.created_by;
        author = actorNameMap.get(cycle.created_by);
      }
    }

    // Identificação da etapa ou elemento
    let stageTitle: string | null = null;
    let eventDetail: string | null = null;
    let dotTone: "blue" | "emerald" | "amber" | "rose" | "indigo" | "slate" = "slate";

    if (log.action === "stage.entered") {
      dotTone = "blue";
      const directName = (newVal.node_name as string) || null;
      const fallbackStage = stages?.find((s) => s.id === log.entity_id);
      const resolvedName = directName || (fallbackStage ? nodeById.get(fallbackStage.node_id)?.name : null);
      stageTitle = resolvedName ? `Etapa iniciada: ${resolvedName}` : "Etapa iniciada";
    } else if (log.action === "activity.completed") {
      dotTone = "emerald";
      const directName = (newVal.node_name as string) || null;
      const act = activities?.find((a) => a.id === log.entity_id);
      const stg = stages?.find((s) => s.id === act?.stage_instance_id);
      const resolvedName = directName || (stg ? nodeById.get(stg.node_id)?.name : null);
      stageTitle = resolvedName ? `Atividade concluída: ${resolvedName}` : "Atividade concluída";
    } else if (log.action === "decision.made") {
      dotTone = "amber";
      const dec = decisions?.find((d) => d.id === log.entity_id);
      const stg = stages?.find((s) => s.id === dec?.stage_instance_id);
      const resolvedName = stg ? nodeById.get(stg.node_id)?.name : null;
      const option = (newVal.selected_option as string) || dec?.selected_option;
      stageTitle = resolvedName ? `Decisão em "${resolvedName}"` : "Decisão registrada";
      if (option) {
        eventDetail = `Opção: "${option}"`;
      }
    } else if (log.action === "claim.created") {
      dotTone = "indigo";
      stageTitle = `Sinistro #${claim.claim_number} cadastrado`;
    } else if (log.action === "cycle.created") {
      dotTone = "indigo";
      stageTitle = `Ciclo ${cycle.cycle_number} aberto`;
      if (newVal.workflow_name) {
        eventDetail = `Fluxo: ${newVal.workflow_name}`;
      }
    } else if (log.action === "document.requested") {
      dotTone = "blue";
      const typeName = (newVal.type as string) || (documents?.find((d) => d.id === log.entity_id) ? docTypeName.get(documents.find((d) => d.id === log.entity_id)!.document_type_id ?? "") : null);
      stageTitle = typeName ? `Documento solicitado: ${typeName}` : "Documento solicitado";
    } else if (log.action === "document.received") {
      dotTone = "emerald";
      const fileName = (newVal.file_name as string) || null;
      stageTitle = fileName ? `Documento recebido: ${fileName}` : "Documento recebido";
    } else if (log.action === "document.validated") {
      dotTone = "emerald";
      stageTitle = "Documento validado com sucesso";
    } else if (log.action === "document.rejected") {
      dotTone = "rose";
      stageTitle = "Documento rejeitado";
    } else if (log.action === "pending_item.created") {
      dotTone = "amber";
      const title = (newVal.title as string) || pendingItems?.find((p) => p.id === log.entity_id)?.title;
      stageTitle = title ? `Pendência aberta: ${title}` : "Pendência aberta";
    } else if (log.action === "pending_item.resolved") {
      dotTone = "emerald";
      const title = pendingItems?.find((p) => p.id === log.entity_id)?.title;
      stageTitle = title ? `Pendência resolvida: ${title}` : "Pendência resolvida";
    } else if (log.action === "claim.declared_value_set") {
      dotTone = "emerald";
      const val = newVal.declared_value !== undefined ? currency.format(Number(newVal.declared_value)) : null;
      stageTitle = "Valor declarado atualizado";
      if (val) eventDetail = `Novo valor: ${val}`;
    } else if (log.action === "financial_entry.created") {
      dotTone = "blue";
      const desc = (newVal.description as string) || "Lançamento financeiro";
      const amt = newVal.amount !== undefined ? currency.format(Number(newVal.amount)) : null;
      stageTitle = `Lançamento criado: ${desc}`;
      if (amt) eventDetail = amt;
    } else if (log.action === "sla.paused") {
      dotTone = "amber";
      stageTitle = "Prazo de SLA pausado";
    } else if (log.action === "sla.resumed") {
      dotTone = "blue";
      stageTitle = "Prazo de SLA retomado";
    } else if (log.action === "cycle.blocked") {
      dotTone = "rose";
      stageTitle = "Processo bloqueado";
    } else if (log.action === "cycle.discarded") {
      dotTone = "rose";
      stageTitle = "Ciclo descartado";
    } else if (log.action === "cycle.reopened") {
      dotTone = "blue";
      stageTitle = "Ciclo reaberto";
    } else {
      stageTitle = AUDIT_LABEL[log.action] ?? log.action;
    }

    return {
      id: log.id,
      stageTitle,
      eventDetail,
      reason: log.reason,
      author: author ?? null,
      authorAvatarUrl: authorId ? (actorAvatarById.get(authorId) ?? null) : null,
      createdAt: log.created_at,
      dotTone,
    };
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-wide px-4 py-6 md:px-8 md:py-8">
        <Link href="/sinistros" className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> Sinistros
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{claim.claim_number}</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {workflow?.name} · v{version?.version_number}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
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
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                    c.id === cycle.id ? "bg-brand text-white ring-brand" : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Ciclo {c.cycle_number}
                </Link>
              ))}
            </div>
          )}
        </div>

        {cycle.status === "completed" && cycle.id === allCycles[0].id && perms.has("claim.reopen") && (
          <details className="mt-3 group">
            <summary className="action-chip inline-flex cursor-pointer list-none items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-medium">
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

        {cycle.status !== "completed" && cycle.status !== "discarded" && cycle.id === allCycles[0].id && perms.has("claim.discard") && (
          <details className="mt-3 group">
            <summary className="action-chip action-chip-danger inline-flex cursor-pointer list-none items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-medium">
              Descartar e reiniciar este ciclo
            </summary>
            <form
              action={discardCycle.bind(null, cycle.id)}
              className="mt-2 flex max-w-md flex-wrap items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3"
            >
              <p className="basis-full text-[12px] text-rose-800">O ciclo atual será encerrado e um novo começará do início do fluxo. O histórico é mantido.</p>
              <input name="reason" required placeholder="Motivo do descarte" className={`${input} text-[12px]`} />
              <button className="shrink-0 rounded-md bg-rose-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-rose-700">
                Descartar e abrir novo ciclo
              </button>
            </form>
          </details>
        )}

        {cycle.status === "discarded" && (
          <p className="mt-3 text-[12px] text-slate-500">Ciclo descartado, motivo registrado no histórico abaixo.</p>
        )}

        {duplicateCheck && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4 shrink-0" /> Possível duplicidade
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {duplicateCandidates.map((c, i) => (
                <li key={i}>
                  Sinistro <span className="font-medium">{c.claim_number}</span>,{" "}
                  {((c.matched_fields as string[]) ?? []).join(", ")}
                  {c.confidence !== null && ` (${Math.round(c.confidence * 100)}% de confiança)`}
                </li>
              ))}
            </ul>
            <form action={decideDuplicate.bind(null, duplicateCheck.id, "confirmed_duplicate")} className="mt-2 flex flex-wrap items-center gap-2">
              <input type="hidden" name="claim_id" value={claim.id} />
              <input name="justification" placeholder="Justificativa (opcional)" className={`${input} w-64 bg-white text-[12px]`} />
              <button className="rounded-md bg-rose-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-rose-700">É duplicidade</button>
            </form>
            <form action={decideDuplicate.bind(null, duplicateCheck.id, "not_duplicate")} className="mt-1.5">
              <input type="hidden" name="claim_id" value={claim.id} />
              <button className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[12px] font-medium text-amber-800 hover:bg-amber-100">
                Não é duplicidade
              </button>
            </form>
          </div>
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

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-xs" aria-label="Resumo do andamento">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            {progress && (
              <div className="min-w-[200px] max-w-[320px] flex-1">
                <div className="flex items-center justify-between text-xs font-medium leading-none">
                  <span className="text-slate-500">Progresso</span>
                  <span className={`font-bold ${progress.pct === 100 ? "text-emerald-700" : "text-brand"}`}>{progress.pct}%</span>
                </div>
                <div className="relative mt-1.5 h-2 w-full overflow-hidden rounded-full border border-slate-300/40 bg-slate-200/80">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${progress.pct === 100 ? "bg-emerald-500" : "bg-brand"}`}
                    style={{ width: `${progress.pct}%` }}
                  />
                </div>
                <div className="mt-1 text-xs text-slate-500">{progress.subtext}</div>
              </div>
            )}

            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
              {cycleDone ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                  <CheckCircle2 className="size-4" /> Fluxo concluído
                </span>
              ) : currentStages.length > 0 ? (
                currentStages.map((cs) => (
                  <span key={cs.id} className="inline-flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Etapa atual</span>
                    <span className="font-semibold text-slate-900">{cs.node?.name}</span>
                    <span className="text-xs text-slate-500">
                      (há {formatDuration(minutesSince(cs.enteredAt))})
                    </span>
                    <StageSlaBadge enteredAt={cs.enteredAt} slaMinutes={cs.node ? slaOf(cs.node) : undefined} />
                  </span>
                ))
              ) : (
                <span className="text-slate-500">Sem etapa em andamento</span>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-[12px]">
            {cycleDone && flowTookMinutes !== null ? (
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-500">Prazo total do fluxo:</span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${
                    flowLimitMinutes && flowTookMinutes > flowLimitMinutes
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  Concluído em {formatDuration(flowTookMinutes)}
                  {flowLimitMinutes
                    ? flowTookMinutes > flowLimitMinutes
                      ? ` • estourou o limite de ${formatDuration(flowLimitMinutes)} em ${formatDuration(flowTookMinutes - flowLimitMinutes)}`
                      : ` • dentro do limite de ${formatDuration(flowLimitMinutes)}`
                    : ""}
                </span>
              </div>
            ) : runningFlowSla ? (
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-500">Prazo total do fluxo:</span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${
                    runningFlowSla.isBreached
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : runningFlowSla.isAtRisk
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-sky-200 bg-sky-50 text-sky-700"
                  }`}
                >
                  {runningFlowSla.pct}% consumido • {runningFlowSla.formattedRemaining} (limite: {runningFlowSla.formattedLimit})
                </span>
              </div>
            ) : (
              <div />
            )}
            {!cycleDone && waitingGroupIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-slate-500">
                <span>Aguardando:</span>
                {waitingGroupIds.map((gid) => (
                  <span key={gid} className="rounded border border-slate-200/60 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                    <GroupChip name={groupMeta.get(gid)?.name ?? "-"} icon={groupMeta.get(gid)?.icon} color={groupMeta.get(gid)?.color} />
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Execução e Detalhes</h2>
          <ExecutionViewToggle
            historyCount={historyItems.length}
            history={<ClaimHistoryTimeline items={historyItems} />}
            graph={<ExecutionGraph nodes={execNodes} edges={execEdges} />}
            financialCount={panelItems.length}
            financial={
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                {panelItems.length === 0 ? (
                  <p className="text-[13px] text-slate-600">
                    Este fluxo ainda não tem painel financeiro.{" "}
                    {perms.has("workflow.edit") || perms.has("financial.configure") ? (
                      <Link href={`/sinistros/painel-financeiro/${version!.workflow_id}`} className="font-medium text-brand hover:underline">
                        Montar o painel
                      </Link>
                    ) : (
                      "Peça a quem edita o fluxo para montar o painel."
                    )}
                  </p>
                ) : (
                  <form action={saveFinancialFields.bind(null, claim.id)} className="space-y-4">
                    <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Painel financeiro do fluxo">
                      {panelItems.map(({ it, f }) => {
                        const raw = viewFields[f.key];
                        const has = raw !== undefined && raw !== "";
                        const n = has ? Number(raw) : null;
                        const tone = it.tone === "sign" && n !== null ? (n < 0 ? "text-rose-700" : "text-emerald-700") : "text-slate-900";
                        const editable = canEditFinancial && f.field_type !== "calculated" && it.mode !== "view";
                        return (
                          <div key={f.key}>
                            <label htmlFor={`fin-${f.key}`} className="mb-1 block text-xs text-slate-500">
                              {it.label || f.label}
                              {f.field_type === "calculated" && " (calculado)"}
                            </label>
                            {editable ? (
                              <input
                                id={`fin-${f.key}`}
                                name={`field_${f.key}`}
                                type="number"
                                step={f.field_type === "number" ? "any" : "0.01"}
                                min={f.field_type === "percent" ? (f.min_value ?? 0) : (f.min_value ?? undefined)}
                                max={f.field_type === "percent" ? (f.max_value ?? 100) : (f.max_value ?? undefined)}
                                defaultValue={customFields[f.key] ?? ""}
                                placeholder={f.field_type === "money" ? "0,00" : f.field_type === "percent" ? "0" : ""}
                                className={`${input} text-[13px]`}
                              />
                            ) : (
                              <div id={`fin-${f.key}`} className={`text-[15px] font-semibold ${tone}`}>
                                {has ? fmtValue(f, raw) : "-"}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                      {perms.has("workflow.edit") || perms.has("financial.configure") ? (
                        <Link href={`/sinistros/painel-financeiro/${version!.workflow_id}`} className="text-[12px] font-medium text-brand hover:underline">
                          Configurar o painel deste fluxo
                        </Link>
                      ) : (
                        <span />
                      )}
                      {canEditFinancial && panelItems.some(({ f, it }) => f.field_type !== "calculated" && it.mode !== "view") && (
                        <button className="rounded-lg bg-brand px-4 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600 cursor-pointer">Salvar valores</button>
                      )}
                    </div>
                  </form>
                )}
              </div>
            }
            dataCount={dataRows.filter((r) => r.filled).length}
            data={
              <div className="space-y-4">
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Sinistro</h3>
                  <dl className="grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
                    <div className="flex gap-1.5">
                      <dt className="text-slate-500">Número:</dt>
                      <dd className="font-medium text-slate-900">{claim.claim_number}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="text-slate-500">Fluxo:</dt>
                      <dd className="font-medium text-slate-900">
                        {workflow?.name ?? "-"} · v{version?.version_number}
                      </dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="text-slate-500">Aberto em:</dt>
                      <dd className="font-medium text-slate-900">{new Date(claim.created_at).toLocaleDateString("pt-BR")}</dd>
                    </div>
                    {claim.occurred_at && (
                      <div className="flex gap-1.5">
                        <dt className="text-slate-500">Data do evento:</dt>
                        <dd className="font-medium text-slate-900">{new Date(claim.occurred_at).toLocaleDateString("pt-BR")}</dd>
                      </div>
                    )}
                  </dl>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Campos do fluxo</h3>
                  <p className="mb-3 text-xs text-slate-500">
                    Tudo o que foi preenchido neste sinistro, na abertura e em cada etapa. Os campos sem valor aparecem como &ldquo;Não preenchido&rdquo;.
                  </p>
                  {dataRows.length === 0 ? (
                    <p className="text-[13px] text-slate-500">Este fluxo não tem campos personalizados.</p>
                  ) : (
                    <dl className="divide-y divide-slate-100 text-[13px]">
                      {dataRows.map((r) => (
                        <div key={r.key} className="grid gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                          <dt className="text-slate-600">
                            {r.label}
                            {r.required && <span className="text-rose-600"> *</span>}
                            {r.where.length > 0 && <span className="block text-xs text-slate-400">Pedido em: {r.where.join(", ")}</span>}
                          </dt>
                          <dd className={r.filled ? "font-medium text-slate-900" : "text-slate-400"}>
                            {r.href ? (
                              <a href={r.href} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                                Ver arquivo
                              </a>
                            ) : (
                              r.display
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>
              </div>
            }
            documentsCount={(documents ?? []).length}
            documents={
              <div className="space-y-4">
                <div className="space-y-3">
                  {(documents ?? []).map((doc, docIndex) => {
                    const versions = versionsByDoc.get(doc.id) ?? [];
                    const pend = doc.pending_items as unknown as { requested_by: string | null; responsible_group_id: string | null; due_at: string | null; status: string } | null;
                    const extraNumber = doc.is_extra ? (documents ?? []).slice(0, docIndex + 1).filter((d) => d.is_extra).length : 0;
                    const isRequester = doc.is_extra && pend?.requested_by === ctx.userId;
                    const canReview = (doc.status === "received" || doc.status === "in_validation") && (perms.has("document.validate") || isRequester);
                    const canSend = !doc.is_extra || canActOnGroup(pend?.responsible_group_id ?? null);
                    const overdue = !!pend && pend.status === "open" && isPastIso(pend.due_at);
                    const dueLabel = pend?.due_at ? new Date(pend.due_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null;
                    return (
                      <div key={doc.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <FileText className="size-4 text-slate-500" />
                            <span className="text-[13px] font-medium text-slate-900">
                              {doc.is_extra && <span className="mr-1.5 font-normal text-slate-600">Documento extra {extraNumber}:</span>}
                              {docTypeName.get(doc.document_type_id) ?? "-"}
                            </span>
                            {doc.is_required && (
                              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                                obrigatório
                              </span>
                            )}
                          </div>
                          <DocStatusBadge status={doc.status} />
                        </div>

                        {doc.is_extra && (
                          <div className="mt-2 space-y-1 text-[12px] text-slate-700">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                Grupo
                                <span className="rounded bg-slate-900/[0.06] px-1.5 py-0.5 font-semibold text-slate-900">
                                  <GroupChip
                                    name={pend?.responsible_group_id ? (groupMeta.get(pend.responsible_group_id)?.name ?? "-") : "-"}
                                    icon={pend?.responsible_group_id ? groupMeta.get(pend.responsible_group_id)?.icon : undefined}
                                    color={pend?.responsible_group_id ? groupMeta.get(pend.responsible_group_id)?.color : undefined}
                                  />
                                </span>
                              </span>
                              {dueLabel && (
                                <span className={overdue ? "sla-chip sla-urgent" : pend?.status === "resolved" ? "text-slate-600" : "sla-chip sla-ok"}>
                                  {overdue ? `Atrasado, prazo era ${dueLabel}` : `Prazo ${dueLabel}`}
                                </span>
                              )}
                            </div>
                            {doc.instructions && <p className="whitespace-pre-line text-slate-700">{doc.instructions}</p>}
                          </div>
                        )}

                        {versions.length === 0 ? (
                          <p className="mt-2 text-[12px] text-slate-500">Nenhum arquivo enviado ainda.</p>
                        ) : (
                          <ul className="mt-2 space-y-1">
                            {versions.map((v) => {
                              const url = urlByPath.get(v.storage_path);
                              return (
                              <li key={v.id} className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
                                <span className="text-slate-500">v{v.version_number}</span>
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
                                <span className="text-slate-500">{(v.size_bytes / 1024).toFixed(0)} KB</span>
                                {v.rejection_reason && <span className="text-rose-700">{v.rejection_reason}</span>}
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
                          {canSend ? (
                            <DocumentUploadForm variant="version" claimId={claim.id} claimCycleId={cycle.id} documentId={doc.id} hint={uploadHint} />
                          ) : (
                            <span className="text-[12px] text-slate-600">Quem envia é o grupo responsável.</span>
                          )}

                          {canReview && (
                            <>
                              <form action={reviewDocument}>
                                <input type="hidden" name="claim_id" value={claim.id} />
                                <input type="hidden" name="document_id" value={doc.id} />
                                <input type="hidden" name="decision" value="validated" />
                                <button className="rounded-md px-2.5 py-1 text-[12px] font-medium text-emerald-700 hover:bg-emerald-50 cursor-pointer">
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
                                <button className="rounded-md px-2.5 py-1 text-[12px] font-medium text-rose-700 hover:bg-rose-50 cursor-pointer">
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

                <div className="grid gap-3 sm:grid-cols-2">
                  <form action={requestExtraDocument} className="space-y-1.5 rounded-xl border border-dashed border-slate-300 bg-white p-3 shadow-xs">
                    <p className="mb-1 text-[12px] font-medium text-slate-700">Solicitar documento extra</p>
                    <input type="hidden" name="claim_id" value={claim.id} />
                    <input type="hidden" name="claim_cycle_id" value={cycle.id} />
                    <input name="type_name" required maxLength={80} placeholder="Nome (ex.: Nota fiscal de venda extra)" className={input} />
                    <textarea name="instructions" rows={2} maxLength={1000} placeholder="Instruções para quem vai enviar (opcional)" className={input} />
                    <select name="group_id" required defaultValue="" className={input} aria-label="Grupo que deve entregar">
                      <option value="" disabled>
                        Grupo que deve entregar
                      </option>
                      {(groups ?? [])
                        .filter((g) => g.status === "active")
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                    </select>
                    <label className="block text-xs text-slate-700">
                      Prazo
                      <input type="datetime-local" name="due_at" required className={`${input} mt-0.5`} />
                    </label>
                    <button className="w-full rounded-lg bg-brand py-1.5 text-[12px] font-medium text-white hover:bg-brand-600 cursor-pointer">Solicitar ao grupo</button>
                  </form>

                  <DocumentUploadForm variant="standalone" claimId={claim.id} claimCycleId={cycle.id} hint={uploadHint} />
                </div>
              </div>
            }
            timeline={
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
                <li key={stage.id} id={`etapa-${stage.id}`} className="scroll-mt-4 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        {NODE_META[type]?.label ?? type}
                        {stage.pass_number > 1 && ` · ${stage.pass_number}ª passagem`}
                      </span>
                      <h3 className="text-[14px] font-medium text-slate-900">{node?.name ?? "-"}</h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {liveSla && liveSla.status !== "completed" && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${SLA_STATUS_STYLE[liveSla.status]}`}
                          title={tracking ? formatMinutesRemaining(tracking.target_at) : undefined}
                        >
                          {SLA_STATUS_LABEL[liveSla.status]}
                        </span>
                      )}
                      <StageBadge status={stage.status} />
                    </div>
                  </div>

                  {liveSla && liveSla.status !== "completed" && tracking && (
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                      <span className="inline-flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
                        {isPaused ? (
                          "Prazo pausado"
                        ) : node && slaOf(node) ? (
                          <StageSlaBadge enteredAt={stage.entered_at} slaMinutes={slaOf(node)} />
                        ) : (
                          formatMinutesRemaining(tracking.target_at)
                        )}
                        <span>nesta etapa há {formatDuration(minutesSince(stage.entered_at))}</span>
                      </span>
                      {cycle.status === "discarded" ? null : isPaused ? (
                        <form action={resumeSla.bind(null, tracking.id, claim.id)}>
                          <button className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                            <PlayCircle className="size-3.5" /> Retomar prazo
                          </button>
                        </form>
                      ) : (
                        <details className="relative">
                          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
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

                  {activity && type !== "end" && (() => {
                    const stageFields = (node?.config.field_keys ?? [])
                      .map((k) => fieldByKey.get(k))
                      .filter((f): f is NonNullable<typeof f> => !!f);
                    stageFields.sort((x, y) => x.position - y.position);
                    const readonlyKeys = new Set(node?.config.readonly_field_keys ?? []);
                    const editableFields = stageFields.filter((f) => !readonlyKeys.has(f.key) && f.field_type !== "calculated");
                    const consultFields = stageFields.filter((f) => readonlyKeys.has(f.key) || f.field_type === "calculated");
                    return (
                    <>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 pt-3">
                      <span className="text-[12px] text-slate-500">
                        Grupo:{" "}
                        <span className="font-medium text-slate-700">
                          {activity.group_id && groupMeta.get(activity.group_id) ? (
                            <GroupChip name={groupMeta.get(activity.group_id)!.name} icon={groupMeta.get(activity.group_id)!.icon} color={groupMeta.get(activity.group_id)!.color} />
                          ) : (
                            "-"
                          )}
                        </span>
                      </span>
                    {stage.status === "completed" && stage.exited_at && node?.type !== "end" && (() => {
                      const limit = node ? slaOf(node) : undefined;
                      const took = Math.max(0, Math.round((new Date(stage.exited_at).getTime() - new Date(stage.entered_at).getTime()) / 60000));
                      const late = limit ? took > limit : false;
                      return (
                        <span
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${
                              !limit ? "border-slate-200 bg-slate-50 text-slate-600" : late ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {!limit
                              ? `Levou ${formatDuration(took)} (sem prazo definido)`
                              : late
                                ? `Fora do prazo • estourou em ${formatDuration(took - limit)} (levou ${formatDuration(took)} de ${formatDuration(limit)})`
                                : `No prazo • levou ${formatDuration(took)} de ${formatDuration(limit)}`}
                          </span>
                      );
                    })()}
                    {activity.status === "completed" &&
                      stage.id === lastDoneStageId &&
                      perms.has("claim.execute") &&
                      !["discarded", "blocked", "cancelled", "archived"].includes(cycle.status) &&
                      (isAdmin ||
                        (activity.completed_by === ctx.userId &&
                          !!activity.completed_at &&
                          Date.now() - new Date(activity.completed_at).getTime() <= UNDO_WINDOW_MINUTES * 60000 &&
                          canActOnGroup(activity.group_id))) && (
                        <details className="[&[open]]:basis-full">
                          <summary className="inline-flex cursor-pointer list-none text-[12px] font-medium text-rose-800 underline-offset-2 hover:text-rose-900 hover:underline">
                            Concluí sem querer, desfazer
                          </summary>
                          <form
                            action={undoActivityCompletion.bind(null, activity.id)}
                            className="mt-2 flex max-w-md items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3"
                          >
                            <input name="reason" required placeholder="Motivo para desfazer" className={`${input} text-[12px]`} />
                            <button className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-amber-700">
                              Desfazer
                            </button>
                          </form>
                          <p className="mt-1 text-xs text-slate-500">
                            A etapa volta a ficar em andamento e o motivo fica registrado.
                            {!isAdmin && ` Quem concluiu pode desfazer por até ${UNDO_WINDOW_MINUTES} minutos, enquanto a seguinte não for concluída.`}
                          </p>
                        </details>
                      )}
                      {activity.status === "in_progress" &&
                      cycle.status !== "discarded" &&
                      perms.has("claim.execute") &&
                      canActOnGroup(activity.group_id) ? (
                        <ActivityForm action={completeActivityWithState.bind(null, activity.id)} className="w-full space-y-2.5">
                          {consultFields.length > 0 && (
                            <dl className="grid gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-[12px] sm:grid-cols-2 lg:grid-cols-3" aria-label="Campos só para consulta">
                              {consultFields.map((f) => {
                                const raw = viewFields[f.key];
                                const has = raw !== undefined && raw !== null && String(raw) !== "";
                                const display = !has
                                  ? "-"
                                  : f.field_type === "boolean"
                                    ? raw === "true"
                                      ? "Sim"
                                      : "Não"
                                    : f.field_type === "person"
                                      ? (memberOptions.find((m) => m.id === raw)?.name ?? raw)
                                      : f.field_type === "date"
                                        ? new Date(`${raw}T00:00:00`).toLocaleDateString("pt-BR")
                                        : fmtValue(f, raw);
                                return (
                                  <div key={f.key} className="flex gap-1.5">
                                    <dt className="text-slate-500">{f.label}:</dt>
                                    <dd className="font-medium text-slate-800">
                                      {f.field_type === "attachment" && has && attachmentUrlByPath.get(raw) ? (
                                        <a href={attachmentUrlByPath.get(raw) ?? undefined} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                                          Ver arquivo
                                        </a>
                                      ) : (
                                        display
                                      )}
                                    </dd>
                                  </div>
                                );
                              })}
                              <div className="text-xs text-slate-400 sm:col-span-2 lg:col-span-3">Somente consulta nesta etapa.</div>
                            </dl>
                          )}
                          {editableFields.length > 0 && (
                            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                              {editableFields.map((f) => (
                                <div key={f.key}>
                                  <label htmlFor={`field-${f.key}`} className="mb-1 block text-[12px] font-medium text-slate-600">
                                    {f.label}
                                    {f.required && <span className="text-rose-600"> *</span>}
                                  </label>
                                  {f.field_type === "select" ? (
                                    <select
                                      id={`field-${f.key}`}
                                      name={`field_${f.key}`}
                                      required={f.required}
                                      defaultValue={customFields[f.key] ?? f.default_value ?? ""}
                                      className={`${input} text-[13px]`}
                                    >
                                      <option value="">Selecione…</option>
                                      {((f.options as string[] | null) ?? []).map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : f.field_type === "boolean" ? (
                                    <select
                                      id={`field-${f.key}`}
                                      name={`field_${f.key}`}
                                      required={f.required}
                                      defaultValue={customFields[f.key] ?? f.default_value ?? ""}
                                      className={`${input} text-[13px]`}
                                    >
                                      <option value="">Selecione…</option>
                                      <option value="true">Sim</option>
                                      <option value="false">Não</option>
                                    </select>
                                  ) : f.field_type === "person" ? (
                                    <select
                                      id={`field-${f.key}`}
                                      name={`field_${f.key}`}
                                      required={f.required}
                                      defaultValue={customFields[f.key] ?? f.default_value ?? ""}
                                      className={`${input} text-[13px]`}
                                    >
                                      <option value="">Selecione…</option>
                                      {memberOptions.map((m) => (
                                        <option key={m.id} value={m.id}>
                                          {m.name}
                                        </option>
                                      ))}
                                    </select>
                                  ) : f.field_type === "textarea" ? (
                                    <textarea
                                      id={`field-${f.key}`}
                                      name={`field_${f.key}`}
                                      rows={3}
                                      required={f.required}
                                      defaultValue={customFields[f.key] ?? f.default_value ?? ""}
                                      className={`${input} text-[13px]`}
                                    />
                                  ) : f.field_type === "attachment" ? (
                                    <div>
                                      {customFields[f.key] && attachmentUrlByPath.get(customFields[f.key]) && (
                                        <a
                                          href={attachmentUrlByPath.get(customFields[f.key]) ?? undefined}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="mb-1 block text-[12px] text-brand hover:underline"
                                        >
                                          Ver arquivo já enviado
                                        </a>
                                      )}
                                      <input
                                        id={`field-${f.key}`}
                                        name={`field_${f.key}`}
                                        type="file"
                                        required={f.required && !customFields[f.key]}
                                        className={`${input} text-[13px]`}
                                      />
                                    </div>
                                  ) : (
                                    <input
                                      id={`field-${f.key}`}
                                      name={`field_${f.key}`}
                                      type={f.field_type === "number" || f.field_type === "money" || f.field_type === "percent" ? "number" : f.field_type === "date" ? "date" : "text"}
                                      step={f.field_type === "money" || f.field_type === "percent" ? "0.01" : f.field_type === "number" ? "any" : undefined}
                                      min={f.field_type === "percent" ? (f.min_value ?? 0) : (f.min_value ?? undefined)}
                                      max={f.field_type === "percent" ? (f.max_value ?? 100) : (f.max_value ?? undefined)}
                                      required={f.required}
                                      minLength={f.field_type === "text" ? (f.min_length ?? undefined) : undefined}
                                      maxLength={f.field_type === "text" ? (f.max_length ?? undefined) : undefined}
                                      defaultValue={customFields[f.key] ?? f.default_value ?? ""}
                                      className={`${input} text-[13px]`}
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex justify-end">
                            <ConfirmSubmit
                              title={`Concluir a etapa "${node?.name ?? ""}"?`}
                              description={
                                <>
                                  Sinistro <span className="font-medium">{claim.claim_number}</span>. Confira os dados desta etapa antes de seguir.
                                </>
                              }
                              confirmLabel="Concluir etapa"
                              className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition hover:bg-brand-600"
                            >
                              Concluir
                            </ConfirmSubmit>
                          </div>
                        </ActivityForm>
                      ) : activity.status === "in_progress" && cycle.status === "discarded" ? (
                        <span className="ml-auto text-[12px] text-slate-500">Ciclo descartado</span>
                      ) : activity.status === "in_progress" ? (
                        <span className="ml-auto text-[12px] text-slate-500">Sem permissão para concluir</span>
                      ) : activity.status === "cancelled" ? (
                        <span className="ml-auto text-[12px] text-slate-500">Desfeita (conclusão anterior desfeita)</span>
                      ) : (
                        <span className="ml-auto inline-flex items-center gap-1 text-[12px] text-emerald-700">
                          <CheckCircle2 className="size-3.5" /> Concluída
                        </span>
                      )}
                    </div>
                    {activity.status === "completed" && stageFields.some((f) => viewFields[f.key]) && (
                      <dl className="mt-2.5 grid gap-x-4 gap-y-1 border-t border-slate-100 pt-2.5 text-[12px] sm:grid-cols-2">
                        {stageFields
                          .filter((f) => viewFields[f.key])
                          .map((f) => {
                            const raw = viewFields[f.key];
                            const display =
                              f.field_type === "boolean"
                                ? raw === "true"
                                  ? "Sim"
                                  : "Não"
                                : f.field_type === "person"
                                  ? (memberOptions.find((m) => m.id === raw)?.name ?? raw)
                                  : fmtValue(f, raw);
                            return (
                              <div key={f.key} className="flex gap-1.5">
                                <dt className="text-slate-500">{f.label}:</dt>
                                <dd className="font-medium text-slate-800">
                                  {f.field_type === "attachment" && attachmentUrlByPath.get(raw) ? (
                                    <a href={attachmentUrlByPath.get(raw) ?? undefined} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                                      Ver arquivo
                                    </a>
                                  ) : (
                                    display
                                  )}
                                </dd>
                              </div>
                            );
                          })}
                      </dl>
                    )}
                    </>
                    );
                  })()}

                  {activity && (pendingByActivity.get(activity.id)?.length ?? 0) > 0 && (
                    <ul className="mt-2.5 space-y-1.5 border-t border-slate-100 pt-2.5">
                      {(pendingByActivity.get(activity.id) ?? []).map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-2 text-[12px]">
                          <span className={p.status === "open" ? "text-slate-700" : "text-slate-500 line-through"}>
                            {p.title}
                            {p.responsible_group_id && <span className="ml-1.5 text-slate-500">· {groupName.get(p.responsible_group_id)}</span>}
                          </span>
                          {p.status === "open" && cycle.status !== "discarded" && (
                            <span className="flex shrink-0 items-center gap-2">
                              <form action={resolvePendingItem.bind(null, p.id, claim.id)}>
                                <button className="text-emerald-600 hover:underline">Resolver</button>
                              </form>
                              <form action={cancelPendingItem.bind(null, p.id, claim.id)}>
                                <button className="text-slate-500 hover:underline">Cancelar</button>
                              </form>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {activity && cycle.status !== "discarded" && (
                    <details className="mt-2 border-t border-slate-100 pt-2">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-600">
                        + Pendência
                      </summary>
                      <form
                        action={createPendingItem.bind(null, activity.id)}
                        className="mt-2 flex flex-wrap items-end gap-1.5"
                      >
                        <input type="hidden" name="claim_id" value={claim.id} />
                        <input name="title" required placeholder="O que falta?" className={`${input} w-48 text-[12px]`} />
                        <select name="group_id" className={`${input} w-40 text-[12px]`}>
                          <option value="">Grupo responsável…</option>
                          {[...groupName.entries()].map(([id, name]) => (
                            <option key={id} value={id}>
                              {name}
                            </option>
                          ))}
                        </select>
                        <input name="due_at" type="date" className={`${input} w-36 text-[12px]`} />
                        <button className="rounded-md border border-slate-200 px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
                          Adicionar
                        </button>
                      </form>
                    </details>
                  )}

                  {joinProgress && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <p className="text-[12px] font-medium text-amber-700">
                        Aguardando ramos ({joinProgress.ruleLabel}), {joinProgress.completed} de {joinProgress.total}
                      </p>
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {joinProgress.branches.map((b, i) => (
                          <li
                            key={i}
                            className={`rounded-md px-2 py-0.5 text-xs ring-1 ring-inset ${
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
                        <p className="mt-2 text-[12px] text-slate-500">Ciclo descartado</p>
                      ) : !perms.has("claim.execute") || !canActOnGroup(node?.groupId ?? null) ? (
                        <p className="mt-2 text-[12px] text-slate-500">Sem permissão para decidir</p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {((decision.options as string[]) ?? []).map((opt) => (
                            <form key={opt} action={chooseDecision.bind(null, decision.id, opt, "")}>
                              <ConfirmSubmit
                                title={`Escolher "${opt}"?`}
                                description={
                                  <>
                                    Decisão: <span className="font-medium">{decision.question}</span> (sinistro {claim.claim_number}). O fluxo segue pelo
                                    caminho escolhido.
                                  </>
                                }
                                confirmLabel="Confirmar decisão"
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-700 transition hover:border-brand/40 hover:bg-brand/[0.03]"
                              >
                                {opt}
                              </ConfirmSubmit>
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
          } />
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
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}>
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
  const label = status === "completed" ? "Concluída" : status === "in_progress" ? "Em andamento" : status === "cancelled" ? "Desfeita" : status;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}>{label}</span>;
}
