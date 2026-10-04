// ============================================================================
// src/pages/nfl/NflPlayerPage.tsx
//
// /nfl/players/:slug -- one player, for picking a fantasy team: who he is,
// this season in a sentence (points, rank at his position, recent form),
// how consistent he is week to week, his next opponents and how many points
// they give up to his position, his game log, and every season since 2016.
// Client-rendered (not pre-generated: ~2,000 players would break the
// low-page-count policy).
// ============================================================================

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { NFL_HEAT_MAP_PATH, NFL_HUB_PATH, NFL_PLAYERS_PATH, NFL_SCORING_PATH, nflPlayerPath, nflTeamPath, ukKickoff } from '../../lib/nflApi';
import {
  FORMATS,
  age,
  allowedPerGame,
  consistency,
  fantasyPosition,
  fmt1,
  heightLabel,
  loadPlayerPage,
  ppg,
  playerSentence,
  pts,
  weightLabel,
  type NflPlayerWeek,
  type ScoringFormat,
} from '../../lib/nflFantasyApi';
import NotFoundPage from '../NotFoundPage';

const num = 'px-2 py-1.5 text-right font-mono text-xs tabular-nums';

function statLine(w: NflPlayerWeek, pos: string): string {
  const parts: string[] = [];
  if (pos === 'QB') parts.push(`${w.completions}/${w.attempts}, ${w.passing_yards} yds, ${w.passing_tds} TD${w.interceptions ? `, ${w.interceptions} INT` : ''}`);
  if (pos === 'K') parts.push(`FG ${w.fg_made}/${w.fg_att}, PAT ${w.pat_made}`);
  if (w.carries) parts.push(`${w.carries} car, ${w.rushing_yards} yds${w.rushing_tds ? `, ${w.rushing_tds} TD` : ''}`);
  if (w.targets || w.receptions) parts.push(`${w.receptions}/${w.targets} rec, ${w.receiving_yards} yds${w.receiving_tds ? `, ${w.receiving_tds} TD` : ''}`);
  if (w.fumbles_lost) parts.push(`${w.fumbles_lost} fum lost`);
  return parts.join(' · ') || '–';
}

