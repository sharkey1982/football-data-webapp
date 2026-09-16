// ============================================================================
// src/components/fpl/GameweekRangeFilter.tsx
//
// Shared "from GW to GW" range picker -- preset buttons (This GW / Next 3 /
// Next 5 / Next 10 / Custom) plus explicit From/To number inputs, matching
// the style OptimalSquadPage established first. Requested directly: align
// how every page presents a gameweek range, rather than each having its
// own bespoke inputs. Purely a controlled input component -- callers own
// the actual from/to state and decide what to do when it changes (fetch
// immediately, or wait for an explicit submit button).
// ============================================================================

import { useEffect, useState } from 'react';

export type GameweekRangePreset = 'this' | 'next3' | 'next5' | 'next10' | 'custom';

export default function GameweekRangeFilter({
  defaultGw,
  fromGw,
  toGw,
  onChange,
  /** Caps the "Next 10 GWs" preset and, if provided, is shown in a
   * validation message when the custom range exceeds it. Omit for pages
   * with no such constraint (e.g. a plain projections table). */
  maxRangeSpan,
  /** Which preset to apply once defaultGw first resolves. Defaults to
   * 'this' (matching Optimal Squad) -- pass a different one for a page
   * whose natural starting window is wider (e.g. a projections table
   * defaulting to "next 5 GWs" instead of just the current one). */
  initialPreset = 'this',
}: {
  defaultGw: number | null;
  fromGw: number | null;
  toGw: number | null;
  onChange: (fromGw: number | null, toGw: number | null) => void;
  maxRangeSpan?: number;
  initialPreset?: GameweekRangePreset;
}) {
  const [preset, setPreset] = useState<GameweekRangePreset>(initialPreset);

  useEffect(() => {
    if (defaultGw === null) return;
    applyPreset(preset);
    // Only re-run when the default first resolves -- a later change to
    // `preset` re-runs this deliberately (see applyPreset below), but this
    // effect itself must not fire again just because fromGw/toGw changed
    // as a RESULT of applying a preset, or picking "This GW" would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultGw]);

  function applyPreset(p: GameweekRangePreset) {
    setPreset(p);
    if (defaultGw === null) return;
    if (p === 'this') onChange(defaultGw, defaultGw);
    else if (p === 'next3') onChange(defaultGw, defaultGw + 2);
    else if (p === 'next5') onChange(defaultGw, defaultGw + 4);
    else if (p === 'next10') onChange(defaultGw, defaultGw + (maxRangeSpan ?? 9));
    // 'custom' leaves whatever the person has already set via the number inputs.
  }

  const rangeSpan = fromGw !== null && toGw !== null ? toGw - fromGw : null;
  const rangeTooWide = maxRangeSpan !== undefined && rangeSpan !== null && rangeSpan > maxRangeSpan;
  const rangeInvalid = fromGw !== null && toGw !== null && toGw < fromGw;

  return (
    <div className="space-y-2">
      <div>
        <div className="text-xs font-medium text-ink-500 mb-1">Gameweek range</div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['this', 'This GW'],
              ['next3', 'Next 3 GWs'],
              ['next5', 'Next 5 GWs'],
              ['next10', 'Next 10 GWs'],
              ['custom', 'Custom'],
            ] as [GameweekRangePreset, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              className={[
                'px-3 py-1.5 text-sm font-medium rounded-md border transition-colors',
                preset === key ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'bg-white text-ink-700 border-chalk-300 hover:bg-chalk-100',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-ink-500 mb-1" htmlFor="from-gw">
            From GW
          </label>
          <input
            id="from-gw"
            type="number"
            min={1}
            value={fromGw ?? ''}
            onChange={(e) => {
              setPreset('custom');
              onChange(e.target.value === '' ? null : Number(e.target.value), toGw);
            }}
            className="w-20 border border-chalk-300 rounded px-2 py-1 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-500 mb-1" htmlFor="to-gw">
            To GW
          </label>
          <input
            id="to-gw"
            type="number"
            min={1}
            value={toGw ?? ''}
            onChange={(e) => {
              setPreset('custom');
              onChange(fromGw, e.target.value === '' ? null : Number(e.target.value));
            }}
            className="w-20 border border-chalk-300 rounded px-2 py-1 text-sm font-mono"
          />
        </div>
      </div>

      {(rangeInvalid || rangeTooWide) && (
        <p className="text-xs text-loss-700">
          {rangeInvalid ? 'To GW must be on or after From GW.' : `Range too wide \u2014 up to ${(maxRangeSpan ?? 0) + 1} gameweeks at once.`}
        </p>
      )}
    </div>
  );
}
