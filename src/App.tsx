import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import TeamExplorer from './pages/TeamExplorer';
import MatchPreview from './pages/MatchPreview';
import GameweekBrowser from './pages/GameweekBrowser';
import LeagueTable from './pages/LeagueTable';
import ResultsData from './pages/ResultsData';
import SourceData from './pages/SourceData';
import FantasyFixtures from './pages/FantasyFixtures';
import FplFixturesList from './pages/fpl/FplFixturesList';
import FixtureProjectionPage from './pages/fpl/FixtureProjectionPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<GameweekBrowser />} />
          <Route path="teams" element={<TeamExplorer />} />
          <Route path="fixtures" element={<GameweekBrowser />} />
          <Route path="table" element={<LeagueTable />} />
          <Route path="preview" element={<MatchPreview />} />
          <Route path="fantasy" element={<FantasyFixtures />} />
          <Route path="fpl" element={<FplFixturesList />} />
          <Route path="fpl/fixture/:fixtureId" element={<FixtureProjectionPage />} />
          <Route path="results-data" element={<ResultsData />} />
          <Route path="source-data" element={<SourceData />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
