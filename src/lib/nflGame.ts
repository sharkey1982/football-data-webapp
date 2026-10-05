// ============================================================================
// src/lib/nflGame.ts
//
// One NFL game's preview (/nfl/games/:gameId), the NFL counterpart of the
// football match page and Head to Heads preview: head-to-head since 2002,
// each side's form and season so far going into the game, and the model
// against the betting market.
//
// Everything is "as it stood before kick-off": form and records only count
// games played before this one, and the model prediction is the one the
// public.nfl_game_model view keeps (made before kick-off, never hindsight).
// Pure builders here are shared by the browser loader and the static build.
// ============================================================================

import { supabase } from './supabase';
import { GAME_COLUMNS, MODEL_COLUMNS, lineLabel, weekLabel, ukKickoff, type NflGame, type NflGameModel } from './nflApi';
import { againstSpread } from './nflStory';

export type NflGamePreview = {
  game: NflGame;
  model: NflGameModel | null;
  /** Earlier meetings of the two franchises, most recent first. */
  meetings: NflGame[];
  /** Each side's games before this one, most recent first (up to 25). */
  homeRecent: NflGame[];
  awayRecent: NflGame[];
};

const RECENT = 25;

export const isPlayed = (g: NflGame) => g.home_score != null && g.away_score != null;

/** Games strictly before `game` (by date, then id) that have a result. */
function before(game: NflGame) {
  return (g: NflGame) => isPlayed(g) && g.game_id !== game.game_id && (g.gameday < game.gameday || (g.gameday === game.gameday && g.game_id < game.game_id));
}

const newestFirst = (a: NflGame, b: NflGame) => (a.gameday === b.gameday ? b.game_id.localeCompare(a.game_id) : b.gameday.localeCompare(a.gameday));

const involves = (g: NflGame, fr: string) => g.home_franchise === fr || g.away_franchise === fr;

/** Build a preview from a pool of games (the static build passes every game since 2002). */
export function buildGamePreview(game: NflGame, games: NflGame[], model: NflGameModel | null): NflGamePreview {
  const prior = games.filter(before(game)).sort(newestFirst);
  const h = game.home_franchise;
  const a = game.away_franchise;
  return {
    game,
    model,
    meetings: prior.filter((g) => involves(g, h) && involves(g, a)),
    homeRecent: prior.filter((g) => involves(g, h)).slice(0, RECENT),
    awayRecent: prior.filter((g) => involves(g, a)).slice(0, RECENT),
  };
}

// ---- Head to head --------------------------------------------------------------

export type NflHeadToHead = {
  played: number;
  /** From the home side of THIS game's point of view. */
  homeWins: number;
  awayWins: number;
  ties: number;
  /** Meetings with this game's home side at home. */
  atHome: { played: number; homeWins: number; awayWins: number; ties: number };
  avgTotal: number | null;
  /** Against the spread, from this game's home side (only meetings with a line). */
  homeAts: { cover: number; miss: number; push: number };
  biggestHomeWin: NflGame | null;
  biggestAwayWin: NflGame | null;
  /** Current run of wins by one side (ties end a run). */
  run: { franchise: string; name: string; length: number } | null;
  since: number | null;
};

function margin(g: NflGame, fr: string): number {
  const m = g.home_score! - g.away_score!;
  return g.home_franchise === fr ? m : -m;
}

