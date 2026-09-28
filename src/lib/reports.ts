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
// já dentro da faixa de alerta (slaAtRisk) — o sinal deixa as duas listas ordenáveis pela mesma
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
};

const OPEN_STATUSES = ["draft", "open", "in_progress", "waiting"];

// Alimenta Tower of Control (Documento 5 §6) e Dashboard (§7) — os dois leem o mesmo agregado,
// só mudam o que destacam, para nunca haver duas contas diferentes de "quantos estão atrasados".
export async function loadOperationalSnapshot(supabase: Supa, tenantId: string): Promise<OperationalSnapshot> {
  const { data: cycles } = await supabase
    .from("claim_cycles")
    .select("id, claim_id, status, formalized_at")
    .eq("tenant_id", tenantId);

  const claimIds = [...new Set((cycles ?? []).map((c) => c.claim_id))];
  const { data: claims } = claimIds.length
    ? await supabase.from("claims").select("id, claim_number, claim_category_id").in("id", claimIds)
    : { data: [] as { id: string; claim_number: string; claim_category_id: string }[] };
  const claimById = new Map((claims ?? []).map((c) => [c.id, c]));

  const categoryIds = [...new Set((claims ?? []).map((c) => c.claim_category_id))];
  const { data: categories } = categoryIds.length
    ? await supabase.from("claim_categories").select("id, name").in("id", categoryIds)
    : { data: [] as { id: string; name: string }[] };
  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const statusCounts: CycleStatusCounts = {};
  const byCategoryMap = new Map<string, number>();
  for (const c of cycles ?? []) {
    statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
    const claim = claimById.get(c.claim_id);
    if (claim) byCategoryMap.set(claim.claim_category_id, (byCategoryMap.get(claim.claim_category_id) ?? 0) + 1);
  }
  const byCategory: CategoryCount[] = [...byCategoryMap.entries()]
    .map(([categoryId, count]) => ({ categoryId, categoryName: categoryName.get(categoryId) ?? "—", count }))
    .sort((a, b) => b.count - a.count);

  const blockedCycles = (cycles ?? []).filter((c) => c.status === "blocked");
  const blockedIds = blockedCycles.map((c) => c.id);
  const { data: blockLogs } = blockedIds.length
    ? await supabase
        .from("audit_logs")
        .select("entity_id, reason, created_at")
        .in("entity_id", blockedIds)
        .eq("action", "cycle.blocked")
        .order("created_at", { ascending: false })
    : { data: [] as { entity_id: string; reason: string | null; created_at: string }[] };
  const reasonByCycle = new Map<string, { reason: string | null; created_at: string }>();
  for (const log of blockLogs ?? []) {
    if (!reasonByCycle.has(log.entity_id)) reasonByCycle.set(log.entity_id, log);
  }
  const blocked: BlockedCycle[] = blockedCycles.map((c) => ({
    cycleId: c.id,
    claimId: c.claim_id,
    claimNumber: claimById.get(c.claim_id)?.claim_number ?? "—",
    reason: reasonByCycle.get(c.id)?.reason ?? null,
    blockedAt: reasonByCycle.get(c.id)?.created_at ?? null,
  }));

  const now = Date.now();
  const aging: AgingCycle[] = (cycles ?? [])
    .filter((c) => OPEN_STATUSES.includes(c.status) && c.formalized_at)
    .map((c) => ({
      cycleId: c.id,
      claimId: c.claim_id,
      claimNumber: claimById.get(c.claim_id)?.claim_number ?? "—",
      status: c.status,
      formalizedAt: c.formalized_at!,
      days: Math.floor((now - new Date(c.formalized_at!).getTime()) / 86_400_000),
    }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 8);

  const cycleIds = (cycles ?? []).map((c) => c.id);
  const { data: stages } = cycleIds.length
    ? await supabase.from("stage_instances").select("id, claim_cycle_id").in("claim_cycle_id", cycleIds)
    : { data: [] as { id: string; claim_cycle_id: string }[] };
  const stageIds = (stages ?? []).map((s) => s.id);
  const { data: activities } = stageIds.length
    ? await supabase
        .from("activity_instances")
        .select("group_id, status")
        .in("stage_instance_id", stageIds)
        .in("status", ["not_started", "in_progress"])
    : { data: [] as { group_id: string | null; status: string }[] };

  const { data: groups } = await supabase.from("groups").select("id, name").eq("tenant_id", tenantId);
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const backlogMap = new Map<string, number>();
  for (const a of activities ?? []) {
    if (!a.group_id) continue;
    backlogMap.set(a.group_id, (backlogMap.get(a.group_id) ?? 0) + 1);
  }
  const backlogByGroup: GroupBacklog[] = [...backlogMap.entries()]
    .map(([groupId, count]) => ({ groupId, groupName: groupName.get(groupId) ?? "—", count }))
    .sort((a, b) => b.count - a.count);

  // SLA (Documento 4/5 §6-§7): "próximos do prazo" e "atrasados" calculados ao vivo sobre
  // sla_tracking, sem esperar o scheduler periódico (ainda não implementado — ver §10 do doc4).
  const { data: openTracking } = cycleIds.length
    ? await supabase
        .from("sla_tracking")
        .select("claim_cycle_id, started_at, target_at, workflow_slas(alert_thresholds)")
        .in("claim_cycle_id", cycleIds)
        .in("status", ["on_track", "at_risk"])
    : { data: [] as { claim_cycle_id: string; started_at: string; target_at: string; workflow_slas: { alert_thresholds: number[] } | null }[] };

  const cycleById = new Map((cycles ?? []).map((c) => [c.id, c]));
  const overdueMap = new Map<string, number>();
  const atRiskMap = new Map<string, number>();
  const nowTs = Date.now();
  for (const t of openTracking ?? []) {
    const cycle = cycleById.get(t.claim_cycle_id);
    if (!cycle) continue;
    const started = new Date(t.started_at).getTime();
    const target = new Date(t.target_at).getTime();
    const minutesOverdue = Math.round((nowTs - target) / 60_000);
    if (minutesOverdue >= 0) {
      overdueMap.set(t.claim_cycle_id, Math.max(overdueMap.get(t.claim_cycle_id) ?? 0, minutesOverdue));
      continue;
    }
    if (target <= started) continue;
    // "próximo do prazo" = já cruzou o primeiro alert_threshold configurado (Documento 4 §4), a
    // mesma régua do alerta do motor de SLA — não é um "falta pouco tempo" arbitrário da tela.
    const elapsedPct = ((nowTs - started) / (target - started)) * 100;
    const thresholds = (t.workflow_slas as unknown as { alert_thresholds: number[] } | null)?.alert_thresholds ?? [75, 90, 95, 100];
    const firstThreshold = Math.min(...thresholds);
    if (elapsedPct >= firstThreshold) {
      atRiskMap.set(t.claim_cycle_id, Math.round((target - nowTs) / 60_000) * -1);
    }
  }

  const toSlaItems = (map: Map<string, number>): SlaItem[] =>
    [...map.entries()]
      .map(([cycleId, minutesOverdue]) => {
        const cycle = cycleById.get(cycleId)!;
        return { cycleId, claimId: cycle.claim_id, claimNumber: claimById.get(cycle.claim_id)?.claim_number ?? "—", minutesOverdue };
      })
      .sort((a, b) => b.minutesOverdue - a.minutesOverdue)
      .slice(0, 8);

  const slaOverdue = toSlaItems(overdueMap);
  const slaAtRisk = toSlaItems(atRiskMap);

  return { totalCycles: (cycles ?? []).length, statusCounts, blocked, aging, backlogByGroup, byCategory, slaOverdue, slaAtRisk };
}
