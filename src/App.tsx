import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import MatchExplorer from './pages/MatchExplorer';
import TeamExplorer from './pages/TeamExplorer';
import MatchPreview from './pages/MatchPreview';
import GameweekBrowser from './pages/GameweekBrowser';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<GameweekBrowser />} />
          <Route path="matches" element={<MatchExplorer />} />
          <Route path="teams" element={<TeamExplorer />} />
          <Route path="fixtures" element={<GameweekBrowser />} />
          <Route path="preview" element={<MatchPreview />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
