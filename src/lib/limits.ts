import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Supa = SupabaseClient<Database>;

// Limites efetivos = limites do plano, sobrescritos pelo que foi personalizado no contrato do cliente.
// null (sem contrato ativo) = sem limites aplicados. Chave ausente ou null dentro do mapa = sem limite.
export type Limits = Record<string, number | null>;

export async function getLimits(supabase: Supa, tenantId: string): Promise<Limits | null> {
  const { data: contract } = await supabase
    .from("tenant_contracts")
    .select("plan_id, overrides, status")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!contract || contract.status !== "active") return null;

  const { data: rows } = await supabase.from("plan_limits").select("limit_key, limit_value").eq("plan_id", contract.plan_id);
  const limits: Limits = {};
  for (const r of rows ?? []) limits[r.limit_key] = r.limit_value === null ? null : Number(r.limit_value);
  for (const [k, v] of Object.entries((contract.overrides ?? {}) as Record<string, unknown>)) {
    limits[k] = v === null || v === undefined ? null : Number(v);
  }
  return limits;
}

/** Valor numérico do limite; null = sem limite. */
export function limitOf(limits: Limits | null, key: string): number | null {
  const v = limits?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Interruptores (sim/não): só é "permitido" se estiver explicitamente em 1. */
export function isAllowed(limits: Limits | null, key: string): boolean {
  return Number(limits?.[key]) === 1;
}

/** Bloqueia a criação de mais um item quando o plano já chegou no máximo. */
export async function assertCountLimit(supabase: Supa, tenantId: string, key: string, label: string, current: number): Promise<void> {
  const cap = limitOf(await getLimits(supabase, tenantId), key);
  if (cap !== null && current >= cap) {
    throw new Error(`Limite do plano atingido: ${label} (máximo ${cap}). Fale com o suporte para ampliar.`);
  }
}
