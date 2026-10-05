// ============================================================================
// src/lib/intlApi.ts
//
// International football (Oct 2026): routes and loaders for the International
// pages. Reads the anon views over the intl schema (scripts/intl_import.py,
// daily): intl_matches, intl_fixtures, intl_team_summary, intl_edition_summary,
// intl_stages, intl_groups, intl_team_competition_totals, intl_pair_records,
// intl_goals.
// ============================================================================

import { supabase } from './supabase';
import {
  TOURNAMENTS,
  type CompetitionTotal,
  type EditionSummary,
  type IntlFixture,
  type IntlGoal,
  type ClubCallup,
  type ClubEloRow,
  type GroupOdds,
  type LeagueExport,
  type SquadClubStrength,
  type IntlGroup,
  type IntlSquad,
  type SquadPlayer,
  type IntlMatch,
  type IntlStage,
  type PairRecord,
  type TeamSummary,
  type TournamentSlug,
} from './intlStats';

export const INTL_HUB_PATH = '/international';
export const INTL_DISCOVER_PATH = '/international/discover';
export const INTL_FIXTURES_PATH = '/international/fixtures';
export const INTL_TEAMS_PATH = '/international/teams';
export const INTL_TOURNAMENTS_PATH = '/international/tournaments';

export const intlTeamPath = (slug: string) => `${INTL_TEAMS_PATH}/${slug}`;
export const intlTournamentPath = (slug: TournamentSlug | string) => `${INTL_TOURNAMENTS_PATH}/${slug}`;
export const intlEditionPath = (slug: TournamentSlug | string, label: string) => `${INTL_TOURNAMENTS_PATH}/${slug}/${label}`;
export const intlFixturesPath = (opts: { date?: string; team?: string } = {}) => {
  const q = new URLSearchParams();
  if (opts.team) q.set('team', opts.team);
  if (opts.date) q.set('date', opts.date);
  const s = q.toString();
  return s ? `${INTL_FIXTURES_PATH}?${s}` : INTL_FIXTURES_PATH;
};
/** Edition page for an edition key (WC-2026 -> /international/tournaments/world-cup/2026). */
export function editionPathOf(e: Pick<EditionSummary, 'competition' | 'label'>): string {
  const t = TOURNAMENTS.find((x) => x.competition === e.competition);
  return t ? intlEditionPath(t.slug, e.label) : INTL_TOURNAMENTS_PATH;
}

export const MATCH_COLUMNS =
  'match_key,match_date,home_team,home_slug,home_name,away_team,away_slug,away_name,home_score,away_score,home_score_90,away_score_90,' +
  'went_extra_time,shootout_winner,competition,competition_slug,competition_kind,edition_key,stage_code,stage_name,stage_type,group_label,matchday,' +
  'city,country,neutral,elo_home_pre,elo_away_pre,elo_change';
export const FIXTURE_COLUMNS =
  'fixture_key,edition_key,kickoff_utc,home_team,home_slug,away_team,away_slug,group_label,round_number,venue,home_score,away_score,match_key,p_home,p_draw,p_away,xg_home,xg_away,scores';
export const TEAM_COLUMNS =
  'team,slug,confederation,played,won,drawn,lost,goals_for,goals_against,first_match,last_match,elo,elo_rank,elo_peak,elo_peak_date,wc_titles,euro_titles,unl_titles,titles';
export const GROUP_ODDS_COLUMNS = 'edition_key,group_label,team,slug,played,points,gd,gf,p_pos,exp_points,sims,updated_at';
export const GROUP_ODDS_COLUMNS_ZONES = `${GROUP_ODDS_COLUMNS},zones`;
export const SQUAD_COLUMNS = 'team,slug,wiki_title,revision_at,intro,caps_as_of,players,fetched_at';
export const SQUAD_PLAYER_COLUMNS =
  'team,list,seq,number,position,player,wiki_title,birth_date,caps,goals,club,club_country,latest_date,latest_text,status,club_wiki,club_league_country,club_slug,clubelo_name,club_elo,club_elo_rank';
/** Before migration 20261005220000 the club columns don't exist: fall back to these. */
export const SQUAD_PLAYER_COLUMNS_BASIC = 'team,list,seq,number,position,player,wiki_title,birth_date,caps,goals,club,club_country,latest_date,latest_text,status';
export const EDITION_COLUMNS =
  'edition_key,competition,competition_slug,label,season_start,teams,matches,goals,hosts,winner,winner_slug,runner_up,runner_up_slug,final_key,first_match,last_match';

