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
  type IntlGroup,
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
export const FIXTURE_COLUMNS = 'fixture_key,edition_key,kickoff_utc,home_team,home_slug,away_team,away_slug,group_label,round_number,venue,home_score,away_score,match_key';
export const TEAM_COLUMNS =
  'team,slug,confederation,played,won,drawn,lost,goals_for,goals_against,first_match,last_match,elo,elo_rank,elo_peak,elo_peak_date,wc_titles,euro_titles,unl_titles';
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
  | 'intl_goals';
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
  teams: Pick<TeamSummary, 'team' | 'slug'>[];
  goals: Pick<IntlGoal, 'scorer' | 'own_goal' | 'penalty'>[];
};

export async function loadIntlTeam(slug: string): Promise<IntlTeamData | null> {
  const team = (await rows<TeamSummary>(intlView('intl_team_summary', TEAM_COLUMNS).eq('slug', slug).limit(1)))[0];
  if (!team) return null;
  const t = team.team;
  const enc = (v: string) => `"${v.replace(/"/g, '\\"')}"`;
  const [matches, fixtures, totals, pairs, editions, teams, goals] = await Promise.all([
    paged<IntlMatch>(() => intlView('intl_matches', MATCH_COLUMNS).or(`home_slug.eq.${slug},away_slug.eq.${slug}`).order('match_date', { ascending: true }).order('match_key', { ascending: true })),
    rows<IntlFixture>(intlView('intl_fixtures', FIXTURE_COLUMNS).or(`home_slug.eq.${slug},away_slug.eq.${slug}`).order('kickoff_utc', { ascending: true }).limit(50)),
    rows<CompetitionTotal>(intlView('intl_team_competition_totals', 'team,competition,competition_kind,played,won,drawn,lost,goals_for,goals_against,first_match,last_match').eq('team', t)),
    paged<PairRecord>(() => intlView('intl_pair_records', 'team_a,team_b,played,a_won,drawn,b_won,a_goals,b_goals,first_meeting,last_meeting').or(`team_a.eq.${enc(t)},team_b.eq.${enc(t)}`).order('team_a', { ascending: true }).order('team_b', { ascending: true })),
    rows<EditionSummary>(intlView('intl_edition_summary', EDITION_COLUMNS).order('season_start', { ascending: true })),
    paged<Pick<TeamSummary, 'team' | 'slug'>>(() => intlView('intl_team_summary', 'team,slug').order('team', { ascending: true })),
    paged<Pick<IntlGoal, 'scorer' | 'own_goal' | 'penalty'>>(() => intlView('intl_goals', 'scorer,own_goal,penalty').eq('team', t).eq('own_goal', false).order('match_key', { ascending: true }).order('seq', { ascending: true })),
  ]);
  return { team, matches, fixtures, totals, pairs, editions, teams, goals };
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
};

export async function loadIntlEdition(slug: string, label: string): Promise<IntlEditionData | null> {
  const t = TOURNAMENTS.find((x) => x.slug === slug);
  if (!t) return null;
  const editions = await rows<EditionSummary>(intlView('intl_edition_summary', EDITION_COLUMNS).eq('competition', t.competition).order('season_start', { ascending: true }));
  const edition = editions.find((e) => e.label === label);
  if (!edition) return null;
  const key = edition.edition_key;
  const [matches, stages, groups, fixtures] = await Promise.all([
    paged<IntlMatch>(() => intlView('intl_matches', MATCH_COLUMNS).eq('edition_key', key).order('match_date', { ascending: true }).order('match_key', { ascending: true })),
    rows<IntlStage>(intlView('intl_stages', 'stage_key,edition_key,code,name,type,stage_order').eq('edition_key', key).order('stage_order', { ascending: true })),
    rows<IntlGroup>(intlView('intl_groups', 'group_key,edition_key,stage_code,label,league,size,teams').eq('edition_key', key).order('label', { ascending: true })),
    rows<IntlFixture>(intlView('intl_fixtures', FIXTURE_COLUMNS).eq('edition_key', key).order('kickoff_utc', { ascending: true }).limit(1000)),
  ]);
  // Goals for the edition's games, in chunks (keys go in the URL).
  const goals: IntlGoal[] = [];
  const keys = matches.map((m) => m.match_key);
  for (let i = 0; i < keys.length; i += 60) {
    goals.push(...(await rows<IntlGoal>(intlView('intl_goals', 'match_key,seq,team,scorer,minute,own_goal,penalty').in('match_key', keys.slice(i, i + 60)).limit(2000))));
  }
  return { edition, matches, stages, groups, goals, fixtures, editions };
}
