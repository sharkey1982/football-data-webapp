// ============================================================================
// src/lib/nflApi.ts
//
// NFL section (phase 1, Oct 2026): schedule and results, standings, team
// pages. Reads public.nfl_teams / nfl_games / nfl_standings, which sit over
// the nfl schema loaded daily from nflverse (scripts/nfl_import.py; seasons
// from 2002, the current 32-team alignment).
//
// The same loaders feed the browser; the pure builders below also feed the
// static generator, which fetches in bulk and passes the rows in.
// ============================================================================

import { supabase } from './supabase';
import type { NflSeasonSummary } from './nflStory';

export const NFL_FIRST_SEASON = 2002;

export type NflTeam = {
  franchise: string;
  slug: string;
  name: string;
  short_name: string;
  conference: 'AFC' | 'NFC';
  division: 'East' | 'North' | 'South' | 'West';
};

export type NflGameType = 'REG' | 'WC' | 'DIV' | 'CON' | 'SB';

export type NflGame = {
  game_id: string;
  season: number;
  game_type: NflGameType;
  week: number;
  gameday: string;
  kickoff_at: string | null;
  home_franchise: string;
  home_slug: string;
  home_name: string;
  home_short: string;
  away_franchise: string;
  away_slug: string;
  away_name: string;
  away_short: string;
  home_score: number | null;
  away_score: number | null;
  overtime: boolean | null;
  neutral_site: boolean;
  div_game: boolean;
  spread_line: number | null;
  total_line: number | null;
  stadium: string | null;
};

/** The model's pre-kick-off prediction for a game (Elo, experiment N1) and
 * the market at that moment. Only predictions made before kick-off exist. */
export type NflGameModel = {
  game_id: string;
  predicted_at: string;
  p_home: number;
  predicted_margin: number;
  market_p_home: number | null;
};
export const MODEL_COLUMNS = 'game_id,predicted_at,p_home,predicted_margin,market_p_home';

/** "KC 64%": the side the probability favours, from a home-win probability. */
export function favourLabel(g: Pick<NflGame, 'home_franchise' | 'away_franchise'>, pHome: number): string {
  const p = Number(pHome);
  return p >= 0.5 ? `${g.home_franchise} ${Math.round(p * 100)}%` : `${g.away_franchise} ${Math.round((1 - p) * 100)}%`;
}

export type NflStanding = {
  season: number;
  franchise: string;
  slug: string;
  team_name: string;
  short_name: string;
  conference: 'AFC' | 'NFC';
  division: 'East' | 'North' | 'South' | 'West';
  played: number;
  won: number;
  lost: number;
  tied: number;
  win_pct: number | null;
  points_for: number;
  points_against: number;
  point_diff: number;
  home_won: number;
  home_lost: number;
  away_won: number;
  away_lost: number;
  div_won: number;
  div_lost: number;
  div_tied: number;
  conf_won: number;
  conf_lost: number;
  playoff_result: string | null;
  playoff_round: number;
  season_complete: boolean;
  /** Ranks the real division winner (from the play-off bracket) first in
   * completed seasons; otherwise win %, division win %, points difference. */
  division_rank: number;
  /** Division champion, from the play-off bracket. Null until the season is complete. */
  won_division: boolean | null;
};

export const GAME_COLUMNS =
  'game_id,season,game_type,week,gameday,kickoff_at,home_franchise,home_slug,home_name,home_short,away_franchise,away_slug,away_name,away_short,home_score,away_score,overtime,neutral_site,div_game,spread_line,total_line,stadium';
export const STANDING_COLUMNS =
  'season,franchise,slug,team_name,short_name,conference,division,played,won,lost,tied,win_pct,points_for,points_against,point_diff,home_won,home_lost,away_won,away_lost,div_won,div_lost,div_tied,conf_won,conf_lost,playoff_result,playoff_round,season_complete,division_rank,won_division';
export const TEAM_COLUMNS = 'franchise,slug,name,short_name,conference,division';

