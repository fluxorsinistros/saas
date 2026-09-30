import { PLAN_LIMITS, type PlanLimitDef } from "@/lib/plan-limits";

// Estilos e formatadores compartilhados pelas telas de Administração.
export const input =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";
export const btnPrimary = "rounded-lg bg-brand px-3 py-2 text-[12px] font-medium text-white hover:bg-brand-600";
export const btnGhost =
  "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-100";
export const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const limitLabel = (key: string) => PLAN_LIMITS.find((d) => d.key === key)?.label ?? key;

// Texto do valor efetivo de um limite (número, sim/não ou sem limite)
export function showValue(def: PlanLimitDef | undefined, v: unknown): string {
  if (def?.kind === "toggle") return Number(v) === 1 ? "permitido" : "bloqueado";
  return v === null || v === undefined ? "sem limite" : String(v).replace(".", ",");
}

export const formatNumber = (v: number | string | null | undefined) =>
  v === null || v === undefined ? "" : String(v).replace(".", ",");

export const TENANT_STATUS_LABEL: Record<string, string> = { active: "Ativa", suspended: "Suspensa", archived: "Arquivada" };
