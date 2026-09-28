import type { MatchWithNames } from '../lib/matchesApi';
import { headToHeadSentence, seasonText, summariseHeadToHead, type Run, type Tally } from '../lib/headToHeadHistory';
import { formatMatchDateWithYear } from '../lib/formatDate';

// Every meeting between two clubs in the archive, summarised: the record,
// venue splits, biggest wins, longest unbeaten runs, common scorelines,
// first meeting and competitions. Sits above the last-10 list on /preview.

function score(m: MatchWithNames): string {
  return `${m.home_team_name} ${m.full_time_home_goals}–${m.full_time_away_goals} ${m.away_team_name}`;
}

function when(m: MatchWithNames): string {
  return `${formatMatchDateWithYear(m.match_date)}${m.league_name ? `, ${m.league_name}` : ''}`;
}

function runText(r: Run | null): string {
  if (!r) return '—';
  const years = r.from.slice(0, 4) === r.to.slice(0, 4) ? r.from.slice(0, 4) : `${r.from.slice(0, 4)}–${r.to.slice(0, 4)}`;
  return `${r.length} meetings (${years}${r.ongoing ? ', ongoing' : ''})`;
}

function TallyLine({ label, t, aName, bName }: { label: string; t: Tally; aName: string; bName: string }) {
  const n = t.aWins + t.draws + t.bWins;
  if (n === 0) return null;
  return (
    <tr>
      <th scope="row" className="text-left font-normal text-xs text-ink-500 pr-3 py-1">{label}</th>
      <td className="text-right font-mono text-xs tabular-nums px-2">{n}</td>
      <td className="text-right font-mono text-xs tabular-nums px-2" title={`${aName} wins`}>{t.aWins}</td>
      <td className="text-right font-mono text-xs tabular-nums px-2">{t.draws}</td>
      <td className="text-right font-mono text-xs tabular-nums px-2" title={`${bName} wins`}>{t.bWins}</td>
    </tr>
  );
}

export function HeadToHeadHistory({
  meetings,
  teamAId,
  teamAName,
  teamBName,
}: {
  meetings: MatchWithNames[];
  teamAId: number;
  teamAName: string;
  teamBName: string;
}) {
  const h = summariseHeadToHead(meetings, teamAId);
  if (h.played < 3) return null;
  return (
    <div className="space-y-3" data-testid="h2h-history">
      <p className="text-sm text-ink-900">{headToHeadSentence(h, teamAName, teamBName)}</p>

      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-ink-500">
              <th />
              <th scope="col" className="text-right font-medium text-xs px-2">Played</th>
              <th scope="col" className="text-right font-medium text-xs px-2">{teamAName}</th>
              <th scope="col" className="text-right font-medium text-xs px-2">Draws</th>
              <th scope="col" className="text-right font-medium text-xs px-2">{teamBName}</th>
            </tr>
          </thead>
          <tbody>
            <TallyLine label="All meetings" t={h.overall} aName={teamAName} bName={teamBName} />
            <TallyLine label={`At ${teamAName}`} t={h.aHome} aName={teamAName} bName={teamBName} />
            <TallyLine label={`At ${teamBName}`} t={h.bHome} aName={teamAName} bName={teamBName} />
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-500">Goals: {teamAName} {h.aGoals}, {teamBName} {h.bGoals}.</p>

      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-ink-500">{teamAName}&rsquo;s biggest win</dt>
          <dd>{h.biggestAWin ? <>{score(h.biggestAWin)} <span className="text-xs text-ink-500">({when(h.biggestAWin)})</span></> : 'None yet'}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">{teamBName}&rsquo;s biggest win</dt>
          <dd>{h.biggestBWin ? <>{score(h.biggestBWin)} <span className="text-xs text-ink-500">({when(h.biggestBWin)})</span></> : 'None yet'}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">{teamAName}&rsquo;s longest unbeaten run</dt>
          <dd>{runText(h.longestUnbeatenA)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">{teamBName}&rsquo;s longest unbeaten run</dt>
          <dd>{runText(h.longestUnbeatenB)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">Most common scores ({teamAName} first)</dt>
          <dd className="font-mono text-xs">{h.commonScores.map((s) => `${s.score} ×${s.count}`).join(' · ')}</dd>
        </div>
        {h.first && (
          <div>
            <dt className="text-xs text-ink-500">First meeting in the archive</dt>
            <dd>
              {score(h.first)}{' '}
              <span className="text-xs text-ink-500">
                ({h.first.season_label ? seasonText(h.first.season_label) : h.first.match_date.slice(0, 4)}
                {h.first.league_name ? `, ${h.first.league_name}` : ''})
              </span>
            </dd>
          </div>
        )}
      </dl>
      {h.competitions.length > 1 && (
        <p className="text-xs text-ink-500">By competition: {h.competitions.map((c) => `${c.name} ${c.played}`).join(', ')}.</p>
      )}
    </div>
  );
}
