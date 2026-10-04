// ============================================================================
// src/lib/nflFantasyApi.ts
//
// NFL fantasy numbers: player seasons and weeks with points in standard,
// half-PPR and PPR scoring, each player's consistency, and which defences
// give up the most to each position (the Fixture Heat Map).
//
// Points come from the database (nfl.points_std, checked daily against
// nflverse's own scoring) -- nothing is rescored here.
// ============================================================================

import { supabase } from './supabase';
import { GAME_COLUMNS, seasonRange, type NflGame, type NflTeam, TEAM_COLUMNS } from './nflApi';

export type ScoringFormat = 'ppr' | 'half' | 'std';
export const FORMATS: { key: ScoringFormat; label: string }[] = [
  { key: 'ppr', label: 'PPR' },
  { key: 'half', label: 'Half-PPR' },
  { key: 'std', label: 'Standard' },
];
export const FANTASY_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'] as const;
export type FantasyPosition = (typeof FANTASY_POSITIONS)[number];

/** FB plays as a running back in every fantasy format. */
export const fantasyPosition = (p: string | null): string => (p === 'FB' ? 'RB' : (p ?? ''));

export type NflPlayerSeason = {
  player_id: string;
  player_slug: string;
  player_name: string;
  position: string;
  season: number;
  team: string;
  team_slug: string;
  team_short: string;
  games: number;
  completions: number;
  attempts: number;
  passing_yards: number;
  passing_tds: number;
  interceptions: number;
  carries: number;
  rushing_yards: number;
  rushing_tds: number;
  receptions: number;
  targets: number;
  receiving_yards: number;
  receiving_tds: number;
  fumbles_lost: number;
  target_share: number | null;
  fg_made: number;
  fg_att: number;
  pat_made: number;
  pts_std: number;
  pts_half: number;
  pts_ppr: number;
  ppg_std: number;
  ppg_half: number;
  ppg_ppr: number;
  last3_ppg_std: number | null;
  last3_ppg_half: number | null;
  last3_ppg_ppr: number | null;
  sd_ppr: number | null;
  best_ppr: number | null;
  last_week: number;
};

export type NflPlayerWeek = {
  player_id: string;
  position: string;
  season: number;
  week: number;
  season_type: 'REG' | 'POST';
  game_id: string;
  team: string;
  opponent: string;
  opponent_slug: string;
  opponent_short: string;
  at_home: boolean;
  gameday: string;
  team_score: number | null;
  opponent_score: number | null;
  completions: number;
  attempts: number;
  passing_yards: number;
  passing_tds: number;
  interceptions: number;
  carries: number;
  rushing_yards: number;
  rushing_tds: number;
  receptions: number;
  targets: number;
  receiving_yards: number;
  receiving_tds: number;
  fumbles_lost: number;
  target_share: number | null;
  fg_made: number;
  fg_att: number;
  pat_made: number;
  pts_std: number;
  pts_half: number;
  pts_ppr: number;
};

export type NflPlayer = {
  player_id: string;
  slug: string;
  name: string;
  position: string | null;
  team: string | null;
  team_slug: string | null;
  team_name: string | null;
  birth_date: string | null;
  height_in: number | null;
  weight_lb: number | null;
  college: string | null;
  rookie_season: number | null;
  draft_year: number | null;
  draft_round: number | null;
  draft_pick: number | null;
  jersey_number: number | null;
  status: string | null;
  years_exp: number | null;
};

export type PointsAllowed = {
  season: number;
  defence: string;
  defence_slug: string;
  defence_name: string;
  defence_short: string;
  position: string;
  games: number;
  std_per_game: number;
  half_per_game: number;
  ppr_per_game: number;
  ppr_rank: number;
};

export const SEASON_COLUMNS =
  'player_id,player_slug,player_name,position,season,team,team_slug,team_short,games,completions,attempts,passing_yards,passing_tds,interceptions,carries,rushing_yards,rushing_tds,receptions,targets,receiving_yards,receiving_tds,fumbles_lost,target_share,fg_made,fg_att,pat_made,pts_std,pts_half,pts_ppr,ppg_std,ppg_half,ppg_ppr,last3_ppg_std,last3_ppg_half,last3_ppg_ppr,sd_ppr,best_ppr,last_week';
