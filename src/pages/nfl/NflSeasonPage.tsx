// ============================================================================
// src/pages/nfl/NflSeasonPage.tsx
//
// /nfl/seasons/:season -- the story of one NFL season, as Football's league
// season pages tell theirs: the champion and the route there, best and
// worst records, scoring, streaks, the biggest upsets, how the season
// compares with every other since 2002, the play-off results and the final
// (or current) standings. Server-rendered at build for every season.
// ============================================================================

import { Link, useParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import StandingsTables from '../../components/nfl/StandingsTables';
import {
  NFL_HUB_PATH,
  NFL_SEASONS_PATH,
  loadNflSeason,
  nflFixturesPath,
  nflSeasonPath,
  nflTeamPath,
  weekLabel,
  type NflGame,
  type NflSeasonData,
} from '../../lib/nflApi';
import { seasonFingerprint, seasonStory, upsetSize } from '../../lib/nflStory';
import NotFoundPage from '../NotFoundPage';

const ROUND_ORDER = ['WC', 'DIV', 'CON', 'SB'] as const;

function PlayoffGame({ g }: { g: NflGame }) {
  const done = g.home_score != null;
  const homeWon = done && g.home_score! > g.away_score!;
  return (
    <li className="text-sm">
      <Link to={nflTeamPath(g.away_slug)} className={`hover:underline ${done && !homeWon ? 'font-semibold' : ''}`}>{g.away_name}</Link>
      {done ? <span className="font-mono text-xs tabular-nums">{` ${g.away_score}-${g.home_score} `}</span> : <span className="text-ink-500 text-xs"> @ </span>}
      <Link to={nflTeamPath(g.home_slug)} className={`hover:underline ${homeWon ? 'font-semibold' : ''}`}>{g.home_name}</Link>
      {g.overtime && <span className="text-xs text-ink-500"> (OT)</span>}
      {upsetSize(g) >= 3 && <span className="text-xs text-pitch-700">{` · upset, ${upsetSize(g)}-point underdog won`}</span>}
    </li>
  );
}

export default function NflSeasonPage({ initialData }: { initialData?: NflSeasonData }) {
  const { season: seg } = useParams();
  const season = seg && /^\d{4}$/.test(seg) ? Number(seg) : null;
  const { data, failed, loading } = useKeyedFetch(
    season == null ? null : String(season),
    () => loadNflSeason(season as number),
    initialData ? { key: String(initialData.season), data: initialData } : undefined
  );
  const story = data ? seasonStory(data.season, data.games, data.rows, data.summaries) : null;

  useDocumentHead({
    title: season ? `The ${season} NFL season: champions, story and standings` : 'NFL season',
    description: story?.headline ?? 'The story of an NFL season.',
    path: season ? nflSeasonPath(season) : NFL_SEASONS_PATH,
  });

  if (season === null || (!loading && !failed && data === null)) return <NotFoundPage />;

  const idx = data ? data.seasons.indexOf(data.season) : -1;
  const prev = data && idx > 0 ? data.seasons[idx - 1] : null;
  const next = data && idx >= 0 && idx < data.seasons.length - 1 ? data.seasons[idx + 1] : null;
  const summary = data?.summaries.find((s) => s.season === data.season);
  const post = data ? data.games.filter((g) => g.game_type !== 'REG') : [];

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot; <Link to={NFL_SEASONS_PATH} className="hover:underline">Past seasons</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">{`The ${season} season`}</h1>
      </header>

      {failed && <p className="text-ink-700">This season is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {data && story && (
        <>
          <section aria-label="The story" className="space-y-3 max-w-prose" data-testid="nfl-season-story">
            <p className="text-ink-900 text-lg leading-snug">{story.headline}</p>
            {story.paragraphs.map((p) => (
              <p key={p} className="text-ink-900">{p}</p>
            ))}
          </section>

          <nav aria-label="Other seasons" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {prev && <Link to={nflSeasonPath(prev)} className="text-pitch-800 underline underline-offset-2">&larr; {prev}</Link>}
            <Link to={NFL_SEASONS_PATH} className="text-pitch-800 underline underline-offset-2">Every season</Link>
            <Link to={nflFixturesPath(data.season, 1)} rel="nofollow" className="text-pitch-800 underline underline-offset-2">{`${data.season} fixtures & results`}</Link>
            {next && <Link to={nflSeasonPath(next)} className="text-pitch-800 underline underline-offset-2">{next} &rarr;</Link>}
          </nav>

          {post.length > 0 && (
            <section aria-labelledby="playoffs-heading">
              <h2 id="playoffs-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">Play-offs</h2>
              <div className="grid sm:grid-cols-2 gap-4 mt-2">
                {ROUND_ORDER.map((round) => {
                  const games = post.filter((g) => g.game_type === round);
                  if (games.length === 0) return null;
                  return (
                    <div key={round}>
                      <h3 className="font-mono text-xs uppercase tracking-widest text-ink-500">{weekLabel(round, 0)}</h3>
                      <ul className="mt-1 space-y-0.5">{games.map((g) => <PlayoffGame key={g.game_id} g={g} />)}</ul>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section aria-labelledby="table-heading" className="space-y-2">
            <h2 id="table-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">
              {data.rows[0]?.season_complete ? 'Final standings' : 'Standings'}
            </h2>
            <StandingsTables rows={data.rows} />
          </section>

          {summary && (
            <section aria-labelledby="numbers-heading">
              <h2 id="numbers-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">Season in numbers</h2>
              <div className="overflow-x-auto mt-2">
                <table className="text-sm border border-chalk-300 rounded-lg overflow-hidden">
                  <thead className="bg-chalk-200 text-ink-500">
                    <tr>
                      <th scope="col" className="text-left font-medium text-xs px-3 py-2">Measure</th>
                      <th scope="col" className="text-right font-medium text-xs px-3 py-2">{data.season}</th>
                      <th scope="col" className="text-right font-medium text-xs px-3 py-2">Average since 2002</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasonFingerprint(summary, data.summaries).map((f, i) => (
                      <tr key={f.label} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                        <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">
                          {f.label}
                          {f.note && <span className="block text-ink-500">{f.note}</span>}
                        </th>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{f.value}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-ink-500">{f.average ?? '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-ink-500 mt-2 max-w-prose">Regular season only. Average: every completed season since 2002 except this one. Data: nflverse.</p>
            </section>
          )}
        </>
      )}
    </article>
  );
}
