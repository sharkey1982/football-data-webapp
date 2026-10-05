// ============================================================================
// src/pages/international/IntlFixturesPage.tsx
//
// /international/fixtures -- International Fixtures & Results. The shared
// calendar heat map shows games per day (results and coming fixtures); pick a
// day for its games by competition, with each side's Elo expectation and the
// upsets. ?date=YYYY-MM-DD picks a day; ?team=<slug> shows one nation's latest
// results and coming fixtures instead. Results come from the CC0 results file,
// which runs days to weeks behind: games played since show "Result to follow".
// ============================================================================

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import FixtureCalendarHeatmap from '../../components/FixtureCalendarHeatmap';
import { FixtureRow, GameList, GameRow, IntlHeader, Section } from '../../components/intl/IntlBits';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { INTL_FIXTURES_PATH, intlFixturesPath, intlTeamPath, loadIntlFixtures, loadIntlTeamGames, loadIntlTeams } from '../../lib/intlApi';
import { DATA_NOTE, competitionRank, countsByDate, shortDate, ukDateTime, type IntlFixture, type IntlMatch } from '../../lib/intlStats';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Left-hand calendar month for a date: the month before it. */
function leftMonthOf(date: string): { year: number; month: number } {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1;
  return m === 0 ? { year: y - 1, month: 11 } : { year: y, month: m - 1 };
}

const todayUk = () => ukDateTime(new Date().toISOString()).date;

type DayGroup = { competition: string; rank: number; matches: IntlMatch[]; fixtures: IntlFixture[] };

function groupDay(matches: IntlMatch[], fixtures: IntlFixture[], date: string): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const m of matches.filter((x) => x.match_date === date)) {
    const g = groups.get(m.competition) ?? { competition: m.competition, rank: competitionRank(m.competition, m.competition_kind), matches: [], fixtures: [] };
    g.matches.push(m);
    groups.set(m.competition, g);
  }
  for (const f of fixtures.filter((x) => !x.match_key && ukDateTime(x.kickoff_utc).date === date)) {
    const name = 'UEFA Nations League';
    const g = groups.get(name) ?? { competition: name, rank: competitionRank(name, 'nations_league'), matches: [], fixtures: [] };
    g.fixtures.push(f);
    groups.set(name, g);
  }
  return [...groups.values()].sort((a, b) => a.rank - b.rank || a.competition.localeCompare(b.competition));
}

