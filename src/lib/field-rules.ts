// Tamanho do texto de um campo personalizado (mínimo/máximo de caracteres). A mesma regra vale na tela
// (maxLength/minLength do input) e no servidor, que é quem de fato barra.
export type LengthRule = { label: string; field_type: string; min_length?: number | null; max_length?: number | null };

export function lengthError(def: LengthRule, value: string): string | null {
  if (def.field_type !== "text" && def.field_type !== "textarea") return null;
  const n = value.trim().length;
  if (n === 0) return null; // vazio é tratado pela regra de obrigatório
  const { min_length: min, max_length: max } = def;
  if (min && max && min === max && n !== min) return `"${def.label}" precisa ter exatamente ${min} caracteres.`;
  if (max && n > max) return `"${def.label}" aceita no máximo ${max} caracteres.`;
  if (min && n < min) return `"${def.label}" precisa ter pelo menos ${min} caracteres.`;
  return null;
}

// Mínimo/máximo de valor (número, valor em R$ e porcentagem). Mesma regra na tela e no servidor.
export type ValueRule = { label: string; field_type: string; min_value?: number | null; max_value?: number | null };

export const VALUE_FIELD_TYPES = ["number", "money", "percent"];

export function parseNumberInput(raw: string): number | null {
  const n = Number(raw.trim().replace(",", "."));
  return raw.trim() !== "" && Number.isFinite(n) ? n : null;
}

export function valueError(def: ValueRule, value: string): string | null {
  if (!VALUE_FIELD_TYPES.includes(def.field_type)) return null;
  if (value.trim() === "") return null; // vazio é tratado pela regra de obrigatório
  const n = parseNumberInput(value);
  if (n === null) return `"${def.label}" precisa ser um número.`;
  const fmt = (v: number) => formatNumberField(def.field_type, v);
  const { min_value: min, max_value: max } = def;
  if (def.field_type === "percent" && (n < 0 || n > 100) && min == null && max == null) return `"${def.label}" precisa estar entre 0% e 100%.`;
  if (max != null && n > max) return `"${def.label}" aceita no máximo ${fmt(max)}.`;
  if (min != null && n < min) return `"${def.label}" aceita no mínimo ${fmt(min)}.`;
  return null;
}

// Como o número aparece para a pessoa: R$ 1.234,50 / 30% / 12,5.
export function formatNumberField(fieldType: string, n: number): string {
  if (fieldType === "money") return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (fieldType === "percent") return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
}