type Query = PromiseLike<{ data: unknown[] | null; error: unknown }> & {
  eq(column: string, value: unknown): Query;
  gte(column: string, value: unknown): Query;
  lte(column: string, value: unknown): Query;
  lt(column: string, value: unknown): Query;
  or(filter: string): Query;
  in(column: string, values: unknown[]): Query;
  not(column: string, op: string, value: unknown): Query;
  order(column: string, options?: { ascending: boolean }): Query;
  limit(n: number): Query;
  range(from: number, to: number): Query;
};
type ViewName =
  | 'intl_matches'
  | 'intl_fixtures'
  | 'intl_team_summary'
  | 'intl_edition_summary'
  | 'intl_stages'
  | 'intl_groups'
  | 'intl_team_competition_totals'
  | 'intl_pair_records'
  | 'intl_goals'
  | 'intl_team_year_elo'
  | 'intl_upsets'
  | 'intl_group_odds'
  | 'intl_squads'
  | 'intl_squad_players'
  | 'intl_club_callups'
  | 'intl_league_exports'
  | 'intl_club_elo'
  | 'intl_squad_club_strength';
/** The intl views aren't in the generated database types; a loose query shape keeps the calls readable. */
export const intlView = (view: ViewName, columns: string): Query =>
  (supabase.from(view as never) as unknown as { select(columns: string): Query }).select(columns);

async function rows<T>(q: Query): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

/** Every row of a query, 1,000 at a time (PostgREST's page size). */
async function paged<T>(make: () => Query): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await rows<T>(make().range(from, from + 999));
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

// ---- Fixtures & Results ------------------------------------------------------

export type IntlFixturesData = { from: string; to: string; matches: IntlMatch[]; fixtures: IntlFixture[]; latestResult: string | null };

/** Two calendar months: results and fixtures from the first day of `year/month` to the end of the next month. */
export function monthWindow(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, month + 2, 0));
  return { from, to: end.toISOString().slice(0, 10) };
}

export async function loadIntlFixtures(year: number, month: number): Promise<IntlFixturesData> {
  const { from, to } = monthWindow(year, month);
  const [matches, fixtures, latest] = await Promise.all([
    paged<IntlMatch>(() => intlView('intl_matches', MATCH_COLUMNS).gte('match_date', from).lte('match_date', to).order('match_date', { ascending: true }).order('match_key', { ascending: true })),
    rows<IntlFixture>(intlView('intl_fixtures', FIXTURE_COLUMNS).gte('kickoff_utc', `${from}T00:00:00Z`).lte('kickoff_utc', `${to}T23:59:59Z`).order('kickoff_utc', { ascending: true }).limit(1000)),
    rows<{ match_date: string }>(intlView('intl_matches', 'match_date').order('match_date', { ascending: false }).limit(1)),
  ]);
  return { from, to, matches, fixtures, latestResult: latest[0]?.match_date ?? null };
}

export type IntlTeamGamesData = { team: TeamSummary; matches: IntlMatch[]; fixtures: IntlFixture[] };

/** One team's latest 30 results and its coming fixtures (Fixtures & Results, ?team=). */
export async function loadIntlTeamGames(slug: string): Promise<IntlTeamGamesData | null> {
  const team = (await rows<TeamSummary>(intlView('intl_team_summary', TEAM_COLUMNS).eq('slug', slug).limit(1)))[0];
  if (!team) return null;
  const name = team.team;
  const [matches, fixtures] = await Promise.all([
    rows<IntlMatch>(intlView('intl_matches', MATCH_COLUMNS).or(`home_slug.eq.${slug},away_slug.eq.${slug}`).order('match_date', { ascending: false }).limit(30)),
    rows<IntlFixture>(intlView('intl_fixtures', FIXTURE_COLUMNS).or(`home_slug.eq.${slug},away_slug.eq.${slug}`).order('kickoff_utc', { ascending: true }).limit(50)),
  ]);
  return { team: { ...team, team: name }, matches, fixtures };
}

// ---- Teams --------------------------------------------------------------------

export async function loadIntlTeams(): Promise<TeamSummary[]> {
  return paged<TeamSummary>(() => intlView('intl_team_summary', TEAM_COLUMNS).order('team', { ascending: true }));
}

export type IntlTeamData = {
  team: TeamSummary;
  matches: IntlMatch[];
  fixtures: IntlFixture[];
  totals: CompetitionTotal[];
  pairs: PairRecord[];
  editions: EditionSummary[];
  teams: Pick<TeamSummary, 'team' | 'slug' | 'confederation'>[];
  goals: Pick<IntlGoal, 'scorer' | 'own_goal' | 'penalty'>[];
  squad: IntlSquad | null;
  squadPlayers: SquadPlayer[];
  groupOdds: GroupOdds[];
};

