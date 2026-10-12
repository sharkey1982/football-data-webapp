// ============================================================================
// src/components/fpl/ReportTable.tsx
//
// Small sortable table for the gameweek reports (sortable by default, as
// the site's data tables are). Click a header to sort; click again to
// reverse. Renders on the server in its initial order.
// ============================================================================

import { useState, type ReactNode } from 'react';

export type Column<T> = {
  label: string;
  /** Sort key; omit for an unsortable column. */
  sort?: (row: T) => number | string | null;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /** Row header (first column). */
  head?: boolean;
};

export default function ReportTable<T>({ caption, columns, rows, empty }: { caption: string; columns: Column<T>[]; rows: T[]; empty?: string }) {
  const [sort, setSort] = useState<{ i: number; desc: boolean } | null>(null);
  if (!rows.length) return <p className="text-sm text-ink-500">{empty ?? 'None.'}</p>;
  const sorted = sort
    ? [...rows].sort((a, b) => {
        const f = columns[sort.i].sort!;
        const x = f(a), y = f(b);
        if (x === y) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        const v = typeof x === 'string' ? x.localeCompare(String(y)) : (x as number) - (y as number);
        return sort.desc ? -v : v;
      })
    : rows;
  return (
    <div className="overflow-x-auto">
      <table className="text-sm border border-chalk-300 rounded-lg overflow-hidden">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-chalk-200 text-ink-500">
          <tr>
            {columns.map((c, i) => {
              const align = c.align ?? (i === 0 ? 'left' : 'right');
              const active = sort?.i === i;
              return (
                <th
                  key={c.label}
                  scope="col"
                  className={`${align === 'left' ? 'text-left' : 'text-right'} font-medium text-xs px-1.5 sm:px-3 py-2 align-bottom leading-tight`}
                  aria-sort={active ? (sort!.desc ? 'descending' : 'ascending') : c.sort ? 'none' : undefined}
                >
                  {c.sort ? (
                    <button
                      type="button"
                      className="hover:text-ink-900"
                      onClick={() => setSort(active ? { i, desc: !sort!.desc } : { i, desc: typeof c.sort!(rows[0]) === 'number' })}
                    >
                      {c.label}
                      {active ? (sort!.desc ? ' ▾' : ' ▴') : ''}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, ri) => (
            <tr key={ri} className={ri % 2 ? 'bg-chalk-100/60' : undefined}>
              {columns.map((c, i) => {
                const align = c.align ?? (i === 0 ? 'left' : 'right');
                const cls = `${align === 'left' ? 'text-left min-w-[5.5rem]' : 'text-right font-mono text-xs tabular-nums whitespace-nowrap'} px-1.5 sm:px-3 py-1.5 align-top`;
                return i === 0 || c.head ? (
                  <th key={c.label} scope="row" className={`${cls} font-normal`}>{c.render(r)}</th>
                ) : (
                  <td key={c.label} className={cls}>{c.render(r)}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
