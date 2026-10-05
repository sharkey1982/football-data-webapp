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

// ---- Stat lines: season average, what the opponent allows, and the actual game --------------

/** One team's line in one game (public.nfl_team_games). */
export type TeamGameLine = {
  season: number;
  week: number;
  game_id: string;
  franchise: string;
  points_for: number | null;
  pass_yards_net: number;
  rushing_yards: number;
  passing_tds: number;
  rushing_tds: number;
  giveaways: number;
  fg_made: number;
  fg_att: number;
  opp_pass_yards_net: number | null;
  opp_rushing_yards: number | null;
  opp_passing_tds: number | null;
  opp_rushing_tds: number | null;
  opp_fg_made: number | null;
  takeaways: number;
  points_against: number | null;
};
export const TEAM_GAME_COLUMNS =
  'season,week,game_id,franchise,points_for,points_against,pass_yards_net,rushing_yards,passing_tds,rushing_tds,giveaways,fg_made,fg_att,opp_pass_yards_net,opp_rushing_yards,opp_passing_tds,opp_rushing_tds,opp_fg_made,takeaways';

/** Each stat: the team's own figure, and what a defence allows (from that defence's games). */
export const STAT_LINES: { key: string; label: string; digits: number; own: (g: TeamGameLine) => number | null; allows: (g: TeamGameLine) => number | null }[] = [
  { key: 'pts', label: 'Points', digits: 1, own: (g) => g.points_for, allows: (g) => g.points_against },
  { key: 'pass', label: 'Passing yards', digits: 0, own: (g) => g.pass_yards_net, allows: (g) => g.opp_pass_yards_net },
  { key: 'rush', label: 'Rushing yards', digits: 0, own: (g) => g.rushing_yards, allows: (g) => g.opp_rushing_yards },
  { key: 'ptd', label: 'Passing TDs', digits: 1, own: (g) => g.passing_tds, allows: (g) => g.opp_passing_tds },
  { key: 'rtd', label: 'Rushing TDs', digits: 1, own: (g) => g.rushing_tds, allows: (g) => g.opp_rushing_tds },
  { key: 'fg', label: 'Field goals', digits: 1, own: (g) => g.fg_made, allows: (g) => g.opp_fg_made },
  { key: 'to', label: 'Giveaways / takeaways', digits: 1, own: (g) => g.giveaways, allows: (g) => g.takeaways },
];

export type StatLine = { key: string; label: string; digits: number; avg: number | null; oppAllows: number | null; actual: number | null };

const mean = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x != null).map(Number);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/**
 * A team's stat lines for one game: its average per game before this game,
 * what the opponent's defence allowed per game before it, and (once played)
 * the actual figure in this game. "Giveaways / takeaways": the team's
 * giveaways, and the takeaways the opponent's defence forces.
 */
export function statLines(lines: TeamGameLine[], team: string, opponent: string, game: Pick<NflGame, 'game_id' | 'week' | 'season'>): { lines: StatLine[]; games: number; oppGames: number } {
  const before = (f: string) => lines.filter((l) => l.franchise === f && l.season === game.season && l.week < game.week && l.game_id !== game.game_id);
  const mine = before(team);
  const theirs = before(opponent);
  const actual = lines.find((l) => l.franchise === team && l.game_id === game.game_id) ?? null;
  return {
    games: mine.length,
    oppGames: theirs.length,
    lines: STAT_LINES.map((s) => ({
      key: s.key,
      label: s.label,
      digits: s.digits,
      avg: mean(mine.map(s.own)),
      oppAllows: mean(theirs.map(s.allows)),
      actual: actual ? s.own(actual) : null,
    })),
  };
}

/** A player's actual output in one game (public.nfl_player_weeks). */
export type PlayerActual = {
  player_id: string;
  pts_std: number;
  pts_half: number;
  pts_ppr: number;
  passing_yards: number;
  passing_tds: number;
  rushing_yards: number;
  rushing_tds: number;
  receptions: number;
  receiving_yards: number;
  receiving_tds: number;
  fg_made: number;
  fg_att: number;
};
export const PLAYER_ACTUAL_COLUMNS = 'player_id,pts_std,pts_half,pts_ppr,passing_yards,passing_tds,rushing_yards,rushing_tds,receptions,receiving_yards,receiving_tds,fg_made,fg_att';

