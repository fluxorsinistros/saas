import { GroupChip } from "@/lib/group-icons";
import { StageSlaBadge } from "@/components/StageSlaBadge";
import { getMemberGroups } from "@/lib/active-group";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { NODE_META, type NodeType } from "@/lib/workflow/types";

export const metadata: Metadata = { title: "Minhas tarefas" };

// Quem vê o quê: o Administrador controla a empresa e vê as tarefas de TODOS os grupos; o Operador vê só as do grupo
// em que está atuando agora. Isso é decidido aqui, no servidor — não existe parâmetro de endereço que amplie a lista.
export default async function TarefasPage() {
  const ctx = await getTenantContext();
  const supabase = await createClient();

  const { isAdmin, active: activeGroup } = await getMemberGroups(ctx.userId, ctx.tenantId);
  const scope = isAdmin ? "all" : "mine";
  const myGroupIds = activeGroup ? [activeGroup.id] : [];

  let query = supabase
    .from("activity_instances")
    .select("id, status, group_id, started_at, stage_instance_id")
    .eq("tenant_id", ctx.tenantId)
    .in("status", ["not_started", "in_progress"])
    .order("started_at", { ascending: true })
    .limit(100);
  if (scope === "mine") query = query.in("group_id", myGroupIds.length ? myGroupIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: activities } = await query;

  const stageIds = [...new Set((activities ?? []).map((a) => a.stage_instance_id))];
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
    ? await supabase.from("workflow_nodes").select("id, name, node_type, config").in("id", nodeIds)
    : { data: [] as { id: string; name: string; node_type: string; config: unknown }[] };
  const nodeById = new Map((nodes ?? []).map((n) => [n.id, n]));

  const { data: groups } = await supabase.from("groups").select("id, name, icon, color").eq("tenant_id", ctx.tenantId);
  const groupById = new Map((groups ?? []).map((g) => [g.id, g]));

  const rows = (activities ?? [])
    .map((a) => {
      const stage = stageById.get(a.stage_instance_id);
      const cycle = stage ? cycleById.get(stage.claim_cycle_id) : undefined;
      const claim = cycle ? claimById.get(cycle.claim_id) : undefined;
      const node = stage ? nodeById.get(stage.node_id) : undefined;
      if (!stage || !cycle || !claim || !node || cycle.status === "blocked" || cycle.status === "completed") return null;
      const cfg = (node.config ?? {}) as { sla_minutes?: number };
      return {
        activity: a,
        claim,
        node,
        enteredAt: stage.entered_at,
        slaMinutes: typeof cfg.sla_minutes === "number" && cfg.sla_minutes > 0 ? cfg.sla_minutes : undefined,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-narrow px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{isAdmin ? "Tarefas da empresa" : "Minhas tarefas"}</h1>
        <p className="mt-1 max-w-xl text-[14px] text-slate-700">
          {isAdmin
            ? "Atividades em aberto em todos os grupos da empresa. Abra o sinistro para conferir os dados e concluir a etapa."
            : `Atividades em aberto no grupo em que você atua${activeGroup ? ` (${activeGroup.name})` : ""}. Abra o sinistro para conferir os dados e concluir a etapa.`}
        </p>
        {rows.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <CheckCircle2 className="mx-auto size-8 text-slate-300" />
            <p className="mt-3 text-[15px] font-medium text-slate-800">Nenhuma tarefa em aberto</p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {rows.map(({ activity, claim, node, enteredAt, slaMinutes }) => (
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
                      "—"
                    )}
                  </div>
                </Link>
                {activity.status === "in_progress" && <StageSlaBadge enteredAt={enteredAt} slaMinutes={slaMinutes} />}
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
        )}
      </div>
    </div>
  );
}
