// ============================================================================
// src/pages/international/IntlTeamPage.tsx
//
// /international/teams/:slug -- one nation: rating now and at its peak, coming
// fixtures and latest results, its record at every World Cup, Euro and Nations
// League, its rating over time, its record by competition, top scorers and a
// head-to-head against any opponent it has played.
// ============================================================================

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SortableTable, { type Column } from '../../components/SortableTable';
import { FixtureRow, GameList, GameRow, IntlHeader, Section } from '../../components/intl/IntlBits';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { INTL_TEAMS_PATH, editionPathOf, intlFixturesPath, intlTeamPath, intlTeamPath as teamPath, loadIntlTeam, type IntlTeamData } from '../../lib/intlApi';
import { DATA_NOTE, isReported, reportedAsMatch, TOURNAMENTS, eloByYear, editionLabel, shortDate, tournamentHistory, type CompetitionTotal, type HistoryCell, type PairRecord } from '../../lib/intlStats';

const REACHED_CLASS = (c: HistoryCell) =>
  c.won ? 'bg-amber-500 text-pitch-950 border-amber-600' : c.reached === 'Runner-up' ? 'bg-pitch-800 text-chalk-100 border-pitch-900' : c.order >= 5 ? 'bg-chalk-200 text-pitch-800 border-pitch-600' : 'bg-white text-ink-700 border-chalk-300';

function EloChart({ points, team }: { points: { year: number; elo: number }[]; team: string }) {
  if (points.length < 2) return null;
  const W = 640, H = 180, L = 44, R = 12, T = 12, B = 24;
  const x0 = points[0].year, x1 = points[points.length - 1].year;
  const lo = Math.floor(Math.min(...points.map((p) => p.elo)) / 100) * 100;
  const hi = Math.ceil(Math.max(...points.map((p) => p.elo)) / 100) * 100;
  const X = (y: number) => L + ((y - x0) / Math.max(1, x1 - x0)) * (W - L - R);
  const Y = (e: number) => T + (1 - (e - lo) / Math.max(1, hi - lo)) * (H - T - B);
  const ticks = [lo, Math.round((lo + hi) / 200) * 100, hi];
  const yearTicks = [x0, Math.round((x0 + x1) / 2), x1];
  const peak = points.reduce((a, b) => (b.elo > a.elo ? b : a));
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-2xl" role="img" aria-label={`${team}'s Elo rating by year, ${x0} to ${x1}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="currentColor" className="text-chalk-300" />
            <text x={L - 6} y={Y(t) + 4} textAnchor="end" className="fill-ink-500 text-[11px] font-mono">{t}</text>
          </g>
        ))}
        {yearTicks.map((y) => (
          <text key={y} x={X(y)} y={H - 6} textAnchor="middle" className="fill-ink-500 text-[11px] font-mono">{y}</text>
        ))}
        <polyline fill="none" stroke="currentColor" strokeWidth={2} className="text-pitch-700" points={points.map((p) => `${X(p.year)},${Y(p.elo)}`).join(' ')} />
        <circle cx={X(peak.year)} cy={Y(peak.elo)} r={4} className="fill-amber-500" />
        <text x={X(peak.year)} y={Y(peak.elo) - 8} textAnchor={X(peak.year) > W - 80 ? 'end' : 'middle'} className="fill-ink-900 text-[11px]">{`Peak ${peak.elo} (${peak.year})`}</text>
      </svg>
      <figcaption className="text-xs text-ink-500">Rating at the end of each year it played.</figcaption>
    </figure>
  );
}

