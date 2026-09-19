import { AuthProvider } from './lib/auth';
import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
const MarketEfficiencyPage = lazy(() => import('./pages/football/MarketEfficiencyPage'));
const FplMarketPage = lazy(() => import('./pages/fpl/FplMarketPage'));
const PriceRiskPage = lazy(() => import('./pages/fpl/PriceRiskPage'));
const DigestPage = lazy(() => import('./pages/fpl/DigestPage'));
const SeasonXiPage = lazy(() => import('./pages/fpl/SeasonXiPage'));
const PlayerScoutPage = lazy(() => import('./pages/fpl/PlayerScoutPage'));
const SetPiecesPage = lazy(() => import('./pages/fpl/SetPiecesPage'));
const InjuriesPage = lazy(() => import('./pages/fpl/InjuriesPage'));
const ValuePage = lazy(() => import('./pages/fpl/ValuePage'));
const TeamOfTheWeekPage = lazy(() => import('./pages/fpl/TeamOfTheWeekPage'));
const FormationsPage = lazy(() => import('./pages/fpl/FormationsPage'));
const Login = lazy(() => import('./pages/Login'));
const LeagueTable = lazy(() => import('./pages/LeagueTable'));
const TeamStrengthPage = lazy(() => import('./pages/TeamStrengthPage'));
const ResultsData = lazy(() => import('./pages/ResultsData'));
const SourceData = lazy(() => import('./pages/SourceData'));
const FantasyFixtures = lazy(() => import('./pages/FantasyFixtures'));
const DataHealth = lazy(() => import('./pages/DataHealth'));
const FplFixturesList = lazy(() => import('./pages/fpl/FplFixturesList'));
const GameweekPage = lazy(() => import('./pages/fpl/GameweekPage'));
const FixtureProjectionPage = lazy(() => import('./pages/fpl/FixtureProjectionPage'));
const OptimalSquadPage = lazy(() => import('./pages/fpl/OptimalSquadPage'));
const HindsightOptimalSquadPage = lazy(() => import('./pages/fpl/HindsightOptimalSquadPage'));
const PlayerProjectionsTablePage = lazy(() => import('./pages/fpl/PlayerProjectionsTablePage'));
const ScoringRulesPage = lazy(() => import('./pages/fpl/ScoringRulesPage'));
const ActualMatchesPage = lazy(() => import('./pages/fpl/ActualMatchesPage'));
const ActualMatchDetailPage = lazy(() => import('./pages/fpl/ActualMatchDetailPage'));
const TacticalRolesAdminPage = lazy(() => import('./pages/fpl/TacticalRolesAdminPage'));

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
            path="football/leagues-compared"
            element={
              <Suspense fallback={<RouteFallback />}>
                <CrossLeaguePage />
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
            path="football/teams/:slug"
            element={
              <Suspense fallback={<RouteFallback />}>
                <TeamPage />
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
            path="fixtures"
            element={
              <Suspense fallback={<RouteFallback />}>
                <GameweekBrowser />
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
            path="fpl/player-scout/:slug"
            element={
              <Suspense fallback={<RouteFallback />}>
                <PlayerScoutPage />
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
          <Route
            path="fpl/whats-changed"
            element={
              <Suspense fallback={<RouteFallback />}>
                <DigestPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/price-risk"
            element={
              <Suspense fallback={<RouteFallback />}>
                <PriceRiskPage />
              </Suspense>
            }
          />
          <Route
            path="fpl/market"
            element={
              <Suspense fallback={<RouteFallback />}>
                <FplMarketPage />
              </Suspense>
            }
          />
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
            path="fpl/tactical-roles"
            element={
              <Suspense fallback={<RouteFallback />}>
                <TacticalRolesAdminPage />
              </Suspense>
            }
          />
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
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  );
}
