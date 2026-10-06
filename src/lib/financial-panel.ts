// Painel financeiro de um fluxo: lista ordenada de itens, cada um apontando para um campo numérico do catálogo
// (número, R$, % ou calculado).
//  tone:  "neutral" ou "sign" (verde quando >= 0, vermelho quando negativo)
//  mode:  "edit" (a pessoa preenche no painel) ou "view" (só informativo). Calculado é sempre informativo.
//  label: rótulo só do painel (opcional); vazio usa o nome do campo.
export type PanelItem = { key: string; tone: "neutral" | "sign"; mode: "edit" | "view"; label?: string };

export const PANEL_MAX_ITEMS = 20;
export const PANEL_LABEL_MAX = 60;
export const PANEL_FIELD_TYPES = ["number", "money", "percent", "calculated"];

export function readPanel(raw: unknown): PanelItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PanelItem[] = [];
  for (const it of raw) {
    if (it && typeof it === "object" && typeof (it as PanelItem).key === "string") {
      const x = it as Partial<PanelItem>;
      const label = typeof x.label === "string" ? x.label.trim().slice(0, PANEL_LABEL_MAX) : "";
      out.push({ key: x.key as string, tone: x.tone === "sign" ? "sign" : "neutral", mode: x.mode === "view" ? "view" : "edit", ...(label ? { label } : {}) });
    }
  }
  return out.slice(0, PANEL_MAX_ITEMS);
}
