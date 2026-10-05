// ============================================================================
// src/lib/nflMatchup.ts
//
// NFL Match Projections (as FPL's Match Projections): one game's fantasy
// match-up. For each team -- the market's points for the game, the team's
// volume (plays, pass rate), where its yards and touchdowns come from by
// position (is it a running-back team or a receiver team?), how much the
// opponent's defence gives up to each position, its DST points -- and the two
// line-ups of key players side by side with their projections.
// ============================================================================

import { supabase } from './supabase';
import { GAME_COLUMNS, TEAM_SEASON_COLUMNS, type NflGame, type NflTeamSeason } from './nflApi';
import { PROJECTION_COLUMNS, loadProjections, type NflProjection } from './nflProjections';

export const SKILL = ['QB', 'RB', 'WR', 'TE'] as const;
export type Skill = (typeof SKILL)[number];

export type PositionSplit = Record<Skill, number>;

export type TeamProfile = {
  franchise: string;
  games: number;
  season: number;
  /** Rushing + receiving yards gained by players at each position. */
  yards: PositionSplit;
  /** Rushing + receiving touchdowns scored by players at each position. */
  tds: PositionSplit;
  /** Targets by position (who the passes go to). */
  targets: PositionSplit;
  /** Carries by position. */
  carries: PositionSplit;
};

export type WeekLine = {
  team: string;
  position: string;
  season: number;
  season_type: string;
  rushing_yards: number;
  receiving_yards: number;
  rushing_tds: number;
  receiving_tds: number;
  targets: number;
  carries: number;
  game_id: string;
};

const zero = (): PositionSplit => ({ QB: 0, RB: 0, WR: 0, TE: 0 });
const skill = (p: string): Skill | null => (p === 'FB' ? 'RB' : (SKILL as readonly string[]).includes(p) ? (p as Skill) : null);

export function buildProfile(franchise: string, season: number, weeks: WeekLine[]): TeamProfile {
  const p: TeamProfile = { franchise, season, games: 0, yards: zero(), tds: zero(), targets: zero(), carries: zero() };
  const games = new Set<string>();
  for (const w of weeks) {
    if (w.team !== franchise || w.season !== season || w.season_type !== 'REG') continue;
    games.add(w.game_id);
    const s = skill(w.position);
    if (!s) continue;
    p.yards[s] += Number(w.rushing_yards) + Number(w.receiving_yards);
    p.tds[s] += Number(w.rushing_tds) + Number(w.receiving_tds);
    p.targets[s] += Number(w.targets);
    p.carries[s] += Number(w.carries);
  }
  p.games = games.size;
  return p;
}

export const total = (x: PositionSplit): number => SKILL.reduce((s, k) => s + x[k], 0);
export const share = (x: PositionSplit, k: Skill): number => (total(x) ? x[k] / total(x) : 0);

/** "Run-led", "Receiver-led" or "Balanced", from the share of yards and TDs from running backs v receivers (WR + TE). */
export function reliance(p: TeamProfile): { label: 'Run-led' | 'Receiver-led' | 'Balanced'; rb: number; rec: number } {
  const rb = (share(p.yards, 'RB') + share(p.tds, 'RB')) / 2;
  const rec = (share(p.yards, 'WR') + share(p.yards, 'TE') + share(p.tds, 'WR') + share(p.tds, 'TE')) / 2;
  // League-typical: about 30% of skill-position yards from RBs, 60% from receivers.
  const label = rb >= 0.4 ? 'Run-led' : rec >= 0.68 ? 'Receiver-led' : 'Balanced';
  return { label, rb, rec };
}

export function relianceSentence(p: TeamProfile, name: string): string {
  if (!p.games) return `${name}: no games yet this season.`;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const rbY = share(p.yards, 'RB');
  const recY = share(p.yards, 'WR') + share(p.yards, 'TE');
  const rbT = share(p.tds, 'RB');
  const recT = share(p.tds, 'WR') + share(p.tds, 'TE');
  return `${name} get ${pct(rbY)} of their yards and ${pct(rbT)} of their touchdowns from running backs, ${pct(recY)} and ${pct(recT)} from receivers and tight ends.`;
}

/** Implied points for each side from the line: total/2 +/- spread/2 (spread + = home favoured). */
export function impliedPoints(g: Pick<NflGame, 'spread_line' | 'total_line'>): { home: number; away: number } | null {
  if (g.spread_line == null || g.total_line == null) return null;
  const s = Number(g.spread_line);
  const t = Number(g.total_line);
  return { home: t / 2 + s / 2, away: t / 2 - s / 2 };
}

/** Key players for one side: the top projected at each slot (QB1, RB1-2, WR1-3, TE1, K). */
export const SLOTS: { pos: string; n: number }[] = [
  { pos: 'QB', n: 1 },
  { pos: 'RB', n: 2 },
  { pos: 'WR', n: 3 },
  { pos: 'TE', n: 1 },
  { pos: 'K', n: 1 },
];