export function headToHead(p: NflGamePreview): NflHeadToHead {
  const { game, meetings } = p;
  const h = game.home_franchise;
  const out: NflHeadToHead = {
    played: meetings.length,
    homeWins: 0,
    awayWins: 0,
    ties: 0,
    atHome: { played: 0, homeWins: 0, awayWins: 0, ties: 0 },
    avgTotal: null,
    homeAts: { cover: 0, miss: 0, push: 0 },
    biggestHomeWin: null,
    biggestAwayWin: null,
    run: null,
    since: meetings.length ? meetings[meetings.length - 1].season : null,
  };
  let total = 0;
  for (const g of meetings) {
    const m = margin(g, h);
    const atHome = g.home_franchise === h && !g.neutral_site;
    if (atHome) out.atHome.played++;
    if (m > 0) {
      out.homeWins++;
      if (atHome) out.atHome.homeWins++;
      if (!out.biggestHomeWin || m > margin(out.biggestHomeWin, h)) out.biggestHomeWin = g;
    } else if (m < 0) {
      out.awayWins++;
      if (atHome) out.atHome.awayWins++;
      if (!out.biggestAwayWin || m < margin(out.biggestAwayWin, h)) out.biggestAwayWin = g;
    } else {
      out.ties++;
      if (atHome) out.atHome.ties++;
    }
    total += g.home_score! + g.away_score!;
    const ats = againstSpread(g, h);
    if (ats) out.homeAts[ats]++;
  }
  if (meetings.length) out.avgTotal = total / meetings.length;
  // Current run: from the most recent meeting back.
  const first = meetings[0];
  if (first && margin(first, h) !== 0) {
    const homeSide = margin(first, h) > 0;
    let n = 0;
    for (const g of meetings) {
      const m = margin(g, h);
      if (m === 0 || m > 0 !== homeSide) break;
      n++;
    }
    out.run = homeSide ? { franchise: h, name: game.home_name, length: n } : { franchise: game.away_franchise, name: game.away_name, length: n };
  }
  return out;
}

export function headToHeadSentence(p: NflGamePreview, h2h: NflHeadToHead): string {
  const { game } = p;
  if (h2h.played === 0) return `${game.home_name} and ${game.away_name} have not met since 2002.`;
  const lead =
    h2h.homeWins === h2h.awayWins
      ? `The two are level at ${h2h.homeWins} wins each`
      : h2h.homeWins > h2h.awayWins
        ? `${game.home_name} lead ${h2h.homeWins}–${h2h.awayWins}`
        : `${game.away_name} lead ${h2h.awayWins}–${h2h.homeWins}`;
  const ties = h2h.ties ? ` with ${h2h.ties} tie${h2h.ties === 1 ? '' : 's'}` : '';
  const run = h2h.run && h2h.run.length >= 2 ? ` ${h2h.run.name} have won the last ${h2h.run.length}.` : '';
  return `${lead}${ties} in ${h2h.played} meeting${h2h.played === 1 ? '' : 's'} since ${h2h.since}.${run}`;
}

// ---- Form and season so far -------------------------------------------------------

export type NflFormEntry = { game: NflGame; letter: 'W' | 'L' | 'T'; score: string; opponent: string; home: boolean; ats: 'cover' | 'miss' | 'push' | null };

export function formOf(recent: NflGame[], franchise: string, n = 5): NflFormEntry[] {
  return recent.slice(0, n).map((g) => {
    const home = g.home_franchise === franchise;
    const us = home ? g.home_score! : g.away_score!;
    const them = home ? g.away_score! : g.home_score!;
    return {
      game: g,
      letter: us > them ? 'W' : us < them ? 'L' : 'T',
      score: `${us}–${them}${g.overtime ? ' (OT)' : ''}`,
      opponent: home ? g.away_name : g.home_name,
      home,
      ats: againstSpread(g, franchise),
    };
  });
}

/** Tooltip text for a form badge, e.g. "W 27–20 v Chiefs (H), Week 4 2026". */
export function formDetail(e: NflFormEntry): string {
  return `${e.letter} ${e.score} ${e.home ? 'v' : 'at'} ${e.opponent}, ${weekLabel(e.game.game_type, e.game.week)} ${e.game.season}`;
}

export type NflSeasonSoFar = {
  played: number;
  won: number;
  lost: number;
  tied: number;
  pointsFor: number;
  pointsAgainst: number;
  ats: { cover: number; miss: number; push: number };
};

export function seasonSoFar(recent: NflGame[], franchise: string, season: number): NflSeasonSoFar {
  const s: NflSeasonSoFar = { played: 0, won: 0, lost: 0, tied: 0, pointsFor: 0, pointsAgainst: 0, ats: { cover: 0, miss: 0, push: 0 } };
  for (const g of recent) {
    if (g.season !== season) continue;
    const home = g.home_franchise === franchise;
    const us = home ? g.home_score! : g.away_score!;
    const them = home ? g.away_score! : g.home_score!;
    s.played++;
    s.pointsFor += us;
    s.pointsAgainst += them;
    if (us > them) s.won++;
    else if (us < them) s.lost++;
    else s.tied++;
    const ats = againstSpread(g, franchise);
    if (ats) s.ats[ats]++;
  }
  return s;
}

