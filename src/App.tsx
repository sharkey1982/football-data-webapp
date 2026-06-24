import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import TeamExplorer from './pages/TeamExplorer';
import MatchPreview from './pages/MatchPreview';
import GameweekBrowser from './pages/GameweekBrowser';
import RawData from './pages/RawData';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<GameweekBrowser />} />
          <Route path="teams" element={<TeamExplorer />} />
          <Route path="fixtures" element={<GameweekBrowser />} />
          <Route path="preview" element={<MatchPreview />} />
          <Route path="raw-data" element={<RawData />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
