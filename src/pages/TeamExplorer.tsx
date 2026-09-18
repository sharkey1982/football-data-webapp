import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getLeagues,
  getTeams,
  getTeamBySlug,
  getMatchesForTeam,
  getMostRecentFixtureSeason,
  getTeamsInLeagueFixtures,
  buildMatchTrend,
  type MatchWithNames,
} from '../lib/api';
import { TeamStatsPanel } from '../components/TeamStatsPanel';
import { GoalTrendChart } from '../components/GoalTrendChart';
import { FormSequenceChart } from '../components/FormSequenceChart';
import { useDocumentHead } from '../hooks/useDocumentHead';

type TeamOption = { team_id: number; canonical_name: string; slug: string };
type LeagueOption = { league_id: number; code: string; name: string };

export default function TeamExplorer() {
  const navigate = useNavigate();
  const { slug: routeSlug } = useParams<{ slug?: string }>();

  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [leagueFilter, setLeagueFilter] = useState<number | null>(null);

  const [allTeams, setAllTeams] = useState<TeamOption[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [nameFilter, setNameFilter] = useState('');

  const [team, setTeam] = useState<TeamOption | null>(null);
  const [matches, setMatches] = useState<MatchWithNames[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDocumentHead({
    title: team ? `${team.canonical_name} \u2014 Team Explorer` : 'Team Explorer',
    description: team
      ? `${team.canonical_name}'s recent form, goal trends, and match history.`
      : 'Look up any team\u2019s recent form, goal trends, and head-to-head match history.',
    path: team ? `/football/teams/${team.slug}` : '/teams',
  });

  useEffect(() => {
    getLeagues().then((data) => setLeagues(data ?? []));
  }, []);

  useEffect(() => {
    setLoadingTeams(true);
    setError(null);
    (async () => {
      try {
        if (leagueFilter) {
          const season = await getMostRecentFixtureSeason(leagueFilter);
          if (season) {
            const teams = await getTeamsInLeagueFixtures(leagueFilter, season.season_id);
            setAllTeams(teams);
            return;
          }
        }
        const teams = await getTeams();
        setAllTeams((teams ?? []) as TeamOption[]);
      } catch (err: any) {
        setError(err.message ?? 'Failed to load teams');
      } finally {
        setLoadingTeams(false);
      }
    })();
  }, [leagueFilter]);

  // Resolves /football/teams/:slug on load -- the canonical, bookmarkable
  // entry point requested directly (previously this page had no URL state
  // for the selected team at all: not even a query string, just client
  // component state, so a specific team's view could never be linked to).
  useEffect(() => {
    if (!routeSlug) return;
    let cancelled = false;
    (async () => {
      try {
        const resolved = await getTeamBySlug(routeSlug);
        if (cancelled) return;
        if (!resolved) {
          setError(`No team found for "${routeSlug}".`);
          return;
        }
        await selectTeam(resolved, { updateUrl: false });
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? 'Failed to load team');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSlug]);

  const visibleTeams = allTeams.filter((t) =>
    t.canonical_name.toLowerCase().includes(nameFilter.trim().toLowerCase())
  );

  async function selectTeam(t: TeamOption, opts: { updateUrl?: boolean } = { updateUrl: true }) {
    setTeam(t);
    setError(null);
    setMatches(null);
    // Keeps the URL in sync with whichever team is actually showing, so
    // every team has a durable, shareable link -- replace (not push) so
    // clicking through several teams doesn't fill up back-button history
    // with intermediate selections.
    if (opts.updateUrl !== false && t.slug) {
      navigate(`/football/teams/${t.slug}`, { replace: true });
    }
    try {
      const data = await getMatchesForTeam(t.team_id, 60);
      setMatches(data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load team data');
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wide">
          {team ? team.canonical_name : 'Team Explorer'}
        </h1>
        <p className="text-ink-500 mt-1">
          Browse teams, then dig into their home/away form, goal record, and recent matches.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Filter by division</label>
          <select
            value={leagueFilter ?? ''}
            onChange={(e) => setLeagueFilter(e.target.value ? Number(e.target.value) : null)}
            className="w-full border border-chalk-300 rounded px-3 py-2 bg-white focus:border-pitch-700"
          >
            <option value="">All divisions</option>
            {leagues.map((l) => (
              <option key={l.league_id} value={l.league_id}>
                {l.code} &mdash; {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Filter by name</label>
          <input
            type="text"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Start typing&hellip;"
            className="w-full border border-chalk-300 rounded px-3 py-2 bg-white focus:border-pitch-700"
          />
        </div>
      </div>

      {error && (
        <div className="border border-loss-600 bg-loss-600/10 text-loss-700 px-4 py-3 rounded">{error}</div>
      )}

      {loadingTeams && <p className="text-ink-500 font-mono text-sm">Loading teams&hellip;</p>}

      {!loadingTeams && visibleTeams.length > 0 && (
        <div className="border border-chalk-300 rounded-lg bg-white max-h-64 overflow-y-auto">
          <ul className="divide-y divide-chalk-200">
            {visibleTeams.map((t) => (
              <li key={t.team_id}>
                <button
                  onClick={() => selectTeam(t)}
                  className={[
                    'w-full text-left px-4 py-2 transition-colors',
                    team?.team_id === t.team_id ? 'bg-pitch-800 text-chalk-100' : 'hover:bg-chalk-100',
                  ].join(' ')}
                >
                  {t.canonical_name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {team && matches && <TeamStatsPanel team={team} matches={matches} />}

      {team && matches && matches.length > 0 && (
        <div className="border border-chalk-300 rounded-lg bg-white p-4">
          <h2 className="font-display uppercase text-sm tracking-wide text-ink-500 mb-3">
            Recent form &mdash; last {Math.min(15, matches.length)}
          </h2>
          <div className="space-y-4">
            <GoalTrendChart data={buildMatchTrend(matches.slice(0, 15), team.team_id)} />
            <FormSequenceChart data={buildMatchTrend(matches.slice(0, 15), team.team_id)} />
          </div>
        </div>
      )}
    </div>
  );
}
