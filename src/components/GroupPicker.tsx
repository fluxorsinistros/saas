"use client";

import { useState } from "react";

export type PickerGroup = {
  id: string;
  name: string;
  usesSubgroups: boolean;
  subgroupRequired: boolean;
  subgroups: { id: string; name: string }[];
};

const select =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

// Grupos da pessoa. Quando o grupo usa subgrupos e a pessoa está nele, aparece a escolha do subgrupo logo abaixo
// (obrigatória se o grupo exigir). Os campos seguem o padrão do servidor: group_ids e subgroup_<id do grupo>.
export function GroupPicker({
  groups,
  selectedIds = [],
  selectedSubgroups = {},
}: {
  groups: PickerGroup[];
  selectedIds?: string[];
  selectedSubgroups?: Record<string, string>;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set(selectedIds));
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-2">
      {groups.map((g) => (
        <div key={g.id}>
          <label className="flex items-center gap-2 text-[13px] text-slate-700">
            <input type="checkbox" name="group_ids" value={g.id} checked={checked.has(g.id)} onChange={() => toggle(g.id)} /> {g.name}
          </label>
          {g.usesSubgroups && checked.has(g.id) && (
            <div className="ml-6 pb-1">
              <label htmlFor={`subgroup-${g.id}`} className="block text-[12px] text-slate-600">
                Subgrupo de {g.name}
                {g.subgroupRequired ? " (obrigatório)" : " (opcional)"}
              </label>
              <select
                id={`subgroup-${g.id}`}
                name={`subgroup_${g.id}`}
                required={g.subgroupRequired}
                defaultValue={selectedSubgroups[g.id] ?? ""}
                className={select}
              >
                <option value="">{g.subgroups.length ? "Escolha o subgrupo" : "Nenhum subgrupo cadastrado"}</option>
                {g.subgroups.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      ))}
      {groups.length === 0 && <p className="text-xs text-slate-500">A empresa ainda não tem grupos.</p>}
    </div>
  );
}
