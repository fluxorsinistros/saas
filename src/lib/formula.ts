// Fórmulas dos campos calculados (ex.: total_gasto = valor_do_prejuizo + valor_da_franquia).
// Interpretador próprio e fechado: só números, as chaves dos campos, + - * / ( ) e as funções min, max, abs e round.
// Nunca usa eval nem Function, então uma fórmula não consegue executar código.

type Node =
  | { t: "num"; v: number }
  | { t: "ref"; key: string }
  | { t: "neg"; a: Node }
  | { t: "bin"; op: "+" | "-" | "*" | "/"; a: Node; b: Node }
  | { t: "fn"; name: string; args: Node[] };

const FUNCTIONS: Record<string, { min: number; max: number }> = {
  min: { min: 2, max: 10 },
  max: { min: 2, max: 10 },
  abs: { min: 1, max: 1 },
  round: { min: 1, max: 2 },
};

export const FORMULA_MAX_LENGTH = 300;

type Token = { k: "num" | "id" | "op" | "end"; v: string };

function tokenize(src: string): Token[] | string {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const text = src.slice(i, j);
      if (!/^\d*\.?\d+$/.test(text)) return `Número inválido: "${text}".`;
      out.push({ k: "num", v: text });
      i = j;
    } else if (/[a-z_]/i.test(ch)) {
      let j = i;
      while (j < src.length && /[a-z0-9_]/i.test(src[j])) j++;
      out.push({ k: "id", v: src.slice(i, j).toLowerCase() });
      i = j;
    } else if ("+-*/(),".includes(ch)) {
      out.push({ k: "op", v: ch });
      i++;
    } else {
      return `Caractere não permitido na fórmula: "${ch}".`;
    }
  }
  out.push({ k: "end", v: "" });
  return out;
}

