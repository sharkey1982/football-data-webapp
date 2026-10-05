// ============================================================================
// src/entry-server.tsx
//
// Server-render entry for static generation. Built separately by Vite
// (`vite build --ssr`) so the page components, their TypeScript, and the
// path aliases all resolve exactly as they do in the browser build --
// rather than hand-transpiling them and hoping the two stay in step.
//
// Renders the SAME components the browser uses, with data injected as
// props (see PlayerPage/MatchPage's initialData). No fetching happens
// here: the generator queries Supabase once in bulk and hands the data
// in, which is what makes this fast enough to do thousands of pages --
// the previous browser-based prerenderer needed ~2-4 seconds per page
// because each one had to boot a real page and wait for its own network
// requests.
//
// Head tags are returned separately rather than rendered by the
// components, because useDocumentHead does its work in useEffect, which
// renderToString never runs. The generator injects these into the HTML
// shell itself.
// ============================================================================

import { renderToString } from 'react-dom/server';
// StaticRouter, Routes and Route all from ONE package. Importing StaticRouter
// from 'react-router' and Routes from 'react-router-dom' worked in the
// production bundle (which merges them) but loaded two copies of the router
// under the test runner, so the router context did not match -- "useRoutes()
// may be used only in the context of a <Router>". That is why these
// renderers could not be tested until now.
import { Route, Routes, StaticRouter } from 'react-router-dom';
import PlayerPage, { type PlayerPageData } from './pages/fpl/PlayerPage';
import MatchPage from './pages/football/MatchPage';
import TeamPage, { type TeamPageData } from './pages/football/TeamPage';
import TeamFinancePage from './pages/football/TeamFinancePage';
import FinanceIndexPage from './pages/FinanceIndexPage';
import FinanceComparePage from './pages/FinanceComparePage';
import HistoryHubPage from './pages/football/HistoryHubPage';
import type { HistoryHubData } from './lib/historyApi';
import LeaguesPage from './pages/football/LeaguesPage';
import LeagueIndexPage from './pages/football/LeagueIndexPage';
import LeagueSeasonPage from './pages/football/LeagueSeasonPage';
import ClubSeasonPage from './pages/football/ClubSeasonPage';
import RecordsPage from './pages/football/RecordsPage';
import TrendsPage from './pages/football/TrendsPage';
import ScorelinesPage from './pages/football/ScorelinesPage';
import { scorelineSentence, summariseScorelines, type ScorelinesData } from './lib/scorelinesApi';
import { trendsHeadline, trendsPath, type TrendsData } from './lib/trendsApi';
import { recordsPath, type RecordsData } from './lib/recordsApi';
export { buildRecords } from './lib/recordsApi';
import { clubSeasonPath, clubSeasonStory, type ClubSeasonData } from './lib/clubSeasonApi';
export { buildClubSeason, SNAPSHOT_COLUMNS, clubSeasonPath as clubSeasonPagePath } from './lib/clubSeasonApi';
export { assembleLeaguePages, SUMMARY_SELECT, TABLE_COLUMNS, leaguePath as leaguePagePath, leagueSeasonPath as leagueSeasonPagePath } from './lib/leagueSeasonApi';
import {
  leagueIndexSentence,
  leaguePath,
  leagueSeasonPath,
  seasonDisplay,
  seasonStory,
  type LeagueIndexData,
  type LeagueSeasonData,
  type LeaguesListEntry,
} from './lib/leagueSeasonApi';
import { buildComparison } from './lib/financeCompare';
import { latestPeriod, type ClubFinanceData, type FinanceIndexEntry } from './lib/financeApi';
import { formatMoneyShort, fyLabel, longDate, scaled, signedMoney } from './lib/financeFormat';
import { buildModelFromLambdas, type MatchPagePrediction } from './lib/matchPageApi';
import { SITE_URL, BRAND_NAME } from './lib/siteConfig';
import NflFixturesPage from './pages/nfl/NflFixturesPage';
import NflTablePage from './pages/nfl/NflTablePage';
import NflTeamsPage from './pages/nfl/NflTeamsPage';
import NflTeamPage from './pages/nfl/NflTeamPage';
import NflGamePage from './pages/nfl/NflGamePage';
import NflRoadTripsPage from './pages/nfl/NflRoadTripsPage';
import LocalClubsPage from './pages/football/LocalClubsPage';
import { LOCAL_CLUBS_PATH, TOP_TIERS as LOCAL_CLUBS_TIERS, buildLocalClubs, type LocalClubsData } from './lib/localClubs';
import NflPickMyTeamPage from './pages/nfl/NflPickMyTeamPage';
import { buildPicker, buildRoadTrips, roadTripsSentence, LONDON_STADIUM, type PickerData, type RoadTrips } from './lib/nflPlaces';
import { buildGamePreview, gameSentence, type NflGamePreview } from './lib/nflGame';
import NflSeasonsPage from './pages/nfl/NflSeasonsPage';
import NflSeasonPage from './pages/nfl/NflSeasonPage';
import NflScoringRulesPage from './pages/nfl/NflScoringRulesPage';
import {
  NFL_FIXTURES_PATH,
  NFL_HUB_PATH,
  NFL_PICK_PATH,
  NFL_ROAD_TRIPS_PATH,
  NFL_SCORING_PATH,
  NFL_SEASONS_PATH,
  NFL_TABLE_PATH,
  NFL_TEAMS_PATH,
  nflGamePath,
  nflSeasonPath,
  nflTeamPath,
  standingsSentence,
  teamSentence,
  weekSentence,
  type NflSeasonData,
  type NflSeasonIndexData,
  type NflStandingsData,
  type NflTeamData,
  type NflWeekData,
} from './lib/nflApi';
import { seasonStory as nflSeasonStory, seasonsSentence } from './lib/nflStory';
import type { ReactElement } from 'react';
export {
  buildTeam as buildNflTeam,
  buildWeek as buildNflWeek,
  seasonRange as nflSeasonRange,
  GAME_COLUMNS as NFL_GAME_COLUMNS,
  STANDING_COLUMNS as NFL_STANDING_COLUMNS,
  TEAM_COLUMNS as NFL_TEAM_COLUMNS,
  MODEL_COLUMNS as NFL_MODEL_COLUMNS,
  nflGamePath,
  nflSeasonPath,
  nflTeamPath,
} from './lib/nflApi';
export { SUMMARY_COLUMNS as NFL_SUMMARY_COLUMNS } from './lib/nflStory';
export { buildGamePreview as buildNflGamePreview };
export { teamChances } from './lib/teamPageApi';
export { buildLocalClubs, LOCAL_CLUBS_TIERS };
export { buildRoadTrips as buildNflRoadTrips, buildPicker as buildNflPicker, LONDON_STADIUM as NFL_LONDON_STADIUM };
import { STATIC_ROUTES, type RouteMeta } from './lib/routeMeta';
import TennisResultsPage from './pages/tennis/TennisResultsPage';
import TennisPlayersPage from './pages/tennis/TennisPlayersPage';
import TennisPlayerPage from './pages/tennis/TennisPlayerPage';
import TennisSeasonsPage from './pages/tennis/TennisSeasonsPage';
import TennisSeasonPage from './pages/tennis/TennisSeasonPage';
import TennisTournamentsPage from './pages/tennis/TennisTournamentsPage';
import TennisTournamentPage from './pages/tennis/TennisTournamentPage';
import TennisEditionPage from './pages/tennis/TennisEditionPage';
import TennisTvGuidePage from './pages/tennis/TennisTvGuidePage';
import { editionSentence as tennisEditionSentence, eventSentence as tennisEventSentence, guideGroups as tennisGuideGroups, guideSentence as tennisGuideSentence, tournamentsSentence as tennisTournamentsSentence } from './lib/tennisEvents';
import {
  TENNIS_HUB_PATH,
  TENNIS_PLAYERS_PATH,
  TENNIS_RESULTS_PATH,
  TENNIS_SEASONS_PATH,
  TENNIS_TOURNAMENTS_PATH,
  TENNIS_TV_GUIDE_PATH,
  tennisEditionPath,
  tennisEventPath,
  tennisPlayerPath,
  tennisSeasonPath,
  type TennisEditionData,
  type TennisEventData,
  type TennisGuideData,
  type TennisTournamentsData,
  type TennisPlayerData,
  type TennisPlayersData,
  type TennisResultsData,
  type TennisSeasonData,
  type TennisSeasonIndexData,
} from './lib/tennisApi';
import { FIRST_YEAR as TENNIS_FIRST_YEAR, groupByTournament as tennisGroupByTournament, resultsSentence as tennisResultsSentence, seasonsSentence as tennisSeasonsSentence, playerSentence as tennisPlayerSentence, seasonSentence as tennisSeasonSentence } from './lib/tennisStats';
export {
  MATCH_COLUMNS as TENNIS_MATCH_COLUMNS,
  PLAYER_COLUMNS as TENNIS_PLAYER_COLUMNS,
  buildTennisPlayer,
  buildSeasonIndex as buildTennisSeasonIndex,
  buildTournaments as buildTennisTournaments,
  EVENT_COLUMNS as TENNIS_EVENT_COLUMNS,
  EDITION_COLUMNS as TENNIS_EDITION_COLUMNS,
  CALENDAR_COLUMNS as TENNIS_CALENDAR_COLUMNS,
  tennisEditionPath,
  tennisEventPath,
  resultsWindow as tennisResultsWindow,
  tennisPlayerPath,
  tennisSeasonPath,
  tennisYears,
} from './lib/tennisApi';
export { STATIC_PLAYER_MIN as TENNIS_STATIC_PLAYER_MIN, seasonIndex as tennisSeasonIndex, seasonSummary as tennisSeasonSummary } from './lib/tennisStats';
export { eventSummary as tennisEventSummary } from './lib/tennisEvents';

