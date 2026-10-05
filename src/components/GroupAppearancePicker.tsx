"use client";

import { useState } from "react";
import { GROUP_COLORS, GROUP_ICONS, GroupIcon, normalizeGroupColor, normalizeGroupIcon } from "@/lib/group-icons";

// Escolha de ícone e cor do grupo (campos "icon" e "color" do formulário). Os dois vêm de listas fixas.
export function GroupAppearancePicker({ icon, color }: { icon?: string | null; color?: string | null }) {
  const [selIcon, setSelIcon] = useState(normalizeGroupIcon(icon));
  const [selColor, setSelColor] = useState(normalizeGroupColor(color));

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 block text-[12px] font-medium text-slate-600">Ícone e cor do grupo</legend>
      <div className="flex items-center gap-3">
        <GroupIcon icon={selIcon} color={selColor} className="size-10" iconClassName="size-5" />
        <span className="text-[12px] text-slate-500">Aparece ao lado do nome do grupo no menu, nas tarefas e nos sinistros.</span>
      </div>

      <div>
        <div className="mb-1 text-xs text-slate-500">Ícone</div>
        <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-10">
          {Object.entries(GROUP_ICONS).map(([key, { label, Icon }]) => (
            <label key={key} title={label} className="cursor-pointer">
              <input type="radio" name="icon" value={key} checked={selIcon === key} onChange={() => setSelIcon(key)} className="peer sr-only" />
              <span className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 peer-checked:border-brand peer-checked:bg-brand/10 peer-checked:text-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40">
                <Icon className="size-4" />
                <span className="sr-only">{label}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs text-slate-500">Cor</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(GROUP_COLORS).map(([key, { label, swatch }]) => (
            <label key={key} title={label} className="cursor-pointer">
              <input type="radio" name="color" value={key} checked={selColor === key} onChange={() => setSelColor(key)} className="peer sr-only" />
              <span className={`block size-7 rounded-full ${swatch} ring-offset-2 transition peer-checked:ring-2 peer-checked:ring-slate-900 peer-focus-visible:ring-2 peer-focus-visible:ring-brand`}>
                <span className="sr-only">{label}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
