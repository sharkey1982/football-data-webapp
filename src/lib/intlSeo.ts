// ============================================================================
// Titles, descriptions and breadcrumbs for the international detail pages.
//
// Shared by the pages (useDocumentHead, in the browser) and the static build
// (scripts/generate-static.mjs writes each nation, tournament and edition
// page's <head> so crawlers see the right title and canonical before any
// JavaScript runs). Keep the two in step by using only these.
// ============================================================================

import type { RouteMeta } from './routeMeta';
import { intlEditionPath, intlTeamPath, intlTournamentPath, INTL_TEAMS_PATH, INTL_TOURNAMENTS_PATH } from './intlApi';
import { editionLabel, type EditionSummary, type TeamSummary, type Tournament } from './intlStats';

const INTERNATIONAL = { name: 'International', path: '/international' };

/** Nations with fewer games than this get no static page and no sitemap
 * entry: a handful of results is a thin page (the browser still shows it). */
export const INTL_STATIC_TEAM_MIN_GAMES = 30;

export function intlTeamHead(t: Pick<TeamSummary, 'team' | 'slug' | 'played' | 'won' | 'first_match' | 'elo' | 'elo_rank'>): RouteMeta {
  return {
    path: intlTeamPath(t.slug),
    title: `${t.team} national team: record, rating and tournament history`,
    description: `${t.team}: played ${t.played}, won ${t.won} since ${t.first_match.slice(0, 4)}; Elo ${Math.round(t.elo)}${t.elo_rank ? ` (ranked ${t.elo_rank})` : ''}; World Cup, Euro and Nations League history and head-to-heads.`,
    crumbs: [INTERNATIONAL, { name: 'Your Team', path: INTL_TEAMS_PATH }],
  };
}

export function intlTournamentHead(t: Pick<Tournament, 'competition' | 'slug'>): RouteMeta {
  return {
    path: intlTournamentPath(t.slug),
    title: `Every ${t.competition}: winners, hosts and results`,
    description: `Every ${t.competition} edition with its hosts, winner and runner-up, the roll of honour, and each edition's groups, knockouts and scorers.`,
    crumbs: [INTERNATIONAL, { name: 'Tournaments', path: INTL_TOURNAMENTS_PATH }],
  };
}

/** finalScore is the final's score text when known ("2-1"); the static build has none. */
export function intlEditionHead(
  t: Pick<Tournament, 'competition' | 'slug' | 'short'>,
  e: Pick<EditionSummary, 'label' | 'winner' | 'runner_up'>,
  finalScore?: string | null,
): RouteMeta {
  const name = `${t.competition} ${editionLabel(e.label)}`;
  return {
    path: intlEditionPath(t.slug, e.label),
    title: `${name}: results, groups and scorers`,
    description: e.winner
      ? `${name}: ${e.winner} beat ${e.runner_up ?? 'the runners-up'}${finalScore ? ` ${finalScore} in the final` : ''}. Every group, knockout round, scorer and upset.`
      : `${name}: every group, fixture and result.`,
    crumbs: [INTERNATIONAL, { name: 'Tournaments', path: INTL_TOURNAMENTS_PATH }, { name: t.short, path: intlTournamentPath(t.slug) }],
  };
}