export type RenderedPage = {
  html: string;
  title: string;
  description: string;
  canonical: string;
  /** JSON-LD objects for this page. Only ever describes facts the page
   * actually shows -- no invented properties to pad the schema out, and
   * nothing asserted that the data doesn't support (e.g. no venue on a
   * fixture, because venue isn't stored). */
  structuredData: object[];
};

function breadcrumb(items: { name: string; path: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderPlayerPage(slug: string, data: PlayerPageData): RenderedPage {
  const path = `/fpl/players/${slug}`;
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/fpl/players/:slug" element={<PlayerPage initialData={data} />} />
      </Routes>
    </StaticRouter>
  );

  const upcoming = data.season.filter((g) => g.projected_points != null && g.status !== 'played');
  const total = upcoming.reduce((sum, g) => sum + (g.projected_points ?? 0), 0);

  return {
    html,
    title: `${data.profile.full_name} \u2014 FPL projections | ${BRAND_NAME}`,
    description:
      upcoming.length > 0
        ? `${data.profile.full_name} (${data.profile.team_name}) is projected ${total.toFixed(1)} Fantasy Premier League points across the next ${upcoming.length} gameweek${upcoming.length === 1 ? '' : 's'}. Per-gameweek projected points, expected minutes and results.`
        : `Fantasy Premier League projections, expected minutes and results for ${data.profile.full_name} (${data.profile.team_name}).`,
    canonical: `${SITE_URL}${path}`,
    structuredData: [
      breadcrumb([
        { name: 'Fantasy Premier League', path: '/fpl/start' },
        { name: 'Players', path: '/fpl/player-points' },
        { name: data.profile.full_name, path },
      ]),
    ],
  };
}

/** rho is passed separately because it lives on the fixture's frozen fit
 * run, not on the fixture row -- the generator fetches fit runs in bulk
 * and supplies it here, so the model is rebuilt with exactly the same
 * helper the browser uses. */
export function renderMatchPage(slug: string, input: MatchPagePrediction & { __rho?: number | null }): RenderedPage {
  const { __rho, ...rest } = input;
  const data: MatchPagePrediction =
    rest.model == null && rest.predicted_home_goals != null && rest.predicted_away_goals != null && __rho != null
      ? { ...rest, model: buildModelFromLambdas(rest.predicted_home_goals, rest.predicted_away_goals, __rho) }
      : rest;

  const path = `/football/matches/${slug}`;
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/football/matches/:slug" element={<MatchPage initialData={data} />} />
      </Routes>
    </StaticRouter>
  );

  const fixture = `${data.home_team_name} v ${data.away_team_name}`;
  const description = data.model
    ? `Model prediction for ${fixture}: ${data.home_team_name} ${data.model.homeWinPct.toFixed(1)}%, draw ${data.model.drawPct.toFixed(1)}%, ${data.away_team_name} ${data.model.awayWinPct.toFixed(1)}%. Expected goals and most likely scoreline.`
    : `Fixture details for ${fixture}.`;

  // SportsEvent describes the fixture itself -- the one genuinely
  // schema-shaped fact on the page. The model's probabilities have no
  // standard schema.org representation, so they're deliberately NOT
  // forced into one; they're in the page's own semantic HTML instead,
  // which is what actually gets read.
  const sportsEvent: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: fixture,
    startDate: data.kickoff_date,
    // schema.org has no "completed" event status -- its EventStatusType
    // values cover scheduled/postponed/cancelled/rescheduled/moved.
    // A played fixture did happen as scheduled, so this is correct for
    // both cases rather than something to branch on.
    eventStatus: 'https://schema.org/EventScheduled',
    sport: 'Football',
    url: `${SITE_URL}${path}`,
    homeTeam: { '@type': 'SportsTeam', name: data.home_team_name },
    awayTeam: { '@type': 'SportsTeam', name: data.away_team_name },
  };

  return {
    html,
    title: `${fixture} \u2014 prediction | ${BRAND_NAME}`,
    description,
    canonical: `${SITE_URL}${path}`,
    structuredData: [
      sportsEvent,
      breadcrumb([
        { name: 'Football', path: '/football' },
        { name: 'Matches', path: '/fixtures' },
        { name: fixture, path },
      ]),
    ],
  };
}

