// ============================================================================
// src/pages/nfl/NflTeamPage.tsx
//
// /nfl/teams/:slug -- one franchise: the story of its season, its games
// (results, the line and whether it covered, where to watch the rest), its
// fantasy leaders, and every season since 2002 (record, division finish,
// play-offs). Franchise pages follow a
// team through moves (Oakland -> Las Vegas Raiders, San Diego -> Los Angeles
// Chargers, St Louis -> Los Angeles Rams) and renames, showing each season
// under the name it played as. Server-rendered at build for all 32.
// ============================================================================

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import {
  NFL_HUB_PATH,
  NFL_TEAMS_PATH,
  byeWeeks,
  nflGamePath,
  nflPlayerPath,
  lineLabel,
  loadNflTeam,
  nflSeasonPath,
  nflTeamPath,
  ordinal,
  pctLabel,
  recordLabel,
  teamResult,
  teamSentence,
  ukKickoff,
  weekLabel,
  type NflStanding,
  type NflTeamData,
} from '../../lib/nflApi';
import NotFoundPage from '../NotFoundPage';
import NflWatchLine from '../../components/nfl/NflWatchLine';
import ResultFlag from '../../components/ResultFlag';
import { nflTeamChance, resultFlag, vsExpectedText, winsVsExpected } from '../../lib/expectation';
import { againstSpread, teamSeasonStory } from '../../lib/nflStory';
import { loadTeamFantasyLeaders, type NflPlayerSeason } from '../../lib/nflFantasyApi';

