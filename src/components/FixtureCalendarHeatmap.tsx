import { useState } from 'react';

type Props = {
  /** ISO date ('YYYY-MM-DD') -> fixture count, for the currently selected league/season. */
  dateCounts: Record<string, number>;
  loading: boolean;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
};

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// All month/grid arithmetic below uses UTC-anchored values deliberately --
// same reasoning as formatMatchDate: these are calendar dates with no
// meaningful time-of-day, so we don't want local-timezone conversion
// shifting a fixture into the wrong day near midnight.

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Finds the year/month of the chronologically latest date with any fixtures. */
function latestMonthFromCounts(dateCounts: Record<string, number>): { year: number; month: number } {
  const keys = Object.keys(dateCounts);
  if (keys.length === 0) {
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  }
  const latestKey = keys.sort().at(-1)!;
  const [year, month] = latestKey.split('-').map(Number);
  return { year, month: month - 1 };
}

/** Monday-first day-of-week index (0 = Monday, 6 = Sunday) for a UTC date. */
function mondayFirstDow(year: number, month: number, day: number): number {
  const jsDay = new Date(Date.UTC(year, month, day)).getUTCDay(); // 0 = Sunday
  return (jsDay + 6) % 7;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export default function FixtureCalendarHeatmap({ dateCounts, loading, selectedDate, onSelectDate }: Props) {
  const [{ year, month }, setViewMonth] = useState(() => latestMonthFromCounts(dateCounts));
  const [userNavigated, setUserNavigated] = useState(false);

  // Once real data arrives (dateCounts goes from empty to populated, e.g.
  // after switching league/season), snap the view to the new latest month --
  // but only if the person hasn't manually paged the calendar themselves.
  const latest = latestMonthFromCounts(dateCounts);
  if (!userNavigated && (latest.year !== year || latest.month !== month) && Object.keys(dateCounts).length > 0) {
    setViewMonth(latest);
  }

  function changeMonth(delta: number) {
    setUserNavigated(true);
    setViewMonth((current) => {
      const total = current.year * 12 + current.month + delta;
      return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
    });
  }

  const totalDays = daysInMonth(year, month);
  const leadingBlanks = mondayFirstDow(year, month, 1);
  const maxCount = Math.max(1, ...Object.values(dateCounts));

  const cells: { day: number | null; key: string | null; count: number }[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push({ day: null, key: null, count: 0 });
  for (let d = 1; d <= totalDays; d++) {
    const key = dateKey(year, month, d);
    cells.push({ day: d, key, count: dateCounts[key] ?? 0 });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, key: null, count: 0 });

  function heatClasses(count: number, isSelected: boolean): string {
    if (isSelected) return 'bg-amber-500 text-ink-900 font-semibold';
    if (count === 0) return 'bg-white text-ink-500';
    const intensity = count / maxCount;
    if (intensity > 0.75) return 'bg-pitch-800 text-chalk-100';
    if (intensity > 0.5) return 'bg-pitch-700 text-chalk-100';
    if (intensity > 0.25) return 'bg-pitch-700/60 text-ink-900';
    return 'bg-pitch-700/25 text-ink-900';
  }

  return (
    <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-pitch-900 text-chalk-100">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Previous month"
          className="px-2 py-1 rounded hover:bg-pitch-800 transition-colors"
        >
          &larr;
        </button>
        <span className="font-display uppercase text-sm tracking-wide">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="Next month"
          className="px-2 py-1 rounded hover:bg-pitch-800 transition-colors"
        >
          &rarr;
        </button>
      </div>

      <div className="p-3">
        {loading ? (
          <p className="text-ink-500 font-mono text-sm px-1 py-2">Loading calendar&hellip;</p>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAY_HEADERS.map((w) => (
                <div key={w} className="text-center text-xs font-medium text-ink-500">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, i) => {
                if (cell.day === null) return <div key={i} className="aspect-square" />;
                const isSelected = cell.key === selectedDate;
                return (
                  <button
                    type="button"
                    key={cell.key}
                    disabled={cell.count === 0}
                    onClick={() => onSelectDate(isSelected ? null : cell.key)}
                    className={[
                      'aspect-square rounded flex flex-col items-center justify-center text-xs transition-colors border border-chalk-300',
                      heatClasses(cell.count, isSelected),
                      cell.count === 0 ? 'cursor-default' : 'cursor-pointer hover:ring-2 hover:ring-amber-400',
                    ].join(' ')}
                  >
                    <span>{cell.day}</span>
                    {cell.count > 0 && <span className="font-mono text-[10px] leading-none mt-0.5">{cell.count}</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
