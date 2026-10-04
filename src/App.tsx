import { AuthProvider } from './lib/auth';
import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AppLayout from './components/AppLayout';

// Every page is lazy-loaded rather than bundled into one upfront chunk --
// requested directly, after confirming this app had a single 1.1MB JS
// bundle (300kB gzipped) with zero code-splitting: every visit downloaded
// and parsed all 20 pages' worth of code (recharts, every FPL admin page,
// every tactical-roles/optimizer page) regardless of which single page was
// actually being used, which matters concretely given this is used on
// mobile. AppLayout itself (the nav shell) stays a normal, eager import --
// it's needed immediately on every route, so lazy-loading it would only
// add a round trip with no benefit.
const InThePapersPage = lazy(() => import('./pages/fpl/InThePapersPage'));
const TeamFinancePage = lazy(() => import('./pages/football/TeamFinancePage'));
const FinanceComparePage = lazy(() => import('./pages/FinanceComparePage'));
const AffiliateDisclosurePage = lazy(() => import('./pages/AffiliateDisclosurePage'));
const TvGuidePage = lazy(() => import('./pages/football/TvGuidePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const FinanceIndexPage = lazy(() => import('./pages/FinanceIndexPage'));
const TeamExplorer = lazy(() => import('./pages/TeamExplorer'));
const MatchPreview = lazy(() => import('./pages/MatchPreview'));
const GameweekBrowser = lazy(() => import('./pages/GameweekBrowser'));
const Landing = lazy(() => import('./pages/Landing'));
const FootballHub = lazy(() => import('./pages/FootballHub'));
const FplHub = lazy(() => import('./pages/FplHub'));
const PlayerPage = lazy(() => import('./pages/fpl/PlayerPage'));
const MatchPage = lazy(() => import('./pages/football/MatchPage'));
const TeamPage = lazy(() => import('./pages/football/TeamPage'));
const StagePage = lazy(() => import('./pages/StagePage'));
const CrossLeaguePage = lazy(() => import('./pages/football/CrossLeaguePage'));
const HistoryHubPage = lazy(() => import('./pages/football/HistoryHubPage'));
const WhatHappenedNextPage = lazy(() => import('./pages/football/WhatHappenedNextPage'));
const HistoricPacePage = lazy(() => import('./pages/football/HistoricPacePage'));
const LeaguesPage = lazy(() => import('./pages/football/LeaguesPage'));
const LeagueIndexPage = lazy(() => import('./pages/football/LeagueIndexPage'));
const LeagueSeasonPage = lazy(() => import('./pages/football/LeagueSeasonPage'));
const ClubSeasonPage = lazy(() => import('./pages/football/ClubSeasonPage'));
const RecordsPage = lazy(() => import('./pages/football/RecordsPage'));
const TrendsPage = lazy(() => import('./pages/football/TrendsPage'));
const ScorelinesPage = lazy(() => import('./pages/football/ScorelinesPage'));
const CountryInsightsPage = lazy(() => import('./pages/football/CountryInsightsPage'));
const MarketEfficiencyPage = lazy(() => import('./pages/football/MarketEfficiencyPage'));
const PriceRiskPage = lazy(() => import('./pages/fpl/PriceRiskPage'));
const SeasonXiPage = lazy(() => import('./pages/fpl/SeasonXiPage'));
const PlayerScoutPage = lazy(() => import('./pages/fpl/PlayerScoutPage'));
const PlayerRecordPage = lazy(() => import('./pages/fpl/PlayerRecordPage'));
const ModelAccuracyPage = lazy(() => import('./pages/football/ModelAccuracyPage'));
const ModelReturnsPage = lazy(() => import('./pages/football/ModelReturnsPage'));
const ModelScorecardPage = lazy(() => import('./pages/football/ModelScorecardPage'));
const ModelChangesPage = lazy(() => import('./pages/admin/ModelChangesPage'));
const AiLabPage = lazy(() => import('./pages/admin/AiLabPage'));
const SetPiecesPage = lazy(() => import('./pages/fpl/SetPiecesPage'));
const InjuriesPage = lazy(() => import('./pages/fpl/InjuriesPage'));
const ValuePage = lazy(() => import('./pages/fpl/ValuePage'));
const TeamOfTheWeekPage = lazy(() => import('./pages/fpl/TeamOfTheWeekPage'));
const ModelXiAccuracyPage = lazy(() => import('./pages/fpl/ModelXiAccuracyPage'));
const FormationsPage = lazy(() => import('./pages/fpl/FormationsPage'));
const Login = lazy(() => import('./pages/Login'));
const LeagueTable = lazy(() => import('./pages/LeagueTable'));
const FixtureChangesPage = lazy(() => import('./pages/FixtureChangesPage'));
const TeamStrengthPage = lazy(() => import('./pages/TeamStrengthPage'));
const ResultsData = lazy(() => import('./pages/ResultsData'));
const SourceData = lazy(() => import('./pages/SourceData'));
const FantasyFixtures = lazy(() => import('./pages/FantasyFixtures'));
const DataHealth = lazy(() => import('./pages/DataHealth'));
const DataFlow = lazy(() => import('./pages/DataFlow'));
const FplFixturesList = lazy(() => import('./pages/fpl/FplFixturesList'));
const GameweekPage = lazy(() => import('./pages/fpl/GameweekPage'));
const FixtureProjectionPage = lazy(() => import('./pages/fpl/FixtureProjectionPage'));
const OptimalSquadPage = lazy(() => import('./pages/fpl/OptimalSquadPage'));
const SquadCheckPage = lazy(() => import('./pages/fpl/SquadCheckPage'));
// Squad Check was renamed Rate My Team (30 Sep 2026); keep ?id= on old links.
function SquadCheckRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/fpl/rate-my-team${search}`} replace />;
}
const HindsightOptimalSquadPage = lazy(() => import('./pages/fpl/HindsightOptimalSquadPage'));
const PlayerProjectionsTablePage = lazy(() => import('./pages/fpl/PlayerProjectionsTablePage'));
const ScoringRulesPage = lazy(() => import('./pages/fpl/ScoringRulesPage'));
const ActualMatchesPage = lazy(() => import('./pages/fpl/ActualMatchesPage'));
const ActualMatchDetailPage = lazy(() => import('./pages/fpl/ActualMatchDetailPage'));
const TacticalRolesAdminPage = lazy(() => import('./pages/fpl/TacticalRolesAdminPage'));
const NflHub = lazy(() => import('./pages/nfl/NflHub'));
const NflFixturesPage = lazy(() => import('./pages/nfl/NflFixturesPage'));
const NflTvGuidePage = lazy(() => import('./pages/nfl/NflTvGuidePage'));
const NflTablePage = lazy(() => import('./pages/nfl/NflTablePage'));
const NflTeamsPage = lazy(() => import('./pages/nfl/NflTeamsPage'));
const NflTeamPage = lazy(() => import('./pages/nfl/NflTeamPage'));
const NflGamePage = lazy(() => import('./pages/nfl/NflGamePage'));
const NflRoadTripsPage = lazy(() => import('./pages/nfl/NflRoadTripsPage'));
const LocalClubsPage = lazy(() => import('./pages/football/LocalClubsPage'));
const NflPickMyTeamPage = lazy(() => import('./pages/nfl/NflPickMyTeamPage'));
const NflSeasonsPage = lazy(() => import('./pages/nfl/NflSeasonsPage'));
const NflSeasonPage = lazy(() => import('./pages/nfl/NflSeasonPage'));
const NflPlayersPage = lazy(() => import('./pages/nfl/NflPlayersPage'));
const NflPlayerPage = lazy(() => import('./pages/nfl/NflPlayerPage'));
const NflHeatMapPage = lazy(() => import('./pages/nfl/NflHeatMapPage'));
const NflScoringRulesPage = lazy(() => import('./pages/nfl/NflScoringRulesPage'));
// The NFL section's first URLs (4 Oct 2026), moved the same day to match
// Football's structure; netlify.toml 301s them too.
function NflOldStandingsRedirect() {
  const { pathname } = useLocation();
  const season = pathname.split('/')[3];
  return <Navigate to={season ? `/nfl/seasons/${season}` : '/nfl/table'} replace />;
}

/** Matches this app's existing "Loading..." convention (font-mono,
 * text-ink-500) used throughout individual pages' own data-loading
 * states, so a route-level load looks like the same kind of wait rather
 * than a visually distinct one. */
function RouteFallback() {
  return <p className="text-ink-500 font-mono text-sm px-1 py-4">{'Loading\u2026'}</p>;
}

export default function App() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            index
            element={
              <Suspense fallback={<RouteFallback />}>
                <Landing />
              </Suspense>
            }
          />
          <Route
            path="football"
            element={
              <Suspense fallback={<RouteFallback />}>
                <FootballHub />
              </Suspense>
            }
          />
          <Route
            path="football/market-efficiency"
            element={
              <Suspense fallback={<RouteFallback />}>
                <MarketEfficiencyPage />
              </Suspense>
            }
          />
          <Route
            path="football/countries-compared"
            element={
              <Suspense fallback={<RouteFallback />}>
                <CountryInsightsPage />
              </Suspense>
            }
          />
          <Route
            path="football/leagues-compared"
            element={
              <Suspense fallback={<RouteFallback />}>
                <CrossLeaguePage />
              </Suspense>
            }
          />
          <Route
            path="football/history"
            element={
              <Suspense fallback={<RouteFallback />}>
                <HistoryHubPage />
              </Suspense>
            }
          />
          <Route
            path="football/history/what-happened-next"
            element={
              <Suspense fallback={<RouteFallback />}>
                <WhatHappenedNextPage />
              </Suspense>
            }
          />
          <Route
            path="football/history/pace"
            element={
              <Suspense fallback={<RouteFallback />}>
                <HistoricPacePage />
              </Suspense>
            }
          />
          <Route
            path="football/leagues"
            element={
              <Suspense fallback={<RouteFallback />}>
                <LeaguesPage />
              </Suspense>
            }
          />
          <Route
            path="football/leagues/:league"
            element={
              <Suspense fallback={<RouteFallback />}>
                <LeagueIndexPage />
              </Suspense>
            }
          />
          <Route
            path="football/leagues/:league/:season"
            element={
              <Suspense fallback={<RouteFallback />}>
                <LeagueSeasonPage />
              </Suspense>
            }
          />
          <Route
            path="football/records"
            element={
              <Suspense fallback={<RouteFallback />}>
                <RecordsPage />
              </Suspense>
            }
          />
          <Route
            path="football/records/:league"
            element={
              <Suspense fallback={<RouteFallback />}>
                <RecordsPage />
              </Suspense>
            }
          />
          <Route
            path="football/history/trends"
            element={
              <Suspense fallback={<RouteFallback />}>
                <TrendsPage />
              </Suspense>
            }
          />
          <Route
            path="football/history/trends/:league"
            element={
              <Suspense fallback={<RouteFallback />}>
                <TrendsPage />
              </Suspense>
            }
          />
          <Route
            path="football/history/scorelines"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ScorelinesPage />
              </Suspense>
            }
          />
          <Route
            path="football/:stage"
            element={
              <Suspense fallback={<RouteFallback />}>
                <StagePage themeKey="football" />
              </Suspense>
            }
          />
          <Route
            path="fpl/start/:stage"
            element={
              <Suspense fallback={<RouteFallback />}>
                <StagePage themeKey="fpl" />
              </Suspense>
            }
          />
          <Route
            path="fpl/start"
            element={
              <Suspense fallback={<RouteFallback />}>
                <FplHub />
              </Suspense>
            }
          />
          <Route
            path="teams"
            element={
              <Suspense fallback={<RouteFallback />}>
                <TeamExplorer />
              </Suspense>
            }
          />
          <Route
            path="football/local-clubs"
            element={
              <Suspense fallback={<RouteFallback />}>
                <LocalClubsPage />
              </Suspense>
            }
          />
          <Route
            path="football/teams/:slug"
            element={
              <Suspense fallback={<RouteFallback />}>
                <TeamPage />
              </Suspense>
            }
          />
          {/* Club finances. Deliberately NOT /football/finance: that would be
              captured by the football/:stage journey route. */}
          <Route
            path="football/teams/:slug/finances"
            element={
              <Suspense fallback={<RouteFallback />}>
                <TeamFinancePage />
              </Suspense>
            }
          />
          <Route
            path="football/teams/:slug/:season"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ClubSeasonPage />
              </Suspense>
            }
          />
          <Route
            path="finance/compare"
            element={
              <Suspense fallback={<RouteFallback />}>
                <FinanceComparePage />
              </Suspense>
            }
          />
          <Route
            path="finance"
            element={
              <Suspense fallback={<RouteFallback />}>
                <FinanceIndexPage />
              </Suspense>
            }
          />
          <Route
            path="football/projections"
            element={
              <Suspense fallback={<RouteFallback />}>
                <GameweekBrowser variant="projections" />
              </Suspense>
            }
          />
          <Route
            path="tv-guide"
            element={
              <Suspense fallback={<RouteFallback />}>
                <TvGuidePage />
              </Suspense>
            }
          />
          <Route
            path="affiliate-disclosure"
            element={
              <Suspense fallback={<RouteFallback />}>
                <AffiliateDisclosurePage />
              </Suspense>
            }
          />
          <Route
            path="fixtures"
            element={
              <Suspense fallback={<RouteFallback />}>
                <GameweekBrowser />
              </Suspense>
            }
          />
          <Route
            path="fixtures/changes"
            element={
              <Suspense fallback={<RouteFallback />}>
                <FixtureChangesPage />
              </Suspense>
            }
          />
          <Route
            path="table"
            element={
              <Suspense fallback={<RouteFallback />}>
                <LeagueTable />
              </Suspense>
            }
          />
          <Route
            path="team-strength"
            element={
              <Suspense fallback={<RouteFallback />}>
                <TeamStrengthPage />
              </Suspense>
            }
          />
          <Route
            path="admin/model"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ModelChangesPage />
              </Suspense>
            }
          />
          <Route
            path="admin/ai-lab"
            element={
              <Suspense fallback={<RouteFallback />}>
                <AiLabPage />
              </Suspense>
            }
          />
          <Route
            path="admin/team-ratings"
            element={
              <Suspense fallback={<RouteFallback />}>
                <TeamStrengthPage adminMode />
              </Suspense>
            }
          />
          <Route
            path="preview"
            element={
              <Suspense fallback={<RouteFallback />}>
                <MatchPreview />
              </Suspense>
            }
          />
          <Route
            path="fantasy"
            element={
              <Suspense fallback={<RouteFallback />}>
                <FantasyFixtures />
              </Suspense>
            }
          />
          <Route
            path="fpl"
            element={
              <Suspense fallback={<RouteFallback />}>
                <FplFixturesList />
              </Suspense>
            }
          />
          <Route
            path="fpl/gameweek/:matchweek"
            element={
              <Suspense fallback={<RouteFallback />}>
                <GameweekPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/fixture/:fixtureId"
            element={
              <Suspense fallback={<RouteFallback />}>
                <FixtureProjectionPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/optimal-squad"
            element={
              <Suspense fallback={<RouteFallback />}>
                <OptimalSquadPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/rate-my-team"
            element={
              <Suspense fallback={<RouteFallback />}>
                <SquadCheckPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/optimal-squad-so-far"
            element={
              <Suspense fallback={<RouteFallback />}>
                <HindsightOptimalSquadPage />
              </Suspense>
            }
          />
          <Route
            path="login"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Login />
              </Suspense>
            }
          />
          <Route
            path="football/matches/:slug"
            element={
              <Suspense fallback={<RouteFallback />}>
                <MatchPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/formations"
            element={
              <Suspense fallback={<RouteFallback />}>
                <FormationsPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/team-of-the-week/:gw"
            element={
              <Suspense fallback={<RouteFallback />}>
                <TeamOfTheWeekPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/team-of-the-week"
            element={
              <Suspense fallback={<RouteFallback />}>
                <TeamOfTheWeekPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/model-xi"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ModelXiAccuracyPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/value"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ValuePage />
              </Suspense>
            }
          />
          <Route
            path="fpl/injuries"
            element={
              <Suspense fallback={<RouteFallback />}>
                <InjuriesPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/set-pieces"
            element={
              <Suspense fallback={<RouteFallback />}>
                <SetPiecesPage />
              </Suspense>
            }
          />
          <Route
            path="football/model-accuracy"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ModelAccuracyPage />
              </Suspense>
            }
          />
          <Route
            path="football/model-scorecard"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ModelScorecardPage />
              </Suspense>
            }
          />
          <Route
            path="football/model-returns"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ModelReturnsPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/player-scout/:slug"
            element={
              <Suspense fallback={<RouteFallback />}>
                <PlayerRecordPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/player-scout"
            element={
              <Suspense fallback={<RouteFallback />}>
                <PlayerScoutPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/season-xi"
            element={
              <Suspense fallback={<RouteFallback />}>
                <SeasonXiPage />
              </Suspense>
            }
          />
          {/* In the papers: the Newsroom and the Transfer Window merged. The
              old addresses redirect (also 301s in netlify.toml). */}
          <Route
            path="fpl/in-the-papers"
            element={
              <Suspense fallback={<RouteFallback />}>
                <InThePapersPage />
              </Suspense>
            }
          />
          <Route path="fpl/whats-changed" element={<Navigate to="/fpl/in-the-papers" replace />} />
          <Route
            path="fpl/price-risk"
            element={
              <Suspense fallback={<RouteFallback />}>
                <PriceRiskPage />
              </Suspense>
            }
          />
          <Route path="fpl/market" element={<Navigate to="/fpl/in-the-papers" replace />} />
          <Route path="fpl/squad-check" element={<SquadCheckRedirect />} />
          <Route
            path="fpl/players/:slug"
            element={
              <Suspense fallback={<RouteFallback />}>
                <PlayerPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/player-points"
            element={
              <Suspense fallback={<RouteFallback />}>
                <PlayerProjectionsTablePage />
              </Suspense>
            }
          />
          <Route
            path="fpl/scoring-rules"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ScoringRulesPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/actual-matches"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ActualMatchesPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/actual-matches/:matchweek"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ActualMatchesPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/actual-matches/fixture/:fixtureId"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ActualMatchDetailPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/line-ups"
            element={
              <Suspense fallback={<RouteFallback />}>
                <TacticalRolesAdminPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/tactical-roles"
            element={
              <Suspense fallback={<RouteFallback />}>
                <TacticalRolesAdminPage adminMode />
              </Suspense>
            }
          />
          {/* NFL: the same hub -> stage -> page structure as Football and Fantasy (journey.ts). */}
          <Route
            path="nfl"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NflHub />
              </Suspense>
            }
          />
          <Route
            path="nfl/fixtures"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NflFixturesPage />
              </Suspense>
            }
          />
          <Route
            path="nfl/tv-guide"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NflTvGuidePage />
              </Suspense>
            }
          />
          <Route
            path="nfl/table"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NflTablePage />
              </Suspense>
            }
          />
          <Route
            path="nfl/teams"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NflTeamsPage />
              </Suspense>
            }
          />
          <Route
            path="nfl/teams/:slug"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NflTeamPage />
              </Suspense>
            }
          />
          <Route
            path="nfl/road-trips"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NflRoadTripsPage />
              </Suspense>
            }
          />
          <Route
            path="nfl/pick-my-team"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NflPickMyTeamPage />
              </Suspense>
            }
          />
          <Route
            path="nfl/games/:gameId"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NflGamePage />
              </Suspense>
            }
          />
          <Route
            path="nfl/seasons"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NflSeasonsPage />
              </Suspense>
            }
          />
          <Route
            path="nfl/seasons/:season"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NflSeasonPage />
              </Suspense>
            }
          />
          <Route
            path="nfl/players"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NflPlayersPage />
              </Suspense>
            }
          />
          <Route
            path="nfl/players/:slug"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NflPlayerPage />
              </Suspense>
            }
          />
          <Route
            path="nfl/fixture-heat-map"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NflHeatMapPage />
              </Suspense>
            }
          />
          <Route
            path="nfl/scoring-rules"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NflScoringRulesPage />
              </Suspense>
            }
          />
          <Route
            path="nfl/:stage"
            element={
              <Suspense fallback={<RouteFallback />}>
                <StagePage themeKey="nfl" />
              </Suspense>
            }
          />
          <Route path="nfl/standings" element={<NflOldStandingsRedirect />} />
          <Route path="nfl/standings/:season" element={<NflOldStandingsRedirect />} />
          <Route
            path="results-data"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ResultsData />
              </Suspense>
            }
          />
          <Route
            path="source-data"
            element={
              <Suspense fallback={<RouteFallback />}>
                <SourceData />
              </Suspense>
            }
          />
          <Route
            path="data-health"
            element={
              <Suspense fallback={<RouteFallback />}>
                <DataHealth />
              </Suspense>
            }
          />
          <Route
            path="data-flow"
            element={
              <Suspense fallback={<RouteFallback />}>
                <DataFlow />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NotFoundPage />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  );
}
