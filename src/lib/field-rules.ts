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
