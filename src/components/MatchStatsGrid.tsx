import type { MatchWithNames } from '../lib/api';

/**
 * Home-vs-away comparison bars for one match's box-score stats (shots,
 * shots on target, corners, fouls, cards). Shared between the Match
 * Preview result banner and the head-to-head "latest meeting" panel, so
 * both read the same way.
 */
export function MatchStatsGrid({ match }: { match: MatchWithNames }) {
  const rows: { label: string; home: number | null; away: number | null }[] = [
    { label: 'Shots', home: match.home_shots, away: match.away_shots },
    { label: 'Shots on Target', home: match.home_shots_on_target, away: match.away_shots_on_target },
    { label: 'Corners', home: match.home_corners, away: match.away_corners },
    { label: 'Fouls', home: match.home_fouls, away: match.away_fouls },
    { label: 'Yellow Cards', home: match.home_yellow_cards, away: match.away_yellow_cards },
    { label: 'Red Cards', home: match.home_red_cards, away: match.away_red_cards },
  ];
  const known = rows.filter((r) => r.home != null || r.away != null);
  if (known.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {known.map((r) => {
        const total = (r.home ?? 0) + (r.away ?? 0);
        const homePct = total > 0 ? ((r.home ?? 0) / total) * 100 : 50;
        return (
          <div key={r.label} className="grid grid-cols-[1.5rem_1fr_auto_1fr_1.5rem] items-center gap-2 text-xs">
            <span className="text-right font-mono">{r.home ?? '\u2013'}</span>
            <div className="h-1.5 rounded-full bg-chalk-300 overflow-hidden flex justify-end">
              <div className="h-full bg-pitch-700" style={{ width: `${homePct}%` }} />
            </div>
            <span className="text-ink-500 uppercase tracking-wide text-[10px] px-1 whitespace-nowrap text-center">
              {r.label}
            </span>
            <div className="h-1.5 rounded-full bg-chalk-300 overflow-hidden">
              <div className="h-full bg-loss-600" style={{ width: `${100 - homePct}%` }} />
            </div>
            <span className="text-left font-mono">{r.away ?? '\u2013'}</span>
          </div>
        );
      })}
    </div>
  );
}
