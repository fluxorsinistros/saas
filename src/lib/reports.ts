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

export type OperationalSnapshot = {
  totalCycles: number;
  statusCounts: CycleStatusCounts;
  blocked: BlockedCycle[];
  aging: AgingCycle[];
  backlogByGroup: GroupBacklog[];
  byCategory: CategoryCount[];
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

  return { totalCycles: (cycles ?? []).length, statusCounts, blocked, aging, backlogByGroup, byCategory };
}