export function renderTeamPage(slug: string, data: TeamPageData): RenderedPage {
  const path = `/football/teams/${slug}`;
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/football/teams/:slug" element={<TeamPage initialData={data} />} />
      </Routes>
    </StaticRouter>
  );

  const p = data.profile;
  const rated =
    p.goals_for_per_game != null && p.goals_against_per_game != null
      ? ` The model expects ${p.goals_for_per_game.toFixed(2)} goals scored and ${p.goals_against_per_game.toFixed(2)} conceded per game against an average opponent.`
      : '';

  return {
    html,
    title: `${p.display_name} \u2014 ratings & fixtures | ${BRAND_NAME}`,
    description: `Model ratings, results and predicted fixtures for ${p.display_name}.${rated}`,
    canonical: `${SITE_URL}${path}`,
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'SportsTeam',
        name: p.display_name,
        sport: 'Football',
        url: `${SITE_URL}${path}`,
        ...(p.league_name ? { memberOf: { '@type': 'SportsOrganization', name: p.league_name } } : {}),
      },
      breadcrumb([
        { name: 'Football', path: '/football' },
        { name: 'Teams', path: '/teams' },
        { name: p.display_name, path },
      ]),
    ],
  };
}

/** Head tags and breadcrumbs for a static route.
 *
 * Content stays client-rendered for these -- they're interactive pages
 * whose data is fetched on mount, and giving each one an injected-data
 * path would be a large refactor. But the HEAD can be correct now, and
 * that's the part that was actively harmful: 26 sitemap URLs all
 * serving the same title and no description reads as duplicate content,
 * which is worse than not listing them.
 *
 * Google renders JavaScript, so the body still indexes; what it can't
 * do is guess which page is which before rendering. */
export function renderStaticRouteHead(meta: RouteMeta): RenderedPage {
  const crumbs = meta.crumbs
    ? [...meta.crumbs, { name: meta.title.split(' — ')[0], path: meta.path }]
    : [];
  return {
    html: '',
    title: `${meta.title} | ${BRAND_NAME}`,
    description: meta.description,
    canonical: `${SITE_URL}${meta.path}`,
    structuredData: crumbs.length > 1 ? [breadcrumb(crumbs)] : [],
  };
}

export { STATIC_ROUTES };

// ---- Club finances ---------------------------------------------------------
// The finance module, re-exported as ONE namespace so the build scripts group
// and normalise rows with exactly the code the browser uses (one bulk query
// per view for every club) -- see scripts/lib/financeStatic.mjs.
export * as finance from './lib/financeApi';
// The player page's projection breakdown, so static generation maps it with
// the same code as the browser.
export { projectionDetail, PROJECTION_DETAIL_COLUMNS } from './lib/fplPlayerPageApi';