export default function NflPlayerPage() {
  const { slug = '' } = useParams();
  const { data, failed, loading } = useKeyedFetch(slug, () => loadPlayerPage(slug));
  const [fmt, setFmt] = useState<ScoringFormat>('ppr');

  useDocumentHead({
    title: data ? `${data.player.name}: fantasy points, stats and matchups` : 'NFL player',
    description: data ? playerSentence(data, 'ppr') : 'NFL player fantasy points, stats, consistency and upcoming matchups.',
    path: nflPlayerPath(slug),
  });

  if (!loading && !failed && data === null) return <NotFoundPage />;

  const pos = data ? fantasyPosition(data.player.position) : '';
  const cons = data ? consistency(data.weeks, fmt, pos) : null;
  const p = data?.player;
  const bio = p
    ? [
        p.position,
        p.jersey_number != null ? `#${p.jersey_number}` : null,
        age(p.birth_date) != null ? `age ${age(p.birth_date)}` : null,
        heightLabel(p.height_in),
        weightLabel(p.weight_lb),
        p.college,
        p.draft_year ? `drafted ${p.draft_year}, round ${p.draft_round}, pick ${p.draft_pick}` : p.rookie_season ? `undrafted, rookie season ${p.rookie_season}` : null,
        p.years_exp != null ? `${p.years_exp} ${p.years_exp === 1 ? 'season' : 'seasons'} in the NFL` : null,
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot; <Link to={NFL_PLAYERS_PATH} className="hover:underline">Player Scout</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">{p ? p.name : 'NFL player'}</h1>
        {p && (
          <p className="text-sm text-ink-500 mt-1">
            {p.team_slug ? <Link to={nflTeamPath(p.team_slug)} className="text-pitch-800 underline underline-offset-2">{p.team_name}</Link> : 'No current team'}
            {bio && ` · ${bio}`}
          </p>
        )}
      </header>

      {failed && <p className="text-ink-700">This player is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {data && (
        <>
          <div role="group" aria-label="Scoring" className="inline-flex border border-chalk-300 rounded overflow-hidden text-sm">
            {FORMATS.map((f) => (
              <button key={f.key} type="button" aria-pressed={fmt === f.key} onClick={() => setFmt(f.key)} className={`px-2.5 py-1 ${fmt === f.key ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700'}`}>
                {f.label}
              </button>
            ))}
          </div>

          <p className="text-ink-900 max-w-prose" data-testid="nfl-player-story">{playerSentence(data, fmt)}</p>

          {cons && (
            <section aria-labelledby="consistency-heading">
              <h2 id="consistency-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">{`Week to week, ${data.weeksSeason}`}</h2>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                {[
                  ['Bad week', fmt1(cons.floor), 'one week in four is lower'],
                  ['Typical week', fmt1(cons.median), 'the median'],
                  ['Good week', fmt1(cons.ceiling), 'one week in four is higher'],
                  [`${cons.startLine}+ points`, `${cons.startable} of ${cons.games}`, `weeks at a startable ${pos} level`],
                ].map(([label, value, note]) => (
                  <div key={label} className="border border-chalk-300 rounded-lg bg-white/60 px-3 py-2">
                    <dt className="text-xs text-ink-500">{label}</dt>
                    <dd className="font-mono text-lg tabular-nums text-ink-900">{value}</dd>
                    <dd className="text-[11px] text-ink-500">{note}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {data.upcoming.length > 0 && (
            <section aria-labelledby="next-heading">
              <h2 id="next-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">Next games</h2>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
                  <thead className="bg-chalk-200 text-ink-500">
                    <tr>
                      <th scope="col" className="text-left font-medium text-xs px-2 py-2">Week</th>
                      <th scope="col" className="text-left font-medium text-xs px-2 py-2">Opponent</th>
                      <th scope="col" className="text-left font-medium text-xs px-2 py-2 hidden sm:table-cell">Kick-off (UK)</th>
                      <th scope="col" className="text-right font-medium text-xs px-2 py-2">{`Pts allowed to ${pos}s`}</th>
                      <th scope="col" className="text-right font-medium text-xs px-2 py-2">Matchup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.upcoming.map((u, i) => {
                      const rank = u.allowed?.ppr_rank ?? null;
                      const tone = rank == null ? '' : rank <= 8 ? 'text-pitch-700 font-semibold' : rank >= 25 ? 'text-loss-600' : '';
                      return (
                        <tr key={u.game.game_id} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                          <td className="px-2 py-1.5 text-xs">{`Week ${u.game.week}`}</td>
                          <td className="px-2 py-1.5">{`${u.home ? 'v' : '@'} ${u.opponentShort}`}</td>
                          <td className="px-2 py-1.5 text-xs font-mono hidden sm:table-cell">{ukKickoff(u.game)}</td>
                          <td className={num}>{u.allowed ? fmt1(allowedPerGame(u.allowed, fmt)) : '–'}</td>
                          <td className={`${num} ${tone}`}>{rank == null ? '–' : rank <= 8 ? `Kind (${rank}/32)` : rank >= 25 ? `Tough (${rank}/32)` : `${rank}/32`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-ink-500 mt-2 max-w-prose">
                {`Points allowed: per game by that defence to ${pos}s, in the ${data.allowedSeason ?? ''} regular season${data.allowedSeason != null && data.allowedSeason < data.weeksSeason ? ' (this season is too young to judge defences yet)' : ''}. Matchup rank: 1 gives up the most PPR points. `}
                <Link to={NFL_HEAT_MAP_PATH} className="underline">Every team&rsquo;s run on the Fixture Heat Map</Link>.
              </p>
            </section>
          )}

          {data.weeks.length > 0 && (
            <section aria-labelledby="log-heading">
              <h2 id="log-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">{`${data.weeksSeason} game log`}</h2>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
                  <thead className="bg-chalk-200 text-ink-500">
                    <tr>
                      <th scope="col" className="text-left font-medium text-xs px-2 py-2">Week</th>
                      <th scope="col" className="text-left font-medium text-xs px-2 py-2">Opp</th>
                      <th scope="col" className="text-left font-medium text-xs px-2 py-2 hidden sm:table-cell">Result</th>
                      <th scope="col" className="text-left font-medium text-xs px-2 py-2">Stats</th>
                      <th scope="col" className="text-right font-medium text-xs px-2 py-2">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.weeks.map((w, i) => {
                      const res = w.team_score == null ? '' : `${w.team_score > w.opponent_score! ? 'W' : w.team_score < w.opponent_score! ? 'L' : 'T'} ${w.team_score}-${w.opponent_score}`;
                      return (
                        <tr key={w.game_id} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                          <td className="px-2 py-1.5 text-xs">{w.season_type === 'POST' ? 'Play-off' : w.week}</td>
                          <td className="px-2 py-1.5 text-xs">
                            <Link to={nflTeamPath(w.opponent_slug)} className="hover:underline">{`${w.at_home ? 'v' : '@'} ${w.opponent_short}`}</Link>
                          </td>
                          <td className="px-2 py-1.5 text-xs font-mono hidden sm:table-cell">{res}</td>
                          <td className="px-2 py-1.5 text-xs text-ink-700">{statLine(w, pos)}</td>
                          <td className={`${num} font-semibold`}>{fmt1(pts(w, fmt))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {data.seasons.length > 0 && (
            <section aria-labelledby="career-heading">
              <h2 id="career-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">Every season</h2>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
                  <thead className="bg-chalk-200 text-ink-500">
                    <tr>
                      <th scope="col" className="text-left font-medium text-xs px-2 py-2">Season</th>
                      <th scope="col" className="text-left font-medium text-xs px-2 py-2">Team</th>
                      <th scope="col" className="text-right font-medium text-xs px-2 py-2">GP</th>
                      <th scope="col" className="text-right font-medium text-xs px-2 py-2 hidden sm:table-cell">{pos === 'QB' ? 'Pass yds' : pos === 'K' ? 'FG' : 'Scrim yds'}</th>
                      <th scope="col" className="text-right font-medium text-xs px-2 py-2 hidden sm:table-cell">{pos === 'K' ? 'FG att' : 'TD'}</th>
                      <th scope="col" className="text-right font-medium text-xs px-2 py-2">Pts</th>
                      <th scope="col" className="text-right font-medium text-xs px-2 py-2">Per game</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.seasons.map((s, i) => (
                      <tr key={s.season} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                        <th scope="row" className="text-left px-2 py-1.5 font-normal">{s.season}</th>
                        <td className="px-2 py-1.5 text-xs">
                          <Link to={nflTeamPath(s.team_slug)} className="hover:underline">{s.team_short}</Link>
                        </td>
                        <td className={num}>{s.games}</td>
                        <td className={`${num} hidden sm:table-cell`}>{pos === 'QB' ? s.passing_yards : pos === 'K' ? s.fg_made : Number(s.rushing_yards) + Number(s.receiving_yards)}</td>
                        <td className={`${num} hidden sm:table-cell`}>{pos === 'K' ? s.fg_att : Number(s.passing_tds) + Number(s.rushing_tds) + Number(s.receiving_tds)}</td>
                        <td className={num}>{fmt1(pts(s, fmt))}</td>
                        <td className={`${num} font-semibold`}>{fmt1(ppg(s, fmt))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-ink-500 mt-2">
                Regular season, since 2016. <Link to={NFL_SCORING_PATH} className="underline">How points are scored</Link>. Data: nflverse.
              </p>
            </section>
          )}
        </>
      )}
    </article>
  );
}
