// ============================================================================
// src/components/intl/NationPicker.tsx
//
// A friendlier nation chooser than a 200-name dropdown: a button that opens a
// panel with a search box, confederation tabs, quick picks (the current top
// ten by Elo, or the nations most played for a head-to-head) and the list
// grouped by confederation. Type and press Enter for the first match; Escape
// or a click outside closes it.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { CONFEDERATIONS } from '../../lib/intlStats';

export type PickerNation = { team: string; slug: string; confederation: string | null; elo_rank?: number | null; note?: string };

type Props = {
  nations: PickerNation[];
  value: string | null;
  onChange: (slug: string | null) => void;
  label: string;
  /** Text on the button with nothing picked; also offered as "clear" in the panel when set. */
  emptyLabel?: string;
  /** Quick picks; default: the ten best-ranked nations. */
  quick?: PickerNation[];
  quickLabel?: string;
  testId?: string;
};

const OTHER = 'Other';

export default function NationPicker({ nations, value, onChange, label, emptyLabel, quick, quickLabel = 'Top ranked', testId }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [conf, setConf] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const current = nations.find((n) => n.slug === value) ?? null;

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const quickPicks = useMemo(
    () => quick ?? nations.filter((n) => n.elo_rank != null).sort((a, b) => (a.elo_rank ?? 999) - (b.elo_rank ?? 999)).slice(0, 10),
    [quick, nations]
  );
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return nations
      .filter((n) => (!conf || (n.confederation ?? OTHER) === conf) && (!s || n.team.toLowerCase().includes(s)))
      .sort((a, b) => a.team.localeCompare(b.team));
  }, [nations, q, conf]);
  const grouped = useMemo(() => {
    const order = [...CONFEDERATIONS, OTHER];
    return order
      .map((c) => ({ c, list: filtered.filter((n) => (n.confederation ?? OTHER) === c) }))
      .filter((g) => g.list.length);
  }, [filtered]);
  const confs = useMemo(() => [...CONFEDERATIONS, OTHER].filter((c) => nations.some((n) => (n.confederation ?? OTHER) === c)), [nations]);

  function pick(slug: string | null) {
    onChange(slug);
    setOpen(false);
    setQ('');
  }

  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap ${active ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'bg-white text-ink-700 border-chalk-300 hover:border-pitch-600'}`;

  return (
    <div className="relative inline-block text-sm" ref={box} data-testid={testId}>
      <span className="text-ink-500 mr-2">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 border border-chalk-300 rounded px-3 py-1 bg-white hover:border-pitch-600"
        data-testid={testId ? `${testId}-button` : undefined}
      >
        <span className={current ? 'text-ink-900 font-medium' : 'text-ink-500'}>{current ? current.team : emptyLabel ?? 'Choose a nation'}</span>
        <span aria-hidden className="text-ink-500 text-xs">▾</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="absolute z-30 mt-1 left-0 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-chalk-300 bg-white shadow-lg p-3 space-y-3"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          <input
            ref={input}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered[0]) pick(filtered[0].slug);
            }}
            placeholder="Type a nation"
            aria-label="Search nations"
            className="w-full border border-chalk-300 rounded px-2 py-1"
            data-testid={testId ? `${testId}-search` : undefined}
          />
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Confederation">
            <button type="button" className={chip(!conf)} onClick={() => setConf('')} aria-pressed={!conf}>All</button>
            {confs.map((c) => (
              <button key={c} type="button" className={chip(conf === c)} onClick={() => setConf(c)} aria-pressed={conf === c}>{c}</button>
            ))}
          </div>
          {!q && !conf && quickPicks.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-ink-500">{quickLabel}</p>
              <div className="flex flex-wrap gap-1.5">
                {quickPicks.map((n) => (
                  <button key={n.slug} type="button" className={chip(n.slug === value)} onClick={() => pick(n.slug)}>{n.team}</button>
                ))}
              </div>
            </div>
          )}
          <div className="max-h-64 overflow-y-auto -mx-1 px-1">
            {emptyLabel && value && (
              <button type="button" onClick={() => pick(null)} className="block w-full text-left px-2 py-1 rounded text-pitch-800 hover:bg-chalk-100">{emptyLabel}</button>
            )}
            {grouped.length === 0 && <p className="text-ink-500 px-2 py-1">No nation matches.</p>}
            {grouped.map((g) => (
              <div key={g.c}>
                {!conf && <p className="sticky top-0 bg-white text-[11px] uppercase tracking-wide text-ink-500 px-2 pt-2 pb-0.5">{g.c}</p>}
                <ul>
                  {g.list.map((n) => (
                    <li key={n.slug}>
                      <button
                        type="button"
                        onClick={() => pick(n.slug)}
                        className={`flex w-full items-baseline justify-between gap-2 text-left px-2 py-1 rounded hover:bg-chalk-100 ${n.slug === value ? 'font-semibold text-pitch-800' : 'text-ink-900'}`}
                      >
                        <span>{n.team}</span>
                        {n.note && <span className="text-xs text-ink-500 font-mono">{n.note}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
