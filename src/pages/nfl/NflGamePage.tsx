// ============================================================================
// src/pages/nfl/NflGamePage.tsx
//
// /nfl/games/:gameId -- one NFL game: where to watch it in the UK, the
// result, what the model predicted beforehand next to the betting market,
// each side's form and season so far, and the head-to-head since 2002.
//
// Laid out as Football's match page (/football/matches/:slug: header, where
// to watch, result, prediction table) with the Head to Heads preview's
// overview below it (form card, head-to-head record, last meetings), using
// the same shared components -- see src/lib/layoutPairs.ts.
// ============================================================================

import { Link, useParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import WatchOptions from '../../components/WatchOptions';
import { ComparisonCard, type FormEntry } from '../../components/ComparisonCard';
import { getActivePartners } from '../../lib/commercialLinks';
import {
  NFL_HUB_PATH,
  NFL_TV_PATH,
  favourLabel,
  lineLabel,
  nflFixturesPath,
  nflGamePath,
  nflTeamPath,
  ukKickoff,
  weekLabel,
  type NflGame,
} from '../../lib/nflApi';
import {
  formDetail,
  formOf,
  gameSentence,
  headToHead,
  headToHeadSentence,
  isPlayed,
  loadNflGame,
  marginLabel,
  recordText,
  seasonSoFar,
  type NflFormEntry,
  type NflGamePreview,
  type NflSeasonSoFar,
} from '../../lib/nflGame';
import { gameNumber, nflWatch } from '../../lib/nflWatch';
import { againstSpread } from '../../lib/nflStory';
import NotFoundPage from '../NotFoundPage';

const card = 'border border-chalk-300 rounded-lg bg-white p-4';
const cardHeading = 'font-display uppercase text-sm tracking-wide text-ink-500 mb-3';
const sectionHeading = 'font-display uppercase tracking-wide text-lg text-ink-900';
const num = 'px-3 py-1.5 text-right font-mono text-xs tabular-nums';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

function toFormEntries(entries: NflFormEntry[]): FormEntry[] {
  // ComparisonCard reads oldest to newest, left to right.
  return [...entries].reverse().map((e) => ({ result: e.letter === 'T' ? 'D' : e.letter, label: e.letter, detail: formDetail(e) }));
}

function atsText(a: { cover: number; miss: number; push: number }): string {
  const n = a.cover + a.miss + a.push;
  if (n === 0) return '–';
  return `${a.cover}-${a.miss}${a.push ? `-${a.push}` : ''}`;
}

function scoreLine(g: NflGame): string {
  return `${g.away_name} ${g.away_score}–${g.home_score} ${g.home_name}${g.overtime ? ' (OT)' : ''}`;
}

function SeasonSoFar({ game, home, away }: { game: NflGame; home: NflSeasonSoFar; away: NflSeasonSoFar }) {
  if (home.played === 0 && away.played === 0) return null;
  const perGame = (n: number, s: NflSeasonSoFar) => (s.played ? (n / s.played).toFixed(1) : '–');
  const rows: [string, string, string][] = [
    ['Record', recordText(home), recordText(away)],
    ['Points per game', perGame(home.pointsFor, home), perGame(away.pointsFor, away)],
    ['Points allowed per game', perGame(home.pointsAgainst, home), perGame(away.pointsAgainst, away)],
    ['Points difference', `${home.pointsFor - home.pointsAgainst >= 0 ? '+' : ''}${home.pointsFor - home.pointsAgainst}`, `${away.pointsFor - away.pointsAgainst >= 0 ? '+' : ''}${away.pointsFor - away.pointsAgainst}`],
    ['Against the spread (W-L-P)', atsText(home.ats), atsText(away.ats)],
  ];
  return (
    <div className={card} data-testid="nfl-season-so-far">
      <h2 className={cardHeading}>{`${game.season} season ${isPlayed(game) ? 'before this game' : 'so far'}`}</h2>
      <table className="w-full max-w-lg text-sm">
        <thead className="text-ink-500">
          <tr>
            <th scope="col" className="text-left font-medium text-xs py-1" />
            <th scope="col" className="text-right font-medium text-xs px-3 py-1">{game.home_short}</th>
            <th scope="col" className="text-right font-medium text-xs px-3 py-1">{game.away_short}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, h, a]) => (
            <tr key={label}>
              <th scope="row" className="text-left font-normal text-xs text-ink-500 py-1">{label}</th>
              <td className={num}>{h}</td>
              <td className={num}>{a}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeadToHeadRecord({ p }: { p: NflGamePreview }) {
  const { game } = p;
  const h = headToHead(p);
  const venue = (g: NflGame) => `${g.season} ${weekLabel(g.game_type, g.week)}`;
  return (
    <>
      <div className={card} data-testid="nfl-h2h-record">
        <h2 className={cardHeading}>Head-to-head record</h2>
        <p className="text-sm text-ink-700 max-w-prose">{headToHeadSentence(p, h)}</p>
        {h.played > 0 && (
          <>
            <table className="text-sm mt-3">
              <thead className="text-ink-500">
                <tr>
                  <th scope="col" className="text-left font-medium text-xs pr-3 py-1" />
                  <th scope="col" className="text-right font-medium text-xs px-2 py-1">P</th>
                  <th scope="col" className="text-right font-medium text-xs px-2 py-1">{game.home_short}</th>
                  <th scope="col" className="text-right font-medium text-xs px-2 py-1">T</th>
                  <th scope="col" className="text-right font-medium text-xs px-2 py-1">{game.away_short}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['All meetings', h.played, h.homeWins, h.ties, h.awayWins] as const,
                  [`At ${game.home_name}`, h.atHome.played, h.atHome.homeWins, h.atHome.ties, h.atHome.awayWins] as const,
                ].map(([label, n, hw, t, aw]) =>
                  n === 0 ? null : (
                    <tr key={label}>
                      <th scope="row" className="text-left font-normal text-xs text-ink-500 pr-3 py-1">{label}</th>
                      <td className="text-right font-mono text-xs tabular-nums px-2">{n}</td>
                      <td className="text-right font-mono text-xs tabular-nums px-2">{hw}</td>
                      <td className="text-right font-mono text-xs tabular-nums px-2">{t}</td>
                      <td className="text-right font-mono text-xs tabular-nums px-2">{aw}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mt-3">
              {h.biggestHomeWin && (
                <div>
                  <dt className="text-xs text-ink-500">{`Biggest ${game.home_name} win`}</dt>
                  <dd>{`${scoreLine(h.biggestHomeWin)} (${venue(h.biggestHomeWin)})`}</dd>
                </div>
              )}
              {h.biggestAwayWin && (
                <div>
                  <dt className="text-xs text-ink-500">{`Biggest ${game.away_name} win`}</dt>
                  <dd>{`${scoreLine(h.biggestAwayWin)} (${venue(h.biggestAwayWin)})`}</dd>
                </div>
              )}
              {h.avgTotal != null && (
                <div>
                  <dt className="text-xs text-ink-500">Average points per meeting</dt>
                  <dd className="font-mono tabular-nums">{h.avgTotal.toFixed(1)}</dd>
                </div>
              )}
              {h.homeAts.cover + h.homeAts.miss + h.homeAts.push > 0 && (
                <div>
                  <dt className="text-xs text-ink-500">{`${game.home_name} against the spread (W-L-P)`}</dt>
                  <dd className="font-mono tabular-nums">{atsText(h.homeAts)}</dd>
                </div>
              )}
            </dl>
          </>
        )}
      </div>

      <div className={card} data-testid="nfl-h2h-meetings">
        <h2 className={cardHeading}>{p.meetings.length ? `Head-to-head (last ${Math.min(10, p.meetings.length)})` : 'Head-to-head'}</h2>
        {p.meetings.length === 0 ? (
          <p className="text-sm text-ink-500">These two haven&rsquo;t met since 2002.</p>
        ) : (
          <ul className="divide-y divide-chalk-200 text-sm">
            {p.meetings.slice(0, 10).map((g) => {
              const ats = againstSpread(g, game.home_franchise);
              return (
                <li key={g.game_id} className="py-1.5 flex flex-wrap gap-x-3 justify-between">
                  <Link to={nflGamePath(g.game_id)} className="hover:underline">{scoreLine(g)}</Link>
                  <span className="text-xs text-ink-500 font-mono">
                    {venue(g)}
                    {lineLabel(g) && ` · line ${lineLabel(g)}${ats ? ` (${game.home_short} ${ats === 'cover' ? 'covered' : ats === 'miss' ? 'did not cover' : 'push'})` : ''}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

export default function NflGamePage({ initialData }: { initialData?: NflGamePreview } = {}) {
  const { gameId = '' } = useParams<{ gameId: string }>();
  const { data: p, failed, loading } = useKeyedFetch(gameId, () => loadNflGame(gameId), initialData ? { key: initialData.game.game_id, data: initialData } : undefined);
  const { data: partners } = useKeyedFetch('streaming', () => getActivePartners('streaming').catch(() => []));

  const game = p?.game;
  const title = game ? `${game.away_name} ${game.neutral_site ? 'v' : 'at'} ${game.home_name}` : 'NFL game';
  useDocumentHead({
    title: game ? `${title}: preview, head-to-head and prediction` : title,
    description: p ? gameSentence(p) : 'NFL game preview: head-to-head, form, the model against the market and where to watch in the UK.',
    path: nflGamePath(gameId),
  });

  if (loading) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (failed) return <p className="text-loss-600 text-sm">Failed to load this game.</p>;
  if (!p || !game) return <NotFoundPage />;

  const played = isPlayed(game);
  const model = p.model;
  const watch = nflWatch(game);
  const line = lineLabel(game);
  const homeForm = formOf(p.homeRecent, game.home_franchise);
  const awayForm = formOf(p.awayRecent, game.away_franchise);
  const pHome = model ? Number(model.p_home) : null;
  const mHome = model?.market_p_home != null ? Number(model.market_p_home) : null;
  const ats = againstSpread(game, game.home_franchise);
  const fixturesLink = nflFixturesPath(game.season, game.game_type === 'REG' ? game.week : undefined);

  return (
    <article className="space-y-6">
      <header>
        <p className="text-xs text-ink-500">
          <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot;{' '}
          <Link to={fixturesLink} className="hover:underline">Fixtures &amp; Results</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">
          <Link to={nflTeamPath(game.away_slug)} className="hover:underline">{game.away_name}</Link> {game.neutral_site ? 'v' : 'at'}{' '}
          <Link to={nflTeamPath(game.home_slug)} className="hover:underline">{game.home_name}</Link>
        </h1>
        <p className="text-ink-700 mt-1">
          {`NFL ${game.season}`} &middot; {weekLabel(game.game_type, game.week)} &middot; <time dateTime={game.kickoff_at ?? game.gameday}>{`${ukKickoff(game)}${game.kickoff_at ? ' UK time' : ''}`}</time>
          {game.stadium && <> &middot; {game.stadium}</>}
          {game.div_game && <> &middot; division game</>}
        </p>
        {model && (
          <p className="text-xs text-ink-500 font-mono mt-2">
            Prediction made <time dateTime={model.predicted_at}>{formatTimestamp(model.predicted_at)}</time> &middot; Elo model
          </p>
        )}
      </header>

      {!played && (
        <section aria-label="Where to watch">
          <h2 className={sectionHeading}>Where to watch (UK)</h2>
          <div className="mt-1">
            <WatchOptions offers={watch.offers} partners={partners ?? []} fixtureId={gameNumber(game.game_id)} page="match_page" />
          </div>
          {watch.pickedWeekly && (
            <p className="text-xs text-ink-500 mt-2 max-w-prose">
              {watch.pickedWeekly}{' '}
              <Link to={NFL_TV_PATH} className="underline underline-offset-2">NFL TV Guide</Link>
            </p>
          )}
        </section>
      )}

      {played && (
        <section data-testid="nfl-game-result">
          <h2 className={sectionHeading}>Result</h2>
          <p className="text-ink-900 mt-1 text-lg">{scoreLine(game)}</p>
          {line && (
            <p className="text-sm text-ink-700 mt-1">
              {`Closing line ${line}${game.total_line != null ? `, total ${game.total_line} (${game.home_score! + game.away_score! > game.total_line ? 'went over' : game.home_score! + game.away_score! < game.total_line ? 'stayed under' : 'landed on it'})` : ''}. `}
              {ats === 'push' ? 'The spread was a push.' : ats ? `${ats === 'cover' ? game.home_name : game.away_name} covered.` : ''}
            </p>
          )}
        </section>
      )}

      <section data-testid="nfl-game-prediction">
        <h2 className={sectionHeading}>{played ? 'What the model predicted beforehand' : 'Prediction'}</h2>
        {model && pHome != null ? (
          <>
            <p className="text-ink-700 mt-1 max-w-prose">
              {`The model ${played ? 'gave' : 'gives'} ${game.home_name} a ${pct(pHome)} chance of winning and ${game.away_name} ${pct(1 - pHome)}, with a predicted margin of ${marginLabel(game, model.predicted_margin)}.`}
              {mHome != null && ` The betting market ${played ? 'had' : 'has'} it ${favourLabel(game, mHome)}.`}
              {played && ` ${(pHome >= 0.5) === (game.home_score! > game.away_score!) && game.home_score !== game.away_score ? 'The model’s favourite won.' : game.home_score === game.away_score ? 'The game was tied.' : 'The underdog won.'}`}
            </p>
            <div className="overflow-x-auto mt-2">
              <table className="w-full max-w-md text-sm border border-chalk-300 rounded-lg overflow-hidden">
                <thead className="bg-chalk-200 text-ink-500">
                  <tr>
                    <th scope="col" className="text-left font-medium text-xs px-3 py-2">Outcome</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">This model</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">Betting market</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row" className="text-left px-3 py-1.5 font-normal text-xs">{`${game.home_name} win`}</th>
                    <td className={num}>{pct(pHome)}</td>
                    <td className={num}>{mHome != null ? pct(mHome) : '–'}</td>
                  </tr>
                  <tr className="bg-chalk-100/60">
                    <th scope="row" className="text-left px-3 py-1.5 font-normal text-xs">{`${game.away_name} win`}</th>
                    <td className={num}>{pct(1 - pHome)}</td>
                    <td className={num}>{mHome != null ? pct(1 - mHome) : '–'}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="text-left px-3 py-1.5 font-normal text-xs">Margin</th>
                    <td className={num}>{marginLabel(game, model.predicted_margin)}</td>
                    <td className={num}>{line ?? '–'}</td>
                  </tr>
                  {game.total_line != null && (
                    <tr className="bg-chalk-100/60">
                      <th scope="row" className="text-left px-3 py-1.5 font-normal text-xs">Total points</th>
                      <td className={num}>–</td>
                      <td className={num}>{game.total_line}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-500 mt-2 max-w-prose">
              The model is a margin-based Elo rating walked forward over every game since 2002, with home advantage; ties are rare enough not to be priced. Betting
              market: the moneyline with the bookmaker&rsquo;s margin removed, and the spread as quoted (favourite first).
            </p>
          </>
        ) : (
          <p className="text-ink-500 text-sm mt-1">
            {played
              ? 'No model prediction was made before this game kicked off (predictions are only shown if they were made beforehand).'
              : 'The model’s prediction appears here about a week before kick-off.'}
            {line && ` The betting line is ${line}${game.total_line != null ? `, total ${game.total_line}` : ''}.`}
          </p>
        )}
      </section>

      <section className="space-y-4" aria-label="Form and head-to-head">
        <ComparisonCard
          homeTeamName={game.home_name}
          awayTeamName={game.away_name}
          homeForm={toFormEntries(homeForm)}
          awayForm={toFormEntries(awayForm)}
          homeWinPct={pHome != null ? pHome * 100 : undefined}
          drawPct={pHome != null ? 0 : undefined}
          awayWinPct={pHome != null ? (1 - pHome) * 100 : undefined}
        />
        <p className="text-xs text-ink-500 -mt-2">
          Form is each team&rsquo;s last 5 games before this one, home and away (the season is only 17 games), oldest to newest; play-offs included.
        </p>
        <SeasonSoFar game={game} home={seasonSoFar(p.homeRecent, game.home_franchise, game.season)} away={seasonSoFar(p.awayRecent, game.away_franchise, game.season)} />
        <HeadToHeadRecord p={p} />
      </section>

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to={fixturesLink} className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">{`${weekLabel(game.game_type, game.week)} fixtures & results`}</Link>
        <Link to={nflTeamPath(game.home_slug)} className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">{game.home_name}</Link>
        <Link to={nflTeamPath(game.away_slug)} className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">{game.away_name}</Link>
        <Link to={NFL_TV_PATH} className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">NFL TV Guide</Link>
      </nav>
    </article>
  );
}