export async function loadIntlTeam(slug: string): Promise<IntlTeamData | null> {
  const team = (await rows<TeamSummary>(intlView('intl_team_summary', TEAM_COLUMNS).eq('slug', slug).limit(1)))[0];
  if (!team) return null;
  const t = team.team;
  const enc = (v: string) => `"${v.replace(/"/g, '\\"')}"`;
  const [matches, fixtures, totals, pairs, editions, teams, goals, squads, squadPlayers, myOdds] = await Promise.all([
    paged<IntlMatch>(() => intlView('intl_matches', MATCH_COLUMNS).or(`home_slug.eq.${slug},away_slug.eq.${slug}`).order('match_date', { ascending: true }).order('match_key', { ascending: true })),
    rows<IntlFixture>(intlView('intl_fixtures', FIXTURE_COLUMNS).or(`home_slug.eq.${slug},away_slug.eq.${slug}`).order('kickoff_utc', { ascending: true }).limit(50)),
    rows<CompetitionTotal>(intlView('intl_team_competition_totals', 'team,competition,competition_kind,played,won,drawn,lost,goals_for,goals_against,first_match,last_match').eq('team', t)),
    paged<PairRecord>(() => intlView('intl_pair_records', 'team_a,team_b,played,a_won,drawn,b_won,a_goals,b_goals,first_meeting,last_meeting').or(`team_a.eq.${enc(t)},team_b.eq.${enc(t)}`).order('team_a', { ascending: true }).order('team_b', { ascending: true })),
    rows<EditionSummary>(intlView('intl_edition_summary', EDITION_COLUMNS).order('season_start', { ascending: true })),
    paged<Pick<TeamSummary, 'team' | 'slug' | 'confederation'>>(() => intlView('intl_team_summary', 'team,slug,confederation').order('team', { ascending: true })),
    paged<Pick<IntlGoal, 'scorer' | 'own_goal' | 'penalty'>>(() => intlView('intl_goals', 'scorer,own_goal,penalty').eq('team', t).eq('own_goal', false).order('match_key', { ascending: true }).order('seq', { ascending: true })),
    rows<IntlSquad>(intlView('intl_squads', SQUAD_COLUMNS).eq('slug', slug).limit(1)).catch(() => []),
    rows<SquadPlayer>(intlView('intl_squad_players', SQUAD_PLAYER_COLUMNS).eq('slug', slug).order('list', { ascending: true }).order('seq', { ascending: true }).limit(200))
      .catch(() => rows<SquadPlayer>(intlView('intl_squad_players', SQUAD_PLAYER_COLUMNS_BASIC).eq('slug', slug).order('list', { ascending: true }).order('seq', { ascending: true }).limit(200)))
      .catch(() => []),
    rows<GroupOdds>(intlView('intl_group_odds', GROUP_ODDS_COLUMNS_ZONES).eq('slug', slug).limit(5))
      .catch(() => rows<GroupOdds>(intlView('intl_group_odds', GROUP_ODDS_COLUMNS).eq('slug', slug).limit(5)))
      .catch(() => []),
  ]);
  // The rest of this team's Nations League group, for its chances table.
  const groupOdds = myOdds[0]
    ? await rows<GroupOdds>(intlView('intl_group_odds', myOdds[0].zones !== undefined ? GROUP_ODDS_COLUMNS_ZONES : GROUP_ODDS_COLUMNS).eq('edition_key', myOdds[0].edition_key).eq('group_label', myOdds[0].group_label)).catch(() => myOdds)
    : [];
  return { team, matches, fixtures, totals, pairs, editions, teams, goals, squad: squads[0] ?? null, squadPlayers, groupOdds };
}

// ---- Tournaments -----------------------------------------------------------------

export async function loadIntlEditions(): Promise<EditionSummary[]> {
  return rows<EditionSummary>(intlView('intl_edition_summary', EDITION_COLUMNS).order('season_start', { ascending: false }));
}

export type IntlEditionData = {
  edition: EditionSummary;
  matches: IntlMatch[];
  stages: IntlStage[];
  groups: IntlGroup[];
  goals: IntlGoal[];
  fixtures: IntlFixture[];
  editions: EditionSummary[];
  groupOdds: GroupOdds[];
};

