// ============================================================================
// scripts/lib/sitemapPolicy.mjs
//
// Which pages of a family go in the sitemap, as plain functions so
// scripts/generate-sitemap.mjs and the tests (src/__tests__/sitemapPolicy.test.ts)
// read one definition. docs/seo-indexation.md has the policy and the reasons.
//
// 29 Oct 2026 (Search Console: 7,859 URLs "Discovered - currently not
// indexed", impressions down from ~200 to ~10 a day): the sitemap listed
// ~9,600 URLs, most of them long-tail archive pages Google chose not to
// crawl. These rules keep the pages people search for. Every page dropped
// here stays on the site, indexable and linked; it only leaves the sitemap.
// ============================================================================

/** Club seasons (/football/teams/:club/:season): this season and the two before. */
export const CLUB_SEASON_MIN_START_YEAR = 2023;

/** League seasons outside England's five tiers start here; English tiers 1-5 keep every season since 1992/93. */
export const NON_ENGLISH_SEASON_MIN_START_YEAR = 2020;
export const ENGLISH_LEAGUE_IDS = [1, 2, 3, 4, 5];

/** Tennis Grand Slam, Tour Finals and 1000 editions from this year on. */
export const TENNIS_EDITION_MIN_YEAR = 2015;

/** International nations: 50+ games AND an Elo ranking. Unranked sides are
 * the non-FIFA island and regional teams (Alderney, Åland Islands, Jersey,
 * Greenland): their pages stay, but they are not what people search for. */
export const INTL_SITEMAP_MIN_GAMES = 50;

/** EFL and National League match pages: kick-off within this many days of the build, either side. */
export const EFL_MATCH_WINDOW_DAYS = 30;

export function includeClubSeason(startYear) {
  return Number(startYear) >= CLUB_SEASON_MIN_START_YEAR;
}

export function includeLeagueSeason(leagueId, startYear) {
  return ENGLISH_LEAGUE_IDS.includes(Number(leagueId)) || Number(startYear) >= NON_ENGLISH_SEASON_MIN_START_YEAR;
}

export function includeTennisEdition(year) {
  return Number(year) >= TENNIS_EDITION_MIN_YEAR;
}

export function includeIntlNation(team) {
  return Number(team?.played ?? 0) >= INTL_SITEMAP_MIN_GAMES && team?.elo_rank != null;
}

/** kickoff and today as YYYY-MM-DD. */
export function includeEflMatch(kickoff, today) {
  if (!kickoff || !today) return false;
  const days = (Date.parse(`${String(kickoff).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(today).slice(0, 10)}T00:00:00Z`)) / 86400000;
  return Math.abs(days) <= EFL_MATCH_WINDOW_DAYS;
}
