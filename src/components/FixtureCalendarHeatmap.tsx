type Props = {
  /** ISO date ('YYYY-MM-DD') -> fixture count, for the currently selected league/season. */
  dateCounts: Record<string, number>;
  loading: boolean;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  /** The month currently displayed. Owned by the parent so the matchweek
   *  filter below the calendar can stay in sync with it. */
  viewYear: number;
  /** 0-indexed, matching Date's convention. */
  viewMonth: number;
  onChangeMonth: (year: number, month: number) => void;
};

const WEEKDAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
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

/** Monday-first day-of-week index (0 = Monday, 6 = Sunday) for a UTC date. */
function mondayFirstDow(year: number, month: number, day: number): number {
  const jsDay = new Date(Date.UTC(year, month, day)).getUTCDay(); // 0 = Sunday
  return (jsDay + 6) % 7;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export default function FixtureCalendarHeatmap({
  dateCounts,
  loading,
  selectedDate,
  onSelectDate,
  viewYear,
  viewMonth,
  onChangeMonth,
}: Props) {
  function changeMonth(delta: number) {
    const total = viewYear * 12 + viewMonth + delta;
    onChangeMonth(Math.floor(total / 12), ((total % 12) + 12) % 12);
  }

  const totalDays = daysInMonth(viewYear, viewMonth);
  const leadingBlanks = mondayFirstDow(viewYear, viewMonth, 1);
  const maxCount = Math.max(1, ...Object.values(dateCounts));

  const cells: { day: number | null; key: string | null; count: number }[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push({ day: null, key: null, count: 0 });
  for (let d = 1; d <= totalDays; d++) {
    const key = dateKey(viewYear, viewMonth, d);
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
    <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden w-full max-w-[260px]">
      <div className="flex items-center justify-between px-2 py-1 bg-pitch-900 text-chalk-100">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Previous month"
          className="px-1.5 py-0.5 rounded hover:bg-pitch-800 transition-colors text-xs"
        >
          &larr;
        </button>
        <span className="font-display uppercase text-xs tracking-wide">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="Next month"
          className="px-1.5 py-0.5 rounded hover:bg-pitch-800 transition-colors text-xs"
        >
          &rarr;
        </button>
      </div>

      <div className="p-1.5">
        {loading ? (
          <p className="text-ink-500 font-mono text-xs px-1 py-2">Loading&hellip;</p>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-0.5 mb-0.5">
              {WEEKDAY_HEADERS.map((w, i) => (
                <div key={i} className="text-center text-[9px] font-medium text-ink-500">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
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
                      'aspect-square rounded-sm flex flex-col items-center justify-center text-[9px] leading-none transition-colors border border-chalk-300',
                      heatClasses(cell.count, isSelected),
                      cell.count === 0 ? 'cursor-default' : 'cursor-pointer hover:ring-1 hover:ring-amber-400',
                    ].join(' ')}
                  >
                    <span>{cell.day}</span>
                    {cell.count > 0 && <span className="font-mono text-[8px] leading-none mt-0.5">{cell.count}</span>}
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
