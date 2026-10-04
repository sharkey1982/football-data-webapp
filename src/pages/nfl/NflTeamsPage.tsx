// ============================================================================
// src/pages/nfl/NflTeamsPage.tsx
//
// /nfl/teams -- "Your Team", as in Football: pick one of the 32 teams, by
// conference and division, with this season's record. Server-rendered.
// ============================================================================

import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { CONFERENCES, DIVISIONS, NFL_HUB_PATH, NFL_TEAMS_PATH, divisionRows, loadNflStandings, loadLatestNflSeason, nflTeamPath, recordLabel, type NflStandingsData } from '../../lib/nflApi';

async function loadTeamsIndex(): Promise<NflStandingsData | null> {
  const latest = await loadLatestNflSeason();
  if (latest == null) return null;
  return (await loadNflStandings(latest)) ?? loadNflStandings(latest - 1);
}

export default function NflTeamsPage({ initialData }: { initialData?: NflStandingsData }) {
  const { data, failed, loading } = useKeyedFetch('teams', loadTeamsIndex, initialData ? { key: 'teams', data: initialData } : undefined);
  useDocumentHead({
    title: 'NFL teams: every team’s season and history',
    description: 'All 32 NFL teams by conference and division, with this season’s record, every season since 2002 and the story of each.',
    path: NFL_TEAMS_PATH,
  });

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot; <Link to="/nfl/discover" className="hover:underline">Discover</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Your Team</h1>
        <p className="text-ink-700 mt-2 max-w-prose">Pick a team for its season so far, its games and where to watch them, every season since 2002 and its fantasy leaders.</p>
      </header>
      {failed && <p className="text-ink-700">Teams are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {CONFERENCES.map((c) => (
            <section key={c} aria-labelledby={`teams-${c}`}>
              <h2 id={`teams-${c}`} className="font-display uppercase tracking-wide text-lg text-ink-900">{c}</h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 mt-2 text-sm">
                {DIVISIONS.map((d) => (
                  <div key={d}>
                    <h3 className="text-xs font-mono uppercase tracking-widest text-ink-500">{`${c} ${d}`}</h3>
                    <ul className="mt-1 space-y-0.5">
                      {divisionRows(data.rows, c, d).map((r) => (
                        <li key={r.franchise}>
                          <Link to={nflTeamPath(r.slug)} className="hover:underline">{r.team_name}</Link>
                          <span className="font-mono text-xs text-ink-500">{` ${recordLabel(r)}`}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
