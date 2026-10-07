"use server";

import { publicDbMessage } from "@/lib/errors";
import { parseFormula, validateFormula } from "@/lib/formula";
import { PANEL_FIELD_TYPES, PANEL_MAX_ITEMS, readPanel } from "@/lib/financial-panel";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertCountLimit } from "@/lib/limits";
import { getTenantContext } from "@/lib/tenant";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { validateGraph, type Issue } from "@/lib/workflow/validator";
import type { Graph, NodeConfig, NodeType } from "@/lib/workflow/types";
import type { Json } from "@/lib/supabase/database.types";
import { businessDaysToMinutes } from "@/lib/sla";

export type SavePayload = {
  nodes: {
    id: string;
    node_type: NodeType;
    name: string;
    group_id: string | null;
    config: NodeConfig;
    position: { x: number; y: number };
  }[];
  edges: {
    id: string;
    from_node_id: string;
    to_node_id: string;
    edge_type: string;
    condition: Json | null;
    is_required: boolean;
    order_index: number;
    label: string | null;
  }[];
};

export type ActionResult = { ok: true } | { ok: false; error: string; issues?: Issue[] };

export type FieldResult =
  | {
      ok: true;
      field: {
        id: string;
        key: string;
        label: string;
        field_type: string;
        options: string[] | null;
        required: boolean;
        is_unique: boolean;
        default_value: string | null;
        min_length: number | null;
        max_length: number | null;
        min_value: number | null;
        max_value: number | null;
        formula: string | null;
        position: number;
      };
    }
  | { ok: false; error: string };

const FIELD_SELECT = "id, key, label, field_type, options, required, is_unique, default_value, min_length, max_length, min_value, max_value, formula, position";
const FIELD_TYPES = ["text", "textarea", "number", "money", "percent", "calculated", "date", "boolean", "select", "person", "attachment"];

// Tamanho mínimo/máximo (só texto e texto longo): vazio = sem limite.
function readLengths(formData: FormData, fieldType: string): { min_length: number | null; max_length: number | null } | { error: string } {
  if (fieldType !== "text" && fieldType !== "textarea") return { min_length: null, max_length: null };
  const parse = (name: string) => {
    const raw = String(formData.get(name) ?? "").trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 && n <= 5000 ? n : NaN;
  };
  const min = parse("min_length");
  const max = parse("max_length");
  if (Number.isNaN(min) || Number.isNaN(max)) return { error: "Tamanho precisa ser um número inteiro entre 1 e 5000." };
  if (min !== null && max !== null && min > max) return { error: "O tamanho mínimo não pode ser maior que o máximo." };
  return { min_length: min, max_length: max };
}

// Mínimo/máximo de valor (número, R$ e %): vazio = sem limite.
function readValueBounds(formData: FormData, fieldType: string): { min_value: number | null; max_value: number | null } | { error: string } {
  if (!["number", "money", "percent"].includes(fieldType)) return { min_value: null, max_value: null };
  const parse = (name: string) => {
    const raw = String(formData.get(name) ?? "").trim().replace(",", ".");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && Math.abs(n) <= 1e12 ? n : NaN;
  };
  const min = parse("min_value");
  const max = parse("max_value");
  if (Number.isNaN(min) || Number.isNaN(max)) return { error: "Mínimo e máximo precisam ser números." };
  if (min !== null && max !== null && min > max) return { error: "O mínimo não pode ser maior que o máximo." };
  return { min_value: min, max_value: max };
}

// Fórmula de um campo calculado, conferida contra o catálogo do fluxo (campos existentes, numéricos e sem ciclo).
async function readFormula(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workflowId: string,
  selfKey: string,
  fieldType: string,
  formData: FormData,
): Promise<{ formula: string | null } | { error: string }> {
  if (fieldType !== "calculated") return { formula: null };
  if (!["money", "percent", "number"].includes(String(formData.get("default_value") ?? ""))) return { error: "Escolha como mostrar o resultado (R$, % ou número)." };
  const formula = String(formData.get("formula") ?? "").trim();
  const { data: others } = await supabase.from("workflow_fields").select("key, label, field_type, formula").eq("workflow_id", workflowId).neq("key", selfKey);
  const problem = validateFormula(selfKey, formula, others ?? []);
  return problem ? { error: problem } : { formula };
}

