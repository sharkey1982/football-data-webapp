// ============================================================================
// src/pages/nfl/NflMatchProjectionsPage.tsx
//
// /nfl/match-projections          this week's games as fantasy match-ups
// /nfl/match-projections/:gameId  one game: the two teams' fantasy inputs side
//                                 by side, then their key players side by side.
// Same name and menu place as FPL's Match Projections (after Player
// Projections). Client-rendered (head tags at build).
// ============================================================================

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { NFL_HUB_PATH, NFL_MATCH_PROJECTIONS_PATH, NFL_PROJECTIONS_PATH, nflGamePath, nflMatchProjectionPath, nflPlayerPath, nflTeamPath, ukKickoff, type NflTeamSeason } from '../../lib/nflApi';
import { FORMATS, fmt1, type ScoringFormat } from '../../lib/nflFantasyApi';
import { isUnlikely, projOf, rangeOf, type NflProjection } from '../../lib/nflProjections';
import {
  SKILL,
  actualLine,
  impliedPoints,
  isPlayed,
  statLines,
  lineup,
  loadMatchup,
  loadMatchupIndex,
  reliance,
  relianceSentence,
  share,
  type MatchupData,
  type PlayerActual,
  type PositionAllowed,
  type PositionSplit,
  type TeamProfile,
} from '../../lib/nflMatchup';
import NotFoundPage from '../NotFoundPage';

const POS_COLOUR: Record<string, string> = { QB: 'bg-ink-500', RB: 'bg-pitch-800', WR: 'bg-amber-400', TE: 'bg-cup-600' };
const pct = (x: number) => `${Math.round(x * 100)}%`;
const per = (x: number | undefined, g: number | undefined) => (x == null || !g ? null : Number(x) / g);
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

function Breadcrumb() {
  return (
    <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
      <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot; <Link to="/nfl/predict" className="hover:underline">Predict</Link>
    </p>
  );
}

// ---- One bar: share of a split by position -----------------------------------------------

function SplitBar({ split, label, testId }: { split: PositionSplit; label: string; testId?: string }) {
  const tot = SKILL.reduce((s, k) => s + split[k], 0);
  return (
    <div data-testid={testId}>
      <div className="flex justify-between text-[11px] text-ink-500"><span>{label}</span><span className="font-mono">{tot}</span></div>
      <div className="flex h-4 w-full rounded overflow-hidden bg-chalk-200" role="img" aria-label={`${label}: ${SKILL.map((k) => `${k} ${pct(share(split, k))}`).join(', ')}`}>
        {tot > 0 && SKILL.map((k) => (split[k] > 0 ? <div key={k} className={`${POS_COLOUR[k]} h-full`} style={{ width: `${(split[k] / tot) * 100}%` }} title={`${k}: ${split[k]} (${pct(share(split, k))})`} /> : null))}
      </div>
      <div className="flex gap-2 text-[11px] font-mono text-ink-700 mt-0.5">
        {SKILL.map((k) => <span key={k}>{`${k} ${pct(share(split, k))}`}</span>)}
      </div>
    </div>
  );
}

// ---- KPI comparison: away | metric | home ---------------------------------------------------

type Kpi = { label: string; title: string; away: string; home: string; better?: 'away' | 'home' | null };