export default function IntlFixturesPage() {
  const [params, setParams] = useSearchParams();
  const team = params.get('team');
  const dateParam = ISO.test(params.get('date') ?? '') ? params.get('date')! : null;
  const today = todayUk();
  const [view, setView] = useState<{ year: number; month: number } | null>(null);
  const anchor = view ?? leftMonthOf(dateParam ?? today);
  const { data, failed, loading } = useKeyedFetch(team ? null : `${anchor.year}-${anchor.month}`, () => loadIntlFixtures(anchor.year, anchor.month));
  const teamGames = useKeyedFetch(team, () => loadIntlTeamGames(team!));
  const teams = useKeyedFetch('teams', () => loadIntlTeams());

  const counts = useMemo(() => countsByDate(data?.matches ?? [], data?.fixtures ?? []), [data]);
  const selected = useMemo(() => {
    if (dateParam) return dateParam;
    if (counts[today]) return today;
    const dates = Object.keys(counts).sort();
    return dates.find((d) => d > today) ?? dates.filter((d) => d < today).pop() ?? null;
  }, [dateParam, counts, today]);
  const groups = useMemo(() => (data && selected ? groupDay(data.matches, data.fixtures, selected) : []), [data, selected]);
  const nGames = groups.reduce((a, g) => a + g.matches.length + g.fixtures.length, 0);
  const tg = teamGames.data;

  useDocumentHead({
    title: tg ? `${tg.team.team} results and fixtures` : 'International results and fixtures, day by day',
    description: tg
      ? `${tg.team.team}'s latest international results and coming fixtures, with the Elo favourite in every game.`
      : 'Every men’s international since 1872, day by day: results with the favourite and the upsets, and the coming Nations League fixtures.',
    path: INTL_FIXTURES_PATH,
  });

  function pickDate(d: string) {
    const next = new URLSearchParams(params);
    next.delete('team');
    next.set('date', d);
    setParams(next);
  }
  function pickTeam(slug: string) {
    const next = new URLSearchParams();
    if (slug) next.set('team', slug);
    setParams(next);
  }

  const teamOptions = useMemo(
    () => (teams.data ?? []).filter((t) => t.confederation && t.last_match >= '2018-01-01').sort((a, b) => a.team.localeCompare(b.team)),
    [teams.data]
  );

  return (
    <article className="space-y-5">
      <IntlHeader title="Fixtures & Results">
        <p className="text-ink-700 max-w-prose">Every men’s international since 1872, with the favourite on the day. Pick a day on the calendar, or one nation.</p>
      </IntlHeader>

      <label className="text-sm inline-flex items-center gap-2">
        <span className="text-ink-500">Nation</span>
        <select value={team ?? ''} onChange={(e) => pickTeam(e.target.value)} className="border border-chalk-300 rounded px-2 py-1 bg-white max-w-[16rem]" data-testid="intl-team-picker">
          <option value="">All nations, by day</option>
          {teamOptions.map((t) => (
            <option key={t.slug} value={t.slug}>{t.team}</option>
          ))}
        </select>
      </label>

      {team ? (
        <>
          {teamGames.failed && <p className="text-ink-700">That nation’s games are unavailable right now.</p>}
          {teamGames.loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
          {!teamGames.loading && !teamGames.failed && !tg && <p className="text-ink-700">No nation by that name.</p>}
          {tg && (
            <>
              <p className="text-sm">
                <Link to={intlTeamPath(tg.team.slug)} className="text-pitch-800 underline underline-offset-2">{`${tg.team.team}: full record, rating and tournament history`}</Link>
              </p>
              {tg.fixtures.filter((f) => !f.match_key).length > 0 && (
                <Section title="Coming fixtures" id="intl-team-fixtures">
                  <GameList testId="intl-team-fixtures">{tg.fixtures.filter((f) => !f.match_key).map((f) => <FixtureRow key={f.fixture_key} f={f} showDate />)}</GameList>
                </Section>
              )}
              <Section title="Latest results" id="intl-team-results">
                <GameList testId="intl-team-results">{tg.matches.map((m) => <GameRow key={m.match_key} m={m} showDate showCompetition team={tg.team.team} />)}</GameList>
              </Section>
            </>
          )}
        </>
      ) : (
        <>
          {failed && <p className="text-ink-700">Results are unavailable right now.</p>}
          {loading && !data && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
          {data && (
            <>
              <div className="flex flex-col md:flex-row gap-4 items-start">
                <FixtureCalendarHeatmap
                  dateCounts={counts}
                  loading={loading}
                  selectedDates={new Set(selected ? [selected] : [])}
                  onToggleDate={pickDate}
                  viewYear={anchor.year}
                  viewMonth={anchor.month}
                  onChangeMonth={(year, month) => setView({ year, month })}
                />
                <p className="flex-1 min-w-0 text-ink-500 text-sm pt-1">
                  {`Darker days have more games. Latest result in the file: ${data.latestResult ? shortDate(data.latestResult) : '–'}; games since then show “Result to follow”.`}
                </p>
              </div>

              {selected && (
                <section aria-labelledby="intl-day" className="space-y-4" data-testid="intl-day">
                  <h2 id="intl-day" className="font-display uppercase tracking-wide text-lg text-ink-900">{`${shortDate(selected)} · ${nGames} game${nGames === 1 ? '' : 's'}`}</h2>
                  {groups.length === 0 && <p className="text-ink-700 text-sm">No games on this day.</p>}
                  {groups.map((g) => (
                    <div key={g.competition} className="space-y-1">
                      <h3 className="text-sm font-medium text-ink-900">{g.competition}</h3>
                      <GameList>
                        {g.matches.map((m) => <GameRow key={m.match_key} m={m} />)}
                        {g.fixtures.map((f) => <FixtureRow key={f.fixture_key} f={f} />)}
                      </GameList>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </>
      )}
      <p className="text-xs text-ink-500">
        {`Winners in bold. The percentage is the home side’s Elo expectation before the game (a win counts 1, a draw a half; 100 points for home advantage unless the ground is neutral). “Upset”: the winner’s expectation was under 30%. Kick-offs in UK time. ${DATA_NOTE}`}{' '}
        <Link to={intlFixturesPath()} className="underline">Back to today</Link>
      </p>
    </article>
  );
}