export function renderTeamFinancePage(slug: string, data: ClubFinanceData): RenderedPage {
  const path = `/football/teams/${slug}/finances`;
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/football/teams/:slug/finances" element={<TeamFinancePage initialData={data} />} />
      </Routes>
    </StaticRouter>
  );
  const name = data.team.display_name;
  const latest = latestPeriod(data.periods);
  let description = `Statutory accounts for ${name}, from Companies House.`;
  if (latest) {
    const rev = scaled(latest.revenue_total, latest.unit_scale);
    const pbt = signedMoney('profit_before_tax', scaled(latest.profit_before_tax, latest.unit_scale), 'Profit or loss before tax');
    const first = data.periods[0];
    description =
      `${name}'s statutory accounts ${fyLabel(first.period_end)}\u2013${fyLabel(latest.period_end)}, from Companies House. ` +
      `In the year to ${longDate(latest.period_end)}: revenue ${formatMoneyShort(rev)}, ${pbt.label.toLowerCase()} ${pbt.amount}.`;
  }
  return {
    html,
    title: `${name} finances \u2014 revenue, profit and loss, cash | ${BRAND_NAME}`,
    description,
    canonical: `${SITE_URL}${path}`,
    structuredData: [
      breadcrumb([
        { name: 'Football', path: '/football' },
        { name: 'Teams', path: '/teams' },
        { name, path: `/football/teams/${slug}` },
        { name: 'Finances', path },
      ]),
    ],
  };
}

export function renderFinanceComparePage(clubs: ClubFinanceData[]): RenderedPage {
  const path = '/finance/compare';
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/finance/compare" element={<FinanceComparePage initialData={buildComparison(clubs)} />} />
      </Routes>
    </StaticRouter>
  );
  return {
    html,
    title: `Compare Club Finances: revenue, wages, debt | ${BRAND_NAME}`,
    description: 'Football clubs\u2019 latest accounts side by side: revenue, wages, profit and loss, borrowings and cash, from filings at Companies House.',
    canonical: `${SITE_URL}${path}`,
    structuredData: [breadcrumb([{ name: 'Football', path: '/football' }, { name: 'The Boardroom', path: '/finance' }, { name: 'Compare Club Finances', path }])],
  };
}

export function renderFinanceIndexPage(entries: FinanceIndexEntry[]): RenderedPage {
  const path = '/finance';
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/finance" element={<FinanceIndexPage initialData={entries} />} />
      </Routes>
    </StaticRouter>
  );
  return {
    html,
    title: `The Boardroom: club finances from statutory accounts | ${BRAND_NAME}`,
    description:
      'Football club finances from the accounts clubs file at Companies House: revenue, profit and loss, cash, borrowings and net assets, each figure traceable to its source.',
    canonical: `${SITE_URL}${path}`,
    structuredData: [breadcrumb([{ name: 'Football', path: '/football' }, { name: 'The Boardroom', path }])],
  };
}


export function renderHistoryHubPage(data: HistoryHubData): RenderedPage {
  const path = '/football/history';
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/football/history" element={<HistoryHubPage initialData={data} />} />
      </Routes>
    </StaticRouter>
  );
  const at = (n: number) => data.reliability.find((r) => r.matches_played === n);
  const r10 = at(10);
  const r20 = at(20);
  const seasons = data.reliability[0]?.seasons ?? 0;
  let description =
    'How far clubs still move after every match of the season, measured over every complete season since the 1990s.';
  if (r10 && r20) {
    description =
      `After 10 matches the average Premier League club finishes ${r10.mean_abs_position_change.toFixed(1)} places from where it stands; ` +
      `after 20, ${r20.mean_abs_position_change.toFixed(1)}. From ${seasons} complete 20-club seasons.`;
  }
  return {
    html,
    title: `Position Tracking: when does the league table become real? | ${BRAND_NAME}`,
    description,
    canonical: `${SITE_URL}${path}`,
    structuredData: [breadcrumb([{ name: 'Football', path: '/football' }, { name: 'Position Tracking', path }])],
  };
}

const LEAGUES_CRUMB = { name: 'Leagues', path: '/football/leagues' };

export function renderLeaguesPage(list: LeaguesListEntry[]): RenderedPage {
  const path = '/football/leagues';
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path={path} element={<LeaguesPage initialData={list} />} />
      </Routes>
    </StaticRouter>
  );
  return {
    html,
    title: `Leagues: every season, final table and champion | ${BRAND_NAME}`,
    description: `Final tables, champions and season statistics for ${list.length} leagues: the English leagues since 1992/93 and European top flights.`,
    canonical: `${SITE_URL}${path}`,
    structuredData: [breadcrumb([{ name: 'Football', path: '/football' }, LEAGUES_CRUMB])],
  };
}

export function renderLeagueIndexPage(data: LeagueIndexData): RenderedPage {
  const path = leaguePath(data.league);
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/football/leagues/:league" element={<LeagueIndexPage initialData={data} />} />
      </Routes>
    </StaticRouter>
  );
  return {
    html,
    title: `${data.league.name}: every season, champions and tables | ${BRAND_NAME}`,
    description: leagueIndexSentence(data) || `Every ${data.league.name} season on file.`,
    canonical: `${SITE_URL}${path}`,
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'SportsOrganization',
        name: data.league.name,
        sport: 'Football',
        url: `${SITE_URL}${path}`,
        ...(data.league.country ? { location: { '@type': 'Country', name: data.league.country } } : {}),
      },
      breadcrumb([{ name: 'Football', path: '/football' }, LEAGUES_CRUMB, { name: data.league.name, path }]),
    ],
  };
}

