"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { PanelItem } from "@/lib/financial-panel";
import { saveFinancialPanel } from "../../actions";

type Field = { key: string; label: string; typeLabel: string; formula: string | null };

// Monta o painel: marca os campos que entram, define a ordem e o destaque de cada um.
export function PanelEditor({ workflowId, fields, initial, canEdit }: { workflowId: string; fields: Field[]; initial: PanelItem[]; canEdit: boolean }) {
  const known = new Set(fields.map((f) => f.key));
  const [items, setItems] = useState<PanelItem[]>(initial.filter((i) => known.has(i.key)));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const available = fields.filter((f) => !items.some((i) => i.key === f.key));

  function move(index: number, dir: -1 | 1) {
    setItems((list) => {
      const next = [...list];
      const j = index + dir;
      if (j < 0 || j >= next.length) return list;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveFinancialPanel(workflowId, items);
      setMsg(res.ok ? { ok: true, text: "Painel salvo." } : { ok: false, text: res.error });
    });
  }

  if (fields.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-6 text-[13px] text-slate-600">
        Este fluxo ainda não tem campos numéricos. No editor do fluxo, crie campos do tipo Número, Valor em R$, Porcentagem ou Calculado e
        volte aqui.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-[13px] font-semibold text-slate-900">No painel ({items.length})</h2>
        {items.length === 0 ? (
          <p className="mt-2 text-[13px] text-slate-600">Nada escolhido: a aba Financeiro mostra só os lançamentos e os totais padrão.</p>
        ) : (
          <ol className="mt-2 divide-y divide-slate-100">
            {items.map((it, i) => {
              const f = byKey.get(it.key);
              return (
                <li key={it.key} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-slate-900">{f?.label}</span>{" "}
                    <span className="text-xs text-slate-500">({f?.typeLabel})</span>
                    {f?.formula && <div className="font-mono text-xs text-slate-500">= {f.formula}</div>}
                  </div>
                  <select
                    aria-label={`Destaque de ${f?.label}`}
                    value={it.tone}
                    disabled={!canEdit}
                    onChange={(e) => setItems((l) => l.map((x) => (x.key === it.key ? { ...x, tone: e.target.value as PanelItem["tone"] } : x)))}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                  >
                    <option value="neutral">Sem destaque</option>
                    <option value="sign">Verde se positivo, vermelho se negativo</option>
                  </select>
                  {canEdit && (
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir ${f?.label}`} className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30">
                        <ChevronUp className="size-4" />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Descer ${f?.label}`} className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30">
                        <ChevronDown className="size-4" />
                      </button>
                      <button type="button" onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))} className="ml-1 rounded px-2 py-1 text-xs text-rose-700 hover:bg-rose-50">
                        Tirar
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {canEdit && available.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-[13px] font-semibold text-slate-900">Campos disponíveis</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {available.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setItems((l) => [...l, { key: f.key, tone: "neutral" }])}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[13px] text-slate-800 hover:bg-slate-50"
              >
                + {f.label} <span className="text-xs text-slate-500">({f.typeLabel})</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {canEdit ? (
        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600 disabled:opacity-60">
            {pending ? "Salvando…" : "Salvar painel"}
          </button>
          {msg && <p className={`text-[13px] ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
        </div>
      ) : (
        <p className="text-[13px] text-slate-600">Você pode ver o painel, mas não editar.</p>
      )}
    </div>
  );
}
