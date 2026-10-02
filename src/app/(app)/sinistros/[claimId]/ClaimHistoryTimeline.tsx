"use client";

import { useState } from "react";
import { Clock3, User, ChevronDown, ChevronUp } from "lucide-react";

export type HistoryItem = {
  id: string;
  stageTitle: string;
  eventDetail: string | null;
  reason: string | null;
  author: string | null;
  createdAt: string;
  dotTone: "blue" | "emerald" | "amber" | "rose" | "indigo" | "slate";
};

export function ClaimHistoryTimeline({ items }: { items: HistoryItem[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!items.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-500">
        Nenhum registro de histórico encontrado.
      </div>
    );
  }

  const visibleItems = expanded ? items : items.slice(0, 3);
  const remainingCount = items.length - 3;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <ul className="relative space-y-4 before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
        {visibleItems.map((item) => {
          const dotColorClass =
            item.dotTone === "blue"
              ? "bg-blue-600 ring-blue-100"
              : item.dotTone === "emerald"
                ? "bg-emerald-600 ring-emerald-100"
                : item.dotTone === "amber"
                  ? "bg-amber-500 ring-amber-100"
                  : item.dotTone === "rose"
                    ? "bg-rose-500 ring-rose-100"
                    : item.dotTone === "indigo"
                      ? "bg-indigo-600 ring-indigo-100"
                      : "bg-slate-400 ring-slate-100";

          return (
            <li key={item.id} className="relative flex items-start gap-3 pl-8">
              <span
                className={`absolute left-3.5 top-1.5 size-3 -translate-x-1/2 rounded-full border-2 border-white ring-2 ${dotColorClass}`}
              />
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-slate-800">
                    {item.stageTitle}
                  </span>
                  {item.eventDetail && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                      {item.eventDetail}
                    </span>
                  )}
                  {item.reason && (
                    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-700">
                      Motivo: {item.reason}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                    <User className="size-3 text-slate-500" />
                    {item.author ? (
                      <span>{item.author}</span>
                    ) : (
                      <span className="italic text-slate-500">Sistema (automático)</span>
                    )}
                  </span>

                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <Clock3 className="size-3" />
                    {new Date(item.createdAt).toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {items.length > 3 && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200 transition cursor-pointer"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-3.5" />
                Recolher histórico
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" />
                Ver histórico completo (+{remainingCount} registro{remainingCount === 1 ? "" : "s"})
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
