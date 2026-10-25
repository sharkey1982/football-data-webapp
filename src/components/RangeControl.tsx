// Range views for fixture-type lists: Next matchday / Today / This week /
// This month (TV guides: All upcoming instead of Next matchday). Shared by
// /fixtures, Results Projections and the TV guides; ranges in lib/dateRange.

import { RANGE_LABELS, type DateRange } from '../lib/dateRange';

type Props = {
  options: readonly DateRange[];
  value: DateRange;
  onChange: (r: DateRange) => void;
  /** Step the week or month back or forward (only shown for those ranges). */
  onStep?: (dir: -1 | 1) => void;
  /** What the current range covers, e.g. 'Mon 19 Oct to Sun 25 Oct'. */
  caption?: string;
};

export default function RangeControl({ options, value, onChange, onStep, caption }: Props) {
  const stepping = onStep && (value === 'week' || value === 'month');
  const unit = value === 'week' ? 'week' : 'month';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" data-testid="range-control">
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Show games for">
        {options.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={value === r}
            onClick={() => onChange(r)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
              value === r ? 'bg-pitch-700 border-pitch-700 text-chalk-100' : 'bg-white border-chalk-300 text-ink-700'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>
      {(stepping || caption) && (
        <div className="flex items-center gap-1.5 text-xs text-ink-500">
          {stepping && (
            <button type="button" onClick={() => onStep!(-1)} aria-label={`Previous ${unit}`} className="rounded border border-chalk-300 bg-white px-2 py-0.5 text-ink-700">
              &larr;
            </button>
          )}
          {caption && <span aria-live="polite">{caption}</span>}
          {stepping && (
            <button type="button" onClick={() => onStep!(1)} aria-label={`Next ${unit}`} className="rounded border border-chalk-300 bg-white px-2 py-0.5 text-ink-700">
              &rarr;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
