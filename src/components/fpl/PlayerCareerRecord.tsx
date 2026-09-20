// ============================================================================
// src/components/fpl/PlayerCareerRecord.tsx
//
// One player's season-by-season ACTUAL record: a points-per-season bar
// list and the full compare table (Aug price, points, minutes, per-90,
// per-£m, goals, assists).
//
// Extracted from PlayerRecordPage so the canonical player page
// (/fpl/players/:slug) can show the same thing rather than a thinner
// version of it. The whole point of the extraction is that there is now
// ONE implementation: two hand-maintained copies of a numbers table is
// how the two pages disagreed about the same player in the first place.
//
// Keyed on fpl_code, not fpl_player_id -- FPL reassigns element ids every
// season, so anything spanning seasons has to go through player_identity.
//
// Presentational only. Fetching stays with the pages, because the two
// need it at different moments: the record page loads career data as its
// main content, the canonical page as a secondary section below the
// projections.
// ============================================================================

import { seasonLabel, type PlayerSeason } from '../../lib/playerScoutApi';

export type PlayerCareerRecordProps = {
  career: PlayerSeason[];
  /** Highlighted in the bar list, and clickable if onSelectSeason is
   * given. The record page drives its gameweek table from this; the
   * canonical page has no such table, so it passes neither. */
  selectedSeasonId?: number | null;
  onSelectSeason?: (seasonId: number) => void;
  /** Heading text, so each page can frame it in its own voice. */
  heading?: string;
};

export default function PlayerCareerRecord({
  career,
  selectedSeasonId = null,
  onSelectSeason,
  heading = 'Every season compared',
}: PlayerCareerRecordProps) {
  // One season is not a comparison -- the bar list would be a single
  // full-width bar and the table a single row, both saying less than the
  // numbers already shown elsewhere on either page.
  if (career.length < 2) return null;

  // Guarded rather than assumed: a career whose best season is 0 points
  // (possible for a fringe player with minutes but no returns) would
  // divide by zero and render NaN-width bars.
  const maxCareerPoints = Math.max(...career.map((c) => c.total_points), 1);

  return (
    <section>
      <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">{heading}</h2>
      <ul className="mt-2 space-y-1.5">
        {career.map((c) => {
          const label = seasonLabel(c.season_slug);
          const isSelected = c.season_id === selectedSeasonId;
          return (
            <li key={c.season_id} className="flex items-center gap-3">
              {onSelectSeason ? (
                <button
                  type="button"
                  onClick={() => onSelectSeason(c.season_id)}
                  className={`w-16 shrink-0 text-left font-mono text-xs underline-offset-2 hover:underline ${
                    isSelected ? 'text-ink-900 font-semibold' : 'text-pitch-800'
                  }`}
                >
                  {label}
                </button>
              ) : (
                // No handler means nothing to click -- render plain text
                // rather than a button that looks interactive and isn't.
                <span className="w-16 shrink-0 text-left font-mono text-xs text-ink-700">{label}</span>
              )}
              <div className="flex-1 bg-chalk-200 rounded h-4 overflow-hidden">
                <div className="bg-pitch-700 h-full" style={{ width: `${(c.total_points / maxCareerPoints) * 100}%` }} />
              </div>
              <span className="w-10 text-right font-mono text-xs tabular-nums">{c.total_points}</span>
              <span className="w-14 text-right font-mono text-[0.65rem] text-ink-500 tabular-nums">
                &pound;{(c.start_cost / 10).toFixed(1)}m
              </span>
            </li>
          );
        })}
      </ul>

      <div className="overflow-x-auto mt-3">
        <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
          <thead className="bg-chalk-200 text-ink-500">
            <tr>
              <th scope="col" className="text-left font-medium text-xs px-3 py-2">Season</th>
              <th scope="col" className="text-left font-medium text-xs px-3 py-2">Club</th>
              <th scope="col" className="text-right font-medium text-xs px-3 py-2">Aug price</th>
              <th scope="col" className="text-right font-medium text-xs px-3 py-2">Points</th>
              <th scope="col" className="text-right font-medium text-xs px-3 py-2">Mins</th>
              <th scope="col" className="text-right font-medium text-xs px-3 py-2">Per 90</th>
              <th scope="col" className="text-right font-medium text-xs px-3 py-2">Per &pound;m</th>
              <th scope="col" className="text-right font-medium text-xs px-3 py-2">G</th>
              <th scope="col" className="text-right font-medium text-xs px-3 py-2">A</th>
            </tr>
          </thead>
          <tbody>
            {career.map((c, i) => (
              <tr key={c.season_id} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">
                  {seasonLabel(c.season_slug)}
                </th>
                <td className="px-3 py-1.5 text-xs text-ink-700">{c.team_name ?? '\u2014'}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                  &pound;{(c.start_cost / 10).toFixed(1)}m
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums font-medium">{c.total_points}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-ink-500">{c.minutes}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                  {/* Per 90 puts a 900-minute season and a 3,000-minute
                      one on the same footing, which totals never can. */}
                  {c.minutes > 0 ? ((c.total_points / c.minutes) * 90).toFixed(2) : '\u2014'}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                  {c.points_per_start_million ?? '\u2014'}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{c.goals_scored}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{c.assists}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