export function renderLeagueSeasonPage(data: LeagueSeasonData): RenderedPage {
  const path = leagueSeasonPath(data.league, data.season.start_year);
  const when = seasonDisplay(data.league.code, data.season.start_year);
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/football/leagues/:league/:season" element={<LeagueSeasonPage initialData={data} />} />
      </Routes>
    </StaticRouter>
  );
  const kind = data.summary.is_final ? 'final table' : 'table';
  return {
    html,
    title: `${data.eraName} ${when}: ${kind} and statistics | ${BRAND_NAME}`,
    description: seasonStory(data) || `The ${when} ${data.eraName} ${kind}.`,
    canonical: `${SITE_URL}${path}`,
    structuredData: [
      breadcrumb([
        { name: 'Football', path: '/football' },
        LEAGUES_CRUMB,
        { name: data.league.name, path: leaguePath(data.league) },
        { name: when, path },
      ]),
    ],
  };
}

export function renderClubSeasonPage(data: ClubSeasonData): RenderedPage {
  const path = clubSeasonPath(data.team.slug, data.league.code, data.season.start_year);
  const when = seasonDisplay(data.league.code, data.season.start_year);
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/football/teams/:slug/:season" element={<ClubSeasonPage initialData={data} />} />
      </Routes>
    </StaticRouter>
  );
  return {
    html,
    title: `${data.team.name} ${when}: ${data.eraName} results and table position | ${BRAND_NAME}`,
    description: clubSeasonStory(data),
    canonical: `${SITE_URL}${path}`,
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'SportsTeam',
        name: data.team.name,
        sport: 'Football',
        url: `${SITE_URL}/football/teams/${data.team.slug}`,
        memberOf: { '@type': 'SportsOrganization', name: data.league.name },
      },
      breadcrumb([
        { name: 'Football', path: '/football' },
        { name: 'Teams', path: '/teams' },
        { name: data.team.name, path: `/football/teams/${data.team.slug}` },
        { name: when, path },
      ]),
    ],
  };
}

const RECORDS_CRUMB = { name: 'Records', path: '/football/records' };

export function renderRecordsIndexPage(list: LeaguesListEntry[]): RenderedPage {
  const path = '/football/records';
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path={path} element={<RecordsPage initialList={list} />} />
      </Routes>
    </StaticRouter>
  );
  return {
    html,
    title: `Football records: most points, longest runs, biggest wins | ${BRAND_NAME}`,
    description: `Record books for ${list.length} leagues: points, goals, title margins, biggest wins and the longest winning, unbeaten and losing runs.`,
    canonical: `${SITE_URL}${path}`,
    structuredData: [breadcrumb([{ name: 'Football', path: '/football' }, RECORDS_CRUMB])],
  };
}

export function renderRecordsPage(data: RecordsData): RenderedPage {
  const path = recordsPath(data.league);
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/football/records/:league" element={<RecordsPage initialData={data} />} />
      </Routes>
    </StaticRouter>
  );
  return {
    html,
    title: `${data.league.name} records: most points, longest runs, biggest wins | ${BRAND_NAME}`,
    description: data.headline || `${data.league.name} records.`,
    canonical: `${SITE_URL}${path}`,
    structuredData: [breadcrumb([{ name: 'Football', path: '/football' }, RECORDS_CRUMB, { name: data.league.name, path }])],
  };
}

export function renderTrendsPage(data: TrendsData): RenderedPage {
  const path = trendsPath(data.league);
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/football/history/trends" element={<TrendsPage initialData={data} />} />
        <Route path="/football/history/trends/:league" element={<TrendsPage initialData={data} />} />
      </Routes>
    </StaticRouter>
  );
  return {
    html,
    title: `Historic Trends: how the ${data.league.name} has changed | ${BRAND_NAME}`,
    description: trendsHeadline(data) || `How the ${data.league.name} has changed season by season.`,
    canonical: `${SITE_URL}${path}`,
    structuredData: [
      breadcrumb([
        { name: 'Football', path: '/football' },
        { name: `Historic Trends: ${data.league.name}`, path },
      ]),
    ],
  };
}

export function renderScorelinesPage(data: ScorelinesData): RenderedPage {
  const path = '/football/history/scorelines';
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path={path} element={<ScorelinesPage initialData={data} />} />
      </Routes>
    </StaticRouter>
  );
  return {
    html,
    title: `Score Explore: how often every score happens | ${BRAND_NAME}`,
    description: scorelineSentence(summariseScorelines(data.rows), data.league.name, null) || 'How often each scoreline happens.',
    canonical: `${SITE_URL}${path}`,
    structuredData: [breadcrumb([{ name: 'Football', path: '/football' }, { name: 'Score Explore', path }])],
  };
}

// ---- NFL --------------------------------------------------------------------

const NFL_CRUMB = { name: 'NFL', path: NFL_HUB_PATH };
const NFL_DISCOVER_CRUMB = { name: 'Discover', path: '/nfl/discover' };

function nflPage(path: string, route: string, element: ReactElement): string {
  return renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path={route} element={element} />
      </Routes>
    </StaticRouter>
  );
}

export function renderNflFixturesPage(data: NflWeekData): RenderedPage {
  return {
    html: nflPage(NFL_FIXTURES_PATH, NFL_FIXTURES_PATH, <NflFixturesPage initialData={data} />),
    title: `NFL fixtures and results in UK time | ${BRAND_NAME}`,
    description: weekSentence(data),
    canonical: `${SITE_URL}${NFL_FIXTURES_PATH}`,
    structuredData: [breadcrumb([NFL_CRUMB, NFL_DISCOVER_CRUMB, { name: 'Fixtures & Results', path: NFL_FIXTURES_PATH }])],
  };
}