export function lineup(rows: NflProjection[], teamSlug: string): { slot: string; player: NflProjection | null }[] {
  const mine = rows.filter((r) => r.team_slug === teamSlug).sort((a, b) => Number(b.proj_ppr) - Number(a.proj_ppr));
  const out: { slot: string; player: NflProjection | null }[] = [];
  for (const { pos, n } of SLOTS) {
    const at = mine.filter((r) => (r.position === 'FB' ? 'RB' : r.position) === pos);
    // Players ruled out drop to the end of their position.
    at.sort((a, b) => Number(a.injury_status === 'Out') - Number(b.injury_status === 'Out'));
    for (let i = 0; i < n; i++) out.push({ slot: n > 1 ? `${pos}${i + 1}` : pos, player: at[i] ?? null });
  }
  return out;
}

export type PositionAllowed = { position: string; ppr_per_game: number; ppr_rank: number };

export type MatchupData = {
  game: NflGame;
  season: number;
  projections: NflProjection[];
  home: { profile: TeamProfile; stats: NflTeamSeason | null; allowed: PositionAllowed[] };
  away: { profile: TeamProfile; stats: NflTeamSeason | null; allowed: PositionAllowed[] };
};

const WEEK_COLS = 'team,position,season,season_type,rushing_yards,receiving_yards,rushing_tds,receiving_tds,targets,carries,game_id';

export async function loadMatchup(gameId: string): Promise<MatchupData | null> {
  const { data: gRows, error } = await supabase.from('nfl_games' as never).select(GAME_COLUMNS).eq('game_id', gameId).limit(1);
  if (error) throw error;
  const game = ((gRows ?? []) as unknown as NflGame[])[0];
  if (!game) return null;
  const teams = [game.home_franchise, game.away_franchise];
  // This season once a team has played; before week 2, last season.
  const [projRes, stats, weeks, allowed] = await Promise.all([
    supabase.from('nfl_projections' as never).select(PROJECTION_COLUMNS).eq('game_id', gameId),
    supabase.from('nfl_team_seasons' as never).select(TEAM_SEASON_COLUMNS).in('season', [game.season, game.season - 1]).in('franchise', teams),
    supabase.from('nfl_player_weeks' as never).select(WEEK_COLS).in('season', [game.season, game.season - 1]).in('team', teams).eq('season_type', 'REG').limit(5000),
    supabase.from('nfl_points_allowed' as never).select('season,defence,position,ppr_per_game,ppr_rank').in('season', [game.season, game.season - 1]).in('defence', teams),
  ]);
  for (const r of [projRes, stats, weeks, allowed]) if (r.error) throw r.error;
  const st = (stats.data ?? []) as unknown as NflTeamSeason[];
  const wk = (weeks.data ?? []) as unknown as WeekLine[];
  const al = (allowed.data ?? []) as unknown as (PositionAllowed & { season: number; defence: string })[];
  const side = (f: string) => {
    const cur = buildProfile(f, game.season, wk);
    const season = cur.games >= 1 ? game.season : game.season - 1;
    const profile = season === game.season ? cur : buildProfile(f, season, wk);
    return {
      profile,
      stats: st.find((s) => s.franchise === f && s.season === season) ?? null,
      allowed: al.filter((a) => a.defence === f && a.season === season).map(({ position, ppr_per_game, ppr_rank }) => ({ position, ppr_per_game: Number(ppr_per_game), ppr_rank: Number(ppr_rank) })),
    };
  };
  const home = side(game.home_franchise);
  return { game, season: home.profile.season, projections: (projRes.data ?? []) as unknown as NflProjection[], home, away: side(game.away_franchise) };
}

/** A side's line-up total, or null when the team has no projections for this game yet
 * (the daily job projects each team's next game only: a team playing twice in the
 * window gets this game's projections after the earlier game). */
export type MatchupCard = { game: NflGame; home: number | null; away: number | null; players: number };

/** This week's games that have projections, with each side's projected fantasy points (PPR, top line-up). */
export async function loadMatchupIndex(): Promise<MatchupCard[]> {
  const proj = await loadProjections();
  const ids = [...new Set(proj.map((p) => p.game_id))];
  if (!ids.length) return [];
  const { data, error } = await supabase.from('nfl_games' as never).select(GAME_COLUMNS).in('game_id', ids);
  if (error) throw error;
  const games = (data ?? []) as unknown as NflGame[];
  const side = (g: NflGame, slug: string): number | null => {
    const rows = proj.filter((p) => p.game_id === g.game_id && p.team_slug === slug);
    if (!rows.length) return null;
    return lineup(rows, slug).reduce((s, x) => s + (x.player && x.player.injury_status !== 'Out' ? Number(x.player.proj_ppr) : 0), 0);
  };
  return games
    .map((g) => ({ game: g, home: side(g, g.home_slug), away: side(g, g.away_slug), players: proj.filter((p) => p.game_id === g.game_id).length }))
    .sort((a, b) => String(a.game.kickoff_at ?? a.game.gameday).localeCompare(String(b.game.kickoff_at ?? b.game.gameday)));
}
