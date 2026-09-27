// ============================================================================
// src/pages/football/ClubSeasonPage.tsx
//
// /football/teams/:slug/:season -- one club's league season: the story in
// prose, its position after every match, its points against champions and
// relegated clubs at the same stage, and every result. Server-rendered at
// build (English leagues) with initialData.
// ============================================================================

import { Link, Navigate, useParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import LineChart, { ChartLegend } from '../../components/history/LineChart';
import {
  clubSeasonPath,
  clubSeasonStory,
  leagueSeasonLink,
  loadClubSeason,
  ordinal,
  type ClubSeasonData,
} from '../../lib/clubSeasonApi';
import { isEnglish, parseSeasonSegment, seasonDisplay, seasonSegment } from '../../lib/leagueSeasonApi';
import { formatMatchDateWithYear } from '../../lib/formatDate';
import NotFoundPage from '../NotFoundPage';

const RESULT_TEXT = { W: 'Won', D: 'Drew', L: 'Lost' } as const;
const RESULT_CLASS = { W: 'text-pitch-800', D: 'text-ink-700', L: 'text-loss-600' } as const;

export default function ClubSeasonPage({ initialData }: { initialData?: ClubSeasonData }) {
  const { slug = '', season: seg } = useParams();
  const startYear = parseSeasonSegment(seg);
  const key = startYear === null ? null : `${slug}:${startYear}`;
  const { data, failed, loading } = useKeyedFetch(
    key,
    () => loadClubSeason(slug, startYear as number),
    initialData ? { key: `${initialData.team.slug}:${initialData.season.start_year}`, data: initialData } : undefined
  );

  const when = data ? seasonDisplay(data.league.code, data.season.start_year) : '';
  useDocumentHead({
    title: data ? `${data.team.name} ${when}: ${data.eraName} results and table position` : 'Club season',
    description: data ? clubSeasonStory(data) : 'A club’s league season: every result and its table position after each match.',
    path: data ? clubSeasonPath(data.team.slug, data.league.code, data.season.start_year) : `/football/teams/${slug}/${seg ?? ''}`,
  });

  if (startYear === null || (!loading && !failed && data === null)) return <NotFoundPage />;
  if (data && seg !== seasonSegment(data.league.code, data.season.start_year)) {
    return <Navigate to={clubSeasonPath(data.team.slug, data.league.code, data.season.start_year)} replace />;
  }

  const english = data ? isEnglish(data.league) : false;
  const idx = data ? data.clubSeasons.findIndex((s) => s.start_year === data.season.start_year) : -1;
  const prev = data && idx > 0 ? data.clubSeasons[idx - 1] : null;
  const next = data && idx >= 0 && idx < data.clubSeasons.length - 1 ? data.clubSeasons[idx + 1] : null;
  const band = (o: 'champion' | 'relegated', k: 'p25' | 'p75') =>
    (data?.benchmarks ?? []).filter((b) => b.outcome === o).map((b) => ({ x: b.matches_played, y: Math.round(b[k] * 10) / 10 }));
  const hasBench = (data?.benchmarks.length ?? 0) > 0;

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          {data ? (
            <>
              <Link to={`/football/teams/${data.team.slug}`} className="hover:underline">{data.team.name}</Link>
              {' '}&middot;{' '}
              <Link to={leagueSeasonLink(data)} className="hover:underline">{`${data.eraName} ${when}`}</Link>
            </>
          ) : (
            'Football'
          )}
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">{data ? `${data.team.name} ${when}` : 'Club season'}</h1>
      </header>

      {failed && <p className="text-ink-700">This season is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {data && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="club-season-story">{clubSeasonStory(data)}</p>

          <nav aria-label="Other seasons" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {prev && (
              <Link to={clubSeasonPath(data.team.slug, prev.league_code, prev.start_year)} className="text-pitch-800 underline underline-offset-2">
                &larr; {seasonDisplay(prev.league_code, prev.start_year)}
              </Link>
            )}
            <Link to={`/football/teams/${data.team.slug}`} className="text-pitch-800 underline underline-offset-2">
              {`All ${data.team.name} seasons`}
            </Link>
            <Link to={leagueSeasonLink(data)} className="text-pitch-800 underline underline-offset-2">
              {`${data.eraName} ${when} table`}
            </Link>
            {next && (
              <Link to={clubSeasonPath(data.team.slug, next.league_code, next.start_year)} className="text-pitch-800 underline underline-offset-2">
                {seasonDisplay(next.league_code, next.start_year)} &rarr;
              </Link>
            )}
          </nav>

          {data.matches.length > 1 && (
            <section aria-labelledby="position-heading" className="space-y-2">
              <h2 id="position-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">Position after each match</h2>
              <LineChart
                ariaLabel={`${data.team.name} league position after each match, ${when}`}
                xLabel="Matches played"
                yLabel="Position"
                invertY
                yMin={1}
                yMax={data.summary.clubs}
                height={240}
                series={[
                  {
                    id: 'pos',
                    label: 'Position',
                    points: data.matches.map((m) => ({ x: m.matches_played, y: m.position_on_date })),
                    strokeClass: 'stroke-pitch-700',
                    width: 2.5,
                    dots: data.matches.length <= 46,
                  },
                ]}
              />
            </section>
          )}

          {data.matches.length > 1 && hasBench && (
            <section aria-labelledby="points-heading" className="space-y-2">
              <h2 id="points-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">Points against champions and relegated clubs</h2>
              <LineChart
                ariaLabel={`${data.team.name} points after each match against historical champions and relegated clubs`}
                xLabel="Matches played"
                yLabel="Points"
                yMin={0}
                height={260}
                bands={[
                  { id: 'c', label: 'Champions (middle half)', lower: band('champion', 'p25'), upper: band('champion', 'p75'), fillClass: 'fill-amber-400/40' },
                  { id: 'r', label: 'Relegated (middle half)', lower: band('relegated', 'p25'), upper: band('relegated', 'p75'), fillClass: 'fill-loss-600/20' },
                ]}
                series={[{ id: 'pts', label: data.team.name, points: data.matches.map((m) => ({ x: m.matches_played, y: m.points })), strokeClass: 'stroke-pitch-700', width: 2.5 }]}
              />
              <ChartLegend
                items={[
                  { label: data.team.name, swatchClass: 'bg-pitch-700' },
                  { label: 'Champions, middle half', swatchClass: 'bg-amber-400/60' },
                  { label: 'Relegated, middle half', swatchClass: 'bg-loss-600/30' },
                ]}
              />
              <p className="text-xs text-ink-500 max-w-prose">
                {`Bands: the middle half of champions’ and relegated clubs’ points after each match, from every complete ${data.summary.clubs}-club ${data.league.name} season on file.`}
              </p>
            </section>
          )}

          <section aria-labelledby="results-heading">
            <h2 id="results-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">Results</h2>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
                <thead className="bg-chalk-200 text-ink-500">
                  <tr>
                    <th scope="col" className="text-right font-medium text-xs px-2 py-2">#</th>
                    <th scope="col" className="text-left font-medium text-xs px-2 py-2 hidden sm:table-cell">Date</th>
                    <th scope="col" className="text-left font-medium text-xs px-2 py-2">Opponent</th>
                    <th scope="col" className="text-center font-medium text-xs px-2 py-2">Score</th>
                    <th scope="col" className="text-left font-medium text-xs px-2 py-2 hidden sm:table-cell">Result</th>
                    <th scope="col" className="text-right font-medium text-xs px-2 py-2">Pts</th>
                    <th scope="col" className="text-right font-medium text-xs px-2 py-2">Pos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.matches.map((m, i) => (
                    <tr key={m.matches_played} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{m.matches_played}</td>
                      <td className="px-2 py-1.5 text-xs whitespace-nowrap hidden sm:table-cell">{formatMatchDateWithYear(m.match_date)}</td>
                      <th scope="row" className="text-left px-2 py-1.5 font-normal">
                        {english && m.opponent_slug ? (
                          <Link to={clubSeasonPath(m.opponent_slug, data.league.code, data.season.start_year)} className="hover:underline">{m.opponent_name}</Link>
                        ) : (
                          m.opponent_name
                        )}
                        <span className="text-xs text-ink-500">{m.venue === 'H' ? ' (home)' : ' (away)'}</span>
                      </th>
                      <td className={`px-2 py-1.5 text-center font-mono text-xs tabular-nums ${RESULT_CLASS[m.result]}`}>
                        {`${m.goals_for}–${m.goals_against}`}
                        <span className="sm:hidden">{` ${m.result}`}</span>
                      </td>
                      <td className={`px-2 py-1.5 text-xs hidden sm:table-cell ${RESULT_CLASS[m.result]}`}>{RESULT_TEXT[m.result]}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{m.points}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{ordinal(m.position_on_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-500 mt-2 max-w-prose">
              Score is this club&rsquo;s goals first. Pos is the position in the table after that day&rsquo;s matches; points include deductions from the date they applied.
            </p>
          </section>
        </>
      )}
    </article>
  );
}