export function renderNflTablePage(data: NflStandingsData): RenderedPage {
  return {
    html: nflPage(NFL_TABLE_PATH, NFL_TABLE_PATH, <NflTablePage initialData={data} />),
    title: `${data.season} NFL league table and standings | ${BRAND_NAME}`,
    description: standingsSentence(data),
    canonical: `${SITE_URL}${NFL_TABLE_PATH}`,
    structuredData: [breadcrumb([NFL_CRUMB, NFL_DISCOVER_CRUMB, { name: 'League Table', path: NFL_TABLE_PATH }])],
  };
}

export function renderNflTeamsPage(data: NflStandingsData): RenderedPage {
  return {
    html: nflPage(NFL_TEAMS_PATH, NFL_TEAMS_PATH, <NflTeamsPage initialData={data} />),
    title: `NFL teams: every team\u2019s season and history | ${BRAND_NAME}`,
    description: 'All 32 NFL teams by conference and division, with this season\u2019s record, every season since 2002 and the story of each.',
    canonical: `${SITE_URL}${NFL_TEAMS_PATH}`,
    structuredData: [breadcrumb([NFL_CRUMB, NFL_DISCOVER_CRUMB, { name: 'Your Team', path: NFL_TEAMS_PATH }])],
  };
}

export function renderNflSeasonsPage(data: NflSeasonIndexData): RenderedPage {
  return {
    html: nflPage(NFL_SEASONS_PATH, NFL_SEASONS_PATH, <NflSeasonsPage initialData={data} />),
    title: `Every NFL season since 2002: champions and stories | ${BRAND_NAME}`,
    description: seasonsSentence(data),
    canonical: `${SITE_URL}${NFL_SEASONS_PATH}`,
    structuredData: [breadcrumb([NFL_CRUMB, NFL_DISCOVER_CRUMB, { name: 'Past seasons', path: NFL_SEASONS_PATH }])],
  };
}

export function renderNflSeasonPage(data: NflSeasonData): RenderedPage {
  const path = nflSeasonPath(data.season);
  const story = nflSeasonStory(data.season, data.games, data.rows, data.summaries);
  return {
    html: nflPage(path, '/nfl/seasons/:season', <NflSeasonPage initialData={data} />),
    title: `The ${data.season} NFL season: champions, story and standings | ${BRAND_NAME}`,
    description: story.headline,
    canonical: `${SITE_URL}${path}`,
    structuredData: [breadcrumb([NFL_CRUMB, { name: 'Past seasons', path: NFL_SEASONS_PATH }, { name: `${data.season} season`, path }])],
  };
}

export function renderLocalClubsPage(data: LocalClubsData): RenderedPage {
  const path = LOCAL_CLUBS_PATH;
  return {
    html: renderToString(
      <StaticRouter location={path}>
        <Routes>
          <Route path={path} element={<LocalClubsPage initialData={data} />} />
        </Routes>
      </StaticRouter>
    ),
    title: `Your Local Clubs: nearest football club to your postcode | ${BRAND_NAME}`,
    description: `Put in your postcode to find your nearest football club and the nearest in every division: ${data.clubs.length} clubs from the Premier League to the National League.`,
    canonical: `${SITE_URL}${path}`,
    structuredData: [breadcrumb([{ name: 'Football', path: '/football' }, { name: 'Discover', path: '/football/discover' }, { name: 'Your Local Clubs', path }])],
  };
}

export function renderNflRoadTripsPage(data: RoadTrips): RenderedPage {
  const path = NFL_ROAD_TRIPS_PATH;
  return {
    html: nflPage(path, path, <NflRoadTripsPage initialData={data} />),
    title: `NFL road trips ${data.season}: miles travelled by every team | ${BRAND_NAME}`,
    description: roadTripsSentence(data),
    canonical: `${SITE_URL}${path}`,
    structuredData: [breadcrumb([NFL_CRUMB, NFL_DISCOVER_CRUMB, { name: 'Road Trips', path }])],
  };
}

export function renderNflPickPage(data: PickerData): RenderedPage {
  const path = NFL_PICK_PATH;
  return {
    html: nflPage(path, path, <NflPickMyTeamPage initialData={data} />),
    title: `Which NFL team should I support? Pick My Team | ${BRAND_NAME}`,
    description: 'Four questions for UK fans: winners or underdogs, kick-off times, London games and weather. Matched to all 32 NFL teams on real data.',
    canonical: `${SITE_URL}${path}`,
    structuredData: [breadcrumb([NFL_CRUMB, NFL_DISCOVER_CRUMB, { name: 'Pick My Team', path }])],
  };
}

export function renderNflGamePage(data: NflGamePreview): RenderedPage {
  const g = data.game;
  const path = nflGamePath(g.game_id);
  const name = `${g.away_name} ${g.neutral_site ? 'v' : 'at'} ${g.home_name}`;
  return {
    html: nflPage(path, '/nfl/games/:gameId', <NflGamePage initialData={data} />),
    title: `${name}: preview, head-to-head and prediction | ${BRAND_NAME}`,
    description: gameSentence(data),
    canonical: `${SITE_URL}${path}`,
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'SportsEvent',
        name,
        sport: 'American football',
        startDate: g.kickoff_at ?? g.gameday,
        homeTeam: { '@type': 'SportsTeam', name: g.home_name },
        awayTeam: { '@type': 'SportsTeam', name: g.away_name },
        ...(g.stadium ? { location: { '@type': 'Place', name: g.stadium } } : {}),
        url: `${SITE_URL}${path}`,
      },
      breadcrumb([NFL_CRUMB, { name: 'Fixtures & Results', path: NFL_FIXTURES_PATH }, { name, path }]),
    ],
  };
}