function FantasyLeaders({ franchise, season }: { franchise: string; season: number }) {
  const { data } = useKeyedFetch(`${franchise}:${season}`, () => loadTeamFantasyLeaders(franchise, season));
  if (!data || data.length === 0) return null;
  return (
    <section aria-labelledby="fantasy-heading">
      <h2 id="fantasy-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">{`Fantasy leaders, ${season}`}</h2>
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
          <thead className="bg-chalk-200 text-ink-500">
            <tr>
              <th scope="col" className="text-left font-medium text-xs px-2 py-2">Player</th>
              <th scope="col" className="text-left font-medium text-xs px-2 py-2">Pos</th>
              <th scope="col" className="text-right font-medium text-xs px-2 py-2">GP</th>
              <th scope="col" className="text-right font-medium text-xs px-2 py-2">PPR pts</th>
              <th scope="col" className="text-right font-medium text-xs px-2 py-2">Per game</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p: NflPlayerSeason, i: number) => (
              <tr key={p.player_id} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                <th scope="row" className="text-left px-2 py-1.5 font-normal">
                  <Link to={nflPlayerPath(p.player_slug)} className="hover:underline">{p.player_name}</Link>
                </th>
                <td className="px-2 py-1.5 text-xs">{p.position}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{p.games}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{Number(p.pts_ppr).toFixed(1)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums font-semibold">{Number(p.ppg_ppr).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type SortKey = 'season' | 'win_pct' | 'points_for' | 'points_against' | 'point_diff' | 'division_rank' | 'playoff_round';

const num = 'px-2 py-1.5 text-right font-mono text-xs tabular-nums';

export default function NflTeamPage({ initialData }: { initialData?: NflTeamData }) {
  const { slug = '' } = useParams();
  const { data, failed, loading } = useKeyedFetch(slug, () => loadNflTeam(slug), initialData ? { key: initialData.team.slug, data: initialData } : undefined);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'season', desc: true });

  useDocumentHead({
    title: data ? `${data.team.name}: ${data.season} schedule, results and history` : 'NFL team',
    description: data ? teamSentence(data) : 'NFL team schedule, results and season-by-season record.',
    path: nflTeamPath(slug),
  });

  if (!loading && !failed && data === null) return <NotFoundPage />;

  const history: NflStanding[] = data
    ? [...data.history].sort((a, b) => {
        const v = ((a[sort.key] as number) ?? 0) - ((b[sort.key] as number) ?? 0);
        return (sort.desc ? -v : v) || b.season - a.season;
      })
    : [];
  const header = (k: SortKey, label: string, cls = 'text-right') => (
    <th scope="col" className={`${cls} font-medium text-xs px-2 py-2`} aria-sort={sort.key === k ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="hover:underline" onClick={() => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : k !== 'division_rank' && k !== 'points_against' }))}>
        {label}
      </button>
    </th>
  );
  const now = data?.history.find((h) => h.season === data.season);

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot; <Link to={NFL_TEAMS_PATH} className="hover:underline">Your Team</Link>
          {data && <>{' '}&middot; {`${data.team.conference} ${data.team.division}`}</>}
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">{data ? data.team.name : 'NFL team'}</h1>
        {now && <p className="text-sm text-ink-500 mt-1">{`${data!.season}: ${recordLabel(now)}, ${ordinal(now.division_rank)} in the ${now.conference} ${now.division}`}</p>}
      </header>

      {failed && <p className="text-ink-700">This team is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {data && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="nfl-team-story">{teamSentence(data)}</p>
          {teamSeasonStory(data.team.franchise, data.games, now).sentences.length > 0 && (
            <section aria-labelledby="season-story-heading" className="max-w-prose">
              <h2 id="season-story-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">{`The ${data.season} season`}</h2>
              <p className="text-ink-900 mt-1" data-testid="nfl-team-season-story">{teamSeasonStory(data.team.franchise, data.games, now).sentences.join(' ')}</p>
            </section>
          )}

          <section aria-labelledby="games-heading">
            <h2 id="games-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">{`${data.season} games`}</h2>
            {(() => {
              const v = winsVsExpected(
                data.games
                  .filter((g) => g.game_type === 'REG')
                  .map((g) => {
                    const r = teamResult(g, data.team.franchise);
                    return { outcome: r.letter === 'T' ? 'D' : r.letter, win: nflTeamChance(g, data.team.franchise) };
                  })
              );
              return v.played > 0 ? <p className="text-sm text-ink-700 mt-1" data-testid="nfl-team-page-vs-expected">{`Regular season v the betting line: ${vsExpectedText(v, 'wins')}`}</p> : null;
            })()}
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
                <thead className="bg-chalk-200 text-ink-500">
                  <tr>
                    <th scope="col" className="text-left font-medium text-xs px-2 py-2">Week</th>
                    <th scope="col" className="text-left font-medium text-xs px-2 py-2">Opponent</th>
                    <th scope="col" className="text-left font-medium text-xs px-2 py-2">Result / kick-off (UK)</th>
                    <th scope="col" className="text-left font-medium text-xs px-2 py-2 hidden sm:table-cell">Line (closing)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.games.map((g) => ({ week: g.week, g })), ...byeWeeks(data.games).map((week) => ({ week, g: null }))]
                    .sort((a, b) => a.week - b.week)
                    .map(({ week, g }, i) => {
                    if (!g) {
                      return (
                        <tr key={`bye-${week}`} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                          <td className="px-2 py-1.5 text-xs text-ink-700">{`Week ${week}`}</td>
                          <td colSpan={3} className="px-2 py-1.5 text-xs text-ink-500">Bye</td>
                        </tr>
                      );
                    }
                    const r = teamResult(g, data.team.franchise);
                    return (
                      <tr key={g.game_id} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                        <td className="px-2 py-1.5 text-xs text-ink-700">{weekLabel(g.game_type, g.week)}</td>
                        <th scope="row" className="text-left px-2 py-1.5 font-normal">
                          <span className="text-xs text-ink-500">{g.neutral_site ? 'v ' : r.home ? 'v ' : '@ '}</span>
                          <Link to={nflTeamPath(r.opponentSlug)} className="hover:underline">{r.opponent}</Link>
                          {g.neutral_site && g.stadium && <span className="block text-xs text-pitch-700">{g.stadium}</span>}
                        </th>
                        <td className="px-2 py-1.5 font-mono text-xs tabular-nums">
                          {r.letter ? (
                            <>
                              <Link to={nflGamePath(g.game_id)} className={`hover:underline ${r.letter === 'W' ? 'font-semibold' : r.letter === 'L' ? 'text-loss-600' : ''}`}>{`${r.letter} ${r.score}`}</Link>
                              <ResultFlag kind={resultFlag(nflTeamChance(g, data.team.franchise), r.letter === 'T' ? 'D' : r.letter)} chance={nflTeamChance(g, data.team.franchise)} />
                            </>
                          ) : (
                            <>
                              <Link to={nflGamePath(g.game_id)} className="hover:underline">{ukKickoff(g)}</Link>
                              <span className="block font-sans text-[11px]"><NflWatchLine g={g} /></span>
                            </>
                          )}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-xs text-ink-500 hidden sm:table-cell">
                          {lineLabel(g) ?? ''}
                          {(() => {
                            const ats = againstSpread(g, data.team.franchise);
                            return ats ? <span className={ats === 'cover' ? 'text-pitch-700' : undefined}>{` · ${ats === 'cover' ? 'covered' : ats === 'miss' ? 'did not cover' : 'push'}`}</span> : null;
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-3">
              <Link to={nflSeasonPath(data.season)} className="text-pitch-800 underline underline-offset-2">{`Story of the ${data.season} season`}</Link>
            </p>
          </section>

          <FantasyLeaders franchise={data.team.franchise} season={data.season} />

          <section aria-labelledby="history-heading">
            <h2 id="history-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">Every season since 2002</h2>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
                <thead className="bg-chalk-200 text-ink-500">
                  <tr>
                    {header('season', 'Season', 'text-left')}
                    <th scope="col" className="text-right font-medium text-xs px-2 py-2">W-L</th>
                    {header('win_pct', 'Pct')}
                    {header('division_rank', 'Div')}
                    {header('points_for', 'PF', 'text-right hidden sm:table-cell')}
                    {header('points_against', 'PA', 'text-right hidden sm:table-cell')}
                    {header('point_diff', 'Diff')}
                    {header('playoff_round', 'Play-offs', 'text-left')}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={h.season} className={h.playoff_result === 'Won Super Bowl' ? 'bg-amber-100/60' : i % 2 ? 'bg-chalk-100/60' : undefined}>
                      <th scope="row" className="text-left px-2 py-1.5 font-normal">
                        <Link to={nflSeasonPath(h.season)} className="hover:underline">{h.season}</Link>
                        {h.team_name !== data.team.name && <span className="block text-xs text-ink-500">{h.team_name}</span>}
                      </th>
                      <td className={num}>{recordLabel(h)}</td>
                      <td className={num}>{pctLabel(h.win_pct)}</td>
                      <td className={num}>{h.won_division ? 'Won' : ordinal(h.division_rank)}</td>
                      <td className={`${num} hidden sm:table-cell`}>{h.points_for}</td>
                      <td className={`${num} hidden sm:table-cell`}>{h.points_against}</td>
                      <td className={num}>{h.point_diff > 0 ? `+${h.point_diff}` : h.point_diff}</td>
                      <td className="px-2 py-1.5 text-xs text-ink-700">{h.playoff_result ?? (h.season_complete ? 'Missed' : '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-500 mt-2 max-w-prose">
              Regular season record. Division winners are taken from the play-off bracket. Below the winner, level teams are ordered by division record, then points difference, not the NFL&rsquo;s full tiebreak procedure. Data: nflverse.
            </p>
          </section>
        </>
      )}
    </article>
  );
}
