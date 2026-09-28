import type { EdgeKind, NodeConfig, NodeType } from "./types";

type TNode = { key: string; type: NodeType; name: string; group?: string; config?: NodeConfig; x: number; y: number };
type TEdge = { from: string; to: string; label?: string; kind?: EdgeKind; required?: boolean };

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  nodes: TNode[];
  edges: TEdge[];
};

const DAY = 1440;

// Documento 1 §73 + subfluxos §49–§51.
const responsabilidadeFinanceira: WorkflowTemplate = {
  id: "responsabilidade-financeira",
  name: "Gestão de Sinistro — Responsabilidade Financeira",
  description: "Regulação, definição de responsável e tratamento por Transportadora, Seguradora ou CD/Planta.",
  nodes: [
    { key: "r1", type: "stage", name: "Receber e registrar", group: "Regulação", x: 560, y: 0 },
    { key: "r2", type: "stage", name: "Coletar documentos", group: "Regulação", x: 560, y: 120 },
    { key: "r3", type: "stage", name: "Análise técnica e relatório", group: "Regulação", config: { sla_minutes: 7 * DAY }, x: 560, y: 240 },
    { key: "r4", type: "stage", name: "Definir responsabilidade financeira", group: "Gestão de Risco", config: { sla_minutes: 5 * DAY }, x: 560, y: 360 },
    { key: "d1", type: "decision", name: "Quem absorve o prejuízo?", group: "Gestão de Risco", x: 575, y: 480 },

    { key: "a1", type: "stage", name: "Notificar transportadora", group: "Operacional", x: 140, y: 680 },
    { key: "a2", type: "wait", name: "Aguardar manifestação", config: { sla_minutes: 5 * DAY }, x: 140, y: 800 },
    { key: "a3", type: "decision", name: "Transportadora contesta?", group: "Jurídico", x: 155, y: 920 },
    { key: "a4", type: "stage", name: "Registrar débito", group: "Financeiro", x: -200, y: 1080 },
    { key: "a5", type: "stage", name: "Analisar contestação", group: "Jurídico", config: { loop_max: 3 }, x: 140, y: 1080 },
    { key: "a6", type: "stage", name: "Responder à transportadora", group: "Jurídico", x: 140, y: 1200 },
    { key: "a7", type: "decision", name: "Mantém contestação?", group: "Jurídico", x: 155, y: 1320 },
    { key: "a8", type: "stage", name: "Comitê", group: "Comitê", x: 140, y: 1480 },
    { key: "a9", type: "stage", name: "Decisão jurídica", group: "Jurídico", x: 140, y: 1600 },

    { key: "b1", type: "stage", name: "Acionar seguradora", group: "Seguros", x: 560, y: 680 },
    { key: "b2", type: "stage", name: "Enviar documentação", group: "Seguros", x: 560, y: 800 },
    { key: "b3", type: "wait", name: "Aguardar análise da seguradora", config: { sla_minutes: 10 * DAY }, x: 560, y: 920 },
    { key: "b4", type: "decision", name: "Indenização aprovada?", group: "Seguros", x: 575, y: 1040 },
    { key: "b5", type: "wait", name: "Aguardar pagamento", x: 560, y: 1200 },

    { key: "c1", type: "stage", name: "Comunicar CD/Planta", group: "Operacional", x: 980, y: 680 },
    { key: "c2", type: "stage", name: "Registrar aceite da absorção", group: "Financeiro", x: 980, y: 800 },
    { key: "c3", type: "stage", name: "Registrar tratativas", group: "Operacional", x: 980, y: 920 },

    { key: "end", type: "end", name: "Encerramento", x: 590, y: 1760 },
  ],
  edges: [
    { from: "r1", to: "r2" },
    { from: "r2", to: "r3" },
    { from: "r3", to: "r4" },
    { from: "r4", to: "d1" },
    { from: "d1", to: "a1", label: "Transportadora" },
    { from: "d1", to: "b1", label: "Seguradora" },
    { from: "d1", to: "c1", label: "CD/Planta" },

    { from: "a1", to: "a2" },
    { from: "a2", to: "a3" },
    { from: "a3", to: "a4", label: "Não" },
    { from: "a3", to: "a5", label: "Sim" },
    { from: "a4", to: "end" },
    { from: "a5", to: "a6" },
    { from: "a6", to: "a7" },
    { from: "a7", to: "a5", label: "Sim", kind: "return" },
    { from: "a7", to: "a8", label: "Não" },
    { from: "a8", to: "a9" },
    { from: "a9", to: "end" },

    { from: "b1", to: "b2" },
    { from: "b2", to: "b3" },
    { from: "b3", to: "b4" },
    { from: "b4", to: "b5", label: "Sim" },
    { from: "b4", to: "end", label: "Não" },
    { from: "b5", to: "end" },

    { from: "c1", to: "c2" },
    { from: "c2", to: "c3" },
    { from: "c3", to: "end" },
  ],
};

// Documento 1 §74.
const execucaoParalela: WorkflowTemplate = {
  id: "execucao-paralela",
  name: "Análise paralela com convergência",
  description: "Operacional, Seguradora e Financeiro em paralelo, convergindo antes do Jurídico.",
  nodes: [
    { key: "p0", type: "stage", name: "Levantamento", group: "Regulação", x: 400, y: 0 },
    { key: "s1", type: "parallel_split", name: "Abrir análises", x: 400, y: 130 },
    { key: "o", type: "stage", name: "Análise operacional", group: "Operacional", config: { sla_minutes: 3 * DAY }, x: 60, y: 260 },
    { key: "s", type: "stage", name: "Análise da seguradora", group: "Seguros", config: { sla_minutes: 3 * DAY }, x: 400, y: 260 },
    { key: "f", type: "stage", name: "Análise financeira", group: "Financeiro", config: { sla_minutes: 3 * DAY }, x: 740, y: 260 },
    { key: "j1", type: "join", name: "Aguardar análises", config: { join_rule: "all_required" }, x: 400, y: 400 },
    { key: "c", type: "stage", name: "Consolidação", group: "Gestão de Risco", x: 400, y: 520 },
    { key: "jur", type: "stage", name: "Parecer jurídico", group: "Jurídico", x: 400, y: 640 },
    { key: "end", type: "end", name: "Encerramento", x: 430, y: 780 },
  ],
  edges: [
    { from: "p0", to: "s1" },
    { from: "s1", to: "o", label: "Operacional" },
    { from: "s1", to: "s", label: "Seguradora" },
    { from: "s1", to: "f", label: "Financeiro" },
    { from: "o", to: "j1" },
    { from: "s", to: "j1" },
    { from: "f", to: "j1" },
    { from: "j1", to: "c" },
    { from: "c", to: "jur" },
    { from: "jur", to: "end" },
  ],
};

export const TEMPLATES = [responsabilidadeFinanceira, execucaoParalela];
