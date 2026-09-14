import type { SeasonGameweekSummary } from '../../../lib/fplSeasonApi';
import { formatMatchDate } from '../../../lib/formatDate';

export default function GameweekNav({
  matchweek,
  summary,
  onSelect,
}: {
  matchweek: number;
  summary: SeasonGameweekSummary[];
  onSelect: (matchweek: number) => void;
}) {
  const current = summary.find((s) => s.matchweek === matchweek);
  const minWeek = summary.length > 0 ? summary[0].matchweek : 1;
  const maxWeek = summary.length > 0 ? summary[summary.length - 1].matchweek : 38;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 bg-pitch-900 text-chalk-100 rounded-lg px-3 py-2.5">
        <button
          type="button"
          onClick={() => onSelect(matchweek - 1)}
          disabled={matchweek <= minWeek}
          className="px-3 py-1.5 rounded text-sm font-medium bg-pitch-800 hover:bg-pitch-700 disabled:opacity-30 disabled:hover:bg-pitch-800 transition-colors"
        >
          &larr; Prev
        </button>

        <div className="text-center">
          <div className="font-display uppercase tracking-wide text-lg">Gameweek {matchweek}</div>
          {current && (
            <div className="text-xs text-chalk-300 font-mono">
              {formatMatchDate(current.first_kickoff)}
              {current.last_kickoff !== current.first_kickoff ? ` \u2013 ${formatMatchDate(current.last_kickoff)}` : ''}
              {current.played_count === current.fixture_count
                ? ' \u2022 Complete'
                : current.played_count > 0
                  ? ` \u2022 ${current.played_count}/${current.fixture_count} played`
                  : ''}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onSelect(matchweek + 1)}
          disabled={matchweek >= maxWeek}
          className="px-3 py-1.5 rounded text-sm font-medium bg-pitch-800 hover:bg-pitch-700 disabled:opacity-30 disabled:hover:bg-pitch-800 transition-colors"
        >
          Next &rarr;
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {summary.map((s) => {
          const isSelected = s.matchweek === matchweek;
          const isComplete = s.played_count === s.fixture_count;
          return (
            <button
              key={s.matchweek}
              type="button"
              onClick={() => onSelect(s.matchweek)}
              title={`Gameweek ${s.matchweek}`}
              className={[
                'shrink-0 w-9 h-9 rounded text-xs font-mono font-semibold transition-colors border',
                isSelected
                  ? 'bg-pitch-800 text-chalk-100 border-pitch-800'
                  : isComplete
                    ? 'bg-chalk-200 text-ink-500 border-chalk-300 hover:bg-chalk-300'
                    : 'bg-white text-ink-700 border-chalk-300 hover:bg-chalk-100',
              ].join(' ')}
            >
              {s.matchweek}
            </button>
          );
        })}
      </div>
    </div>
  );
}