export async function loadIntlEdition(slug: string, label: string): Promise<IntlEditionData | null> {
  const t = TOURNAMENTS.find((x) => x.slug === slug);
  if (!t) return null;
  const editions = await rows<EditionSummary>(intlView('intl_edition_summary', EDITION_COLUMNS).eq('competition', t.competition).order('season_start', { ascending: true }));
  const edition = editions.find((e) => e.label === label);
  if (!edition) return null;
  const key = edition.edition_key;
  const [matches, stages, groups, fixtures, groupOdds] = await Promise.all([
    paged<IntlMatch>(() => intlView('intl_matches', MATCH_COLUMNS).eq('edition_key', key).order('match_date', { ascending: true }).order('match_key', { ascending: true })),
    rows<IntlStage>(intlView('intl_stages', 'stage_key,edition_key,code,name,type,stage_order').eq('edition_key', key).order('stage_order', { ascending: true })),
    rows<IntlGroup>(intlView('intl_groups', 'group_key,edition_key,stage_code,label,league,size,teams').eq('edition_key', key).order('label', { ascending: true })),
    rows<IntlFixture>(intlView('intl_fixtures', FIXTURE_COLUMNS).eq('edition_key', key).order('kickoff_utc', { ascending: true }).limit(1000)),
    rows<GroupOdds>(intlView('intl_group_odds', GROUP_ODDS_COLUMNS_ZONES).eq('edition_key', key).limit(200))
      .catch(() => rows<GroupOdds>(intlView('intl_group_odds', GROUP_ODDS_COLUMNS).eq('edition_key', key).limit(200)))
      .catch(() => [] as GroupOdds[]),
  ]);
  // Goals for the edition's games, in chunks (keys go in the URL).
  const goals: IntlGoal[] = [];
  const keys = matches.map((m) => m.match_key);
  for (let i = 0; i < keys.length; i += 60) {
    goals.push(...(await rows<IntlGoal>(intlView('intl_goals', 'match_key,seq,team,scorer,minute,own_goal,penalty').in('match_key', keys.slice(i, i + 60)).limit(2000))));
  }
  return { edition, matches, stages, groups, goals, fixtures, editions, groupOdds };
}

// ---- History: the Elo race, titles and upsets --------------------------------------

export const INTL_HISTORY_PATH = '/international/history';

export type YearElo = { team: string; slug: string; name: string; confederation: string | null; year: number; elo: number; rank: number };
export type IntlUpset = IntlMatch & { expectation: number };
export type IntlHistoryData = { years: YearElo[]; upsets: IntlUpset[]; editions: EditionSummary[] };

const MAJOR = TOURNAMENTS.map((t) => t.competition);

/** The top 10 each year since 1872, the biggest upsets at the major tournaments, and every edition. */
export async function loadIntlHistory(): Promise<IntlHistoryData> {
  const [years, upsets, editions] = await Promise.all([
    paged<YearElo>(() => intlView('intl_team_year_elo', 'team,slug,name,confederation,year,elo,rank').lte('rank', 10).order('year', { ascending: true }).order('rank', { ascending: true })),
    rows<IntlUpset>(intlView('intl_upsets', `expectation,${MATCH_COLUMNS}`).in('competition', MAJOR).order('expectation', { ascending: true }).limit(40)),
    loadIntlEditions(),
  ]);
  return { years, upsets, editions };
}

// ---- Club call-ups: where the internationals play ------------------------------------

export const INTL_CLUBS_PATH = '/international/clubs';

export type IntlClubsData = { clubs: ClubCallup[]; leagues: LeagueExport[]; strength: SquadClubStrength[]; elo: ClubEloRow[] };

export async function loadIntlClubs(): Promise<IntlClubsData> {
  const [clubs, leagues, strength, elo] = await Promise.all([
    rows<ClubCallup>(intlView('intl_club_callups', 'club_key,club,league_country,club_slug,club_elo,club_elo_rank,players,nations,callups').order('players', { ascending: false }).limit(150)),
    rows<LeagueExport>(intlView('intl_league_exports', 'league_country,players,nations,clubs,foreign_players').order('players', { ascending: false }).limit(250)),
    paged<SquadClubStrength>(() => intlView('intl_squad_club_strength', 'team,slug,confederation,players,at_home,abroad,rated,avg_club_elo,league_countries').order('team', { ascending: true })),
    rows<ClubEloRow>(intlView('intl_club_elo', 'club,country,level,elo,rank,club_slug,fetched_on,internationals').order('rank', { ascending: true }).limit(100)),
  ]);
  return { clubs, leagues, strength, elo };
}