export function parseFormula(src: string): { ok: true; ast: Node; refs: string[] } | { ok: false; error: string } {
  const text = src.trim();
  if (!text) return { ok: false, error: "Informe a fórmula." };
  if (text.length > FORMULA_MAX_LENGTH) return { ok: false, error: `A fórmula aceita no máximo ${FORMULA_MAX_LENGTH} caracteres.` };
  const lexed = tokenize(text);
  if (typeof lexed === "string") return { ok: false, error: lexed };
  const tokens: Token[] = lexed;

  let pos = 0;
  const refs = new Set<string>();
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek().k === "op" && peek().v === v;

  function fail(msg: string): never {
    throw new Error(msg);
  }
  function expr(): Node {
    let left = term();
    while (isOp("+") || isOp("-")) {
      const op = tokens[pos++].v as "+" | "-";
      left = { t: "bin", op, a: left, b: term() };
    }
    return left;
  }
  function term(): Node {
    let left = unary();
    while (isOp("*") || isOp("/")) {
      const op = tokens[pos++].v as "*" | "/";
      left = { t: "bin", op, a: left, b: unary() };
    }
    return left;
  }
  function unary(): Node {
    if (isOp("-")) {
      pos++;
      return { t: "neg", a: unary() };
    }
    return primary();
  }
  function primary(): Node {
    const tk = tokens[pos];
    if (tk.k === "num") {
      pos++;
      return { t: "num", v: Number(tk.v) };
    }
    if (tk.k === "id") {
      pos++;
      if (isOp("(")) {
        const spec = FUNCTIONS[tk.v];
        if (!spec) fail(`Função desconhecida: "${tk.v}". Use min, max, abs ou round.`);
        pos++;
        const args: Node[] = [];
        if (!isOp(")")) {
          args.push(expr());
          while (isOp(",")) {
            pos++;
            args.push(expr());
          }
        }
        if (!isOp(")")) fail("Faltou fechar o parêntese da função.");
        pos++;
        if (args.length < spec.min || args.length > spec.max) fail(`A função "${tk.v}" recebe de ${spec.min} a ${spec.max} valores.`);
        return { t: "fn", name: tk.v, args };
      }
      refs.add(tk.v);
      return { t: "ref", key: tk.v };
    }
    if (isOp("(")) {
      pos++;
      const inner = expr();
      if (!isOp(")")) fail("Faltou fechar um parêntese.");
      pos++;
      return inner;
    }
    return fail(tk.k === "end" ? "A fórmula terminou antes da hora." : `Não esperava "${tk.v}" aqui.`);
  }

  try {
    const ast = expr();
    if (peek().k !== "end") fail(`Não esperava "${peek().v}" aqui.`);
    return { ok: true, ast, refs: [...refs] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fórmula inválida." };
  }
}

// Avalia a fórmula. Campo vazio vale 0. Divisão por zero (ou resultado fora do normal) devolve null, mostrado como "-".
export function evaluateFormula(ast: Node, values: Record<string, number | null | undefined>): number | null {
  const run = (n: Node): number => {
    switch (n.t) {
      case "num":
        return n.v;
      case "ref":
        return values[n.key] ?? 0;
      case "neg":
        return -run(n.a);
      case "bin": {
        const a = run(n.a);
        const b = run(n.b);
        if (n.op === "+") return a + b;
        if (n.op === "-") return a - b;
        if (n.op === "*") return a * b;
        if (b === 0) throw new Error("div0");
        return a / b;
      }
      case "fn": {
        const args = n.args.map(run);
        if (n.name === "min") return Math.min(...args);
        if (n.name === "max") return Math.max(...args);
        if (n.name === "abs") return Math.abs(args[0]);
        const digits = args[1] ?? 0;
        const f = 10 ** Math.max(0, Math.min(6, Math.trunc(digits)));
        return Math.round(args[0] * f) / f;
      }
    }
  };
  try {
    const r = run(ast);
    return Number.isFinite(r) ? Math.round(r * 1e6) / 1e6 : null;
  } catch {
    return null;
  }
}

export const NUMERIC_FIELD_TYPES = ["number", "money", "percent", "calculated"];

type FormulaField = { key: string; label: string; field_type: string; formula?: string | null };

// Confere uma fórmula contra o catálogo do fluxo: referências existentes, numéricas e sem ciclo entre calculados.
export function validateFormula(selfKey: string, formula: string, fields: FormulaField[]): string | null {
  const parsed = parseFormula(formula);
  if (!parsed.ok) return parsed.error;
  const byKey = new Map(fields.map((f) => [f.key, f]));
  for (const ref of parsed.refs) {
    const f = byKey.get(ref);
    if (!f) return `A fórmula usa "${ref}", que não é um campo deste fluxo.`;
    if (!NUMERIC_FIELD_TYPES.includes(f.field_type)) return `O campo "${f.label}" não é numérico e não pode entrar na fórmula.`;
  }
  // ciclo: seguir as referências entre calculados a partir deste campo
  const seen = new Set<string>();
  const visit = (key: string, formulaOf: string): boolean => {
    const p = parseFormula(formulaOf);
    if (!p.ok) return false;
    for (const r of p.refs) {
      if (r === selfKey) return true;
      const f = byKey.get(r);
      if (f?.field_type === "calculated" && f.formula && !seen.has(r)) {
        seen.add(r);
        if (visit(r, f.formula)) return true;
      }
    }
    return false;
  };
  if (parsed.refs.includes(selfKey) || visit(selfKey, formula)) return "A fórmula não pode depender dela mesma.";
  return null;
}

// Valores dos campos calculados de um sinistro, a partir dos campos digitados (custom_fields). Calcula na leitura: nunca é gravado.
export function computeCalculatedValues(fields: FormulaField[], raw: Record<string, unknown>): Record<string, number | null> {
  const numeric: Record<string, number | null> = {};
  for (const f of fields) {
    if (f.field_type === "number" || f.field_type === "money" || f.field_type === "percent") {
      const v = raw[f.key];
      const n = v === undefined || v === null || v === "" ? 0 : Number(String(v).replace(",", "."));
      numeric[f.key] = Number.isFinite(n) ? n : 0;
    }
  }
  const calculated = fields.filter((f) => f.field_type === "calculated" && f.formula);
  const out: Record<string, number | null> = {};
  // até N passadas resolve calculados que dependem de outros calculados (ciclos já são barrados ao salvar)
  for (let pass = 0; pass < calculated.length + 1; pass++) {
    for (const f of calculated) {
      const p = parseFormula(f.formula as string);
      if (!p.ok) {
        out[f.key] = null;
        continue;
      }
      const v = evaluateFormula(p.ast, numeric);
      out[f.key] = v;
      numeric[f.key] = v ?? 0;
    }
  }
  return out;
}