const WEEK_COLUMNS =
  'player_id,position,season,week,season_type,game_id,team,opponent,opponent_slug,opponent_short,at_home,gameday,team_score,opponent_score,completions,attempts,passing_yards,passing_tds,interceptions,carries,rushing_yards,rushing_tds,receptions,targets,receiving_yards,receiving_tds,fumbles_lost,target_share,fg_made,fg_att,pat_made,pts_std,pts_half,pts_ppr';
const PLAYER_COLUMNS =
  'player_id,slug,name,position,team,team_slug,team_name,birth_date,height_in,weight_lb,college,rookie_season,draft_year,draft_round,draft_pick,jersey_number,status,years_exp';
export const ALLOWED_COLUMNS =
  'season,defence,defence_slug,defence_name,defence_short,position,games,std_per_game,half_per_game,ppr_per_game,ppr_rank';

export const pts = (r: { pts_std: number; pts_half: number; pts_ppr: number }, f: ScoringFormat) => Number(f === 'ppr' ? r.pts_ppr : f === 'half' ? r.pts_half : r.pts_std);
export const ppg = (r: NflPlayerSeason, f: ScoringFormat) => Number(f === 'ppr' ? r.ppg_ppr : f === 'half' ? r.ppg_half : r.ppg_std);
export const last3 = (r: NflPlayerSeason, f: ScoringFormat) => {
  const v = f === 'ppr' ? r.last3_ppg_ppr : f === 'half' ? r.last3_ppg_half : r.last3_ppg_std;
  return v == null ? null : Number(v);
};
export const allowedPerGame = (r: PointsAllowed, f: ScoringFormat) => Number(f === 'ppr' ? r.ppr_per_game : f === 'half' ? r.half_per_game : r.std_per_game);

// ---- Consistency ------------------------------------------------------------------

/** Weekly points a fantasy manager cares about: a typical bad week (floor,
 * 25th percentile), a typical good week (ceiling, 75th), the median, and
 * how often the player scored at a "starter" level for the position. */
export const STARTER_LINE: Record<string, number> = { QB: 18, RB: 12, WR: 12, TE: 9, K: 8 };

export type Consistency = { games: number; floor: number; median: number; ceiling: number; startable: number; startLine: number };

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function consistency(weeks: NflPlayerWeek[], f: ScoringFormat, position: string): Consistency | null {
  const reg = weeks.filter((w) => w.season_type === 'REG').map((w) => pts(w, f)).sort((a, b) => a - b);
  if (reg.length === 0) return null;
  const line = STARTER_LINE[fantasyPosition(position)] ?? 10;
  return {
    games: reg.length,
    floor: quantile(reg, 0.25),
    median: quantile(reg, 0.5),
    ceiling: quantile(reg, 0.75),
    startable: reg.filter((p) => p >= line).length,
    startLine: line,
  };
}

// ---- Fixture Heat Map ---------------------------------------------------------------

export type HeatCell = { week: number; opponent: string | null; opponentShort: string | null; home: boolean; perGame: number | null; rank: number | null; bye: boolean };
export type HeatRow = { team: NflTeam; cells: HeatCell[]; average: number | null };
export type HeatMapData = {
  season: number;
  basisSeason: number;
  basisGames: number;
  position: FantasyPosition;
  format: ScoringFormat;
  weeks: number[];
  rows: HeatRow[];
};

/** Upcoming weeks for every team, each cell the opponent's points allowed
 * per game to the position. Early in a season (fewer than 4 games a
 * defence) the previous season is the basis, and the page says so. */