// Painel financeiro do fluxo: quais campos numéricos aparecem na aba Financeiro do sinistro, em que ordem e com que destaque.
export async function saveFinancialPanel(workflowId: string, rawItems: unknown): Promise<ActionResult> {
  const ctx = await getTenantContext();
  // quem edita fluxos ou quem o grupo autorizou a configurar o painel (o banco confere de novo)
  if (!(await hasPermission(ctx, "workflow.edit")) && !(await hasPermission(ctx, "financial.configure"))) {
    return { ok: false, error: "Você não tem permissão para configurar o painel financeiro." };
  }
  const items = readPanel(rawItems);
  if (Array.isArray(rawItems) && rawItems.length > PANEL_MAX_ITEMS) return { ok: false, error: `O painel aceita no máximo ${PANEL_MAX_ITEMS} itens.` };
  if (new Set(items.map((i) => i.key)).size !== items.length) return { ok: false, error: "Há um campo repetido no painel." };

  const supabase = await createClient();
  const { data: fields } = await supabase.from("workflow_fields").select("key, field_type").eq("workflow_id", workflowId);
  const typeByKey = new Map((fields ?? []).map((f) => [f.key, f.field_type]));
  const typeFor = (k: string) => typeByKey.get(k) ?? "";
  for (const it of items) {
    if (!PANEL_FIELD_TYPES.includes(typeByKey.get(it.key) ?? "")) return { ok: false, error: `"${it.key}" não é um campo numérico deste fluxo.` };
  }
  // calculado é sempre informativo
  const clean = items.map((i) => (typeFor(i.key) === "calculated" ? { ...i, mode: "view" as const } : i));
  const { error } = await supabase.rpc("save_financial_panel", { p_workflow_id: workflowId, p_panel: clean as unknown as Json });
  if (error) return { ok: false, error: publicDbMessage(error) };
  revalidatePath(`/sinistros/painel-financeiro/${workflowId}`);
  return { ok: true };
}

// Campo personalizado "estilo SHARP" (Documento 1): o cliente cria quantos quiser, sem migração
// nova, isso só grava uma linha de catálogo. A chave vira o identificador estável em
// claims.custom_fields, então nunca muda depois de criada (só o rótulo pode).
export async function createWorkflowField(workflowId: string, formData: FormData): Promise<FieldResult> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "workflow.edit");
  if (!(await hasPermission(ctx, "workflow.edit"))) return { ok: false, error: "Você não tem permissão para editar fluxos." };

  const label = String(formData.get("label") ?? "").trim();
  const fieldType = String(formData.get("field_type") ?? "text");
  if (!label) return { ok: false, error: "Nome do campo é obrigatório." };
  if (!FIELD_TYPES.includes(fieldType)) {
    return { ok: false, error: "Tipo de campo inválido." };
  }

  const key = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!key) return { ok: false, error: "Nome do campo precisa ter alguma letra ou número." };

  const options =
    fieldType === "select"
      ? String(formData.get("options") ?? "")
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : null;
  if (fieldType === "select" && (!options || options.length === 0)) {
    return { ok: false, error: "Lista de opções precisa de pelo menos um item (separado por vírgula)." };
  }

  const required = formData.get("required") === "on";
  const isUnique = formData.get("is_unique") === "on";
  const defaultValue = String(formData.get("default_value") ?? "").trim() || null;
  if (defaultValue && fieldType === "select" && !options?.includes(defaultValue)) {
    return { ok: false, error: "O valor padrão precisa ser uma das opções da lista." };
  }
  const lengths = readLengths(formData, fieldType);
  if ("error" in lengths) return { ok: false, error: lengths.error };
  const bounds = readValueBounds(formData, fieldType);
  if ("error" in bounds) return { ok: false, error: bounds.error };

  const supabase = await createClient();
  const formulaRes = await readFormula(supabase, workflowId, key, fieldType, formData);
  if ("error" in formulaRes) return { ok: false, error: formulaRes.error };
  // campo novo entra no fim da ordem
  const { data: lastField } = await supabase
    .from("workflow_fields")
    .select("position")
    .eq("workflow_id", workflowId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("workflow_fields")
    .insert({
      position: (lastField?.position ?? 0) + 1,
      tenant_id: ctx.tenantId,
      workflow_id: workflowId,
      key,
      label,
      field_type: fieldType,
      options,
      required,
      is_unique: isUnique,
      default_value: defaultValue,
      min_length: lengths.min_length,
      max_length: lengths.max_length,
      min_value: bounds.min_value,
      max_value: bounds.max_value,
      formula: formulaRes.formula,
    })
    .select(FIELD_SELECT)
    .single();
  if (error || !data) {
    return { ok: false, error: error?.code === "23505" ? "Já existe um campo com esse nome neste fluxo." : (error?.message ?? "Falha ao criar campo.") };
  }
  revalidatePath(`/fluxos/${workflowId}`);
  return { ok: true, field: { ...data, options: data.options as string[] | null } };
}