export const CONFERENCES = ['AFC', 'NFC'] as const;
export const DIVISIONS = ['East', 'North', 'South', 'West'] as const;

// ---- Paths -----------------------------------------------------------------

// Mirrors the football section: hub, Fixtures & Results, TV Guide, League
// Table, Your Team, Past seasons -- and Fantasy's Player Scout, Fixture Heat
// Map and Scoring Rules.
export const NFL_HUB_PATH = '/nfl';
export const NFL_FIXTURES_PATH = '/nfl/fixtures';
export const NFL_TV_PATH = '/nfl/tv-guide';
export const NFL_TABLE_PATH = '/nfl/table';
export const NFL_TEAMS_PATH = '/nfl/teams';
export const NFL_SEASONS_PATH = '/nfl/seasons';
export const NFL_PLAYERS_PATH = '/nfl/players';
export const NFL_HEAT_MAP_PATH = '/nfl/fixture-heat-map';
export const NFL_SCORING_PATH = '/nfl/scoring-rules';
export const nflSeasonPath = (season: number) => `${NFL_SEASONS_PATH}/${season}`;
export const nflTablePath = (season?: number) => (season == null ? NFL_TABLE_PATH : `${NFL_TABLE_PATH}?season=${season}`);
export const nflFixturesPath = (season?: number, week?: number) =>
  season == null ? NFL_FIXTURES_PATH : `${NFL_FIXTURES_PATH}?season=${season}${week != null ? `&week=${week}` : ''}`;
export const nflTeamPath = (slug: string) => `${NFL_TEAMS_PATH}/${slug}`;
export const nflPlayerPath = (slug: string) => `${NFL_PLAYERS_PATH}/${slug}`;

// ---- Formatting ------------------------------------------------------------

/** "2026 season": an NFL season is named by the year it kicks off. */
export const seasonLabel = (season: number) => `${season} season`;

export function weekLabel(gameType: NflGameType, week: number): string {
  switch (gameType) {
    case 'WC':
      return 'Wild card round';
    case 'DIV':
      return 'Divisional round';
    case 'CON':
      return 'Conference championships';
    case 'SB':
      return 'Super Bowl';
    default:
      return `Week ${week}`;
  }
}

const UK_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });
const UK_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });

/** Kick-off in UK time, e.g. "Sun 4 Oct, 18:00". Falls back to the US date
 * when the time is not yet published. */
export function ukKickoff(g: Pick<NflGame, 'kickoff_at' | 'gameday'>): string {
  if (!g.kickoff_at) return UK_DAY.format(new Date(`${g.gameday}T12:00:00Z`));
  const d = new Date(g.kickoff_at);
  return `${UK_DAY.format(d)}, ${UK_TIME.format(d)}`;
}

const UK_ISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });

/** UK calendar date of a game as 'YYYY-MM-DD' (the calendar's key). A game
 * with no kick-off time yet falls on its US date. */
export function ukDateKey(g: Pick<NflGame, 'kickoff_at' | 'gameday'>): string {
  return g.kickoff_at ? UK_ISO.format(new Date(g.kickoff_at)) : g.gameday;
}

/** UK calendar day of a game, for grouping a week's games by day. */
export function ukDay(g: Pick<NflGame, 'kickoff_at' | 'gameday'>): string {
  return g.kickoff_at ? UK_DAY.format(new Date(g.kickoff_at)) : UK_DAY.format(new Date(`${g.gameday}T12:00:00Z`));
}

/** "KC -3.5" (favourite first, as quoted), "Pick'em" at 0. nflverse's
 * spread_line is positive when the HOME side is favoured. */
export function lineLabel(g: Pick<NflGame, 'spread_line' | 'home_franchise' | 'away_franchise'>): string | null {
  if (g.spread_line == null) return null;
  if (g.spread_line === 0) return "Pick'em";
  const fav = g.spread_line > 0 ? g.home_franchise : g.away_franchise;
  return `${fav} −${Math.abs(g.spread_line)}`;
}

