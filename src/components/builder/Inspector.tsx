"use client";

import { useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { JOIN_RULE_HELP, JOIN_RULE_LABEL, NODE_META, type JoinRule, type NodeConfig, type NodeType } from "@/lib/workflow/types";
import type { FlowEdge, FlowEdgeData, FlowNode, FlowNodeData } from "./context";

type Group = { id: string; name: string };

const label = "mb-1 block text-[12px] font-medium text-slate-600";
const input =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-slate-50 disabled:text-slate-500";

const GROUP_TYPES: NodeType[] = ["stage", "decision", "pending", "wait"];
const SLA_TYPES: NodeType[] = ["stage", "decision", "pending", "wait"];
const LOOP_TYPES: NodeType[] = ["stage", "decision", "pending", "wait"];

export function NodeInspector({
  node,
  groups,
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
            onChange={(e) => onChange({ groupId: e.target.value || null })}
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

      {SLA_TYPES.includes(type) && (
        <SlaField minutes={data.config.sla_minutes} readOnly={readOnly} onChange={(m) => setConfig({ sla_minutes: m })} />
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
                    className="shrink-0 rounded-md px-2 py-1 text-[11px] text-brand hover:bg-brand/5"
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
            <p className="mt-1 text-[11px] text-slate-500">{JOIN_RULE_HELP[data.config.join_rule ?? "all_required"]}</p>
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
            <p className="mt-1 text-[11px] text-slate-500">
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
        De <span className="font-medium text-slate-900">{sourceName || "—"}</span> para{" "}
        <span className="font-medium text-slate-900">{targetName || "—"}</span>
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
        <span className="block text-[11px] text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

function SlaField({
  minutes,
  readOnly,
  onChange,
}: {
  minutes?: number;
  readOnly: boolean;
  onChange: (m: number | undefined) => void;
}) {
  const [unit, setUnit] = useState<"h" | "d">(minutes && minutes % 1440 !== 0 ? "h" : "d");
  const factor = unit === "d" ? 1440 : 60;
  const value = minutes ? String(+(minutes / factor).toFixed(2)) : "";

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
            onChange(e.target.value && n > 0 ? Math.round(n * factor) : undefined);
          }}
        />
        <select
          aria-label="Unidade do SLA"
          className={`${input} w-28`}
          value={unit}
          disabled={readOnly}
          onChange={(e) => {
            const next = e.target.value as "h" | "d";
            setUnit(next);
            if (minutes) onChange(Math.round((minutes / factor) * (next === "d" ? 1440 : 60)));
          }}
        >
          <option value="d">dias</option>
          <option value="h">horas</option>
        </select>
      </div>
    </div>
  );
}