export const recordText = (s: Pick<NflSeasonSoFar, 'won' | 'lost' | 'tied'>) => (s.tied ? `${s.won}-${s.lost}-${s.tied}` : `${s.won}-${s.lost}`);

// ---- Prediction ------------------------------------------------------------------

/** "KC by 3.5" from the model's predicted home margin. */
export function marginLabel(g: Pick<NflGame, 'home_franchise' | 'away_franchise'>, homeMargin: number): string {
  const m = Number(homeMargin);
  if (Math.abs(m) < 0.25) return 'level';
  return `${m > 0 ? g.home_franchise : g.away_franchise} by ${Math.abs(m).toFixed(1)}`;
}

/** The page's one-line summary (meta description and lead). */
export function gameSentence(p: NflGamePreview): string {
  const { game, model } = p;
  const when = `${weekLabel(game.game_type, game.week)} of the ${game.season} season`;
  const head = `${game.away_name} at ${game.home_name}, ${when}`;
  if (isPlayed(game)) {
    const winner = game.home_score! > game.away_score! ? game.home_name : game.home_score! < game.away_score! ? game.away_name : null;
    const score = `${Math.max(game.home_score!, game.away_score!)}–${Math.min(game.home_score!, game.away_score!)}`;
    return `${head}: ${winner ? `${winner} won ${score}` : `tied ${score}`}${game.overtime ? ' in overtime' : ''}.`;
  }
  const pick = model ? ` The model makes ${Number(model.p_home) >= 0.5 ? game.home_name : game.away_name} ${Math.round(Math.max(Number(model.p_home), 1 - Number(model.p_home)) * 100)}% favourites.` : '';
  const line = lineLabel(game);
  return `${head}, ${ukKickoff(game)} UK time.${pick}${line ? ` Line: ${line}.` : ''} Head-to-head, form and where to watch in the UK.`;
}

// ---- Loader (browser) --------------------------------------------------------------

async function priorGames(franchise: string, game: NflGame): Promise<NflGame[]> {
  const { data, error } = await supabase
    .from('nfl_games' as never)
    .select(GAME_COLUMNS)
    .or(`home_franchise.eq.${franchise},away_franchise.eq.${franchise}`)
    .lte('gameday', game.gameday)
    .not('home_score', 'is', null)
    .order('gameday', { ascending: false })
    .limit(RECENT + 2);
  if (error) throw error;
  return (data ?? []) as unknown as NflGame[];
}

/** `known` = the game row the linking page already has (Fixtures & Results
 * passes it), saving a round trip before the history queries. */
export async function loadNflGame(gameId: string, known?: NflGame): Promise<NflGamePreview | null> {
  if (!/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(gameId)) return null;
  let game = known && known.game_id === gameId ? known : undefined;
  if (!game) {
    const { data, error } = await supabase.from('nfl_games' as never).select(GAME_COLUMNS).eq('game_id', gameId);
    if (error) throw error;
    game = ((data ?? []) as unknown as NflGame[])[0];
  }
  if (!game) return null;
  const h = game.home_franchise;
  const a = game.away_franchise;
  const [meetings, homeGames, awayGames, model] = await Promise.all([
    supabase
      .from('nfl_games' as never)
      .select(GAME_COLUMNS)
      .or(`and(home_franchise.eq.${h},away_franchise.eq.${a}),and(home_franchise.eq.${a},away_franchise.eq.${h})`)
      .limit(200),
    priorGames(h, game),
    priorGames(a, game),
    // The model is an extra: if it can't be read, the rest still shows.
    supabase.from('nfl_game_model' as never).select(MODEL_COLUMNS).eq('game_id', gameId),
  ]);
  if (meetings.error) throw meetings.error;
  const pool = new Map<string, NflGame>();
  for (const g of [...((meetings.data ?? []) as unknown as NflGame[]), ...homeGames, ...awayGames]) pool.set(g.game_id, g);
  const m = model.error ? null : (((model.data ?? []) as unknown as NflGameModel[])[0] ?? null);
  return buildGamePreview(game, [...pool.values()], m);
}
