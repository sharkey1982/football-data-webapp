// ============================================================================
// src/lib/nflTrivia.ts
//
// NFL hub trivia: ONE question per NFL page, each linking to the page that
// holds the answer (the trivia is a navigation aid -- Chris's rule for every
// hub). Built from live data; any question that can't be built is skipped.
// ============================================================================

import { supabase } from './supabase';
import { joined, shuffleFact, tiedWithFirst, type TriviaFact } from './landingApi';
import { NFL_HEAT_MAP_PATH, NFL_PLAYERS_PATH, NFL_SEASONS_PATH, NFL_TABLE_PATH, NFL_TEAMS_PATH, STANDING_COLUMNS, recordLabel, type NflStanding } from './nflApi';

async function standingsAll(): Promise<NflStanding[]> {
  const out: NflStanding[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('nfl_standings' as never).select(STANDING_COLUMNS).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as NflStanding[]));
    if ((data ?? []).length < 1000) return out;
  }
}

/** Counts per team of something true in a season, best-first, one entry per franchise. */
function topCounts(rows: NflStanding[], pick: (r: NflStanding) => boolean): { name: string; n: number }[] {
  const latestName = new Map<string, { name: string; season: number }>();
  for (const r of rows) {
    const cur = latestName.get(r.franchise);
    if (!cur || r.season > cur.season) latestName.set(r.franchise, { name: r.team_name, season: r.season });
  }
  const counts = new Map<string, number>();
  for (const r of rows) if (pick(r)) counts.set(r.franchise, (counts.get(r.franchise) ?? 0) + 1);
  return [...counts.entries()].map(([f, n]) => ({ name: latestName.get(f)!.name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

function mostSuperBowls(rows: NflStanding[]): TriviaFact | null {
  const top = topCounts(rows.filter((r) => r.season_complete), (r) => r.playoff_result === 'Won Super Bowl').slice(0, 4);
  if (top.length < 2) return null;
  const win = tiedWithFirst(top.map((t) => t.n));
  return {
    question: 'Which team has won the most Super Bowls since the 2002 season?',
    ...shuffleFact(top.map((t) => t.name), win, top.map((t) => `${t.n} Super Bowl${t.n === 1 ? '' : 's'}`)),
    explanation: `The ${joined(win.map((i) => top[i].name))} — ${top[0].n} Super Bowl wins.`,
    link: { to: NFL_SEASONS_PATH, label: 'See every season' },
  };
}

function mostPlayoffs(rows: NflStanding[]): TriviaFact | null {
  const top = topCounts(rows.filter((r) => r.season_complete), (r) => r.playoff_round > 0).slice(0, 4);
  if (top.length < 2) return null;
  const win = tiedWithFirst(top.map((t) => t.n));
  return {
    question: 'Which team has reached the play-offs most often since 2002?',
    ...shuffleFact(top.map((t) => t.name), win, top.map((t) => `${t.n} times`)),
    explanation: `The ${joined(win.map((i) => top[i].name))} — ${top[0].n} play-off appearances.`,
    link: { to: NFL_TEAMS_PATH, label: 'Pick a team' },
  };
}

function bestRecordNow(rows: NflStanding[]): TriviaFact | null {
  const season = Math.max(...rows.map((r) => r.season));
  const cur = rows.filter((r) => r.season === season && !r.season_complete && r.played > 0);
  if (cur.length < 4) return null;
  const top = [...cur].sort((a, b) => (b.win_pct ?? 0) - (a.win_pct ?? 0) || b.point_diff - a.point_diff).slice(0, 4);
  const win = tiedWithFirst(top.map((t) => Number(t.win_pct)));
  return {
    question: `Which team has the best record in the ${season} NFL season so far?`,
    ...shuffleFact(top.map((t) => t.team_name), win, top.map((t) => recordLabel(t))),
    explanation: `${win.length > 1 ? `Level at ${recordLabel(top[0])}: the ${joined(win.map((i) => top[i].team_name))}` : `The ${top[0].team_name} \u2014 ${recordLabel(top[0])}`}.`,
    link: { to: NFL_TABLE_PATH, label: 'See the League Table' },
  };
}

async function topFantasyScorer(): Promise<TriviaFact | null> {
  const { data: s } = await supabase.from('nfl_season_summary' as never).select('season,reg_games,reg_played').order('season', { ascending: false }).limit(3);
  const done = ((s ?? []) as { season: number; reg_games: number; reg_played: number }[]).find((x) => x.reg_games > 0 && x.reg_played === x.reg_games);
  if (!done) return null;
  const { data, error } = await supabase
    .from('nfl_player_seasons' as never)
    .select('player_name,position,team_short,pts_ppr')
    .eq('season', done.season)
    .order('pts_ppr', { ascending: false })
    .limit(4);
  if (error) return null;
  const top = (data ?? []) as { player_name: string; position: string; team_short: string; pts_ppr: number }[];
  if (top.length < 2) return null;
  const win = tiedWithFirst(top.map((t) => Number(t.pts_ppr)));
  return {
    question: `Who scored the most PPR fantasy points in the ${done.season} regular season?`,
    ...shuffleFact(top.map((t) => t.player_name), win, top.map((t) => `${Number(t.pts_ppr).toFixed(1)} points (${t.position}, ${t.team_short})`)),
    explanation: `${joined(win.map((i) => top[i].player_name))} — ${Number(top[0].pts_ppr).toFixed(1)} points.`,
    link: { to: `${NFL_PLAYERS_PATH}?season=${done.season}`, label: 'See Player Scout' },
  };
}

async function generousDefence(): Promise<TriviaFact | null> {
  const { data: s } = await supabase.from('nfl_season_summary' as never).select('season,reg_games,reg_played').order('season', { ascending: false }).limit(3);
  const done = ((s ?? []) as { season: number; reg_games: number; reg_played: number }[]).find((x) => x.reg_games > 0 && x.reg_played === x.reg_games);
  if (!done) return null;
  const { data, error } = await supabase
    .from('nfl_points_allowed' as never)
    .select('defence_name,ppr_per_game')
    .eq('season', done.season)
    .eq('position', 'WR')
    .order('ppr_per_game', { ascending: false })
    .limit(4);
  if (error) return null;
  const top = (data ?? []) as { defence_name: string; ppr_per_game: number }[];
  if (top.length < 2) return null;
  const win = tiedWithFirst(top.map((t) => Number(t.ppr_per_game)));
  return {
    question: `Which defence gave up the most PPR points to wide receivers in ${done.season}?`,
    ...shuffleFact(top.map((t) => t.defence_name), win, top.map((t) => `${Number(t.ppr_per_game).toFixed(1)} a game`)),
    explanation: `The ${joined(win.map((i) => top[i].defence_name))} — ${Number(top[0].ppr_per_game).toFixed(1)} points a game to receivers.`,
    link: { to: `${NFL_HEAT_MAP_PATH}?pos=WR`, label: 'See the Fixture Heat Map' },
  };
}

async function safely(fn: () => Promise<TriviaFact | null> | TriviaFact | null): Promise<TriviaFact | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function getNflTrivia(): Promise<TriviaFact[]> {
  const rows = await standingsAll().catch(() => [] as NflStanding[]);
  const facts = await Promise.all([
    safely(() => (rows.length ? mostSuperBowls(rows) : null)), // Past seasons
    safely(() => (rows.length ? mostPlayoffs(rows) : null)), // Your Team
    safely(() => (rows.length ? bestRecordNow(rows) : null)), // League Table
    safely(topFantasyScorer), // Player Scout
    safely(generousDefence), // Fixture Heat Map
  ]);
  return facts.filter((f): f is TriviaFact => f !== null);
}
