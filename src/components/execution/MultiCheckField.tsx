"use client";

import { useState } from "react";
import { splitFieldValues } from "@/lib/workflow/types";

// Lista que aceita mais de uma opção: uma caixa por opção, todas com o mesmo nome (`field_<chave>`), o servidor junta as marcadas.
export function MultiCheckField({
  id,
  name,
  options,
  defaultValue,
  required,
  compact,
}: {
  id: string;
  name: string;
  options: string[];
  defaultValue?: string | null;
  required?: boolean;
  compact?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(() => splitFieldValues(defaultValue).filter((v) => options.includes(v)));
  return (
    <div id={id} role="group" className={`flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 ${compact ? "text-[13px]" : "text-[14px]"}`}>
      {options.map((opt, i) => (
        <label key={opt} className="flex cursor-pointer items-center gap-1.5 text-slate-800">
          <input
            type="checkbox"
            name={name}
            value={opt}
            checked={selected.includes(opt)}
            required={required && selected.length === 0 && i === 0}
            onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, opt] : cur.filter((v) => v !== opt)))}
            className="size-3.5 rounded border-slate-300 text-brand focus:ring-brand/30"
          />
          {opt}
        </label>
      ))}
    </div>
  );
}