// Rótulo, opções, obrigatoriedade, duplicidade e valor padrão são editáveis, tipo e chave ficam
// travados depois de criado, porque claims.custom_fields já pode ter valores gravados sob essa
// chave, no formato daquele tipo.
export async function updateWorkflowField(fieldId: string, workflowId: string, formData: FormData): Promise<FieldResult> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "workflow.edit");
  if (!(await hasPermission(ctx, "workflow.edit"))) return { ok: false, error: "Você não tem permissão para editar fluxos." };

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { ok: false, error: "Nome do campo é obrigatório." };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("workflow_fields").select("field_type, key").eq("id", fieldId).single();
  if (!existing) return { ok: false, error: "Campo não encontrado." };

  const options =
    existing.field_type === "select"
      ? String(formData.get("options") ?? "")
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : null;
  if (existing.field_type === "select" && (!options || options.length === 0)) {
    return { ok: false, error: "Lista de opções precisa de pelo menos um item (separado por vírgula)." };
  }

  const required = formData.get("required") === "on";
  const isUnique = formData.get("is_unique") === "on";
  const defaultValue = String(formData.get("default_value") ?? "").trim() || null;
  if (defaultValue && existing.field_type === "select" && !options?.includes(defaultValue)) {
    return { ok: false, error: "O valor padrão precisa ser uma das opções da lista." };
  }
  const lengths = readLengths(formData, existing.field_type);
  if ("error" in lengths) return { ok: false, error: lengths.error };
  const bounds = readValueBounds(formData, existing.field_type);
  if ("error" in bounds) return { ok: false, error: bounds.error };
  const formulaRes = await readFormula(supabase, workflowId, existing.key, existing.field_type, formData);
  if ("error" in formulaRes) return { ok: false, error: formulaRes.error };

  const { data, error } = await supabase
    .from("workflow_fields")
    .update({
      label,
      options,
      required,
      is_unique: isUnique,
      default_value: defaultValue,
      min_length: lengths.min_length,
      max_length: lengths.max_length,
      min_value: bounds.min_value,
      max_value: bounds.max_value,
      ...(existing.field_type === "calculated" ? { formula: formulaRes.formula } : {}),
    })
    .eq("id", fieldId)
    .eq("tenant_id", ctx.tenantId)
    .select(FIELD_SELECT)
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Falha ao salvar campo." };
  revalidatePath(`/fluxos/${workflowId}`);
  return { ok: true, field: { ...data, options: data.options as string[] | null } };
}

