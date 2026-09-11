type Props = {
  /** ISO date ('YYYY-MM-DD') -> fixture count, for the currently selected league/season. */
  dateCounts: Record<string, number>;
  /** ISO date -> competition type, so cup dates can be coloured differently
   *  from league dates. 'mixed' when a date has both (renders a split
   *  colour). Omitted dates default to the league colour scale. */
  dateTypes?: Record<string, 'league' | 'cup' | 'mixed'>;
  loading: boolean;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  /** The LEFT-hand month shown. The right-hand month is always the one
   *  immediately after it. Owned by the parent so the fixture list can
   *  stay in sync with whichever months are currently on screen. */
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

/** Normalises a possibly out-of-range (year, month) pair -- e.g. month 12 -> next year, January. */
function normaliseMonth(year: number, month: number): { year: number; month: number } {
  const total = year * 12 + month;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export default function FixtureCalendarHeatmap({
  dateCounts,
  dateTypes,
  loading,
  selectedDate,
  onSelectDate,
  viewYear,
  viewMonth,
  onChangeMonth,
}: Props) {
  function changeMonth(delta: number) {
    const next = normaliseMonth(viewYear, viewMonth + delta);
    onChangeMonth(next.year, next.month);
  }

  const maxCount = Math.max(1, ...Object.values(dateCounts));

  function heatClasses(count: number, isSelected: boolean, type: 'league' | 'cup' | 'mixed'): string {
    if (isSelected) return 'bg-amber-500 text-ink-900 font-semibold';
    if (count === 0) return 'bg-white text-ink-500';
    if (type === 'mixed') return 'text-chalk-100 font-medium';
    const intensity = count / maxCount;
    if (type === 'cup') {
      if (intensity > 0.75) return 'bg-cup-800 text-chalk-100';
      if (intensity > 0.5) return 'bg-cup-700 text-chalk-100';
      if (intensity > 0.25) return 'bg-cup-600/70 text-ink-900';
      return 'bg-cup-600/30 text-ink-900';
    }
    if (intensity > 0.75) return 'bg-pitch-800 text-chalk-100';
    if (intensity > 0.5) return 'bg-pitch-700 text-chalk-100';
    if (intensity > 0.25) return 'bg-pitch-700/60 text-ink-900';
    return 'bg-pitch-700/25 text-ink-900';
  }

  function renderMonth(year: number, month: number) {
    const totalDays = daysInMonth(year, month);
    const leadingBlanks = mondayFirstDow(year, month, 1);
    const cells: { day: number | null; key: string | null; count: number; type: 'league' | 'cup' | 'mixed' }[] = [];
    for (let i = 0; i < leadingBlanks; i++) cells.push({ day: null, key: null, count: 0, type: 'league' });
    for (let d = 1; d <= totalDays; d++) {
      const key = dateKey(year, month, d);
      cells.push({ day: d, key, count: dateCounts[key] ?? 0, type: dateTypes?.[key] ?? 'league' });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null, key: null, count: 0, type: 'league' });

    return (
      <div className="flex-1 min-w-0">
        <p className="text-center font-display uppercase text-[10px] tracking-wide text-ink-700 mb-1">
          {MONTH_NAMES[month]} {year}
        </p>
        <div className="grid grid-cols-7 gap-px mb-px">
          {WEEKDAY_HEADERS.map((w, i) => (
            <div key={i} className="text-center text-[8px] font-medium text-ink-500">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px">
          {cells.map((cell, i) => {
            if (cell.day === null) return <div key={i} className="aspect-square" />;
            const isSelected = cell.key === selectedDate;
            const isMixed = cell.type === 'mixed' && cell.count > 0 && !isSelected;
            return (
              <button
                type="button"
                key={cell.key}
                disabled={cell.count === 0}
                onClick={() => onSelectDate(isSelected ? null : cell.key)}
                style={
                  isMixed
                    ? { background: 'linear-gradient(135deg, var(--color-pitch-700) 50%, var(--color-cup-700) 50%)' }
                    : undefined
                }
                className={[
                  'aspect-square rounded-sm flex flex-col items-center justify-center text-[7px] leading-none transition-colors border border-chalk-300',
                  heatClasses(cell.count, isSelected, cell.type),
                  cell.count === 0 ? 'cursor-default' : 'cursor-pointer hover:ring-1 hover:ring-amber-400',
                ].join(' ')}
              >
                <span>{cell.day}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const next = normaliseMonth(viewYear, viewMonth + 1);

  return (
    <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden w-full max-w-[280px]">
      <div className="flex items-center justify-between px-2 py-1 bg-pitch-900 text-chalk-100">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Previous month"
          className="px-1.5 py-0.5 rounded hover:bg-pitch-800 transition-colors text-xs"
        >
          &larr;
        </button>
        <span className="font-display uppercase text-[10px] tracking-wide">
          {MONTH_NAMES[viewMonth]} &ndash; {MONTH_NAMES[next.month]} {next.year}
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
            <div className="flex gap-2">
              {renderMonth(viewYear, viewMonth)}
              {renderMonth(next.year, next.month)}
            </div>
            {dateTypes && Object.values(dateTypes).some((t) => t !== 'league') && (
              <div className="flex items-center gap-3 mt-1.5 px-0.5 text-[9px] text-ink-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-pitch-700 inline-block" /> League
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-cup-700 inline-block" /> Cup
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
