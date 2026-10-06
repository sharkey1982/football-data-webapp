// ============================================================================
// International pages from one bulk read, for the static build.
//
// loadIntlTeam / loadIntlEdition (intlApi.ts) make ~10 requests per page in
// the browser. The static build writes ~420 of these pages, so it reads each
// view ONCE (scripts/generate-static.mjs, writeIntlPages) and these functions
// cut out each page's data with the same filters and order as the loaders,
// so the pre-rendered page matches what the browser then shows.
// ============================================================================

import type { IntlEditionData, IntlTeamData } from './intlApi';
import {
  TOURNAMENTS,
  type CompetitionTotal,
  type EditionSummary,
  type GroupOdds,
  type IntlFixture,
  type IntlGoal,
  type IntlGroup,
  type IntlMatch,
  type IntlSquad,
  type IntlStage,
  type PairRecord,
  type SquadPlayer,
  type TeamSummary,
} from './intlStats';

export type IntlBulk = {
  teams: TeamSummary[];
  matches: IntlMatch[];
  fixtures: IntlFixture[];
  totals: CompetitionTotal[];
  pairs: PairRecord[];
  editions: EditionSummary[];
  goals: IntlGoal[];
  squads: IntlSquad[];
  squadPlayers: (SquadPlayer & { slug: string })[];
  groupOdds: GroupOdds[];
  stages: IntlStage[];
  groups: IntlGroup[];
};

/** The columns the static build reads for each bulk view (goals: every column
 * the edition page needs; the team page uses three of them). */
export const INTL_BULK_GOAL_COLUMNS = 'match_key,seq,team,scorer,minute,own_goal,penalty';
export const INTL_BULK_STAGE_COLUMNS = 'stage_key,edition_key,code,name,type,stage_order';
export const INTL_BULK_GROUP_COLUMNS = 'group_key,edition_key,stage_code,label,league,size,teams';
export const INTL_BULK_TOTAL_COLUMNS = 'team,competition,competition_kind,played,won,drawn,lost,goals_for,goals_against,first_match,last_match';
export const INTL_BULK_PAIR_COLUMNS = 'team_a,team_b,played,a_won,drawn,b_won,a_goals,b_goals,first_meeting,last_meeting';

const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);
const byMatch = (a: IntlMatch, b: IntlMatch) => cmp(a.match_date, b.match_date) || cmp(a.match_key, b.match_key);
const byEdition = (a: EditionSummary, b: EditionSummary) => cmp(a.season_start, b.season_start);
const byGoal = (a: IntlGoal, b: IntlGoal) => cmp(a.match_key, b.match_key) || cmp(a.seq, b.seq);

export function intlTeamFromBulk(bulk: IntlBulk, slug: string): IntlTeamData | null {
  const team = bulk.teams.find((t) => t.slug === slug);
  if (!team) return null;
  const t = team.team;
  const matches = bulk.matches.filter((m) => m.home_slug === slug || m.away_slug === slug).sort(byMatch);
  const fixtures = bulk.fixtures
    .filter((f) => f.home_slug === slug || f.away_slug === slug)
    .sort((a, b) => cmp(a.kickoff_utc, b.kickoff_utc))
    .slice(0, 50);
  const totals = bulk.totals.filter((r) => r.team === t);
  const pairs = bulk.pairs.filter((p) => p.team_a === t || p.team_b === t).sort((a, b) => cmp(a.team_a, b.team_a) || cmp(a.team_b, b.team_b));
  const editions = [...bulk.editions].sort(byEdition);
  const teams = bulk.teams.map((x) => ({ team: x.team, slug: x.slug, confederation: x.confederation })).sort((a, b) => cmp(a.team, b.team));
  const goals = bulk.goals
    .filter((g) => g.team === t && !g.own_goal)
    .sort(byGoal)
    .map((g) => ({ scorer: g.scorer, own_goal: g.own_goal, penalty: g.penalty }));
  const squad = bulk.squads.find((s) => s.slug === slug) ?? null;
  const squadPlayers = bulk.squadPlayers
    .filter((p) => p.slug === slug)
    .sort((a, b) => cmp(a.list, b.list) || cmp(a.seq, b.seq))
    .slice(0, 200);
  const mine = bulk.groupOdds.filter((o) => o.slug === slug).slice(0, 5);
  const groupOdds = mine[0] ? bulk.groupOdds.filter((o) => o.edition_key === mine[0].edition_key && o.group_label === mine[0].group_label) : [];
  // Squad history (squad watch, #238) is left to the browser: the static page
  // shows the current squad, and the history loads once the page runs.
  return { team, matches, fixtures, totals, pairs, editions, teams, goals, squad, squadPlayers, groupOdds, squadVersions: [], snapshotPlayers: [] };
}

export function intlEditionFromBulk(bulk: IntlBulk, slug: string, label: string): IntlEditionData | null {
  const t = TOURNAMENTS.find((x) => x.slug === slug);
  if (!t) return null;
  const editions = bulk.editions.filter((e) => e.competition === t.competition).sort(byEdition);
  const edition = editions.find((e) => e.label === label);
  if (!edition) return null;
  const key = edition.edition_key;
  const matches = bulk.matches.filter((m) => m.edition_key === key).sort(byMatch);
  const keys = new Set(matches.map((m) => m.match_key));
  return {
    edition,
    matches,
    stages: bulk.stages.filter((s) => s.edition_key === key).sort((a, b) => a.stage_order - b.stage_order),
    groups: bulk.groups.filter((g) => g.edition_key === key).sort((a, b) => cmp(a.label, b.label)),
    goals: bulk.goals.filter((g) => keys.has(g.match_key)).sort(byGoal),
    fixtures: bulk.fixtures.filter((f) => f.edition_key === key).sort((a, b) => cmp(a.kickoff_utc, b.kickoff_utc)),
    editions,
    groupOdds: bulk.groupOdds.filter((o) => o.edition_key === key),
  };
}
