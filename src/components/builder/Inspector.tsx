"use client";

import { useState } from "react";
import { Copy, Pencil, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import {
  FIELD_TYPE_LABEL,
  JOIN_RULE_HELP,
  JOIN_RULE_LABEL,
  NODE_META,
  type FieldType,
  type JoinRule,
  type BuilderGroup,
  type CalendarOption,
  type NodeConfig,
  type NodeType,
  type WorkflowField,
} from "@/lib/workflow/types";
import type { ActionResult, FieldResult } from "@/app/(app)/fluxos/actions";
import type { FlowEdge, FlowEdgeData, FlowNode, FlowNodeData } from "./context";
import { businessDaysToMinutes } from "@/lib/sla";

type Group = BuilderGroup;

const label = "mb-1 block text-[12px] font-medium text-slate-600";
const input =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-slate-50 disabled:text-slate-500";

const GROUP_TYPES: NodeType[] = ["stage", "decision", "pending", "wait"];
const SLA_TYPES: NodeType[] = ["stage", "decision", "pending", "wait"];
const LOOP_TYPES: NodeType[] = ["stage", "decision", "pending", "wait"];
const FIELD_TYPES: NodeType[] = ["start", "stage", "decision", "pending", "wait"];

export function NodeInspector({
  node,
  groups,
  calendars = [],
  defaultCalendarId = null,
  fields = [],
  onCreateField,
  onUpdateField,
  onDeleteField,
  onMoveField,
  readOnly,
  outgoing,
  autoFocusName,
  onChange,
  onEdgeChange,
  onSelectEdge,
  onDelete,
  onDuplicate,
}: {
  node: FlowNode;
  groups: Group[];
  calendars?: CalendarOption[];
  defaultCalendarId?: string | null;
  fields?: WorkflowField[];
  onCreateField?: (formData: FormData) => Promise<FieldResult>;
  onUpdateField?: (fieldId: string, formData: FormData) => Promise<FieldResult>;
  onDeleteField?: (fieldId: string, key: string) => Promise<ActionResult>;
  onMoveField?: (fieldId: string, direction: "up" | "down") => Promise<unknown>;
  readOnly: boolean;
  outgoing: FlowEdge[];
  autoFocusName?: boolean;
  onChange: (patch: Partial<FlowNodeData>) => void;
  onEdgeChange: (edgeId: string, patch: Partial<FlowEdgeData>) => void;
  onSelectEdge: (edgeId: string) => void;
  onDelete: () => void;
  onDuplicate?: () => void;
}) {
  const type = node.type as NodeType;
  const { data } = node;
  const setConfig = (patch: Partial<NodeConfig>) => onChange({ config: { ...data.config, ...patch } });
  const nodeGroup = groups.find((g) => g.id === data.groupId);
  const subgroupFields = fields.filter((f) => f.field_type === "group_ref" && f.ref_group_id === data.groupId);
  const subgroupMode = data.config.subgroup_mode ?? "all";

  return (
    <div className="space-y-4">
      <Header
        title={NODE_META[type].label}
        hint={NODE_META[type].help}
        onDelete={readOnly ? undefined : onDelete}
        onDuplicate={readOnly ? undefined : onDuplicate}
      />

      <div>
        <label className={label} htmlFor="node-name">
          {type === "decision" ? "Pergunta da decisão" : "Nome"}
        </label>
        <input
          id="node-name"
          autoFocus={autoFocusName}
          className={input}
          value={data.name}
          disabled={readOnly}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      {GROUP_TYPES.includes(type) && (
        <div>
          <label className={label} htmlFor="node-group">
            Grupo responsável{type === "wait" && <span className="font-normal text-slate-500"> (opcional)</span>}
          </label>
          <select
            id="node-group"
            className={input}
            value={data.groupId ?? ""}
            disabled={readOnly}
            onChange={(e) =>
              onChange({ groupId: e.target.value || null, config: { ...data.config, subgroup_mode: undefined, subgroup_id: undefined, subgroup_field_key: undefined } })
            }
          >
            <option value="">Selecione…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {GROUP_TYPES.includes(type) && nodeGroup?.uses_subgroups && (
        <div className="space-y-1.5">
          <label className={label} htmlFor="node-subgroup-mode">
            Quem do grupo faz esta etapa
          </label>
          <select
            id="node-subgroup-mode"
            className={input}
            value={subgroupMode}
            disabled={readOnly}
            onChange={(e) => {
              const mode = e.target.value as "all" | "fixed" | "field";
              setConfig({
                subgroup_mode: mode === "all" ? undefined : mode,
                subgroup_id: mode === "fixed" ? data.config.subgroup_id : undefined,
                subgroup_field_key: mode === "field" ? data.config.subgroup_field_key : undefined,
              });
            }}
          >
            <option value="all">Todos do grupo</option>
            <option value="fixed">Um subgrupo fixo</option>
            <option value="field">O subgrupo escolhido em um campo do sinistro</option>
          </select>
          {subgroupMode === "fixed" && (
            <select
              aria-label="Subgrupo fixo da etapa"
              className={input}
              value={data.config.subgroup_id ?? ""}
              disabled={readOnly}
              onChange={(e) => setConfig({ subgroup_id: e.target.value || undefined })}
            >
              <option value="">Escolha o subgrupo…</option>
              {(nodeGroup.subgroups ?? []).map((sg) => (
                <option key={sg.id} value={sg.id}>
                  {sg.name}
                </option>
              ))}
            </select>
          )}
          {subgroupMode === "field" &&
            (subgroupFields.length === 0 ? (
              <p className="text-xs text-slate-500">
                Antes, crie em Campos um campo do tipo Grupo ou subgrupo apontando para {nodeGroup.name}, coloque-o no Início e marque como obrigatório.
              </p>
            ) : (
              <select
                aria-label="Campo que define o subgrupo da etapa"
                className={input}
                value={data.config.subgroup_field_key ?? ""}
                disabled={readOnly}
                onChange={(e) => setConfig({ subgroup_field_key: e.target.value || undefined })}
              >
                <option value="">Escolha o campo…</option>
                {subgroupFields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            ))}
        </div>
      )}

      {SLA_TYPES.includes(type) && (
        <SlaField config={data.config} calendars={calendars} defaultCalendarId={defaultCalendarId} readOnly={readOnly} onChange={setConfig} />
      )}

      {SLA_TYPES.includes(type) && data.config.sla_minutes && calendars.length > 0 && (
        <div>
          <label className={label} htmlFor="node-sla-calendar">
            Calendário do SLA{" "}
            <span className="font-normal text-slate-500">
              {data.config.sla_unit === "bd" ? "(obrigatório em dias úteis)" : "(opcional, sem isso conta corrido, 24/7)"}
            </span>
          </label>
          <select
            id="node-sla-calendar"
            className={input}
            value={data.config.sla_calendar_id ?? ""}
            disabled={readOnly}
            onChange={(e) => {
              const id = e.target.value || undefined;
              const cal = calendars.find((x) => x.id === id);
              if (data.config.sla_unit === "bd") {
                if (!cal) return;
                setConfig({ sla_calendar_id: id, sla_minutes: data.config.sla_bd_days ? businessDaysToMinutes(data.config.sla_bd_days, cal) : undefined });
              } else setConfig({ sla_calendar_id: id });
            }}
          >
            {data.config.sla_unit !== "bd" && <option value="">Corrido (24/7)</option>}
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {(type === "stage" || type === "wait" || type === "pending") && (
        <div>
          <label className={label} htmlFor="node-desc">
            Instruções
          </label>
          <textarea
            id="node-desc"
            rows={3}
            className={input}
            value={data.config.description ?? ""}
            disabled={readOnly}
            placeholder="O que precisa ser feito nesta etapa"
            onChange={(e) => setConfig({ description: e.target.value || undefined })}
          />
        </div>
      )}

      {FIELD_TYPES.includes(type) && onCreateField && (
        <FieldsSection
          selected={data.config.field_keys ?? []}
          readonlyKeys={data.config.readonly_field_keys ?? []}
          allowReadonlyMode={type !== "start"}
          onSetReadonly={(key, ro) => {
            const current = new Set(data.config.readonly_field_keys ?? []);
            if (ro) current.add(key);
            else current.delete(key);
            setConfig({ readonly_field_keys: [...current] });
          }}
          fields={fields}
          groups={groups}
          readOnly={readOnly}
          onCreateField={onCreateField}
          onUpdateField={onUpdateField}
          onDeleteField={onDeleteField}
          onMoveField={onMoveField}
          onToggle={(key, checked) => {
            const current = new Set(data.config.field_keys ?? []);
            if (checked) current.add(key);
            else current.delete(key);
            // campo que sai da etapa também sai da lista de "só consulta"
            const ro = (data.config.readonly_field_keys ?? []).filter((k) => current.has(k));
            setConfig({ field_keys: [...current], readonly_field_keys: ro });
          }}
          onCreated={(field) => setConfig({ field_keys: [...(data.config.field_keys ?? []), field.key] })}
        />
      )}

      {(type === "decision" || type === "parallel_split") && (
        <div>
          <div className={label}>{type === "decision" ? "Opções (uma por conexão de saída)" : "Ramos"}</div>
          {outgoing.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
              Arraste do ponto inferior deste elemento até o próximo passo para criar {type === "decision" ? "uma opção" : "um ramo"}.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {outgoing.map((e, i) => (
                <li key={e.id} className="flex items-center gap-1.5">
                  <label htmlFor={`edge-opt-${e.id}`} className="sr-only">
                    {type === "decision" ? `Nome da opção ${i + 1}` : `Nome do ramo ${i + 1}`}
                  </label>
                  <input
                    id={`edge-opt-${e.id}`}
                    className={input}
                    value={e.data?.label ?? ""}
                    disabled={readOnly}
                    placeholder={type === "decision" ? `Opção ${i + 1}` : `Ramo ${i + 1}`}
                    onChange={(ev) => onEdgeChange(e.id, { label: ev.target.value })}
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-md px-2 py-1 text-xs text-brand hover:bg-brand/5"
                    onClick={() => onSelectEdge(e.id)}
                  >
                    Editar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {type === "join" && (
        <div className="space-y-3">
          <div>
            <label className={label} htmlFor="join-rule">
              Liberar quando
            </label>
            <select
              id="join-rule"
              className={input}
              value={data.config.join_rule ?? "all_required"}
              disabled={readOnly}
              onChange={(e) => setConfig({ join_rule: e.target.value as JoinRule })}
            >
              {(Object.keys(JOIN_RULE_LABEL) as JoinRule[]).map((r) => (
                <option key={r} value={r}>
                  {JOIN_RULE_LABEL[r]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">{JOIN_RULE_HELP[data.config.join_rule ?? "all_required"]}</p>
          </div>
          {data.config.join_rule === "min_count" && (
            <div>
              <label className={label} htmlFor="join-min">
                Quantidade mínima de ramos concluídos
              </label>
              <input
                id="join-min"
                type="number"
                min={1}
                className={input}
                value={data.config.min_count ?? ""}
                disabled={readOnly}
                onChange={(e) => setConfig({ min_count: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
          )}
        </div>
      )}

      {LOOP_TYPES.includes(type) && (
        <details className="group rounded-lg border border-slate-200 px-3 py-2 open:pb-3">
          <summary className="cursor-pointer select-none text-[12px] font-medium text-slate-600">Avançado</summary>
          <div className="mt-3">
            <label className={label} htmlFor="loop-max">
              Limite de repetições
            </label>
            <input
              id="loop-max"
              type="number"
              min={1}
              className={input}
              value={data.config.loop_max ?? ""}
              disabled={readOnly}
              placeholder="Ilimitado"
              onChange={(e) => setConfig({ loop_max: e.target.value ? Number(e.target.value) : undefined })}
            />
            <p className="mt-1 text-xs text-slate-500">
              Vale quando uma conexão de retorno (loop) trouxer o processo de volta para cá.
            </p>
          </div>
        </details>
      )}
    </div>
  );
}

export function EdgeInspector({
  edge,
  sourceType,
  sourceName,
  targetName,
  readOnly,
  onChange,
  onDelete,
}: {
  edge: FlowEdge;
  sourceType: NodeType | undefined;
  sourceName: string;
  targetName: string;
  readOnly: boolean;
  onChange: (patch: Partial<FlowEdgeData>) => void;
  onDelete: () => void;
}) {
  const data = edge.data ?? { kind: "normal", label: "", isRequired: true };
  const isDecision = sourceType === "decision";
  const isParallel = sourceType === "parallel_split";

  return (
    <div className="space-y-4">
      <Header
        title="Conexão"
        hint={isDecision ? "Opção de uma decisão" : isParallel ? "Ramo de um paralelo" : "Transição entre passos"}
        onDelete={readOnly ? undefined : onDelete}
      />
      <p className="-mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
        De <span className="font-medium text-slate-900">{sourceName || "-"}</span> para{" "}
        <span className="font-medium text-slate-900">{targetName || "-"}</span>
      </p>
      <div>
        <label className={label} htmlFor="edge-label">
          {isDecision ? "Opção" : isParallel ? "Nome do ramo" : "Rótulo (opcional)"}
        </label>
        <input
          id="edge-label"
          className={input}
          value={data.label}
          disabled={readOnly}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </div>
      {isParallel && (
        <Toggle
          checked={data.isRequired}
          disabled={readOnly}
          onChange={(v) => onChange({ isRequired: v })}
          title="Ramo obrigatório"
          hint="Ramos opcionais podem ser dispensados com justificativa durante a execução."
        />
      )}
      <Toggle
        checked={data.kind === "return"}
        disabled={readOnly}
        onChange={(v) => onChange({ kind: v ? "return" : "normal" })}
        title="Retorno (loop)"
        hint="Use quando a conexão volta para um passo anterior. Cada retorno gera uma nova passagem, sem apagar a anterior."
      />
    </div>
  );
}

function Header({
  title,
  hint,
  onDelete,
  onDuplicate,
}: {
  title: string;
  hint: string;
  onDelete?: () => void;
  onDuplicate?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
        <p className="text-[12px] text-slate-500">{hint}</p>
      </div>
      <div className="flex shrink-0 gap-0.5">
        {onDuplicate && (
          <button
            type="button"
            onClick={onDuplicate}
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-brand/5 hover:text-brand"
            aria-label="Duplicar"
            title="Duplicar (Ctrl+D)"
          >
            <Copy className="size-4" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
            aria-label="Excluir"
            title="Excluir (Delete)"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  title: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-[var(--color-brand)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-[13px] font-medium text-slate-800">{title}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

// Campos personalizados "estilo SHARP" (Documento 1): o fluxo tem um catálogo de campos próprio,
// criado conforme a necessidade, sem nunca precisar de migração, cada etapa só escolhe quais
// desse catálogo ela pede pra preencher.
function FieldsSection({
  fields,
  groups,
  selected,
  readonlyKeys,
  allowReadonlyMode,
  onSetReadonly,
  readOnly,
  onToggle,
  onCreateField,
  onUpdateField,
  onDeleteField,
  onMoveField,
  onCreated,
}: {
  fields: WorkflowField[];
  groups: BuilderGroup[];
  selected: string[];
  readonlyKeys: string[];
  allowReadonlyMode: boolean;
  onSetReadonly: (key: string, readonly: boolean) => void;
  readOnly: boolean;
  onToggle: (key: string, checked: boolean) => void;
  onCreateField: (formData: FormData) => Promise<FieldResult>;
  onUpdateField?: (fieldId: string, formData: FormData) => Promise<FieldResult>;
  onDeleteField?: (fieldId: string, key: string) => Promise<ActionResult>;
  onMoveField?: (fieldId: string, direction: "up" | "down") => Promise<unknown>;
  onCreated: (field: { key: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const selectedSet = new Set(selected);

  async function handleCreate(formData: FormData) {
    setSaving(true);
    setError(null);
    const res = await onCreateField(formData);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onCreated(res.field);
    setOpen(false);
    setFieldType("text");
  }

  return (
    <div>
      <div className={label}>Campos desta etapa</div>
      {fields.length === 0 && !open && (
        <p className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
          Nenhum campo criado neste fluxo ainda.
        </p>
      )}
      {fields.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {fields.map((f, idx) =>
            editingId === f.id && onUpdateField ? (
              <li key={f.id}>
                <EditFieldForm field={f} fields={fields} onSave={(fd) => onUpdateField(f.id, fd)} onDone={() => setEditingId(null)} />
              </li>
            ) : (
              <li key={f.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`field-${f.id}`}
                  className="size-4 rounded border-slate-300 text-brand focus:ring-brand/30"
                  checked={selectedSet.has(f.key)}
                  disabled={readOnly}
                  onChange={(e) => onToggle(f.key, e.target.checked)}
                />
                <label htmlFor={`field-${f.id}`} className="flex-1 text-[13px] text-slate-800">
                  {f.label} <span className="text-slate-500">({FIELD_TYPE_LABEL[f.field_type as FieldType]})</span>
                  {f.required && <span className="ml-1 text-xs font-medium text-rose-600">obrigatório</span>}
                  {f.is_unique && <span className="ml-1 text-xs font-medium text-violet">único</span>}
                </label>
                {allowReadonlyMode && selectedSet.has(f.key) && (
                  <select
                    aria-label={`Como a etapa trata o campo ${f.label}`}
                    title="Editável: a pessoa preenche nesta etapa. Só consulta: ela vê o valor, mas não altera."
                    value={readonlyKeys.includes(f.key) ? "view" : "edit"}
                    disabled={readOnly}
                    onChange={(e) => onSetReadonly(f.key, e.target.value === "view")}
                    className="shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700 focus:border-brand focus:outline-none"
                  >
                    <option value="edit">Editável</option>
                    <option value="view">Só consulta</option>
                  </select>
                )}
                {!readOnly && onMoveField && fields.length > 1 && (
                  <span className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => void onMoveField(f.id, "up")}
                      className="rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-brand disabled:opacity-25 disabled:hover:bg-transparent"
                      aria-label={`Subir o campo ${f.label}`}
                      title="Subir na ordem"
                    >
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === fields.length - 1}
                      onClick={() => void onMoveField(f.id, "down")}
                      className="rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-brand disabled:opacity-25 disabled:hover:bg-transparent"
                      aria-label={`Descer o campo ${f.label}`}
                      title="Descer na ordem"
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                  </span>
                )}
                {!readOnly && onUpdateField && (
                  <button
                    type="button"
                    onClick={() => setEditingId(f.id)}
                    className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-brand"
                    aria-label={`Editar campo ${f.label}`}
                    title="Editar campo"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
                {!readOnly && onDeleteField && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Excluir o campo "${f.label}"? Sinistros que já têm valor nele mantêm o dado, mas ele some do catálogo.`)) {
                        void onDeleteField(f.id, f.key);
                      }
                    }}
                    className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Excluir campo ${f.label}`}
                    title="Excluir campo"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      {readOnly ? null : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"
        >
          <Plus className="size-3.5" /> Novo campo
        </button>
      ) : (
        <form
          action={handleCreate}
          className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5"
        >
          <input
            name="label"
            required
            placeholder="Nome do campo"
            className={`${input} bg-white`}
            autoFocus
          />
          <select
            name="field_type"
            className={`${input} bg-white`}
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as FieldType)}
          >
            {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          {fieldType === "select" && (
            <input name="options" required placeholder="Opções separadas por vírgula" className={`${input} bg-white`} />
          )}
          {fieldType === "group_ref" && (
            <div className="space-y-1">
              <select name="ref_group_id" required defaultValue="" aria-label="Grupo do campo" className={`${input} bg-white`}>
                <option value="" disabled>
                  Escolha o grupo…
                </option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.uses_subgroups ? " (lista os subgrupos)" : " (sem subgrupos)"}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">Quem preenche escolhe da lista de subgrupos do grupo. Se o grupo não usa subgrupos, vale o próprio grupo.</p>
            </div>
          )}
          {fieldType !== "attachment" && fieldType !== "calculated" && fieldType !== "group_ref" && (
            <input name="default_value" placeholder="Valor padrão (opcional)" className={`${input} bg-white`} />
          )}
          {(fieldType === "number" || fieldType === "money" || fieldType === "percent") && (
            <div className="grid grid-cols-2 gap-2">
              <input name="min_value" inputMode="decimal" placeholder={fieldType === "percent" ? "Mínimo (%)" : "Valor mínimo"} className={`${input} bg-white`} />
              <input name="max_value" inputMode="decimal" placeholder={fieldType === "percent" ? "Máximo (%)" : "Valor máximo"} className={`${input} bg-white`} />
            </div>
          )}
          {fieldType === "calculated" && <FormulaInput fields={fields} />}
          {(fieldType === "text" || fieldType === "textarea") && (
            <div className="grid grid-cols-2 gap-2">
              <input name="min_length" type="number" min={1} max={5000} placeholder="Mín. de caracteres" className={`${input} bg-white`} />
              <input name="max_length" type="number" min={1} max={5000} placeholder="Máx. de caracteres" className={`${input} bg-white`} />
            </div>
          )}
          {fieldType !== "calculated" && (
            <label className="flex items-center gap-1.5 text-[12px] text-slate-700">
              <input type="checkbox" name="required" className="size-3.5 rounded border-slate-300 text-brand focus:ring-brand/30" />
              Obrigatório, bloqueia &quot;Concluir&quot; até preencher
            </label>
          )}
          {fieldType !== "boolean" && fieldType !== "attachment" && fieldType !== "calculated" && fieldType !== "group_ref" && (
            <label className="flex items-center gap-1.5 text-[12px] text-slate-700">
              <input type="checkbox" name="is_unique" className="size-3.5 rounded border-slate-300 text-brand focus:ring-brand/30" />
              Não permitir duplicado entre sinistros
            </label>
          )}
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {saving ? "Criando…" : "Criar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-md px-2.5 py-1 text-[12px] text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// Fórmula de um campo calculado: o texto usa as chaves dos campos numéricos do fluxo. Os botões inserem a chave no cursor.
export function FormulaInput({ fields, defaultValue = "", defaultFormat = "money", selfKey }: { fields: WorkflowField[]; defaultValue?: string; defaultFormat?: string; selfKey?: string }) {
  const [text, setText] = useState(defaultValue);
  const usable = fields.filter((f) => ["number", "money", "percent", "calculated"].includes(f.field_type) && f.key !== selfKey);
  return (
    <div className="space-y-1.5">
      <input
        name="formula"
        required
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ex.: valor_do_prejuizo + valor_da_franquia"
        className={`${input} bg-white font-mono`}
        spellCheck={false}
        autoComplete="off"
      />
      {usable.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {usable.map((f) => (
            <button
              key={f.key}
              type="button"
              title={`Inserir ${f.key}`}
              onClick={() => setText((t) => `${t}${t && !/[\s(+\-*/,]$/.test(t) ? " " : ""}${f.key}`)}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700 hover:bg-slate-100"
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Crie antes os campos numéricos (Número, Valor em R$ ou Porcentagem) que entram na conta.</p>
      )}
      <select name="default_value" defaultValue={defaultFormat} className={`${input} bg-white`} aria-label="Mostrar o resultado como">
        <option value="money">Mostrar como valor em R$</option>
        <option value="percent">Mostrar como porcentagem (%)</option>
        <option value="number">Mostrar como número</option>
      </select>
      <p className="text-xs text-slate-500">Use + - * / e parênteses. Funções: min, max, abs, round. Campo vazio vale 0.</p>
    </div>
  );
}

// Só rótulo e opções (quando é lista) são editáveis, tipo e chave ficam travados porque
// claims.custom_fields pode já ter valor gravado sob essa chave, no formato daquele tipo.
function EditFieldForm({
  field,
  fields,
  onSave,
  onDone,
}: {
  field: WorkflowField;
  fields: WorkflowField[];
  onSave: (formData: FormData) => Promise<FieldResult>;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(formData: FormData) {
    setSaving(true);
    setError(null);
    const res = await onSave(formData);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onDone();
  }

  return (
    <form action={handleSave} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
      <input name="label" required defaultValue={field.label} className={`${input} bg-white`} autoFocus />
      {field.field_type === "select" && (
        <input
          name="options"
          required
          defaultValue={(field.options ?? []).join(", ")}
          placeholder="Opções separadas por vírgula"
          className={`${input} bg-white`}
        />
      )}
      {field.field_type === "group_ref" && <p className="text-xs text-slate-500">O grupo do campo não muda depois de criado, porque os sinistros já guardam o valor escolhido.</p>}
      {field.field_type !== "attachment" && field.field_type !== "calculated" && field.field_type !== "group_ref" && (
        <input name="default_value" defaultValue={field.default_value ?? ""} placeholder="Valor padrão (opcional)" className={`${input} bg-white`} />
      )}
      {(field.field_type === "number" || field.field_type === "money" || field.field_type === "percent") && (
        <div className="grid grid-cols-2 gap-2">
          <input
            name="min_value"
            inputMode="decimal"
            defaultValue={field.min_value ?? ""}
            placeholder={field.field_type === "percent" ? "Mínimo (%)" : "Valor mínimo"}
            className={`${input} bg-white`}
          />
          <input
            name="max_value"
            inputMode="decimal"
            defaultValue={field.max_value ?? ""}
            placeholder={field.field_type === "percent" ? "Máximo (%)" : "Valor máximo"}
            className={`${input} bg-white`}
          />
        </div>
      )}
      {field.field_type === "calculated" && <FormulaInput fields={fields} defaultValue={field.formula ?? ""} defaultFormat={field.default_value ?? "money"} selfKey={field.key} />}
      {(field.field_type === "text" || field.field_type === "textarea") && (
        <div className="grid grid-cols-2 gap-2">
          <input
            name="min_length"
            type="number"
            min={1}
            max={5000}
            defaultValue={field.min_length ?? ""}
            placeholder="Mín. de caracteres"
            className={`${input} bg-white`}
          />
          <input
            name="max_length"
            type="number"
            min={1}
            max={5000}
            defaultValue={field.max_length ?? ""}
            placeholder="Máx. de caracteres"
            className={`${input} bg-white`}
          />
        </div>
      )}
      {field.field_type !== "calculated" && (
        <label className="flex items-center gap-1.5 text-[12px] text-slate-700">
          <input
            type="checkbox"
            name="required"
            defaultChecked={field.required}
            className="size-3.5 rounded border-slate-300 text-brand focus:ring-brand/30"
          />
          Obrigatório, bloqueia &quot;Concluir&quot; até preencher
        </label>
      )}
      {field.field_type !== "boolean" && field.field_type !== "attachment" && field.field_type !== "calculated" && field.field_type !== "group_ref" && (
        <label className="flex items-center gap-1.5 text-[12px] text-slate-700">
          <input
            type="checkbox"
            name="is_unique"
            defaultChecked={field.is_unique}
            className="size-3.5 rounded border-slate-300 text-brand focus:ring-brand/30"
          />
          Não permitir duplicado entre sinistros
        </label>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" onClick={onDone} className="rounded-md px-2.5 py-1 text-[12px] text-slate-600 hover:bg-slate-100">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function SlaField({
  config,
  calendars,
  defaultCalendarId,
  readOnly,
  onChange,
}: {
  config: NodeConfig;
  calendars: CalendarOption[];
  defaultCalendarId: string | null;
  readOnly: boolean;
  onChange: (patch: Partial<NodeConfig>) => void;
}) {
  const minutes = config.sla_minutes;
  type Unit = "h" | "d" | "bd";
  const [unit, setUnit] = useState<Unit>(config.sla_unit ?? (minutes && minutes % 1440 !== 0 ? "h" : "d"));
  const factor = unit === "d" ? 1440 : 60;
  const value = unit === "bd" ? (config.sla_bd_days ? String(config.sla_bd_days) : "") : minutes ? String(+(minutes / factor).toFixed(2)) : "";
  // calendário que vale para os dias úteis: o escolhido na etapa, senão o padrão da empresa, senão o primeiro cadastrado
  const calendar = calendars.find((c) => c.id === config.sla_calendar_id) ?? calendars.find((c) => c.id === defaultCalendarId) ?? calendars[0];

  function setBusinessDays(days: number | undefined) {
    if (!calendar) return;
    onChange({
      sla_unit: "bd",
      sla_bd_days: days,
      sla_minutes: days ? businessDaysToMinutes(days, calendar) : undefined,
      sla_calendar_id: calendar.id,
    });
  }

  return (
    <div>
      <label className={label} htmlFor="sla-value">
        SLA <span className="font-normal text-slate-500">(opcional)</span>
      </label>
      <div className="flex gap-1.5">
        <input
          id="sla-value"
          type="number"
          min={0}
          step="any"
          className={input}
          value={value}
          disabled={readOnly}
          placeholder="Sem prazo"
          onChange={(e) => {
            const n = Number(e.target.value);
            if (unit === "bd") return setBusinessDays(e.target.value && n > 0 ? n : undefined);
            onChange({ sla_unit: unit, sla_bd_days: undefined, sla_minutes: e.target.value && n > 0 ? Math.round(n * factor) : undefined });
          }}
        />
        <select
          aria-label="Unidade do SLA"
          className={`${input} w-32`}
          value={unit}
          disabled={readOnly}
          onChange={(e) => {
            const next = e.target.value as Unit;
            const current = unit === "bd" ? config.sla_bd_days : minutes ? minutes / factor : undefined;
            setUnit(next);
            if (next === "bd") {
              if (current) setBusinessDays(current);
              else if (calendar) onChange({ sla_unit: "bd", sla_calendar_id: calendar.id });
            } else {
              onChange({ sla_unit: next, sla_bd_days: undefined, sla_minutes: current ? Math.round(current * (next === "d" ? 1440 : 60)) : undefined });
            }
          }}
        >
          <option value="bd" disabled={calendars.length === 0}>
            dias úteis
          </option>
          <option value="d">dias de 24h</option>
          <option value="h">horas</option>
        </select>
      </div>
      {unit === "bd" && calendar && (
        <p className="mt-1 text-xs text-slate-500">
          1 dia útil = uma jornada do calendário {calendar.name}
          {calendar.business_start && calendar.business_end ? ` (${calendar.business_start.slice(0, 5)} às ${calendar.business_end.slice(0, 5)})` : ""}. Fins de semana e feriados não contam.
        </p>
      )}
      {calendars.length === 0 && <p className="mt-1 text-xs text-slate-500">Para usar dias úteis, cadastre um calendário em Calendários.</p>}
    </div>
  );
}
