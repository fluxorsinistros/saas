export const NODE_TYPES = ["start", "stage", "decision", "parallel_split", "join", "wait", "pending", "end"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export type JoinRule = "all" | "all_required" | "any" | "min_count";

export type NodeConfig = {
  description?: string;
  question?: string;
  sla_minutes?: number;
  // Unidade em que o prazo foi digitado: "h" horas, "d" dias de 24h, "bd" dias úteis. Em "bd" o prazo de verdade é sla_bd_days
  // (número de dias úteis) e sla_minutes é derivado: dias úteis vezes a jornada do calendário, recalculado a cada salvamento.
  sla_unit?: "h" | "d" | "bd";
  sla_bd_days?: number;
  sla_calendar_id?: string;
  // Quem da equipe do grupo faz a etapa: "all" todos do grupo (padrão), "fixed" um subgrupo fixo, "field" o subgrupo escolhido
  // em um campo do sinistro (campo do tipo Grupo ou subgrupo, apontando para este mesmo grupo).
  subgroup_mode?: "all" | "fixed" | "field";
  subgroup_id?: string;
  subgroup_field_key?: string;
  // Etapa (ou Início) que segue conforme o valor de um campo de lista: cada opção do campo é uma saída (rótulo da conexão = opção).
  // Se o campo aceita várias opções, as escolhidas abrem caminhos simultâneos.
  route_field_key?: string;
  loop_max?: number;
  join_rule?: JoinRule;
  min_count?: number;
  // Chaves de workflow_fields que esta etapa pede pra preencher, valores entram em
  // claims.custom_fields na conclusão (ficha única do sinistro, nunca fragmentada por etapa).
  field_keys?: string[];
  // Subconjunto de field_keys que esta etapa só MOSTRA (consulta): a pessoa vê o valor, mas não edita. O valor é editado em
  // outra etapa/grupo. Vale para etapas de trabalho; no Início todos os campos são editáveis.
  readonly_field_keys?: string[];
};

export type FieldType = "text" | "textarea" | "number" | "money" | "percent" | "calculated" | "date" | "boolean" | "select" | "person" | "attachment" | "group_ref";

export type WorkflowField = {
  id: string;
  key: string;
  label: string;
  field_type: FieldType;
  options: string[] | null;
  required: boolean;
  is_unique: boolean;
  default_value: string | null;
  min_length: number | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  formula: string | null;
  // Só no tipo group_ref: o grupo cujos subgrupos (ou o próprio grupo) viram as opções do campo
  ref_group_id: string | null;
  // Só no tipo Lista de opções: aceita escolher mais de uma opção (valor guardado como "a|b")
  multiple?: boolean;
  position: number;
};

// Valor de um campo de lista no sinistro: "a|b" quando aceita várias opções
export const MULTI_SEPARATOR = "|";
export function splitFieldValues(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(MULTI_SEPARATOR)
    .map((v) => v.trim())
    .filter(Boolean);
}

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "Texto",
  textarea: "Texto longo",
  number: "Número",
  money: "Valor em R$",
  percent: "Porcentagem (%)",
  calculated: "Calculado (fórmula)",
  date: "Data",
  boolean: "Sim/Não",
  select: "Lista de opções",
  person: "Pessoa",
  attachment: "Anexo (foto/vídeo/arquivo)",
  group_ref: "Grupo ou subgrupo",
};

// Tipos cujo valor em claims.custom_fields é o caminho de um arquivo no Storage (bucket
// "documents"), não texto puro, precisam de upload e, pra exibir, de URL assinada.
export const FILE_FIELD_TYPES: FieldType[] = ["attachment"];

export type EdgeKind = "normal" | "return";

// Forma neutra do grafo, compartilhada pelo builder (navegador) e pela publicação (servidor).
export type GraphNode = {
  id: string;
  type: NodeType;
  name: string;
  groupId: string | null;
  config: NodeConfig;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label: string;
  isRequired: boolean;
  // Caminho alternativo: quando a passagem seguinte já bateu no limite de repetições, o sinistro segue por esta conexão em vez de
  // ficar bloqueado. Não aparece como opção da decisão.
  onLimit?: boolean;
};