function HeadToHead({ data }: { data: IntlTeamData }) {
  const me = data.team.team;
  const opponents = useMemo(() => [...data.pairs].sort((a, b) => b.played - a.played), [data.pairs]);
  const [pick, setPick] = useState<string | null>(null);
  const pair: PairRecord | undefined = opponents.find((p) => (p.team_a === me ? p.team_b : p.team_a) === pick) ?? opponents[0];
  if (!pair) return null;
  const opp = pair.team_a === me ? pair.team_b : pair.team_a;
  const meIsA = pair.team_a === me;
  const won = meIsA ? pair.a_won : pair.b_won;
  const lost = meIsA ? pair.b_won : pair.a_won;
  const gf = meIsA ? pair.a_goals : pair.b_goals;
  const ga = meIsA ? pair.b_goals : pair.a_goals;
  const meetings = data.matches.filter((m) => m.home_team === opp || m.away_team === opp).slice().reverse();
  const slugOf = new Map(data.teams.map((t) => [t.team, t.slug]));
  return (
    <div className="space-y-2">
      <label className="text-sm inline-flex items-center gap-2">
        <span className="text-ink-500">Against</span>
        <select value={opp} onChange={(e) => setPick(e.target.value)} className="border border-chalk-300 rounded px-2 py-1 bg-white max-w-[16rem]" data-testid="intl-h2h-picker">
          {opponents.map((p) => {
            const o = p.team_a === me ? p.team_b : p.team_a;
            return <option key={o} value={o}>{`${o} (${p.played})`}</option>;
          })}
        </select>
      </label>
      <p className="text-ink-900" data-testid="intl-h2h-record">
        {`${me} v `}
        <Link to={teamPath(slugOf.get(opp) ?? '')} className="underline underline-offset-2">{opp}</Link>
        {`: played ${pair.played}, won ${won}, drawn ${pair.drawn}, lost ${lost}; goals ${gf}–${ga}. First met ${shortDate(pair.first_meeting)}, last ${shortDate(pair.last_meeting)}.`}
      </p>
      <GameList testId="intl-h2h-games">{meetings.slice(0, 15).map((m) => <GameRow key={m.match_key} m={m} showDate showCompetition team={me} />)}</GameList>
      {meetings.length > 15 && <p className="text-xs text-ink-500">{`Latest 15 of ${meetings.length} meetings.`}</p>}
    </div>
  );
}

