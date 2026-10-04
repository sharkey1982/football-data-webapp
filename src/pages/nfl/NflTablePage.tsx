// ============================================================================
// src/pages/nfl/NflTablePage.tsx
//
// /nfl/table -- "League Table", as in Football: this season's standings by
// division or across the league. ?season= shows any season since 2002 (its
// full story lives on /nfl/seasons/:season). The bare URL is server-rendered.
// ============================================================================

import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import StandingsTables from '../../components/nfl/StandingsTables';
import {
  NFL_HUB_PATH,
  NFL_TABLE_PATH,
  loadLatestNflSeason,
  loadNflStandings,
  nflFixturesPath,
  nflSeasonPath,
  nflTablePath,
  standingsSentence,
  type NflStandingsData,
} from '../../lib/nflApi';

async function loadTable(season: number | null): Promise<NflStandingsData | null> {
  if (season != null) return loadNflStandings(season);
  // Before a season's first game its schedule exists but no standings: show the last season.
  const latest = await loadLatestNflSeason();
  if (latest == null) return null;
  return (await loadNflStandings(latest)) ?? loadNflStandings(latest - 1);
}

export default function NflTablePage({ initialData }: { initialData?: NflStandingsData }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const raw = params.get('season');
  const season = raw && /^\d{4}$/.test(raw) ? Number(raw) : null;
  const { data, failed, loading } = useKeyedFetch(season == null ? 'latest' : String(season), () => loadTable(season), initialData ? { key: 'latest', data: initialData } : undefined);

  useDocumentHead({
    title: data ? `${data.season} NFL league table and standings` : 'NFL league table',
    description: data ? standingsSentence(data) : 'NFL standings by division and across the league.',
    path: NFL_TABLE_PATH,
  });

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot; <Link to="/nfl/discover" className="hover:underline">Discover</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">League Table</h1>
      </header>

      {failed && <p className="text-ink-700">The table is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {!loading && !failed && data === null && <p className="text-ink-700">No standings for that season.</p>}

      {data && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="nfl-standings-story">{standingsSentence(data)}</p>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-500">Season</span>
              <select
                className="border border-chalk-300 rounded px-2 py-1 bg-white"
                value={data.season}
                onChange={(e) => navigate(nflTablePath(Number(e.target.value)))}
              >
                {[...data.seasons].reverse().map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <Link to={nflSeasonPath(data.season)} className="text-pitch-800 underline underline-offset-2 pb-1">{`Story of the ${data.season} season`}</Link>
            <Link to={nflFixturesPath(data.season)} className="text-pitch-800 underline underline-offset-2 pb-1">{`${data.season} fixtures & results`}</Link>
          </div>
          <StandingsTables rows={data.rows} />
        </>
      )}
    </article>
  );
}