export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

export const NODE_META: Record<NodeType, { label: string; hint: string; help: string }> = {
  start: {
    label: "Início",
    hint: "Campos da abertura do sinistro",
    help: "Único por fluxo. Os campos marcados aqui aparecem na tela de formalizar um sinistro neste fluxo, antes de qualquer etapa começar.",
  },
  stage: {
    label: "Etapa",
    hint: "Atividade executada por um grupo",
    help: "Um passo do processo. Só um grupo pode ser responsável, mas qualquer pessoa ativa nele pode executar.",
  },
  decision: {
    label: "Decisão",
    hint: "Escolha única entre caminhos",
    help: "Uma pergunta com respostas exclusivas, só um dos caminhos seguintes é ativado.",
  },
  parallel_split: {
    label: "Paralelo",
    hint: "Abre ramos simultâneos",
    help: "Ativa dois ou mais caminhos ao mesmo tempo. Use uma Convergência depois para reuni-los.",
  },
  join: {
    label: "Convergência",
    hint: "Aguarda ramos antes de seguir",
    help: "Junta os caminhos abertos por um Paralelo. Só segue em frente quando a regra escolhida for satisfeita.",
  },
  wait: {
    label: "Espera",
    hint: "Aguarda terceiro ou prazo",
    help: "Pausa o processo até uma resposta externa (ex.: seguradora) ou até um prazo vencer.",
  },
  pending: {
    label: "Pendência",
    hint: "Solicitação sem nova etapa",
    help: "Uma solicitação (ex.: documento faltando) dentro da etapa atual, não move o processo para outro passo.",
  },
  end: { label: "Fim", hint: "Encerra o caminho", help: "Encerra este caminho do processo." },
};

export const JOIN_RULE_LABEL: Record<JoinRule, string> = {
  all_required: "Todos os obrigatórios",
  all: "Todos",
  any: "Qualquer um",
  min_count: "Mínimo de N",
};

export const JOIN_RULE_HELP: Record<JoinRule, string> = {
  all_required: "Segue quando todo ramo marcado como obrigatório terminar. Ramos opcionais podem ficar pendentes.",
  all: "Segue somente quando todos os ramos, obrigatórios ou não, terminarem.",
  any: "Segue assim que o primeiro ramo terminar, os demais continuam em segundo plano.",
  min_count: "Segue quando a quantidade de ramos concluídos atingir o número definido.",
};

// Tipos que exigem grupo responsável (Documento 1 §5.3: etapa aponta para grupo, não pessoa).
export const REQUIRES_GROUP: NodeType[] = ["stage", "decision", "pending"];

export type DbEdgeType = "normal" | "conditional" | "parallel" | "return" | "close";

export function toDbEdgeType(edge: GraphEdge, sourceType: NodeType | undefined, sourceConfig?: NodeConfig): DbEdgeType {
  if (edge.kind === "return") return "return";
  if (sourceType === "parallel_split") return "parallel";
  if (sourceType === "decision") return "conditional";
  if (sourceConfig?.route_field_key) return "conditional";
  return "normal";
}

export function formatSla(minutes?: number, config?: { sla_unit?: string; sla_bd_days?: number }) {
  if (config?.sla_unit === "bd" && config.sla_bd_days) return `${+config.sla_bd_days.toFixed(2)} du`;
  if (!minutes) return null;
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}min`;
}

export type CalendarOption = { id: string; name: string; business_start?: string | null; business_end?: string | null };

// Grupo como o editor do fluxo enxerga: com os subgrupos ativos, quando o grupo usa subgrupos.
export type BuilderGroup = { id: string; name: string; uses_subgroups?: boolean; subgroups?: { id: string; name: string }[] };
