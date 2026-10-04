// ============================================================================
// src/components/SortableTable.tsx
//
// A plain data table whose column headers sort it (Chris: tables are
// sortable by default, by clicking the header). Columns say how to sort;
// a column without a sort value isn't sortable. First used by the tennis
// pages; anything else can take it up.
// ============================================================================

import { useMemo, useState, type ReactNode } from 'react';

export type Column<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  /** Sort value; omit to make the column unsortable. Nulls always sort last. */
  sortValue?: (row: T) => string | number | null;
  align?: 'left' | 'right';
  /** Tailwind classes to hide the column on small screens, e.g. 'hidden sm:table-cell'. */
  className?: string;
  /** First click sorts descending (numbers usually read best that way). */
  descFirst?: boolean;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  /** Show only the first n rows (after sorting). */
  limit?: number;
  caption?: string;
  testId?: string;
  empty?: string;
};

export default function SortableTable<T>({ columns, rows, rowKey, initialSort, limit, caption, testId, empty }: Props<T>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const f = sort!.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return f * (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb)));
    });
  }, [rows, sort, columns]);
  const shown = limit ? sorted.slice(0, limit) : sorted;

  function toggle(c: Column<T>) {
    if (!c.sortValue) return;
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.descFirst ? 'desc' : 'asc' }));
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden" data-testid={testId}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-chalk-200 text-ink-500">
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={`font-medium text-xs px-2 py-2 ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.className ?? ''}`}
                >
                  {c.sortValue ? (
                    <button type="button" onClick={() => toggle(c)} className="inline-flex items-center gap-1 hover:text-ink-900">
                      {c.label}
                      <span aria-hidden className={active ? 'text-ink-900' : 'text-ink-500 opacity-40'}>
                        {active ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
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
          {shown.map((r, i) => (
            <tr key={rowKey(r)} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={`px-2 py-1.5 ${c.align === 'right' ? 'text-right font-mono text-xs tabular-nums' : ''} ${c.className ?? ''}`}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
          {shown.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-2 py-3 text-ink-500">
                {empty ?? 'Nothing to show.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