export function renderNflTeamPage(data: NflTeamData): RenderedPage {
  const path = nflTeamPath(data.team.slug);
  return {
    html: nflPage(path, '/nfl/teams/:slug', <NflTeamPage initialData={data} />),
    title: `${data.team.name}: ${data.season} schedule, results and history | ${BRAND_NAME}`,
    description: teamSentence(data),
    canonical: `${SITE_URL}${path}`,
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'SportsTeam',
        name: data.team.name,
        sport: 'American football',
        memberOf: { '@type': 'SportsOrganization', name: 'National Football League' },
        url: `${SITE_URL}${path}`,
      },
      breadcrumb([NFL_CRUMB, { name: 'Your Team', path: NFL_TEAMS_PATH }, { name: data.team.name, path }]),
    ],
  };
}

export function renderNflScoringPage(): RenderedPage {
  return {
    html: nflPage(NFL_SCORING_PATH, NFL_SCORING_PATH, <NflScoringRulesPage />),
    title: `NFL fantasy scoring rules: standard, half-PPR and PPR | ${BRAND_NAME}`,
    description: 'How NFL fantasy points are scored on FixtureShark: standard, half-PPR and PPR for passing, rushing, receiving and turnovers, and the kicker rules.',
    canonical: `${SITE_URL}${NFL_SCORING_PATH}`,
    structuredData: [breadcrumb([NFL_CRUMB, NFL_DISCOVER_CRUMB, { name: 'Scoring Rules', path: NFL_SCORING_PATH }])],
  };
}

// ---- Tennis -----------------------------------------------------------------
const TENNIS_CRUMB = { name: 'Tennis', path: TENNIS_HUB_PATH };
const TENNIS_DISCOVER_CRUMB = { name: 'Discover', path: '/tennis/discover' };

export function renderTennisResultsPage(data: TennisResultsData): RenderedPage {
  const day = data.matches.filter((m) => m.match_date === data.latestDate);
  return {
    html: nflPage(TENNIS_RESULTS_PATH, TENNIS_RESULTS_PATH, <TennisResultsPage initialData={data} />),
    title: `${data.tour} tennis results by day | ${BRAND_NAME}`,
    description: tennisResultsSentence(data.tour, data.latestDate, day.length, tennisGroupByTournament(day).length),
    canonical: `${SITE_URL}${TENNIS_RESULTS_PATH}`,
    structuredData: [breadcrumb([TENNIS_CRUMB, TENNIS_DISCOVER_CRUMB, { name: 'Results', path: TENNIS_RESULTS_PATH }])],
  };
}

export function renderTennisPlayersPage(data: TennisPlayersData): RenderedPage {
  return {
    html: nflPage(TENNIS_PLAYERS_PATH, TENNIS_PLAYERS_PATH, <TennisPlayersPage initialData={data} />),
    title: `${data.tour} players: records, titles and seasons since ${TENNIS_FIRST_YEAR[data.tour]} | ${BRAND_NAME}`,
    description: `Every ${data.tour} player at tour level since ${TENNIS_FIRST_YEAR[data.tour]}: win-loss record, titles, finals and the years they played.`,
    canonical: `${SITE_URL}${TENNIS_PLAYERS_PATH}`,
    structuredData: [breadcrumb([TENNIS_CRUMB, TENNIS_DISCOVER_CRUMB, { name: 'Your Player', path: TENNIS_PLAYERS_PATH }])],
  };
}

export function renderTennisPlayerPage(data: TennisPlayerData): RenderedPage {
  const path = tennisPlayerPath(data.player.tour, data.player.slug);
  return {
    html: nflPage(path, '/tennis/players/:tour/:slug', <TennisPlayerPage initialData={data} />),
    title: `${data.player.name}: ${data.player.tour} record, titles and results | ${BRAND_NAME}`,
    description: tennisPlayerSentence(data.summary),
    canonical: `${SITE_URL}${path}`,
    structuredData: [breadcrumb([TENNIS_CRUMB, { name: 'Your Player', path: TENNIS_PLAYERS_PATH }, { name: data.player.name, path }])],
  };
}

export function renderTennisSeasonsPage(data: TennisSeasonIndexData): RenderedPage {
  return {
    html: nflPage(TENNIS_SEASONS_PATH, TENNIS_SEASONS_PATH, <TennisSeasonsPage initialData={data} />),
    title: `Every ${data.tour} season since ${TENNIS_FIRST_YEAR[data.tour]}: Grand Slam champions | ${BRAND_NAME}`,
    description: tennisSeasonsSentence(data.tour, data.rows),
    canonical: `${SITE_URL}${TENNIS_SEASONS_PATH}`,
    structuredData: [breadcrumb([TENNIS_CRUMB, TENNIS_DISCOVER_CRUMB, { name: 'Past seasons', path: TENNIS_SEASONS_PATH }])],
  };
}

export function renderTennisSeasonPage(data: TennisSeasonData): RenderedPage {
  const { tour, year } = data.summary;
  const path = tennisSeasonPath(tour, year);
  return {
    html: nflPage(path, '/tennis/seasons/:tour/:year', <TennisSeasonPage initialData={data} />),
    title: `The ${year} ${tour} season: champions, upsets and streaks | ${BRAND_NAME}`,
    description: tennisSeasonSentence(data.summary),
    canonical: `${SITE_URL}${path}`,
    structuredData: [breadcrumb([TENNIS_CRUMB, { name: 'Past seasons', path: TENNIS_SEASONS_PATH }, { name: `${year} ${tour}`, path }])],
  };
}