function kpis(d: MatchupData): Kpi[] {
  const imp = impliedPoints(d.game);
  const a = d.away.stats;
  const h = d.home.stats;
  const cmp = (x: number | null, y: number | null, higher = true): 'away' | 'home' | null =>
    x == null || y == null || Math.abs(x - y) < 1e-9 ? null : (x > y) === higher ? 'away' : 'home';
  const f1 = (x: number | null) => (x == null ? '–' : x.toFixed(1));
  const rate = (s: NflTeamSeason | null) => (s && s.plays ? (Number(s.attempts) + Number(s.sacks_suffered)) / s.plays : null);
  const allowedTo = (list: PositionAllowed[], pos: string) => list.find((x) => x.position === pos);
  const out: Kpi[] = [
    { label: 'Expected points', title: 'What the betting line expects each team to score in this game (total / 2 ± spread / 2)', away: imp ? imp.away.toFixed(1) : '–', home: imp ? imp.home.toFixed(1) : '–', better: imp ? cmp(imp.away, imp.home) : null },
    { label: 'Points per game', title: 'Points scored per game this season', away: f1(per(a?.points_for, a?.games)), home: f1(per(h?.points_for, h?.games)), better: cmp(per(a?.points_for, a?.games), per(h?.points_for, h?.games)) },
    { label: 'Plays per game', title: 'Offensive plays per game: more plays, more fantasy chances', away: f1(per(a?.plays, a?.games)), home: f1(per(h?.plays, h?.games)), better: cmp(per(a?.plays, a?.games), per(h?.plays, h?.games)) },
    { label: 'Pass rate', title: 'Share of plays that are dropbacks', away: rate(a) == null ? '–' : pct(rate(a)!), home: rate(h) == null ? '–' : pct(rate(h)!), better: null },
    { label: 'Style', title: 'Run-led: 40%+ of skill-position yards and TDs from running backs. Receiver-led: 68%+ from wide receivers and tight ends.', away: reliance(d.away.profile).label, home: reliance(d.home.profile).label, better: null },
    { label: 'DST points per game', title: 'Team defence / special teams fantasy points per game (standard scoring)', away: f1(per(a?.dst_points, a?.games)), home: f1(per(h?.dst_points, h?.games)), better: cmp(per(a?.dst_points, a?.games), per(h?.dst_points, h?.games)) },
  ];
  // The matchup: what each side's opponents' defence gives up to each position.
  for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    const vsAway = allowedTo(d.home.allowed, pos); // home defence v away players
    const vsHome = allowedTo(d.away.allowed, pos);
    out.push({
      label: `Opp. defence v ${pos}s`,
      title: `PPR points per game the opponent's defence gives up to ${pos}s, and its rank (1st = gives up the most: the easiest match-up)`,
      away: vsAway ? `${vsAway.ppr_per_game.toFixed(1)} (${ordinal(vsAway.ppr_rank)})` : '–',
      home: vsHome ? `${vsHome.ppr_per_game.toFixed(1)} (${ordinal(vsHome.ppr_rank)})` : '–',
      better: vsAway && vsHome ? cmp(vsAway.ppr_per_game, vsHome.ppr_per_game) : null,
    });
  }
  return out;
}

