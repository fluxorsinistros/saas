import { GroupChip } from "@/lib/group-icons";
import { StageSlaBadge } from "@/components/StageSlaBadge";
import { getMemberGroups } from "@/lib/active-group";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, FileText } from "lucide-react";
import { isPastIso } from "@/lib/format";
import { loadCalendarBundles } from "@/lib/sla-load";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { NODE_META, type NodeType } from "@/lib/workflow/types";

export const metadata: Metadata = { title: "Minhas tarefas" };

// Quem vê o quê: o Administrador controla a empresa e vê as tarefas de TODOS os grupos; o Operador vê só as do grupo
// em que está atuando agora. Isso é decidido aqui, no servidor, não existe parâmetro de endereço que amplie a lista.
export default async function TarefasPage() {
  const ctx = await getTenantContext();
  const supabase = await createClient();

  const { isAdmin, active: activeGroup } = await getMemberGroups(ctx.userId, ctx.tenantId);
  const scope = isAdmin ? "all" : "mine";
  const myGroupIds = activeGroup ? [activeGroup.id] : [];

  let query = supabase
    .from("activity_instances")
    .select("id, status, group_id, subgroup_id, started_at, stage_instance_id")
    .eq("tenant_id", ctx.tenantId)
    .in("status", ["not_started", "in_progress"])
    .order("started_at", { ascending: true })
    .limit(100);
  if (scope === "mine") {
    query = query.in("group_id", myGroupIds.length ? myGroupIds : ["00000000-0000-0000-0000-000000000000"]);
    // etapa de um subgrupo só aparece para quem está nele; etapa sem subgrupo, para todo o grupo
    query = activeGroup?.subgroup_id ? query.or(`subgroup_id.is.null,subgroup_id.eq.${activeGroup.subgroup_id}`) : query.is("subgroup_id", null);
  }
  const { data: activities } = await query;

  // Decisões ainda sem resposta também são tarefas do grupo responsável pela decisão (e do subgrupo, quando há)
  let decisionQuery = supabase
    .from("decisions")
    .select("id, node_id, stage_instance_id, subgroup_id, created_at")
    .eq("tenant_id", ctx.tenantId)
    .is("selected_option", null)
    .not("stage_instance_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(100);
  if (scope === "mine") {
    decisionQuery = activeGroup?.subgroup_id ? decisionQuery.or(`subgroup_id.is.null,subgroup_id.eq.${activeGroup.subgroup_id}`) : decisionQuery.is("subgroup_id", null);
  }
  const { data: decisionsRaw } = await decisionQuery;

  const stageIds = [
    ...new Set([...(activities ?? []).map((a) => a.stage_instance_id), ...(decisionsRaw ?? []).map((d) => d.stage_instance_id as string)]),
  ];
  const { data: stages } = stageIds.length
    ? await supabase.from("stage_instances").select("id, node_id, claim_cycle_id, entered_at").in("id", stageIds)
    : { data: [] as { id: string; node_id: string; claim_cycle_id: string; entered_at: string }[] };
  const stageById = new Map((stages ?? []).map((s) => [s.id, s]));

  const cycleIds = [...new Set((stages ?? []).map((s) => s.claim_cycle_id))];
  const { data: cycles } = cycleIds.length
    ? await supabase.from("claim_cycles").select("id, claim_id, status").in("id", cycleIds)
    : { data: [] as { id: string; claim_id: string; status: string }[] };
  const cycleById = new Map((cycles ?? []).map((c) => [c.id, c]));

  const claimIds = [...new Set((cycles ?? []).map((c) => c.claim_id))];
  const { data: claims } = claimIds.length
    ? await supabase.from("claims").select("id, claim_number").in("id", claimIds)
    : { data: [] as { id: string; claim_number: string }[] };
  const claimById = new Map((claims ?? []).map((c) => [c.id, c]));

  const nodeIds = [...new Set((stages ?? []).map((s) => s.node_id))];
  const { data: nodes } = nodeIds.length
    ? await supabase.from("workflow_nodes").select("id, name, node_type, config, group_id").in("id", nodeIds)
    : { data: [] as { id: string; name: string; node_type: string; config: unknown; group_id: string | null }[] };
  const nodeById = new Map((nodes ?? []).map((n) => [n.id, n]));

  // Prazo real de cada etapa (calendário, dias úteis e feriados já considerados), gravado quando a etapa começa.
  const { data: trackRows } = stageIds.length
    ? await supabase.from("sla_tracking").select("stage_instance_id, target_at").in("stage_instance_id", stageIds).neq("status", "completed")
    : { data: [] as { stage_instance_id: string; target_at: string }[] };
  const targetByStage = new Map((trackRows ?? []).map((t) => [t.stage_instance_id, t.target_at]));
  const calBundles = await loadCalendarBundles(
    supabase,
    (nodes ?? []).map((n) => ((n.config ?? {}) as { sla_calendar_id?: string }).sla_calendar_id ?? ""),
  );

  const { data: groups } = await supabase.from("groups").select("id, name, icon, color").eq("tenant_id", ctx.tenantId);
  const groupById = new Map((groups ?? []).map((g) => [g.id, g]));

  // Documentos extra pedidos a grupos (pendências abertas): o grupo responsável vê o que precisa enviar; quem pediu vê o que
  // já chegou e espera o OK. Administrador vê tudo; o Operador só o do grupo em que atua.
  const { data: extraDocsRaw } = await supabase
    .from("documents")
    .select("id, status, claim_cycle_id, document_types(name), pending_items!inner(requested_by, responsible_group_id, due_at, status), claim_cycles(claim_id, claims(claim_number))")
    .eq("tenant_id", ctx.tenantId)
    .eq("is_extra", true)
    .eq("pending_items.status", "open")
    .limit(100);
  const extraDocs = (extraDocsRaw ?? []).map((d) => {
    const pend = d.pending_items as unknown as { requested_by: string | null; responsible_group_id: string | null; due_at: string | null };
    const cyc = d.claim_cycles as unknown as { claim_id: string; claims: { claim_number: string } | null } | null;
    return {
      id: d.id,
      status: d.status,
      name: (d.document_types as unknown as { name: string } | null)?.name ?? "Documento",
      groupId: pend.responsible_group_id,
      dueAt: pend.due_at,
      requestedBy: pend.requested_by,
      claimId: cyc?.claim_id ?? "",
      claimNumber: cyc?.claims?.claim_number ?? "-",
    };
  });
  const docsToSend = extraDocs
    .filter((d) => (d.status === "requested" || d.status === "rejected") && (isAdmin || (d.groupId !== null && myGroupIds.includes(d.groupId))))
    .sort((a, b) => (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9"));
  const docsToReview = extraDocs.filter((d) => d.status === "received" && (isAdmin || d.requestedBy === ctx.userId));

  // Cada decisão pendente vira uma linha igual às das etapas
  const decisionActivities = (decisionsRaw ?? [])
    .map((d) => {
      const node = nodeById.get(d.node_id ?? "");
      if (!node || (scope === "mine" && !(node.group_id && myGroupIds.includes(node.group_id)))) return null;
      return { id: d.id, status: "in_progress", group_id: node.group_id, subgroup_id: d.subgroup_id, started_at: d.created_at, stage_instance_id: d.stage_instance_id as string };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const rows = [...(activities ?? []), ...decisionActivities]
    .map((a) => {
      const stage = stageById.get(a.stage_instance_id);
      const cycle = stage ? cycleById.get(stage.claim_cycle_id) : undefined;
      const claim = cycle ? claimById.get(cycle.claim_id) : undefined;
      const node = stage ? nodeById.get(stage.node_id) : undefined;
      if (!stage || !cycle || !claim || !node || ["blocked", "completed", "discarded", "cancelled", "archived"].includes(cycle.status)) return null;
      const cfg = (node.config ?? {}) as { sla_minutes?: number; sla_calendar_id?: string };
      return {
        activity: a,
        claim,
        node,
        enteredAt: stage.entered_at,
        targetAt: targetByStage.get(a.stage_instance_id) ?? null,
        bundle: cfg.sla_calendar_id ? calBundles.get(cfg.sla_calendar_id) : undefined,
        slaMinutes: typeof cfg.sla_minutes === "number" && cfg.sla_minutes > 0 ? cfg.sla_minutes : undefined,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((x, y) => new Date(x.enteredAt).getTime() - new Date(y.enteredAt).getTime());

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-narrow px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{isAdmin ? "Tarefas da empresa" : "Minhas tarefas"}</h1>
        <p className="mt-1 max-w-xl text-[14px] text-slate-700">
          {isAdmin
            ? "Atividades em aberto em todos os grupos da empresa. Abra o sinistro para conferir os dados e concluir a etapa."
            : `Atividades em aberto no grupo em que você atua${activeGroup ? ` (${activeGroup.name})` : ""}. Abra o sinistro para conferir os dados e concluir a etapa.`}
        </p>
        {(docsToSend.length > 0 || docsToReview.length > 0) && (
          <section className="mt-6 space-y-6" aria-label="Documentos solicitados">
            {[
              { title: "Documentos para enviar", list: docsToSend, action: "Enviar" },
              { title: "Documentos para dar o OK", list: docsToReview, action: "Conferir" },
            ]
              .filter((g) => g.list.length > 0)
              .map((g) => (
                <div key={g.title}>
                  <h2 className="mb-2 text-[13px] font-semibold text-slate-900">
                    {g.title} ({g.list.length})
                  </h2>
                  <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {g.list.map((d) => {
                      const late = isPastIso(d.dueAt);
                      return (
                        <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                          <FileText className="size-4 shrink-0 text-slate-500" aria-hidden />
                          <Link href={`/sinistros/${d.claimId}`} className="min-w-0 flex-1">
                            <div className="truncate text-[14px] font-medium text-slate-900 hover:underline">{d.name}</div>
                            <div className="truncate text-[12px] text-slate-600">
                              {d.claimNumber}
                              {d.status === "rejected" && " · rejeitado, envie de novo"}
                            </div>
                          </Link>
                          {d.dueAt && (
                            <span className={`sla-chip ${late ? "sla-urgent" : "sla-ok"}`}>
                              {late ? "Atrasado · " : "Prazo "}
                              {new Date(d.dueAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                            </span>
                          )}
                          <Link href={`/sinistros/${d.claimId}`} className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition hover:bg-brand-600">
                            {g.action}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
          </section>
        )}
        {rows.length === 0 && docsToSend.length === 0 && docsToReview.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <CheckCircle2 className="mx-auto size-8 text-slate-300" />
            <p className="mt-3 text-[15px] font-medium text-slate-800">Nenhuma tarefa em aberto</p>
          </div>
        ) : rows.length === 0 ? null : (
          <section className="mt-6" aria-label="Etapas para executar">
          <h2 className="mb-2 text-[13px] font-semibold text-slate-900">Etapas e decisões para executar ({rows.length})</h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {rows.map(({ activity, claim, node, enteredAt, slaMinutes, targetAt, bundle }) => (
              <li key={activity.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {NODE_META[node.node_type as NodeType]?.label ?? node.node_type}
                </span>
                <Link href={`/sinistros/${claim.id}`} className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-slate-900 hover:underline">{node.name}</div>
                  <div className="truncate text-[12px] text-slate-500">
                    {claim.claim_number} ·{" "}
                    {activity.group_id && groupById.get(activity.group_id) ? (
                      <span className="inline-flex translate-y-[3px] items-center">
                        <GroupChip name={groupById.get(activity.group_id)!.name} icon={groupById.get(activity.group_id)!.icon} color={groupById.get(activity.group_id)!.color} />
                      </span>
                    ) : (
                      "-"
                    )}
                  </div>
                </Link>
                {activity.status === "in_progress" && <StageSlaBadge enteredAt={enteredAt} slaMinutes={slaMinutes} targetAt={targetAt} bundle={bundle} />}
                {activity.status === "in_progress" ? (
                  <Link
                    href={`/sinistros/${claim.id}#etapa-${activity.stage_instance_id}`}
                    className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition hover:bg-brand-600"
                  >
                    Abrir
                  </Link>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Não iniciada</span>
                )}
              </li>
            ))}
          </ul>
          </section>
        )}
      </div>
    </div>
  );
}
