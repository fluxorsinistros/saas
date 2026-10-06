// Painel financeiro de um fluxo: lista ordenada de itens, cada um apontando para um campo numérico do catálogo
// (número, R$, % ou calculado). "tone": neutro, ou "sign" = verde quando >= 0 e vermelho quando negativo.
export type PanelItem = { key: string; tone: "neutral" | "sign" };

export const PANEL_MAX_ITEMS = 20;
export const PANEL_FIELD_TYPES = ["number", "money", "percent", "calculated"];

export function readPanel(raw: unknown): PanelItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PanelItem[] = [];
  for (const it of raw) {
    if (it && typeof it === "object" && typeof (it as PanelItem).key === "string") {
      out.push({ key: (it as PanelItem).key, tone: (it as PanelItem).tone === "sign" ? "sign" : "neutral" });
    }
  }
  return out.slice(0, PANEL_MAX_ITEMS);
}