export function buildHeatMap(args: {
  season: number;
  teams: NflTeam[];
  upcoming: NflGame[];
  allowedCurrent: PointsAllowed[];
  allowedPrevious: PointsAllowed[];
  position: FantasyPosition;
  format: ScoringFormat;
  span?: number;
}): HeatMapData {
  const { season, teams, upcoming, position, format } = args;
  const span = args.span ?? 6;
  const current = args.allowedCurrent.filter((r) => r.position === position);
  const minGames = current.length ? Math.min(...current.map((r) => r.games)) : 0;
  const useCurrent = minGames >= 4;
  const basis = (useCurrent ? current : args.allowedPrevious.filter((r) => r.position === position));
  const basisSeason = useCurrent ? season : season - 1;
  const ranked = [...basis].sort((a, b) => allowedPerGame(b, format) - allowedPerGame(a, format));
  const rankOf = new Map(ranked.map((r, i) => [r.defence, i + 1]));
  const perGame = new Map(basis.map((r) => [r.defence, allowedPerGame(r, format)]));
  const reg = upcoming.filter((g) => g.game_type === 'REG' && g.home_score == null);
  const weeks = [...new Set(reg.map((g) => g.week))].sort((a, b) => a - b).slice(0, span);
  const rows: HeatRow[] = teams.map((team) => {
    const cells = weeks.map((week) => {
      const g = reg.find((x) => x.week === week && (x.home_franchise === team.franchise || x.away_franchise === team.franchise));
      if (!g) return { week, opponent: null, opponentShort: null, home: false, perGame: null, rank: null, bye: true };
      const home = g.home_franchise === team.franchise;
      const opp = home ? g.away_franchise : g.home_franchise;
      return { week, opponent: opp, opponentShort: home ? g.away_short : g.home_short, home, perGame: perGame.get(opp) ?? null, rank: rankOf.get(opp) ?? null, bye: false };
    });
    const vals = cells.filter((c) => c.perGame != null).map((c) => c.perGame!);
    return { team, cells, average: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
  });
  return { season, basisSeason, basisGames: basis.length ? Math.min(...basis.map((r) => r.games)) : 0, position, format, weeks, rows };
}

// ---- Loaders -------------------------------------------------------------------------------

async function latestPlayerSeason(): Promise<number> {
  const { data, error } = await supabase.from('nfl_player_weeks' as never).select('season').order('season', { ascending: false }).limit(1);
  if (error) throw error;
  return ((data ?? []) as { season: number }[])[0]?.season ?? new Date().getFullYear();
}

export type PlayerScoutData = { season: number; seasons: number[]; rows: NflPlayerSeason[] };

export async function loadPlayerScout(season: number | null): Promise<PlayerScoutData> {
  const latest = await latestPlayerSeason();
  const s = season ?? latest;
  const rows: NflPlayerSeason[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('nfl_player_seasons' as never).select(SEASON_COLUMNS).eq('season', s).range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as NflPlayerSeason[]));
    if ((data ?? []).length < 1000) break;
  }
  return { season: s, seasons: seasonRange(latest).filter((x) => x >= 2016), rows };
}

export type PlayerPageData = {
  player: NflPlayer;
  seasons: NflPlayerSeason[];
  /** Every game of the most recent season the player played in, play-offs included. */
  weeks: NflPlayerWeek[];
  weeksSeason: number;
  /** The player's team's remaining regular-season games, with the opponent's
   * points allowed to the position (current season, or last season early on). */
  upcoming: { game: NflGame; opponent: string; opponentShort: string; home: boolean; allowed: PointsAllowed | null }[];
  allowedSeason: number | null;
  /** Everyone at the same fantasy position in weeksSeason, for ranks. */
  peers: Pick<NflPlayerSeason, 'player_id' | 'pts_std' | 'pts_half' | 'pts_ppr'>[];
};

/** 1-based rank by season points at the position, or null if absent. */
export function positionRank(d: Pick<PlayerPageData, 'peers'>, playerId: string, f: ScoringFormat): number | null {
  const sorted = [...d.peers].sort((a, b) => pts(b, f) - pts(a, f));
  const i = sorted.findIndex((p) => p.player_id === playerId);
  return i < 0 ? null : i + 1;
}

