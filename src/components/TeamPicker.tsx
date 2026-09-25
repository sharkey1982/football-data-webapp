// ============================================================================
// src/components/TeamPicker.tsx
//
// Searchable team picker with grouped options (country / division). A
// plain <select> can group but not search; this is an ARIA combobox: type
// to filter (accent-insensitive, and a division name lists its clubs),
// arrow keys to move, Enter to choose, Escape to close. Each division
// heading is itself choosable ("All Premier League clubs"): the value is
// then a TeamGroup label prefixed with GROUP_PREFIX.
// ============================================================================

import { useId, useMemo, useRef, useState } from 'react';
import { filterTeamGroups, GROUP_PREFIX, groupOptionLabel, type TeamGroup } from '../lib/teamGroups';

type Props = {
  groups: TeamGroup[];
  value: string;
  onChange: (team: string) => void;
  label?: string;
};

export default function TeamPicker({ groups, value, onChange, label = 'Team' }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => filterTeamGroups(groups, query), [groups, query]);
  // Each group contributes its "all clubs" option, then its clubs.
  const flat = useMemo(() => visible.flatMap((g) => [...(g.wholeGroup ? [GROUP_PREFIX + g.label] : []), ...g.teams]), [visible]);
  const display = (v: string) => (v.startsWith(GROUP_PREFIX) ? groupOptionLabel(v.slice(GROUP_PREFIX.length)) : v);

  function choose(team: string) {
    onChange(team);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open && flat[active]) {
      e.preventDefault();
      choose(flat[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  let optionIndex = -1;
  return (
    <div className="relative">
      <label htmlFor={id} className="block text-xs font-medium text-ink-500 mb-1">
        {label}
      </label>
      <div className="flex items-center border border-chalk-300 rounded bg-white focus-within:border-pitch-700">
        <input
          id={id}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && flat[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          className="w-full min-w-0 px-2 py-1.5 text-sm bg-transparent outline-none"
          placeholder={value ? display(value) : 'Search teams or divisions'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {value && (
          <button
            type="button"
            aria-label={`Clear team (${display(value)})`}
            className="px-2 text-ink-500 hover:text-ink-900"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange('');
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            &times;
          </button>
        )}
      </div>
      {value && !open && <p className="text-[11px] text-pitch-800 mt-0.5 truncate">Showing: {display(value)}</p>}
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 w-full sm:w-72 max-h-72 overflow-y-auto bg-white border border-chalk-300 rounded shadow-lg text-sm"
        >
          {visible.length === 0 && <li className="px-3 py-2 text-ink-500">No teams match</li>}
          {visible.map((g) => (
            <li key={g.label} role="presentation">
              <p className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-ink-500 bg-chalk-100 sticky top-0">{g.label}</p>
              <ul role="presentation">
                {[...(g.wholeGroup ? [GROUP_PREFIX + g.label] : []), ...g.teams].map((t) => {
                  optionIndex += 1;
                  const idx = optionIndex;
                  return (
                    <li
                      key={t}
                      id={`${id}-opt-${idx}`}
                      role="option"
                      aria-selected={t === value}
                      className={`px-3 py-1.5 cursor-pointer ${idx === active ? 'bg-pitch-700 text-chalk-100' : t === value ? 'bg-chalk-200' : 'hover:bg-chalk-100'}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => choose(t)}
                    >
                      {t.startsWith(GROUP_PREFIX) ? <span className="italic">{groupOptionLabel(g.label)}</span> : t}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