/** "289 pass yds, 2 TD · 14 rush yds": the parts of a box-score line that scored. */
export function actualLine(a: PlayerActual): string {
  const parts: string[] = [];
  const td = (n: number) => (n ? `, ${n} TD` : '');
  if (Number(a.passing_yards)) parts.push(`${a.passing_yards} pass yds${td(Number(a.passing_tds))}`);
  if (Number(a.rushing_yards) || Number(a.rushing_tds)) parts.push(`${a.rushing_yards} rush yds${td(Number(a.rushing_tds))}`);
  if (Number(a.receptions) || Number(a.receiving_yards)) parts.push(`${a.receptions} rec, ${a.receiving_yards} yds${td(Number(a.receiving_tds))}`);
  if (Number(a.fg_att)) parts.push(`${a.fg_made}/${a.fg_att} FG`);
  return parts.join(' \u00b7 ') || 'no stats';
}

export type MatchupData = {
  game: NflGame;
  season: number;
  projections: NflProjection[];
  home: { profile: TeamProfile; stats: NflTeamSeason | null; allowed: PositionAllowed[] };
  away: { profile: TeamProfile; stats: NflTeamSeason | null; allowed: PositionAllowed[] };
  /** Both teams' game lines this season (for stat lines and actuals). */
  teamGames: TeamGameLine[];
  /** Once played: each player's actual output in this game. */
  playerActuals: PlayerActual[];
};

/** True once the game has a final score. */
export const isPlayed = (g: Pick<NflGame, 'home_score' | 'away_score'>): boolean => g.home_score != null && g.away_score != null;

const WEEK_COLS = 'team,position,season,season_type,rushing_yards,receiving_yards,rushing_tds,receiving_tds,targets,carries,game_id';

export async function loadMatchup(gameId: string): Promise<MatchupData | null> {
  const { data: gRows, error } = await supabase.from('nfl_games' as never).select(GAME_COLUMNS).eq('game_id', gameId).limit(1);
  if (error) throw error;
  const game = ((gRows ?? []) as unknown as NflGame[])[0];
  if (!game) return null;
  const teams = [game.home_franchise, game.away_franchise];
  // This season once a team has played; before week 2, last season.
  const played = isPlayed(game);
  const [projRes, stats, weeks, allowed, teamGames, actuals] = await Promise.all([
    supabase.from('nfl_projections' as never).select(PROJECTION_COLUMNS).eq('game_id', gameId),
    supabase.from('nfl_team_seasons' as never).select(TEAM_SEASON_COLUMNS).in('season', [game.season, game.season - 1]).in('franchise', teams),
    supabase.from('nfl_player_weeks' as never).select(WEEK_COLS).in('season', [game.season, game.season - 1]).in('team', teams).eq('season_type', 'REG').limit(5000),
    supabase.from('nfl_points_allowed' as never).select('season,defence,position,ppr_per_game,ppr_rank').in('season', [game.season, game.season - 1]).in('defence', teams),
    supabase.from('nfl_team_games' as never).select(TEAM_GAME_COLUMNS).eq('season', game.season).eq('season_type', 'REG').in('franchise', teams),
    played
      ? supabase.from('nfl_player_weeks' as never).select(PLAYER_ACTUAL_COLUMNS).eq('game_id', gameId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [projRes, stats, weeks, allowed]) if (r.error) throw r.error;
  // Stat lines and actuals are extras: the page still works without them.
  const tg = teamGames.error ? [] : ((teamGames.data ?? []) as unknown as TeamGameLine[]);
  const pa = actuals.error ? [] : ((actuals.data ?? []) as unknown as PlayerActual[]);
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
  return { game, season: home.profile.season, projections: (projRes.data ?? []) as unknown as NflProjection[], home, away: side(game.away_franchise), teamGames: tg, playerActuals: pa };
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
  // Projections are kept after kick-off; the index shows the last week and what's coming.
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  const games = ((data ?? []) as unknown as NflGame[]).filter((g) => !g.kickoff_at || new Date(g.kickoff_at).getTime() >= cutoff);
  const side = (g: NflGame, slug: string): number | null => {
    const rows = proj.filter((p) => p.game_id === g.game_id && p.team_slug === slug);
    if (!rows.length) return null;
    return lineup(rows, slug).reduce((s, x) => s + (x.player && x.player.injury_status !== 'Out' ? Number(x.player.proj_ppr) : 0), 0);
  };
  return games
    .map((g) => ({ game: g, home: side(g, g.home_slug), away: side(g, g.away_slug), players: proj.filter((p) => p.game_id === g.game_id).length }))
    .sort((a, b) => String(a.game.kickoff_at ?? a.game.gameday).localeCompare(String(b.game.kickoff_at ?? b.game.gameday)));
}