export async function loadPlayerPage(slug: string): Promise<PlayerPageData | null> {
  const { data: pRows, error } = await supabase.from('nfl_players' as never).select(PLAYER_COLUMNS).eq('slug', slug).limit(1);
  if (error) throw error;
  const player = ((pRows ?? []) as unknown as NflPlayer[])[0];
  if (!player) return null;
  const { data: sRows, error: e2 } = await supabase
    .from('nfl_player_seasons' as never)
    .select(SEASON_COLUMNS)
    .eq('player_id', player.player_id)
    .order('season', { ascending: false });
  if (e2) throw e2;
  const seasons = (sRows ?? []) as unknown as NflPlayerSeason[];
  const weeksSeason = seasons[0]?.season ?? (await latestPlayerSeason());
  const { data: wRows, error: e3 } = await supabase
    .from('nfl_player_weeks' as never)
    .select(WEEK_COLUMNS)
    .eq('player_id', player.player_id)
    .eq('season', weeksSeason)
    .order('week');
  if (e3) throw e3;
  const weeks = (wRows ?? []) as unknown as NflPlayerWeek[];

  let upcoming: PlayerPageData['upcoming'] = [];
  let allowedSeason: number | null = null;
  const pos = fantasyPosition(player.position);
  const latest = await latestPlayerSeason();
  if (player.team && player.status !== 'RET' && (FANTASY_POSITIONS as readonly string[]).includes(pos)) {
    const [gRes, aRes] = await Promise.all([
      supabase
        .from('nfl_games' as never)
        .select(GAME_COLUMNS)
        .eq('season', latest)
        .eq('game_type', 'REG')
        .is('home_score', null)
        .or(`home_franchise.eq.${player.team},away_franchise.eq.${player.team}`)
        .order('week')
        .limit(6),
      supabase.from('nfl_points_allowed' as never).select(ALLOWED_COLUMNS).in('season', [latest, latest - 1]).eq('position', pos),
    ]);
    if (gRes.error) throw gRes.error;
    if (aRes.error) throw aRes.error;
    const allowed = (aRes.data ?? []) as unknown as PointsAllowed[];
    const cur = allowed.filter((a) => a.season === latest);
    const basis = cur.length && Math.min(...cur.map((a) => a.games)) >= 4 ? cur : allowed.filter((a) => a.season === latest - 1);
    allowedSeason = basis[0]?.season ?? null;
    upcoming = ((gRes.data ?? []) as unknown as NflGame[]).map((g) => {
      const home = g.home_franchise === player.team;
      const opp = home ? g.away_franchise : g.home_franchise;
      return { game: g, opponent: opp, opponentShort: home ? g.away_short : g.home_short, home, allowed: basis.find((a) => a.defence === opp) ?? null };
    });
  }
  const posList = pos === 'RB' ? ['RB', 'FB'] : [pos];
  const { data: peerRows, error: e4 } = await supabase
    .from('nfl_player_seasons' as never)
    .select('player_id,pts_std,pts_half,pts_ppr')
    .eq('season', weeksSeason)
    .in('position', posList)
    .limit(1000);
  if (e4) throw e4;
  const peers = (peerRows ?? []) as unknown as PlayerPageData['peers'];
  return { player, seasons, weeks, weeksSeason, upcoming, allowedSeason, peers };
}

export async function loadTeamFantasyLeaders(franchise: string, season: number): Promise<NflPlayerSeason[]> {
  const { data, error } = await supabase
    .from('nfl_player_seasons' as never)
    .select(SEASON_COLUMNS)
    .eq('season', season)
    .eq('team', franchise)
    .order('pts_ppr', { ascending: false })
    .limit(8);
  if (error) throw error;
  return (data ?? []) as unknown as NflPlayerSeason[];
}

