import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Supa = SupabaseClient<Database>;

export type CycleStatusCounts = Record<string, number>;

export type BlockedCycle = {
  cycleId: string;
  claimId: string;
  claimNumber: string;
  reason: string | null;
  blockedAt: string | null;
};

export type AgingCycle = {
  cycleId: string;
  claimId: string;
  claimNumber: string;
  status: string;
  formalizedAt: string;
  days: number;
};

export type GroupBacklog = { groupId: string; groupName: string; count: number };

export type CategoryCount = { categoryId: string; categoryName: string; count: number };

// minutesOverdue: positivo = minutos de atraso (slaOverdue); negativo = minutos que faltam,
// já dentro da faixa de alerta (slaAtRisk), o sinal deixa as duas listas ordenáveis pela mesma
// regra (mais urgente primeiro) sem precisar de dois campos.
export type SlaItem = { cycleId: string; claimId: string; claimNumber: string; minutesOverdue: number };

export type OperationalSnapshot = {
  totalCycles: number;
  statusCounts: CycleStatusCounts;
  blocked: BlockedCycle[];
  aging: AgingCycle[];
  backlogByGroup: GroupBacklog[];
  byCategory: CategoryCount[];
  slaOverdue: SlaItem[];
  slaAtRisk: SlaItem[];
  // As listas acima mostram só os primeiros itens; as contagens abaixo são o total de verdade.
  blockedCount: number;
  slaOverdueCount: number;
  slaAtRiskCount: number;
};


// Alimenta Tower of Control (Documento 5 §6) e Dashboard (§7), os dois leem o mesmo agregado,
// só mudam o que destacam, para nunca haver duas contas diferentes de "quantos estão atrasados".
//
// `groupId`: visão do Operador. Só entram os ciclos em que o grupo dele tem (ou teve) atividade, e os prazos contados são
// os das etapas desse grupo. Sem `groupId` (Administrador) é a empresa inteira.
export async function loadGroupScope(supabase: Supa, tenantId: string, groupId: string | null): Promise<{ cycleIds: Set<string>; stageIds: Set<string> }> {
  if (!groupId) return { cycleIds: new Set(), stageIds: new Set() };
  const { data: acts } = await supabase
    .from("activity_instances")
    .select("stage_instance_id")
    .eq("tenant_id", tenantId)
    .eq("group_id", groupId);
  const stageIds = [...new Set((acts ?? []).map((a) => a.stage_instance_id))];
  const { data: stages } = stageIds.length
    ? await supabase.from("stage_instances").select("id, claim_cycle_id").in("id", stageIds)
    : { data: [] as { id: string; claim_cycle_id: string }[] };
  return { cycleIds: new Set((stages ?? []).map((s) => s.claim_cycle_id)), stageIds: new Set(stageIds) };
}

const NO_GROUP = "00000000-0000-0000-0000-000000000000";

type RpcItem = { cycle_id: string; claim_id: string; claim_number: string };
type RpcSummary = {
  total: number;
  status_counts: Record<string, number>;
  by_category: { id: string; name: string; count: number }[];
  backlog: { id: string; name: string; count: number }[];
  blocked_count: number;
  blocked: (RpcItem & { reason: string | null; blocked_at: string | null })[];
  aging: (RpcItem & { status: string; formalized_at: string; days: number })[];
  sla_overdue_count: number;
  sla_overdue: (RpcItem & { minutes: number })[];
  sla_at_risk_count: number;
  sla_at_risk: (RpcItem & { minutes: number })[];
};

// Os números vêm prontos do banco (public.operational_summary): o app não baixa mais todos os ciclos para somar, então
// o custo não cresce com o número de sinistros. `scope` presente = visão do Operador (só o grupo dele; sem grupo = nada).
export async function loadOperationalSnapshot(
  supabase: Supa,
  tenantId: string,
  scope?: { groupId: string | null },
): Promise<OperationalSnapshot> {
  const { data, error } = await supabase.rpc("operational_summary", {
    p_tenant_id: tenantId,
    p_group_id: scope ? (scope.groupId ?? NO_GROUP) : undefined,
  });
  if (error) throw new Error(error.message);
  const r = data as unknown as RpcSummary;
  const item = (x: RpcItem & { minutes: number }): SlaItem => ({ cycleId: x.cycle_id, claimId: x.claim_id, claimNumber: x.claim_number, minutesOverdue: x.minutes });
  return {
    totalCycles: r.total,
    statusCounts: r.status_counts,
    blocked: r.blocked.map((b) => ({ cycleId: b.cycle_id, claimId: b.claim_id, claimNumber: b.claim_number, reason: b.reason, blockedAt: b.blocked_at })),
    aging: r.aging.map((a) => ({ cycleId: a.cycle_id, claimId: a.claim_id, claimNumber: a.claim_number, status: a.status, formalizedAt: a.formalized_at, days: a.days })),
    backlogByGroup: r.backlog.map((g) => ({ groupId: g.id, groupName: g.name, count: g.count })),
    byCategory: r.by_category.map((c) => ({ categoryId: c.id, categoryName: c.name, count: c.count })),
    slaOverdue: r.sla_overdue.map(item),
    slaAtRisk: r.sla_at_risk.map(item),
    blockedCount: r.blocked_count,
    slaOverdueCount: r.sla_overdue_count,
    slaAtRiskCount: r.sla_at_risk_count,
  };
}

export type OperationalTrend = { days: string[]; total: number[]; open: number[]; blocked: number[]; completed: number[]; overdue: number[]; atRisk: number[] };

// Linhas dos cards do Dashboard: por data de abertura (formalização), um ponto por dia. Falha aqui nunca derruba a tela:
// sem tendência os cards só mostram o número.
export async function loadOperationalTrend(supabase: Supa, tenantId: string, scope?: { groupId: string | null }, days = 30): Promise<OperationalTrend | null> {
  const { data, error } = await supabase.rpc("operational_trend", {
    p_tenant_id: tenantId,
    p_group_id: scope ? (scope.groupId ?? NO_GROUP) : undefined,
    p_days: days,
  });
  if (error || !data) return null;
  const r = data as unknown as { days: string[]; total: number[]; open: number[]; blocked: number[]; completed: number[]; overdue: number[]; at_risk: number[] };
  return { days: r.days, total: r.total, open: r.open, blocked: r.blocked, completed: r.completed, overdue: r.overdue, atRisk: r.at_risk };
}