function KpiStrip({ d }: { d: MatchupData }) {
  const rows = kpis(d);
  const cell = 'px-3 py-1.5 font-mono text-sm tabular-nums';
  return (
    <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden" data-testid="nfl-matchup-kpis">
      <thead className="bg-pitch-900 text-chalk-100">
        <tr>
          <th scope="col" className="px-3 py-2 text-left font-display uppercase tracking-wide text-xs w-1/3">{d.game.away_name}</th>
          <th scope="col" className="px-3 py-2 text-center font-normal text-xs text-chalk-300">Team inputs</th>
          <th scope="col" className="px-3 py-2 text-right font-display uppercase tracking-wide text-xs w-1/3">{d.game.home_name}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((k, i) => (
          <tr key={k.label} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
            <td className={`${cell} text-left ${k.better === 'away' ? 'font-semibold text-pitch-800' : ''}`}>{k.away}</td>
            <th scope="row" title={k.title} className="px-3 py-1.5 text-center text-xs font-normal text-ink-500">{k.label}</th>
            <td className={`${cell} text-right ${k.better === 'home' ? 'font-semibold text-pitch-800' : ''}`}>{k.home}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProfileCard({ name, slug, p }: { name: string; slug: string; p: TeamProfile }) {
  return (
    <div className="border border-chalk-300 rounded-lg p-3 space-y-3 bg-white" data-testid="nfl-matchup-profile">
      <h3 className="font-display uppercase tracking-wide text-sm text-ink-900">
        <Link to={nflTeamPath(slug)} className="hover:underline">{name}</Link>
        <span className="ml-2 text-xs normal-case tracking-normal font-sans text-ink-500">{reliance(p).label}</span>
      </h3>
      <SplitBar split={p.yards} label="Yards (rushing + receiving)" testId="nfl-split-yards" />
      <SplitBar split={p.tds} label="Touchdowns (rushing + receiving)" testId="nfl-split-tds" />
      <SplitBar split={p.targets} label="Targets" />
      <p className="text-xs text-ink-700">{relianceSentence(p, name)}</p>
    </div>
  );
}

// ---- Line-ups side by side ------------------------------------------------------------------

const actualPts = (a: PlayerActual, f: ScoringFormat) => Number(f === 'ppr' ? a.pts_ppr : f === 'half' ? a.pts_half : a.pts_std);

function PlayerCell({ r, fmt, align, played, actual }: { r: NflProjection | null; fmt: ScoringFormat; align: 'left' | 'right'; played: boolean; actual: PlayerActual | null }) {
  if (!r) return <td className={`px-2 py-1.5 text-xs text-ink-500 ${align === 'right' ? 'text-right' : ''}`} colSpan={2}>–</td>;
  const [lo, hi] = rangeOf(r, fmt);
  const name = (
    <span className={isUnlikely(r) ? 'text-ink-500 line-through' : ''}>
      <Link to={nflPlayerPath(r.player_slug)} className="hover:underline">{r.player_name}</Link>
      {r.injury_status && <span className="ml-1 text-[10px] uppercase text-loss-700" title={r.injury ?? ''}>{r.injury_status === 'Questionable' ? 'Q' : r.injury_status}</span>}
      {played && <span className="block text-[10px] text-ink-500" data-testid="nfl-actual-line">{actual ? actualLine(actual) : 'did not play'}</span>}
    </span>
  );
  const pts = played ? (
    <span className="font-mono text-xs tabular-nums" data-testid="nfl-actual-pts">
      <span className="font-semibold text-sm">{actual ? fmt1(actualPts(actual, fmt)) : '0.0'}</span>
      <span className="block text-[10px] text-ink-500">{`proj ${fmt1(projOf(r, fmt))}${r.method === 'season_avg' ? '*' : ''}`}</span>
    </span>
  ) : (
    <span className="font-mono text-xs tabular-nums">
      <span className="font-semibold text-sm">{fmt1(projOf(r, fmt))}</span>
      {r.method === 'season_avg' && <span className="text-ink-500" title="Season average (the projector did not clearly beat it for this position)">*</span>}
      <span className="block text-[10px] text-ink-500">{`${fmt1(lo)}–${fmt1(hi)}`}</span>
    </span>
  );
  return align === 'left' ? (
    <>
      <td className="px-2 py-1.5 text-left">{name}</td>
      <td className="px-2 py-1.5 text-right">{pts}</td>
    </>
  ) : (
    <>
      <td className="px-2 py-1.5 text-left">{pts}</td>
      <td className="px-2 py-1.5 text-right">{name}</td>
    </>
  );
}

function Lineups({ d, fmt }: { d: MatchupData; fmt: ScoringFormat }) {
  const away = lineup(d.projections, d.game.away_slug);
  const home = lineup(d.projections, d.game.home_slug);
  const played = isPlayed(d.game);
  const act = new Map(d.playerActuals.map((a) => [a.player_id, a]));
  const actOf = (p: NflProjection | null) => (p ? (act.get(p.player_id) ?? null) : null);
  const actualSum = (l: typeof away) => l.reduce((s, x) => s + (x.player && act.get(x.player.player_id) ? actualPts(act.get(x.player.player_id)!, fmt) : 0), 0);
  const missing = [!d.projections.some((p) => p.team_slug === d.game.away_slug) && d.game.away_name, !d.projections.some((p) => p.team_slug === d.game.home_slug) && d.game.home_name].filter(Boolean);
  const sum = (l: typeof away) => l.reduce((s, x) => s + (x.player && x.player.injury_status !== 'Out' ? projOf(x.player, fmt) : 0), 0);
  return (
    <>
    {missing.length > 0 && (
      <p className="text-sm text-ink-700" data-testid="nfl-matchup-missing">{`${missing.join(' and ')} ${missing.length > 1 ? 'play' : 'plays'} an earlier game first; this game\u2019s projections appear the morning after it.`}</p>
    )}
    <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden" data-testid="nfl-matchup-lineups">
      <thead className="bg-chalk-200 text-ink-500 text-xs">
        <tr>
          <th scope="col" className="px-2 py-2 text-left font-medium">{d.game.away_short}</th>
          <th scope="col" className="px-2 py-2 text-right font-medium">{played ? 'Actual' : 'Proj'}</th>
          <th scope="col" className="px-2 py-2 text-center font-medium w-12"> </th>
          <th scope="col" className="px-2 py-2 text-left font-medium">{played ? 'Actual' : 'Proj'}</th>
          <th scope="col" className="px-2 py-2 text-right font-medium">{d.game.home_short}</th>
        </tr>
      </thead>
      <tbody>
        {away.map((a, i) => (
          <tr key={a.slot} className={i % 2 ? 'bg-chalk-100/60' : undefined} data-testid="nfl-matchup-slot">
            <PlayerCell r={a.player} fmt={fmt} align="left" played={played} actual={actOf(a.player)} />
            <th scope="row" className="px-2 py-1.5 text-center font-mono text-[11px] text-ink-500 font-normal">{a.slot}</th>
            <PlayerCell r={home[i].player} fmt={fmt} align="right" played={played} actual={actOf(home[i].player)} />
          </tr>
        ))}
        <tr className="border-t-2 border-ink-500 font-semibold" data-testid="nfl-matchup-totals">
          <td className="px-2 py-1.5 text-left text-xs">Line-up total</td>
          <td className="px-2 py-1.5 text-right font-mono">
            {played ? fmt1(actualSum(away)) : fmt1(sum(away))}
            {played && <span className="block text-[10px] font-normal text-ink-500">{`proj ${fmt1(sum(away))}`}</span>}
          </td>
          <td />
          <td className="px-2 py-1.5 text-left font-mono">
            {played ? fmt1(actualSum(home)) : fmt1(sum(home))}
            {played && <span className="block text-[10px] font-normal text-ink-500">{`proj ${fmt1(sum(home))}`}</span>}
          </td>
          <td className="px-2 py-1.5 text-right text-xs">Line-up total</td>
        </tr>
      </tbody>
    </table>
    </>
  );
}

function StatLines({ d }: { d: MatchupData }) {
  const g = d.game;
  const played = isPlayed(g);
  const a = statLines(d.teamGames, g.away_franchise, g.home_franchise, g);
  const h = statLines(d.teamGames, g.home_franchise, g.away_franchise, g);
  if (!a.games && !h.games && !played) return null;
  const f = (x: number | null, digits: number) => (x == null ? '\u2013' : x.toFixed(digits));
  const sub = 'px-2 py-1 text-[10px] font-normal text-ink-500';
  const num = 'px-2 py-1.5 font-mono text-xs tabular-nums';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden" data-testid="nfl-matchup-statlines">
        <thead className="bg-chalk-200 text-ink-500 text-xs">
          <tr>
            <th scope="colgroup" colSpan={played ? 3 : 2} className="px-2 pt-2 text-left font-medium">{g.away_short}</th>
            <th scope="col" rowSpan={2} className="px-2 py-2 text-center font-medium">Per game</th>
            <th scope="colgroup" colSpan={played ? 3 : 2} className="px-2 pt-2 text-right font-medium">{g.home_short}</th>
          </tr>
          <tr>
            {played && <th scope="col" className={`${sub} text-left`}>This game</th>}
            <th scope="col" className={`${sub} text-left`} title="The team's average per game this season, before this game">Avg</th>
            <th scope="col" className={`${sub} text-left`} title="What the opponent's defence allowed per game this season, before this game">Opp allows</th>
            <th scope="col" className={`${sub} text-right`} title="What the opponent's defence allowed per game this season, before this game">Opp allows</th>
            <th scope="col" className={`${sub} text-right`} title="The team's average per game this season, before this game">Avg</th>
            {played && <th scope="col" className={`${sub} text-right`}>This game</th>}
          </tr>
        </thead>
        <tbody>
          {a.lines.map((x, i) => {
            const y = h.lines[i];
            return (
              <tr key={x.key} className={i % 2 ? 'bg-chalk-100/60' : undefined} data-testid="nfl-statline">
                {played && <td className={`${num} text-left font-semibold`}>{f(x.actual, 0)}</td>}
                <td className={`${num} text-left`}>{f(x.avg, x.digits)}</td>
                <td className={`${num} text-left text-ink-500`}>{f(x.oppAllows, x.digits)}</td>
                <th scope="row" className="px-2 py-1.5 text-center text-xs font-normal text-ink-700">{x.label}</th>
                <td className={`${num} text-right text-ink-500`}>{f(y.oppAllows, y.digits)}</td>
                <td className={`${num} text-right`}>{f(y.avg, y.digits)}</td>
                {played && <td className={`${num} text-right font-semibold`}>{f(y.actual, 0)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-ink-500 mt-1 max-w-prose">
        {`Avg: the team\u2019s own average per game before this game (${a.games} and ${h.games} games). Opp allows: what the other side\u2019s defence gave up per game before it. For giveaways, Opp allows is the takeaways that defence forces. These are records, not forecasts: the projections below are for fantasy points.`}
      </p>
    </div>
  );
}

function GameView({ gameId }: { gameId: string }) {
  const [fmt, setFmt] = useState<ScoringFormat>('ppr');
  const { data, failed, loading } = useKeyedFetch(`matchup:${gameId}`, () => loadMatchup(gameId));
  const title = data ? `${data.game.away_name} at ${data.game.home_name}: fantasy match-up` : 'NFL fantasy match-up';
  useDocumentHead({
    title,
    description: data ? `Fantasy match-up for ${data.game.away_name} at ${data.game.home_name}: expected points, volume, where each team's yards and touchdowns come from, and the key players' projections side by side.` : 'NFL fantasy match-up.',
    path: nflMatchProjectionPath(gameId),
  });
  if (loading) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (failed) return <p className="text-ink-700">This match-up is unavailable right now.</p>;
  if (!data) return <NotFoundPage />;
  const g = data.game;
  return (
    <article className="space-y-6">
      <header>
        <Breadcrumb />
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">{`${g.away_name} ${g.neutral_site ? 'v' : 'at'} ${g.home_name}`}</h1>
        <p className="text-ink-700 mt-1 text-sm">
          {isPlayed(g) && <strong className="text-ink-900" data-testid="nfl-matchup-final">{`Final: ${g.away_short} ${g.away_score}\u2013${g.home_score} ${g.home_short} \u00b7 `}</strong>}
          {`Week ${g.week} · ${ukKickoff(g)} (UK)`} &middot; <Link to={nflGamePath(g.game_id)} className="text-pitch-800 underline underline-offset-2">Game preview</Link> &middot;{' '}
          <Link to={NFL_MATCH_PROJECTIONS_PATH} className="text-pitch-800 underline underline-offset-2">All this week&rsquo;s match-ups</Link>
        </p>
      </header>

      <section aria-labelledby="mu-inputs" className="space-y-3">
        <h2 id="mu-inputs" className="font-display uppercase tracking-wide text-lg text-ink-900">The match-up</h2>
        <KpiStrip d={data} />
        <StatLines d={data} />
        <div className="grid sm:grid-cols-2 gap-3">
          <ProfileCard name={g.away_name} slug={g.away_slug} p={data.away.profile} />
          <ProfileCard name={g.home_name} slug={g.home_slug} p={data.home.profile} />
        </div>
        <p className="text-xs text-ink-500 flex flex-wrap gap-3 items-center">
          {SKILL.map((k) => <span key={k} className="inline-flex items-center gap-1"><span className={`inline-block w-3 h-3 rounded-sm ${POS_COLOUR[k]}`} />{k}</span>)}
          <span>{`${data.season} regular season${data.home.profile.games ? `, ${data.home.profile.games} and ${data.away.profile.games} games` : ''}. Yards and touchdowns credit the player who gained them: a QB’s own runs count as QB, his passes count for the receiver.`}</span>
        </p>
      </section>

      <section aria-labelledby="mu-players" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="mu-players" className="font-display uppercase tracking-wide text-lg text-ink-900">Key players</h2>
          <div role="group" aria-label="Scoring" className="inline-flex border border-chalk-300 rounded overflow-hidden text-sm">
            {FORMATS.map((f) => (
              <button key={f.key} type="button" aria-pressed={fmt === f.key} onClick={() => setFmt(f.key)} className={`px-2.5 py-1 ${fmt === f.key ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {data.projections.length ? (
          <Lineups d={data} fmt={fmt} />
        ) : (
          <p className="text-sm text-ink-700">Player projections appear once the game is in the next eight days and has a betting line.</p>
        )}
        <p className="text-xs text-ink-500 max-w-prose">
          The highest-projected players at each slot, assuming they play; anyone ruled out is struck through and left out of the total. Range: 6 in 10 games land inside it. * RB and K show the season average.{' '}
          <Link to={`${NFL_PROJECTIONS_PATH}?team=${g.home_slug}`} className="text-pitch-800 underline underline-offset-2">Every {g.home_short} player</Link> &middot;{' '}
          <Link to={`${NFL_PROJECTIONS_PATH}?team=${g.away_slug}`} className="text-pitch-800 underline underline-offset-2">every {g.away_short} player</Link>.
        </p>
      </section>
    </article>
  );
}

function IndexView() {
  const { data, failed, loading } = useKeyedFetch('matchup-index', loadMatchupIndex);
  useDocumentHead({
    title: 'NFL Match Projections: this week’s fantasy match-ups',
    description: 'Every NFL game this week as a fantasy match-up: expected points, each team’s projected fantasy line-up, and whether it scores through its running backs or its receivers.',
    path: NFL_MATCH_PROJECTIONS_PATH,
  });
  return (
    <article className="space-y-6">
      <header>
        <Breadcrumb />
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Match Projections</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Each game this week as a fantasy match-up: the points the betting market expects, each team&rsquo;s key players side by side, and whether a team gains its yards and touchdowns through its running backs or its receivers.
        </p>
      </header>
      {failed && <p className="text-ink-700">Match-ups are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && data.length === 0 && <p className="text-ink-700">No match-ups yet: they appear once the next week&rsquo;s games have betting lines.</p>}
      {data && data.length > 0 && (
        <ul className="grid sm:grid-cols-2 gap-3" data-testid="nfl-matchup-index">
          {data.map(({ game: g, home, away }) => {
            const imp = impliedPoints(g);
            return (
              <li key={g.game_id}>
                <Link to={nflMatchProjectionPath(g.game_id)} className="block border border-chalk-300 rounded-lg p-3 bg-white hover:border-pitch-700" data-testid="nfl-matchup-card">
                  <p className="text-xs text-ink-500">{isPlayed(g) ? `Week ${g.week} · Final: ${g.away_score}\u2013${g.home_score}` : `Week ${g.week} · ${ukKickoff(g)}`}</p>
                  <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-baseline mt-1 text-sm">
                    <span>{g.away_name}</span>
                    <span className="font-mono text-xs text-ink-500" title="Expected points (betting line)">{imp ? imp.away.toFixed(1) : ''}</span>
                    <span className="font-mono font-semibold" title={away == null ? 'Projected after their earlier game' : 'Projected fantasy points, key line-up (PPR)'}>{away == null ? '–' : fmt1(away)}</span>
                    <span>{`${g.neutral_site ? 'v' : 'at'} ${g.home_name}`}</span>
                    <span className="font-mono text-xs text-ink-500">{imp ? imp.home.toFixed(1) : ''}</span>
                    <span className="font-mono font-semibold" title={home == null ? 'Projected after their earlier game' : undefined}>{home == null ? '–' : fmt1(home)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {data && data.length > 0 && <p className="text-xs text-ink-500">Small figures: points the betting line expects each team to score. Bold: projected fantasy points (PPR) for each team&rsquo;s key line-up (QB, two RBs, three WRs, TE, K). A dash: the team plays an earlier game first, and this one is projected after it.</p>}
    </article>
  );
}

export default function NflMatchProjectionsPage() {
  const { gameId } = useParams<{ gameId?: string }>();
  return gameId ? <GameView gameId={gameId} /> : <IndexView />;
}