export async function loadHeatMap(position: FantasyPosition, format: ScoringFormat): Promise<HeatMapData> {
  const { data: latestRow, error } = await supabase.from('nfl_games' as never).select('season').order('season', { ascending: false }).limit(1);
  if (error) throw error;
  const season = ((latestRow ?? []) as { season: number }[])[0]?.season ?? new Date().getFullYear();
  const [teams, games, allowed] = await Promise.all([
    supabase.from('nfl_teams' as never).select(TEAM_COLUMNS).order('name'),
    supabase.from('nfl_games' as never).select(GAME_COLUMNS).eq('season', season).eq('game_type', 'REG').is('home_score', null).order('week').limit(1000),
    supabase.from('nfl_points_allowed' as never).select(ALLOWED_COLUMNS).in('season', [season, season - 1]).limit(1000),
  ]);
  for (const r of [teams, games, allowed]) if (r.error) throw r.error;
  const all = (allowed.data ?? []) as unknown as PointsAllowed[];
  return buildHeatMap({
    season,
    teams: (teams.data ?? []) as unknown as NflTeam[],
    upcoming: (games.data ?? []) as unknown as NflGame[],
    allowedCurrent: all.filter((a) => a.season === season),
    allowedPrevious: all.filter((a) => a.season === season - 1),
    position,
    format,
  });
}

// ---- Formatting ---------------------------------------------------------------------------

export function age(birth: string | null, on = new Date()): number | null {
  if (!birth) return null;
  const b = new Date(`${birth}T00:00:00Z`);
  let a = on.getUTCFullYear() - b.getUTCFullYear();
  if (on.getUTCMonth() < b.getUTCMonth() || (on.getUTCMonth() === b.getUTCMonth() && on.getUTCDate() < b.getUTCDate())) a--;
  return a;
}

export const heightLabel = (inches: number | null) => (inches == null ? null : `${Math.floor(inches / 12)}ft ${inches % 12}in`);
export const weightLabel = (lb: number | null) => (lb == null ? null : `${lb}lb (${Math.round(lb * 0.4536)}kg)`);
export const fmt1 = (n: number | null | undefined) => (n == null || !Number.isFinite(Number(n)) ? '–' : Number(n).toFixed(1));

// ---- Player page sentence ------------------------------------------------------------

/** This season in one sentence: points, rank at the position, recent form. */
export function playerSentence(d: PlayerPageData, f: ScoringFormat): string {
  const s = d.seasons.find((x) => x.season === d.weeksSeason);
  const pos = fantasyPosition(d.player.position);
  const label = FORMATS.find((x) => x.key === f)!.label;
  if (!s) return `${d.player.name} has no regular-season games on file for ${d.weeksSeason}.`;
  const rank = positionRank(d, d.player.player_id, f);
  const l3 = last3(s, f);
  const form = l3 != null && s.games > 3 ? ` Over his last three games he averaged ${fmt1(l3)}${l3 > ppg(s, f) + 2 ? ', up on his season average' : l3 < ppg(s, f) - 2 ? ', down on his season average' : ''}.` : '';
  return `${d.player.name} has scored ${fmt1(pts(s, f))} ${label} points in ${s.games} game${s.games === 1 ? '' : 's'} in ${d.weeksSeason} (${fmt1(ppg(s, f))} a game)${rank ? `, ${rank === 1 ? 'the most' : `#${rank}`} among ${pos}s` : ''}.${form}`;
}


// ---- Scoring rules (as nfl.points_std) ---------------------------------------------------

export const SCORING_ROWS: [string, string, string, string][] = [
  ['Reception', '0', '0.5', '1'],
  ['Passing yard', '0.04 (1 per 25)', '0.04', '0.04'],
  ['Passing touchdown', '4', '4', '4'],
  ['Interception thrown', '−2', '−2', '−2'],
  ['Rushing or receiving yard', '0.1 (1 per 10)', '0.1', '0.1'],
  ['Rushing, receiving or return touchdown', '6', '6', '6'],
  ['Two-point conversion (pass, run or catch)', '2', '2', '2'],
  ['Fumble lost', '−2', '−2', '−2'],
];

export const KICKING_ROWS: [string, string][] = [
  ['Field goal, 0–39 yards', '3'],
  ['Field goal, 40–49 yards', '4'],
  ['Field goal, 50+ yards', '5'],
  ['Missed field goal', '−1'],
  ['Extra point', '1'],
  ['Missed extra point', '−1'],
];