// Exclusão é do catálogo, não retroativa: sinistros que já guardaram valor sob essa chave em
// claims.custom_fields mantêm o dado (histórico nunca se apaga sozinho, Documento 2 §3), só some
// da lista de campos disponíveis pra escolher em etapas novas. Etapas que já tinham essa chave em
// config.field_keys simplesmente param de mostrá-la (filtro já existente ignora campo inexistente).
export async function deleteWorkflowField(fieldId: string, workflowId: string): Promise<ActionResult> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "workflow.edit");
  if (!(await hasPermission(ctx, "workflow.edit"))) return { ok: false, error: "Você não tem permissão para editar fluxos." };

  const supabase = await createClient();
  const { data: target } = await supabase.from("workflow_fields").select("key, label").eq("id", fieldId).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (target) {
    // um campo usado na fórmula de outro não pode sumir: a conta quebraria em silêncio
    const { data: calcs } = await supabase.from("workflow_fields").select("label, formula").eq("workflow_id", workflowId).eq("field_type", "calculated");
    const user = (calcs ?? []).find((f) => f.formula && parseFormula(f.formula).ok && (parseFormula(f.formula) as { refs: string[] }).refs.includes(target.key));
    if (user) return { ok: false, error: `"${target.label}" é usado na fórmula de "${user.label}". Edite ou exclua esse campo primeiro.` };
  }
  const { error } = await supabase.from("workflow_fields").delete().eq("id", fieldId).eq("tenant_id", ctx.tenantId);
  if (error) return { ok: false, error: publicDbMessage(error) };
  if (target) {
    // tira o campo do painel financeiro do fluxo, se estava lá
    const { data: wf } = await supabase.from("workflows").select("financial_panel").eq("id", workflowId).maybeSingle();
    const kept = readPanel(wf?.financial_panel).filter((i) => i.key !== target.key);
    await supabase.from("workflows").update({ financial_panel: kept as unknown as Json }).eq("id", workflowId).eq("tenant_id", ctx.tenantId);
    revalidatePath(`/sinistros/painel-financeiro/${workflowId}`);
  }
  revalidatePath(`/fluxos/${workflowId}`);
  return { ok: true };
}

// Sobe/desce um campo na ordem do catálogo. Renumera tudo de 1..N para a ordem nunca ficar com buracos ou empates.
export async function moveWorkflowField(
  fieldId: string,
  workflowId: string,
  direction: "up" | "down",
): Promise<{ ok: true; order: string[] } | { ok: false; error: string }> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "workflow.edit");

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("workflow_fields")
    .select("id, position")
    .eq("workflow_id", workflowId)
    .eq("tenant_id", ctx.tenantId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error || !rows) return { ok: false, error: error ? publicDbMessage(error) : "Campos não encontrados." };

  const ids = rows.map((r) => r.id);
  const from = ids.indexOf(fieldId);
  if (from < 0) return { ok: false, error: "Campo não encontrado." };
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= ids.length) return { ok: true, order: ids };
  [ids[from], ids[to]] = [ids[to], ids[from]];

  for (let i = 0; i < ids.length; i++) {
    if (rows.find((r) => r.id === ids[i])?.position === i + 1) continue;
    const { error: upErr } = await supabase.from("workflow_fields").update({ position: i + 1 }).eq("id", ids[i]).eq("tenant_id", ctx.tenantId);
    if (upErr) return { ok: false, error: publicDbMessage(upErr) };
  }
  revalidatePath(`/fluxos/${workflowId}`);
  return { ok: true, order: ids };
}

export type PublishDiff = {
  hasPublishedBefore: boolean;
  nodesAdded: number;
  nodesRemoved: number;
  nodesChanged: number;
  edgesAdded: number;
  edgesRemoved: number;
};