export function recordLabel(r: Pick<NflStanding, 'won' | 'lost' | 'tied'>): string {
  return r.tied > 0 ? `${r.won}-${r.lost}-${r.tied}` : `${r.won}-${r.lost}`;
}

export function pctLabel(p: number | null): string {
  if (p == null) return '–';
  return p >= 1 ? '1.000' : p.toFixed(3).replace(/^0/, '');
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const played = (g: NflGame) => g.home_score != null && g.away_score != null;

// ---- Hub: one week of one season --------------------------------------------

export type NflWeekRef = { week: number; game_type: NflGameType; label: string };

export type NflWeekData = {
  season: number;
  seasons: number[];
  week: number;
  weeks: NflWeekRef[];
  games: NflGame[];
  /** The week the season is on (first week with an unplayed game). */
  currentWeek: number;
  /** Every franchise, for the teams directory under the schedule. */
  teams: NflTeam[];
  /** The whole season, for the calendar. */
  seasonGames: NflGame[];
  /** Model predictions by game_id (only games predicted before kick-off). */
  model: Record<string, NflGameModel>;
};

export function buildWeek(season: number, seasons: number[], seasonGames: NflGame[], week: number | null, teams: NflTeam[], model: NflGameModel[] = []): NflWeekData | null {
  if (seasonGames.length === 0) return null;
  const byWeek = new Map<number, NflWeekRef>();
  for (const g of seasonGames) if (!byWeek.has(g.week)) byWeek.set(g.week, { week: g.week, game_type: g.game_type, label: weekLabel(g.game_type, g.week) });
  const weeks = [...byWeek.values()].sort((a, b) => a.week - b.week);
  const unplayed = seasonGames.filter((g) => !played(g)).map((g) => g.week);
  const currentWeek = unplayed.length > 0 ? Math.min(...unplayed) : weeks[weeks.length - 1].week;
  const chosen = week != null && byWeek.has(week) ? week : currentWeek;
  const games = seasonGames
    .filter((g) => g.week === chosen)
    .sort((a, b) => (a.kickoff_at ?? a.gameday).localeCompare(b.kickoff_at ?? b.gameday) || a.game_id.localeCompare(b.game_id));
  return { season, seasons, week: chosen, weeks, games, currentWeek, teams, seasonGames, model: Object.fromEntries(model.map((m) => [m.game_id, m])) };
}

/** One plain sentence about the week, for the page and its description. */
export function weekSentence(d: NflWeekData): string {
  const ref = d.weeks.find((w) => w.week === d.week);
  const label = ref ? ref.label : `Week ${d.week}`;
  const done = d.games.filter(played);
  const intl = d.games.filter((g) => g.neutral_site && g.stadium).map((g) => `${g.away_short} v ${g.home_short} at ${g.stadium}`);
  const intlText = intl.length > 0 ? ` Neutral-site game${intl.length > 1 ? 's' : ''}: ${intl.join('; ')}.` : '';
  if (done.length === d.games.length) {
    const biggest = [...done].sort((a, b) => Math.abs(b.home_score! - b.away_score!) - Math.abs(a.home_score! - a.away_score!))[0];
    const winner = biggest.home_score! > biggest.away_score! ? biggest.home_name : biggest.away_name;
    const hi = Math.max(biggest.home_score!, biggest.away_score!);
    const lo = Math.min(biggest.home_score!, biggest.away_score!);
    const margin = hi === lo ? '' : ` The widest margin: the ${winner} won ${hi}-${lo}.`;
    if (d.games.length === 1) {
      const g = d.games[0];
      const w = g.home_score! > g.away_score! ? g.home_name : g.away_name;
      const l = g.home_score! > g.away_score! ? g.away_name : g.home_name;
      const score = `${Math.max(g.home_score!, g.away_score!)}-${Math.min(g.home_score!, g.away_score!)}`;
      return g.home_score === g.away_score
        ? `${label} of the ${d.season} NFL season: ${g.away_name} and ${g.home_name} tied ${score}.${intlText}`
        : `${label} of the ${d.season} NFL season: the ${w} beat the ${l} ${score}${g.overtime ? ' in overtime' : ''}.${intlText}`;
    }
    return `${label} of the ${d.season} NFL season: all ${d.games.length} games played.${margin}${intlText}`;
  }
  if (done.length === 0) return `${label} of the ${d.season} NFL season: ${d.games.length} game${d.games.length === 1 ? '' : 's'}, kick-off times in UK time.${intlText}`;
  return `${label} of the ${d.season} NFL season: ${done.length} of ${d.games.length} games played, kick-off times in UK time.${intlText}`;
}

// ---- Standings ---------------------------------------------------------------

export type NflStandingsData = {
  season: number;
  seasons: number[];
  rows: NflStanding[];
};

export function divisionRows(rows: NflStanding[], conference: string, division: string): NflStanding[] {
  return rows
    .filter((r) => r.conference === conference && r.division === division)
    .sort((a, b) => a.division_rank - b.division_rank || a.team_name.localeCompare(b.team_name));
}

export function standingsSentence(d: NflStandingsData): string {
  if (d.rows.length === 0) return `${d.season} NFL standings.`;
  const complete = d.rows[0].season_complete;
  const champion = d.rows.find((r) => r.playoff_result === 'Won Super Bowl');
  const best = [...d.rows].sort((a, b) => (b.win_pct ?? 0) - (a.win_pct ?? 0) || b.point_diff - a.point_diff)[0];
  if (complete && champion) {
    const runnerUp = d.rows.find((r) => r.playoff_result === 'Lost Super Bowl');
    return `The ${champion.team_name} won the Super Bowl after the ${d.season} season${runnerUp ? `, beating the ${runnerUp.team_name}` : ''}. Best regular-season record: the ${best.team_name}, ${recordLabel(best)}.`;
  }
  const tied = d.rows.filter((r) => r.win_pct === best.win_pct);
  const names = tied.map((r) => `the ${r.team_name}`);
  const who = names.length <= 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${d.season} NFL standings so far: ${who} ${tied.length > 1 ? 'share' : 'have'} the best record at ${recordLabel(best)}.`;
}

// ---- Team ----------------------------------------------------------------------

export type NflTeamData = {
  team: NflTeam;
  /** Every season from 2002, newest first. */
  history: NflStanding[];
  /** The latest season's games involving the team. */
  season: number;
  games: NflGame[];
};

export function buildTeam(team: NflTeam, standings: NflStanding[], latestGames: NflGame[], latestSeason: number): NflTeamData {
  return {
    team,
    history: standings.filter((s) => s.franchise === team.franchise).sort((a, b) => b.season - a.season),
    season: latestSeason,
    games: latestGames
      .filter((g) => g.home_franchise === team.franchise || g.away_franchise === team.franchise)
      .sort((a, b) => a.week - b.week),
  };
}

export function teamSentence(d: NflTeamData): string {
  const done = d.history.filter((h) => h.season_complete);
  const titles = done.filter((h) => h.playoff_result === 'Won Super Bowl').map((h) => h.season).sort((a, b) => a - b);
  const playoffs = done.filter((h) => h.playoff_round > 0).length;
  const divTitles = done.filter((h) => h.won_division).length;
  const now = d.history.find((h) => h.season === d.season);
  const titleText =
    titles.length === 0 ? 'no Super Bowl wins' : titles.length === 1 ? `one Super Bowl win (${titles[0]} season)` : `${titles.length} Super Bowl wins (${titles.join(', ')} seasons)`;
  const nowText = now ? ` In ${d.season} they are ${recordLabel(now)}, ${ordinal(now.division_rank)} in the ${now.conference} ${now.division}.` : '';
  return `Since ${NFL_FIRST_SEASON} the ${d.team.name} have reached the play-offs in ${playoffs} of ${done.length} completed seasons, won their division ${divTitles} time${divTitles === 1 ? '' : 's'} and have ${titleText}.${nowText}`;
}

/** The team's regular-season weeks with no game (bye weeks), from the
 * season's week numbers it does play in. */
export function byeWeeks(games: NflGame[]): number[] {
  const reg = games.filter((g) => g.game_type === 'REG').map((g) => g.week);
  if (reg.length === 0) return [];
  const last = Math.max(...reg);
  const have = new Set(reg);
  const out: number[] = [];
  for (let w = 1; w <= last; w++) if (!have.has(w)) out.push(w);
  return out;
}

/** Result letter and score from the team's side. */
export function teamResult(g: NflGame, franchise: string): { letter: 'W' | 'L' | 'T' | null; score: string | null; home: boolean; opponent: string; opponentSlug: string } {
  const home = g.home_franchise === franchise;
  const opponent = home ? g.away_name : g.home_name;
  const opponentSlug = home ? g.away_slug : g.home_slug;
  if (!played(g)) return { letter: null, score: null, home, opponent, opponentSlug };
  const us = home ? g.home_score! : g.away_score!;
  const them = home ? g.away_score! : g.home_score!;
  return { letter: us > them ? 'W' : us < them ? 'L' : 'T', score: `${us}-${them}${g.overtime ? ' (OT)' : ''}`, home, opponent, opponentSlug };
}

// ---- Loaders (browser) -------------------------------------------------------------

/** Seasons are contiguous from 2002 to the latest season with a schedule. */
export function seasonRange(latest: number): number[] {
  const out: number[] = [];
  for (let s = NFL_FIRST_SEASON; s <= latest; s++) out.push(s);
  return out;
}

async function loadLatestSeason(): Promise<number | null> {
  const { data, error } = await supabase.from('nfl_games' as never).select('season').order('season', { ascending: false }).limit(1);
  if (error) throw error;
  return ((data ?? []) as { season: number }[])[0]?.season ?? null;
}

async function loadSeasons(): Promise<number[]> {
  const latest = await loadLatestSeason();
  return latest == null ? [] : seasonRange(latest);
}

async function loadSeasonGames(season: number): Promise<NflGame[]> {
  const { data, error } = await supabase.from('nfl_games' as never).select(GAME_COLUMNS).eq('season', season).order('week').limit(1000);
  if (error) throw error;
  return (data ?? []) as unknown as NflGame[];
}

async function loadSeasonModel(season: number): Promise<NflGameModel[]> {
  // The model is an extra: if it can't be read, the fixtures still show.
  const { data, error } = await supabase.from('nfl_game_model' as never).select(MODEL_COLUMNS).like('game_id', `${season}_%`).limit(1000);
  if (error) return [];
  return (data ?? []) as unknown as NflGameModel[];
}

export async function loadNflWeek(season: number | null, week: number | null): Promise<NflWeekData | null> {
  const seasons = await loadSeasons();
  if (seasons.length === 0) return null;
  const s = season != null && seasons.includes(season) ? season : seasons[seasons.length - 1];
  const [games, teams, model] = await Promise.all([loadSeasonGames(s), loadNflTeams(), loadSeasonModel(s)]);
  return buildWeek(s, seasons, games, week, teams, model);
}

export async function loadNflStandings(season: number): Promise<NflStandingsData | null> {
  const [seasons, res] = await Promise.all([
    loadSeasons(),
    supabase.from('nfl_standings' as never).select(STANDING_COLUMNS).eq('season', season),
  ]);
  if (res.error) throw res.error;
  const rows = (res.data ?? []) as unknown as NflStanding[];
  if (rows.length === 0) return null;
  return { season, seasons, rows };
}

export const loadLatestNflSeason = loadLatestSeason;

export async function loadNflTeam(slug: string): Promise<NflTeamData | null> {
  const { data: teamRows, error } = await supabase.from('nfl_teams' as never).select(TEAM_COLUMNS).eq('slug', slug);
  if (error) throw error;
  const team = ((teamRows ?? []) as unknown as NflTeam[])[0];
  if (!team) return null;
  const seasons = await loadSeasons();
  const latest = seasons[seasons.length - 1];
  const [hist, games] = await Promise.all([
    supabase.from('nfl_standings' as never).select(STANDING_COLUMNS).eq('franchise', team.franchise),
    supabase
      .from('nfl_games' as never)
      .select(GAME_COLUMNS)
      .eq('season', latest)
      .or(`home_franchise.eq.${team.franchise},away_franchise.eq.${team.franchise}`),
  ]);
  if (hist.error) throw hist.error;
  if (games.error) throw games.error;
  return buildTeam(team, (hist.data ?? []) as unknown as NflStanding[], (games.data ?? []) as unknown as NflGame[], latest);
}

export async function loadNflTeams(): Promise<NflTeam[]> {
  const { data, error } = await supabase.from('nfl_teams' as never).select(TEAM_COLUMNS).order('name');
  if (error) throw error;
  return (data ?? []) as unknown as NflTeam[];
}

// ---- Seasons (Past seasons and one season's story) -------------------------------------


export type NflSeasonData = {
  season: number;
  seasons: number[];
  rows: NflStanding[];
  games: NflGame[];
  summaries: NflSeasonSummary[];
};

export type NflSeasonIndexData = { standings: NflStanding[]; summaries: NflSeasonSummary[] };

const SUMMARY_SELECT =
  'season,reg_games,reg_played,points_per_game,home_win_share,one_score_share,overtime_games,ties,favourite_win_share,neutral_games';

async function loadSummaries(): Promise<NflSeasonSummary[]> {
  const { data, error } = await supabase.from('nfl_season_summary' as never).select(SUMMARY_SELECT).order('season');
  if (error) throw error;
  return (data ?? []) as unknown as NflSeasonSummary[];
}

export async function loadNflSeason(season: number): Promise<NflSeasonData | null> {
  const [seasons, st, games, summaries] = await Promise.all([
    loadSeasons(),
    supabase.from('nfl_standings' as never).select(STANDING_COLUMNS).eq('season', season),
    loadSeasonGames(season),
    loadSummaries(),
  ]);
  if (st.error) throw st.error;
  const rows = (st.data ?? []) as unknown as NflStanding[];
  if (rows.length === 0) return null;
  return { season, seasons, rows, games, summaries };
}

export async function loadNflSeasonIndex(): Promise<NflSeasonIndexData> {
  const [summaries, standings] = await Promise.all([loadSummaries(), loadAllStandings()]);
  return { standings, summaries };
}

async function loadAllStandings(): Promise<NflStanding[]> {
  const out: NflStanding[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('nfl_standings' as never).select(STANDING_COLUMNS).order('season').order('franchise').range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as NflStanding[]));
    if ((data ?? []).length < 1000) return out;
  }
}

// ---- TV Guide ------------------------------------------------------------------------------

export type NflUpcomingData = { season: number; games: NflGame[]; model: Record<string, NflGameModel> };

/** Unplayed games from four hours ago (games in progress) to `days` ahead, soonest first. */
export function upcomingGames(seasonGames: NflGame[], now: Date, days = 400): NflGame[] {
  const from = now.getTime() - 4 * 3600 * 1000;
  const to = now.getTime() + days * 86400 * 1000;
  return seasonGames
    .filter((g) => g.home_score == null && g.kickoff_at && new Date(g.kickoff_at).getTime() >= from && new Date(g.kickoff_at).getTime() <= to)
    .sort((a, b) => a.kickoff_at!.localeCompare(b.kickoff_at!));
}

/** The rest of the season, for the TV Guide (as the football guide lists every upcoming fixture). */
export async function loadNflUpcoming(): Promise<NflUpcomingData | null> {
  const seasons = await loadSeasons();
  if (seasons.length === 0) return null;
  const season = seasons[seasons.length - 1];
  const [games, model] = await Promise.all([loadSeasonGames(season), loadSeasonModel(season)]);
  return { season, games: upcomingGames(games, new Date()), model: Object.fromEntries(model.map((m) => [m.game_id, m])) };
}