export default function IntlTeamPage() {
  const { slug = '' } = useParams();
  const { data, failed, loading } = useKeyedFetch(slug, () => loadIntlTeam(slug));
  const t = data?.team;
  useDocumentHead({
    title: t ? `${t.team} national team: record, rating and tournament history` : 'International team',
    description: t
      ? `${t.team}: played ${t.played}, won ${t.won} since ${t.first_match.slice(0, 4)}; Elo ${Math.round(t.elo)}${t.elo_rank ? ` (ranked ${t.elo_rank})` : ''}; World Cup, Euro and Nations League history and head-to-heads.`
      : 'A national team’s record, rating and tournament history.',
    path: intlTeamPath(slug),
  });

  const history = useMemo(() => (data && t ? tournamentHistory(t.team, data.matches, data.editions) : []), [data, t]);
  const elo = useMemo(() => (data && t ? eloByYear(t.team, data.matches) : []), [data, t]);
  const scorers = useMemo(() => {
    const n = new Map<string, number>();
    for (const g of data?.goals ?? []) if (g.scorer) n.set(g.scorer, (n.get(g.scorer) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [data]);

  const totalCols: Column<CompetitionTotal>[] = [
    { key: 'c', label: 'Competition', render: (r) => r.competition, sortValue: (r) => r.competition },
    { key: 'p', label: 'P', render: (r) => r.played, sortValue: (r) => r.played, align: 'right', descFirst: true },
    { key: 'w', label: 'W', render: (r) => r.won, sortValue: (r) => r.won, align: 'right', descFirst: true },
    { key: 'd', label: 'D', render: (r) => r.drawn, sortValue: (r) => r.drawn, align: 'right', descFirst: true },
    { key: 'l', label: 'L', render: (r) => r.lost, sortValue: (r) => r.lost, align: 'right', descFirst: true },
    { key: 'g', label: 'Goals', render: (r) => `${r.goals_for}–${r.goals_against}`, sortValue: (r) => r.goals_for - r.goals_against, align: 'right', descFirst: true, className: 'hidden sm:table-cell' },
    { key: 'y', label: 'Years', render: (r) => (r.first_match.slice(0, 4) === r.last_match.slice(0, 4) ? r.first_match.slice(0, 4) : `${r.first_match.slice(0, 4)}–${r.last_match.slice(0, 4)}`), sortValue: (r) => r.last_match, align: 'right', className: 'hidden md:table-cell' },
  ];

  if (failed) return <p className="text-ink-700">This team is unavailable right now.</p>;
  if (loading) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (!data || !t) return <p className="text-ink-700">No national team by that name. <Link to={INTL_TEAMS_PATH} className="underline">See every nation</Link>.</p>;

  const upcoming = data.fixtures.filter((f) => !f.match_key && !isReported(f));
  const reported = data.fixtures.filter(isReported).map(reportedAsMatch).reverse();
  const latest = [...reported, ...data.matches.slice(-10).reverse()].slice(0, 10);
  return (
    <article className="space-y-6">
      <IntlHeader title={t.team} crumb={{ to: INTL_TEAMS_PATH, label: 'Your Team' }}>
        <p className="text-ink-900 max-w-prose" data-testid="intl-team-summary">
          {`${t.confederation ?? 'Not a FIFA confederation member'}. Played ${t.played} since ${shortDate(t.first_match)}: won ${t.won}, drawn ${t.drawn}, lost ${t.lost}. `}
          {`Elo ${Math.round(t.elo)}${t.elo_rank ? `, ranked ${t.elo_rank} in the world` : ''}; peak ${Math.round(t.elo_peak)} in ${t.elo_peak_date.slice(0, 4)}.`}
          {t.wc_titles + t.euro_titles + t.unl_titles > 0 && ` Titles: ${[t.wc_titles && `${t.wc_titles} World Cup${t.wc_titles > 1 ? 's' : ''}`, t.euro_titles && `${t.euro_titles} Euro${t.euro_titles > 1 ? 's' : ''}`, t.unl_titles && `${t.unl_titles} Nations League${t.unl_titles > 1 ? 's' : ''}`].filter(Boolean).join(', ')}.`}
        </p>
      </IntlHeader>

      {upcoming.length > 0 && (
        <Section title="Coming fixtures" id="intl-tp-fixtures">
          <GameList testId="intl-tp-fixtures">{upcoming.map((f) => <FixtureRow key={f.fixture_key} f={f} showDate />)}</GameList>
        </Section>
      )}

      <Section title="Latest results" id="intl-tp-latest">
        <GameList testId="intl-tp-latest">{latest.map((m) => <GameRow key={m.match_key} m={m} showDate showCompetition team={t.team} />)}</GameList>
        <p className="text-sm"><Link to={intlFixturesPath({ team: t.slug })} className="text-pitch-800 underline underline-offset-2">Results and fixtures</Link></p>
      </Section>

      {history.length > 0 && (
        <Section title="Tournament history" id="intl-tp-history" testId="intl-tp-history">
          {TOURNAMENTS.map((tt) => {
            const cells = history.filter((c) => c.edition_key.startsWith(`${tt.code}-`));
            if (cells.length === 0) return null;
            return (
              <div key={tt.code} className="space-y-1">
                <h3 className="text-sm font-medium text-ink-900">{`${tt.short}: ${cells.length} appearance${cells.length === 1 ? '' : 's'}`}</h3>
                <ul className="flex flex-wrap gap-1.5">
                  {cells.map((c) => (
                    <li key={c.edition_key}>
                      <Link to={editionPathOf({ competition: tt.competition, label: c.label })} className={`inline-flex flex-col items-center border rounded px-2 py-1 text-xs leading-tight hover:underline ${REACHED_CLASS(c)}`}>
                        <span className="font-mono">{editionLabel(c.label)}</span>
                        <span>{c.reached}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <p className="text-xs text-ink-500">Furthest round reached, finals tournaments and Nations League only (qualifiers are not shown).</p>
        </Section>
      )}

      <Section title="Rating over time" id="intl-tp-elo">
        <EloChart points={elo} team={t.team} />
      </Section>

      <Section title="Head to head" id="intl-tp-h2h" testId="intl-tp-h2h">
        <HeadToHead data={data} />
      </Section>

      <Section title="Record by competition" id="intl-tp-totals">
        <SortableTable columns={totalCols} rows={data.totals} rowKey={(r) => r.competition} initialSort={{ key: 'p', dir: 'desc' }} caption={`${t.team} by competition`} testId="intl-tp-totals" />
      </Section>

      {scorers.length > 0 && (
        <Section title="Top scorers" id="intl-tp-scorers">
          <ol className="text-sm list-decimal list-inside columns-1 sm:columns-2" data-testid="intl-tp-scorers">
            {scorers.map(([name, n]) => (
              <li key={name}>{`${name} `}<span className="font-mono text-xs text-ink-500">{n}</span></li>
            ))}
          </ol>
          <p className="text-xs text-ink-500">Goals in games whose scorers are recorded in the source (most competitive games, not every friendly), so totals can be lower than official records.</p>
        </Section>
      )}

      <p className="text-xs text-ink-500">{`Shoot-outs count as draws in records and ratings. ${DATA_NOTE}`}</p>
    </article>
  );
}