// Alimenta o diálogo de confirmação de publicação (crítica de design P1: publicar precisa dizer o que muda).
export async function getPublishDiff(versionId: string): Promise<PublishDiff | { error: string }> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "workflow.publish");
  const supabase = await createClient();

  const { data: version, error: vErr } = await supabase
    .from("workflow_versions")
    .select("workflow_id")
    .eq("id", versionId)
    .single();
  if (vErr || !version) return { error: vErr?.message ?? "Versão não encontrada" };

  const { data: published } = await supabase
    .from("workflow_versions")
    .select("id")
    .eq("workflow_id", version.workflow_id)
    .eq("status", "published")
    .maybeSingle();

  if (!published) {
    const { count } = await supabase
      .from("workflow_nodes")
      .select("id", { count: "exact", head: true })
      .eq("workflow_version_id", versionId);
    return { hasPublishedBefore: false, nodesAdded: count ?? 0, nodesRemoved: 0, nodesChanged: 0, edgesAdded: 0, edgesRemoved: 0 };
  }

  const [{ data: draftNodes }, { data: prevNodes }, { data: draftEdges }, { data: prevEdges }] = await Promise.all([
    supabase.from("workflow_nodes").select("id, name, node_type, group_id, config").eq("workflow_version_id", versionId),
    supabase.from("workflow_nodes").select("id, name, node_type, group_id, config").eq("workflow_version_id", published.id),
    supabase.from("workflow_edges").select("id").eq("workflow_version_id", versionId),
    supabase.from("workflow_edges").select("id").eq("workflow_version_id", published.id),
  ]);

  // Nós carregam o mesmo id entre versões (create_draft_from_version gera novos ids, então comparamos por posição+nome
  // seria frágil; em vez disso comparamos o conjunto de nomes normalizado, que é o que o usuário reconhece na tela).
  const draftNames = new Map((draftNodes ?? []).map((n) => [`${n.node_type}::${n.name.trim().toLowerCase()}`, n]));
  const prevNames = new Map((prevNodes ?? []).map((n) => [`${n.node_type}::${n.name.trim().toLowerCase()}`, n]));

  let changed = 0;
  for (const [key, node] of draftNames) {
    const prev = prevNames.get(key);
    if (prev && JSON.stringify(prev.config) !== JSON.stringify(node.config)) changed++;
  }

  return {
    hasPublishedBefore: true,
    nodesAdded: [...draftNames.keys()].filter((k) => !prevNames.has(k)).length,
    nodesRemoved: [...prevNames.keys()].filter((k) => !draftNames.has(k)).length,
    nodesChanged: changed,
    edgesAdded: Math.max(0, (draftEdges?.length ?? 0) - (prevEdges?.length ?? 0)),
    edgesRemoved: Math.max(0, (prevEdges?.length ?? 0) - (draftEdges?.length ?? 0)),
  };
}

export async function createWorkflow(formData: FormData) {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "workflow.edit");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!name) return;

  const supabase = await createClient();
  const { count: workflowCount } = await supabase.from("workflows").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId);
  await assertCountLimit(supabase, ctx.tenantId, "workflows", "workflows", workflowCount ?? 0);
  const { data: wf, error } = await supabase
    .from("workflows")
    .insert({ tenant_id: ctx.tenantId, name, description })
    .select("id")
    .single();
  if (error || !wf) throw new Error(error?.message ?? "Falha ao criar fluxo");

  const { error: vErr } = await supabase
    .from("workflow_versions")
    .insert({ tenant_id: ctx.tenantId, workflow_id: wf.id, version_number: 1, status: "draft" });
  if (vErr) throw new Error(vErr.message);

  revalidatePath("/fluxos");
  redirect(`/fluxos/${wf.id}`);
}

