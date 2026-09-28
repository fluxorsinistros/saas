// Parser mínimo de CSV: aspas duplas para escapar vírgula/quebra de linha dentro de um campo
// ("" dentro de um campo entre aspas vira uma aspa literal). Suficiente para uma planilha simples
// de importação de sinistros — não precisa de uma lib inteira para isso.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export const IMPORT_COLUMNS = ["fluxo", "data_ocorrencia", "local", "referencia_externa"] as const;
export type ImportRowData = Record<(typeof IMPORT_COLUMNS)[number], string>;

export function csvToRows(text: string): { header: string[]; rows: ImportRowData[] } {
  const parsed = parseCsv(text);
  if (parsed.length === 0) return { header: [], rows: [] };
  const header = parsed[0].map((h) => h.trim().toLowerCase());
  const rows = parsed.slice(1).map((cols) => {
    const entry: Record<string, string> = {};
    header.forEach((key, idx) => {
      entry[key] = (cols[idx] ?? "").trim();
    });
    return {
      fluxo: entry.fluxo ?? "",
      data_ocorrencia: entry.data_ocorrencia ?? "",
      local: entry.local ?? "",
      referencia_externa: entry.referencia_externa ?? "",
    };
  });
  return { header, rows };
}
