"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { PANEL_LABEL_MAX, type PanelItem } from "@/lib/financial-panel";
import { FormulaInput } from "@/components/builder/Inspector";
import type { WorkflowField } from "@/lib/workflow/types";
import { createWorkflowField, deleteWorkflowField, saveFinancialPanel, updateWorkflowField } from "../../actions";

type Field = {
  id: string;
  key: string;
  label: string;
  field_type: string;
  typeLabel: string;
  formula: string | null;
  min_value: number | null;
  max_value: number | null;
  default_value: string | null;
};

const fieldCls = "w-full rounded-lg border-0 px-3 py-2 text-[13px] text-slate-900 outline-none";
const smallSelect = "rounded-md border-0 px-2 py-1 text-xs text-slate-800";
const NEW_TYPES = [
  ["money", "Valor em R$"],
  ["percent", "Porcentagem (%)"],
  ["number", "Número"],
  ["calculated", "Calculado (fórmula)"],
] as const;

// Monta o painel financeiro do fluxo: cria, edita e exclui campos numéricos; escolhe quais entram, a ordem, o rótulo,
// o destaque e se a pessoa preenche ou só consulta.
export function PanelEditor({ workflowId, fields, initial, canEdit }: { workflowId: string; fields: Field[]; initial: PanelItem[]; canEdit: boolean }) {
  const router = useRouter();
  const known = new Set(fields.map((f) => f.key));
  const [items, setItems] = useState<PanelItem[]>(initial.filter((i) => known.has(i.key)));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newType, setNewType] = useState<string>("money");
  const [busy, setBusy] = useState(false);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const available = fields.filter((f) => !items.some((i) => i.key === f.key));
  const asBuilderFields = fields.map((f) => ({ key: f.key, label: f.label, field_type: f.field_type })) as unknown as WorkflowField[];

  function move(index: number, dir: -1 | 1) {
    setItems((list) => {
      const next = [...list];
      const j = index + dir;
      if (j < 0 || j >= next.length) return list;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }
  const patch = (key: string, p: Partial<PanelItem>) => setItems((l) => l.map((x) => (x.key === key ? { ...x, ...p } : x)));

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveFinancialPanel(workflowId, items);
      setMsg(res.ok ? { ok: true, text: "Painel salvo." } : { ok: false, text: res.error });
    });
  }

  async function handleCreate(fd: FormData) {
    setBusy(true);
    setMsg(null);
    const res = await createWorkflowField(workflowId, fd);
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    setItems((l) => [...l, { key: res.field.key, tone: "neutral", mode: res.field.field_type === "calculated" ? "view" : "edit" }]);
    setCreating(false);
    setMsg({ ok: true, text: `Campo "${res.field.label}" criado e incluído no painel. Clique em Salvar painel para confirmar.` });
    router.refresh();
  }

  async function handleUpdate(f: Field, fd: FormData) {
    setBusy(true);
    setMsg(null);
    const res = await updateWorkflowField(f.id, workflowId, fd);
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    setEditingId(null);
    setMsg({ ok: true, text: `Campo "${res.field.label}" atualizado.` });
    router.refresh();
  }

  async function handleDelete(f: Field) {
    if (!window.confirm(`Excluir o campo "${f.label}"? Os valores já preenchidos nos sinistros ficam guardados, mas o campo some do fluxo.`)) return;
    setBusy(true);
    setMsg(null);
    const res = await deleteWorkflowField(f.id, workflowId);
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    setItems((l) => l.filter((x) => x.key !== f.key));
    setMsg({ ok: true, text: `Campo "${f.label}" excluído.` });
    router.refresh();
  }

  function fieldForm(f: Field | null) {
    const type = f ? f.field_type : newType;
    return (
      <form action={(fd) => (f ? handleUpdate(f, fd) : handleCreate(fd))} className="space-y-2 rounded-lg bg-slate-900/[0.04] p-3">
        <input name="label" required defaultValue={f?.label ?? ""} placeholder="Nome do campo (ex.: Valor da franquia)" className={fieldCls} autoFocus />
        {!f && (
          <select name="field_type" value={newType} onChange={(e) => setNewType(e.target.value)} className={fieldCls} aria-label="Tipo do campo">
            {NEW_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        )}
        {(type === "money" || type === "percent" || type === "number") && (
          <div className="grid grid-cols-2 gap-2">
            <input name="min_value" inputMode="decimal" defaultValue={f?.min_value ?? ""} placeholder={type === "percent" ? "Mínimo (%)" : "Valor mínimo"} className={fieldCls} />
            <input name="max_value" inputMode="decimal" defaultValue={f?.max_value ?? ""} placeholder={type === "percent" ? "Máximo (%)" : "Valor máximo"} className={fieldCls} />
          </div>
        )}
        {type === "calculated" && <FormulaInput fields={asBuilderFields} defaultValue={f?.formula ?? ""} defaultFormat={f?.default_value ?? "money"} selfKey={f?.key} />}
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-600 disabled:opacity-60">
            {busy ? "Salvando…" : f ? "Salvar campo" : "Criar campo"}
          </button>
          <button
            type="button"
            onClick={() => (f ? setEditingId(null) : setCreating(false))}
            className="rounded-md px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-900/[0.06]"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl bg-white p-4">
        <h2 className="text-[13px] font-semibold text-slate-900">No painel ({items.length})</h2>
        {items.length === 0 ? (
          <p className="mt-2 text-[13px] text-slate-700">Nada escolhido ainda. Adicione campos abaixo ou crie um novo.</p>
        ) : (
          <ol className="mt-2 divide-y divide-slate-100">
            {items.map((it, i) => {
              const f = byKey.get(it.key);
              if (!f) return null;
              const calc = f.field_type === "calculated";
              return (
                <li key={it.key} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <div className="min-w-[10rem] flex-1">
                      <input
                        aria-label={`Rótulo no painel de ${f.label}`}
                        value={it.label ?? ""}
                        disabled={!canEdit}
                        maxLength={PANEL_LABEL_MAX}
                        onChange={(e) => patch(it.key, { label: e.target.value })}
                        placeholder={f.label}
                        className="w-full rounded-md border-0 px-2 py-1 text-[13px] font-medium text-slate-900 outline-none"
                      />
                      <div className="mt-0.5 px-2 text-xs text-slate-600">
                        {f.typeLabel}
                        {f.formula && <span className="font-mono"> = {f.formula}</span>}
                      </div>
                    </div>
                    <select
                      aria-label={`Quem preenche ${f.label}`}
                      value={calc ? "view" : it.mode}
                      disabled={!canEdit || calc}
                      onChange={(e) => patch(it.key, { mode: e.target.value as PanelItem["mode"] })}
                      className={smallSelect}
                    >
                      <option value="edit">Editável</option>
                      <option value="view">Só informativo</option>
                    </select>
                    <select
                      aria-label={`Destaque de ${f.label}`}
                      value={it.tone}
                      disabled={!canEdit}
                      onChange={(e) => patch(it.key, { tone: e.target.value as PanelItem["tone"] })}
                      className={smallSelect}
                    >
                      <option value="neutral">Sem destaque</option>
                      <option value="sign">Verde/vermelho pelo sinal</option>
                    </select>
                    {canEdit && (
                      <div className="flex items-center gap-0.5">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir ${f.label}`} className="rounded p-1.5 text-slate-700 hover:bg-slate-900/[0.06] disabled:opacity-30">
                          <ChevronUp className="size-4" />
                        </button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Descer ${f.label}`} className="rounded p-1.5 text-slate-700 hover:bg-slate-900/[0.06] disabled:opacity-30">
                          <ChevronDown className="size-4" />
                        </button>
                        <button type="button" onClick={() => setEditingId(editingId === f.id ? null : f.id)} aria-label={`Editar o campo ${f.label}`} title="Editar o campo" className="rounded p-1.5 text-slate-700 hover:bg-slate-900/[0.06]">
                          <Pencil className="size-4" />
                        </button>
                        <button type="button" onClick={() => handleDelete(f)} aria-label={`Excluir o campo ${f.label}`} title="Excluir o campo" className="rounded p-1.5 text-rose-700 hover:bg-rose-500/10">
                          <Trash2 className="size-4" />
                        </button>
                        <button type="button" onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))} className="ml-1 rounded px-2 py-1 text-xs text-slate-700 hover:bg-slate-900/[0.06]">
                          Tirar do painel
                        </button>
                      </div>
                    )}
                  </div>
                  {canEdit && editingId === f.id && (
                    <div className="mt-2">
                      {fieldForm(f)}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {canEdit && (
        <section className="rounded-xl bg-white p-4">
          <h2 className="text-[13px] font-semibold text-slate-900">Campos disponíveis</h2>
          {available.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {available.map((f) => (
                <span key={f.key} className="inline-flex items-center overflow-hidden rounded-lg bg-slate-900/[0.05] text-[13px] text-slate-900">
                  <button
                    type="button"
                    onClick={() => setItems((l) => [...l, { key: f.key, tone: "neutral", mode: f.field_type === "calculated" ? "view" : "edit" }])}
                    className="px-2.5 py-1 hover:bg-slate-900/[0.06]"
                  >
                    + {f.label} <span className="text-xs text-slate-600">({f.typeLabel})</span>
                  </button>
                  <button type="button" onClick={() => handleDelete(f)} aria-label={`Excluir o campo ${f.label}`} title="Excluir o campo" className="px-1.5 py-1 text-rose-700 hover:bg-rose-500/10">
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-slate-700">Todos os campos numéricos do fluxo já estão no painel.</p>
          )}
          <div className="mt-3">
            {creating ? (
              fieldForm(null)
            ) : (
              <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline">
                <Plus className="size-4" /> Novo campo
              </button>
            )}
          </div>
        </section>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600 disabled:opacity-60">
            {pending ? "Salvando…" : "Salvar painel"}
          </button>
          <p className="text-xs text-white">Criar, editar ou excluir um campo vale na hora. Ordem, rótulo, destaque e &quot;Editável&quot; só valem depois de Salvar painel.</p>
        </div>
      ) : (
        <p className="text-[13px] text-white">Você pode ver o painel, mas não editar.</p>
      )}
      {msg && (
        <p role="status" className={`rounded-lg px-3 py-2 text-[13px] ${msg.ok ? "bg-white text-emerald-800" : "bg-white text-rose-800"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