export async function saveDraft(versionId: string, payload: SavePayload): Promise<ActionResult> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "workflow.edit");
  if (!(await hasPermission(ctx, "workflow.edit"))) return { ok: false, error: "Você não tem permissão para editar fluxos." };
  const supabase = await createClient();

  // Prazo em dias úteis: o navegador manda os dias e o servidor refaz os minutos com a jornada atual do calendário. Assim a conta
  // nunca fica velha se o horário do calendário mudou, e nenhum navegador define o prazo de verdade.
  const bdNodes = payload.nodes.filter((n) => n.config.sla_unit === "bd" && (n.config.sla_bd_days ?? 0) > 0);
  if (bdNodes.length) {
    const { data: tenantRow } = await supabase.from("tenants").select("settings").eq("id", ctx.tenantId).maybeSingle();
    const defaultId = (tenantRow?.settings as { sla?: { default_calendar_id?: string | null } } | null)?.sla?.default_calendar_id ?? null;
    const { data: cals } = await supabase.from("sla_calendars").select("id, business_start, business_end").eq("tenant_id", ctx.tenantId);
    const calById = new Map((cals ?? []).map((x) => [x.id, x]));
    for (const n of bdNodes) {
      const cal = calById.get(n.config.sla_calendar_id ?? "") ?? calById.get(defaultId ?? "") ?? (cals ?? [])[0];
      if (!cal) return { ok: false, error: `A etapa "${n.name}" usa dias úteis, mas a empresa não tem calendário. Cadastre um em Calendários.` };
      const days = Number(n.config.sla_bd_days);
      if (!Number.isFinite(days) || days <= 0 || days > 365) return { ok: false, error: `Prazo inválido na etapa "${n.name}".` };
      n.config.sla_calendar_id = cal.id;
      n.config.sla_minutes = businessDaysToMinutes(days, cal);
    }
  }

  const { error } = await supabase.rpc("save_workflow_draft", {
    p_version_id: versionId,
    p_nodes: payload.nodes as unknown as Json,
    p_edges: payload.edges as unknown as Json,
  });
  if (error) return { ok: false, error: publicDbMessage(error) };
  revalidatePath("/fluxos");
  return { ok: true };
}

// A validação roda de novo aqui sobre o que está gravado: o navegador não é fonte de verdade (Documento 1 §56).
export async function publishVersion(versionId: string, releaseNote: string): Promise<ActionResult> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "workflow.publish");
  if (!(await hasPermission(ctx, "workflow.publish"))) return { ok: false, error: "Você não tem permissão para publicar fluxos." };
  const supabase = await createClient();

  const [{ data: nodes, error: nErr }, { data: edges, error: eErr }] = await Promise.all([
    supabase.from("workflow_nodes").select("id, node_type, name, group_id, config").eq("workflow_version_id", versionId),
    supabase
      .from("workflow_edges")
      .select("id, from_node_id, to_node_id, edge_type, label, is_required")
      .eq("workflow_version_id", versionId),
  ]);
  if (nErr || eErr) return { ok: false, error: (nErr ?? eErr)!.message };

  const graph: Graph = {
    nodes: (nodes ?? []).map((n) => ({
      id: n.id,
      type: n.node_type as NodeType,
      name: n.name,
      groupId: n.group_id,
      config: (n.config ?? {}) as NodeConfig,
    })),
    edges: (edges ?? []).map((e) => ({
      id: e.id,
      source: e.from_node_id,
      target: e.to_node_id,
      kind: e.edge_type === "return" ? "return" : "normal",
      label: e.label ?? "",
      isRequired: e.is_required,
    })),
  };

  const issues = validateGraph(graph);
  if (issues.some((i) => i.severity === "error")) {
    return { ok: false, error: "O fluxo tem erros e não pode ser publicado.", issues };
  }

  const { error } = await supabase.rpc("publish_workflow_version", {
    p_version_id: versionId,
    p_validation: { checked_at: new Date().toISOString(), warnings: issues } as unknown as Json,
    p_release_note: releaseNote.trim() || undefined,
  });
  if (error) return { ok: false, error: publicDbMessage(error) };

  revalidatePath("/fluxos");
  return { ok: true };
}

export async function createNewVersion(versionId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "workflow.edit");
  if (!(await hasPermission(ctx, "workflow.edit"))) return { ok: false, error: "Você não tem permissão para editar fluxos." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_draft_from_version", { p_version_id: versionId });
  if (error || !data) return { ok: false, error: error?.message ?? "Falha ao criar versão" };
  revalidatePath("/fluxos");
  return { ok: true, id: data };
}