export function renderTennisTournamentsPage(data: TennisTournamentsData): RenderedPage {
  return {
    html: nflPage(TENNIS_TOURNAMENTS_PATH, TENNIS_TOURNAMENTS_PATH, <TennisTournamentsPage initialData={data} />),
    title: `${data.tour} tournaments: champions, records and draws since ${TENNIS_FIRST_YEAR[data.tour]} | ${BRAND_NAME}`,
    description: tennisTournamentsSentence(data),
    canonical: `${SITE_URL}${TENNIS_TOURNAMENTS_PATH}`,
    structuredData: [breadcrumb([TENNIS_CRUMB, TENNIS_DISCOVER_CRUMB, { name: 'Tournaments', path: TENNIS_TOURNAMENTS_PATH }])],
  };
}

export function renderTennisEventPage(data: TennisEventData): RenderedPage {
  const path = tennisEventPath(data.event.tour, data.event.slug);
  return {
    html: nflPage(path, '/tennis/tournaments/:tour/:slug', <TennisTournamentPage initialData={data} />),
    title: `${data.event.name} (${data.event.tour}): champions, records and draws | ${BRAND_NAME}`,
    description: tennisEventSentence(data.event, data.summary),
    canonical: `${SITE_URL}${path}`,
    structuredData: [breadcrumb([TENNIS_CRUMB, { name: 'Tournaments', path: TENNIS_TOURNAMENTS_PATH }, { name: data.event.name, path }])],
  };
}

export function renderTennisEditionPage(data: TennisEditionData): RenderedPage {
  const { event, edition } = data;
  const path = tennisEditionPath(event.tour, event.slug, edition.year);
  return {
    html: nflPage(path, '/tennis/tournaments/:tour/:slug/:year', <TennisEditionPage initialData={data} />),
    title: `${edition.name} ${edition.year}: draw, results and the road to the final | ${BRAND_NAME}`,
    description: tennisEditionSentence(data),
    canonical: `${SITE_URL}${path}`,
    structuredData: [breadcrumb([TENNIS_CRUMB, { name: 'Tournaments', path: TENNIS_TOURNAMENTS_PATH }, { name: event.name, path: tennisEventPath(event.tour, event.slug) }, { name: String(edition.year), path }])],
  };
}

export function renderTennisTvGuidePage(data: TennisGuideData, today: string): RenderedPage {
  return {
    html: nflPage(TENNIS_TV_GUIDE_PATH, TENNIS_TV_GUIDE_PATH, <TennisTvGuidePage initialData={data} today={today} />),
    title: `Tennis on TV in the UK: this week and next | ${BRAND_NAME}`,
    description: tennisGuideSentence(tennisGuideGroups(data.calendar, data.recent, today)),
    canonical: `${SITE_URL}${TENNIS_TV_GUIDE_PATH}`,
    structuredData: [breadcrumb([TENNIS_CRUMB, TENNIS_DISCOVER_CRUMB, { name: 'TV Guide', path: TENNIS_TV_GUIDE_PATH }])],
  };
}

/** Injects a rendered page into the built index.html shell: its markup
 * into #root, and real head tags replacing the shell's static
 * placeholders. Without the head replacement every generated page would
 * carry the same generic title and description, which is most of the
 * value of doing this at all. */
/** The default share card (public/og-default.png, 1200x630). */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png`;

/** Open Graph + Twitter card tags for a page, wrapped in the same markers
 * index.html uses so a second pass can never stack a duplicate block. */
export function socialTags(page: RenderedPage): string {
  const tags = [
    `<meta property="og:site_name" content="${escapeAttr(BRAND_NAME)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeAttr(page.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(page.description)}" />`,
    `<meta property="og:url" content="${escapeAttr(page.canonical)}" />`,
    `<meta property="og:image" content="${escapeAttr(DEFAULT_OG_IMAGE)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ];
  return `<!-- social:start -->\n    ${tags.join('\n    ')}\n    <!-- social:end -->`;
}

export function buildDocument(shell: string, page: RenderedPage): string {
  // Empty html means head-only generation: leave the root div alone so
  // the SPA boots normally rather than being handed an empty string.
  let out = page.html
    ? shell.replace('<div id="root"></div>', `<div id="root">${page.html}</div>`)
    : shell;
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttr(page.title)}</title>`);
  out = out.replace(
    /<meta\s+name="description"[\s\S]*?\/>/,
    `<meta name="description" content="${escapeAttr(page.description)}" />`
  );
  const ld = (page.structuredData ?? [])
    .map(
      (obj) =>
        // "</script>" inside JSON would terminate the script element
        // early; escaping the slash is the standard guard.
        `  <script type="application/ld+json">${JSON.stringify(obj).replace(/<\//g, '<\\/')}</script>`
    )
    .join('\n');
  out = out.replace(
    '</head>',
    `  <link rel="canonical" href="${escapeAttr(page.canonical)}" />\n${ld}\n  </head>`
  );
  // Social preview tags, page-specific. Replaces the shell's default block
  // (index.html, between the social markers); link-preview fetchers never
  // run JS, so this is the only place they can come from.
  const social = socialTags(page);
  out = /<!-- social:start -->[\s\S]*?<!-- social:end -->/.test(out)
    ? out.replace(/<!-- social:start -->[\s\S]*?<!-- social:end -->/, social)
    : out.replace('</head>', `  ${social}\n  </head>`);
  return out;
}
