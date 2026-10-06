// Barra de magnitude de série única (contagem por grupo/categoria), um hue só, comprimento
// proporcional, rótulo direto no lugar de eixo. Segue a skill de dataviz: sequential = um hue.
export function MagnitudeBars({ items, emptyLabel }: { items: { label: string; count: number }[]; emptyLabel: string }) {
  if (items.length === 0) return <p className="text-[13px] text-slate-500">{emptyLabel}</p>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-[12px] text-slate-600">{item.label}</span>
          <div className="h-2 min-w-0 flex-1 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-brand"
              style={{ width: `${Math.max((item.count / max) * 100, 4)}%` }}
            />
          </div>
          <span className="w-6 shrink-0 text-right text-[12px] font-medium text-slate-700">{item.count}</span>
        </li>
      ))}
    </ul>
  );
}
