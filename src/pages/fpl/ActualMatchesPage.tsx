// ============================================================================
// src/pages/fpl/ActualMatchesPage.tsx
//
// The actual-results counterpart to Match Projections -- real final
// scores, real FPL stats, for gameweeks already played. Defaults to the
// most recently fully-played gameweek (not the upcoming one, which is
// what Match Projections defaults to). Reuses the same GameweekNav
// component as Match Projections for consistency.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSeasonSummary, type SeasonGameweekSummary } from '../../lib/fplSeasonApi';
import { getActualMatchFixtures, type ActualMatchFixture } from '../../lib/fplActualMatchApi';
import GameweekNav from '../../components/fpl/season/GameweekNav';
import { getErrorMessage } from '../../lib/errorMessage';

export default function ActualMatchesPage() {
  const { matchweek: matchweekParam } = useParams<{ matchweek: string }>();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<SeasonGameweekSummary[]>([]);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [fixtures, setFixtures] = useState<ActualMatchFixture[]>([]);
  const [loadingFixtures, setLoadingFixtures] = useState(true);
  const [fixturesError, setFixturesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSeasonSummary()
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((e) => {
        if (!cancelled) setSummaryError(getErrorMessage(e, 'Failed to load the season summary'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Default to the most recently FULLY played gameweek, not the upcoming
  // one -- this page is specifically about what already happened.
  const defaultMatchweek = useMemo(() => {
    const played = summary.filter((s) => s.fixture_count > 0 && s.played_count === s.fixture_count);
    return played.length > 0 ? played[played.length - 1].matchweek : summary.length > 0 ? summary[0].matchweek : 1;
  }, [summary]);

  const matchweek = matchweekParam ? Number(matchweekParam) : defaultMatchweek;

  useEffect(() => {
    if (!matchweekParam && summary.length > 0) {
      navigate(`/fpl/actual-matches/${defaultMatchweek}`, { replace: true });
    }
  }, [matchweekParam, summary.length, defaultMatchweek, navigate]);

  useEffect(() => {
    if (!Number.isFinite(matchweek)) return;
    let cancelled = false;
    setLoadingFixtures(true);
    setFixturesError(null);
    getActualMatchFixtures(matchweek)
      .then((data) => {
        if (!cancelled) setFixtures(data);
      })
      .catch((e) => {
        if (!cancelled) setFixturesError(getErrorMessage(e, 'Failed to load fixtures'));
      })
      .finally(() => {
        if (!cancelled) setLoadingFixtures(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchweek]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Actual Matches</h1>
        <p className="text-sm text-ink-500 mt-1">
          Real results and real FPL stats for gameweeks already played &mdash; the counterpart to Match Projections.
          There&rsquo;s a genuine data gap for proper starting lineups/formations here (no per-match source for who
          started in what shape), so players are listed by minutes played within each team instead of on a pitch
          diagram &mdash; the stats themselves (goals, assists, bonus, points) are the real, official numbers.
        </p>
      </div>

      {summaryError && <p className="text-loss-700 text-sm">{summaryError}</p>}

      {summary.length > 0 && Number.isFinite(matchweek) && (
        <GameweekNav matchweek={matchweek} summary={summary} onSelect={(mw) => navigate(`/fpl/actual-matches/${mw}`)} />
      )}

      {loadingFixtures && <p className="text-ink-500 font-mono text-sm">{'Loading\u2026'}</p>}
      {fixturesError && <p className="text-loss-700 text-sm">{fixturesError}</p>}

      {!loadingFixtures && !fixturesError && (
        <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
          <ul className="divide-y divide-chalk-200">
            {fixtures.map((f) => (
              <li key={f.fixture_id}>
                <a
                  href={`/fpl/actual-matches/fixture/${f.fixture_id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/fpl/actual-matches/fixture/${f.fixture_id}`);
                  }}
                  className="flex items-center justify-between px-3 py-2.5 hover:bg-chalk-100 transition-colors"
                >
                  <span className="text-sm text-ink-900">
                    {f.home_team} <span className="text-ink-400">v</span> {f.away_team}
                  </span>
                  {f.finished ? (
                    <span className="font-mono text-sm font-semibold text-ink-900">
                      {f.home_score} &ndash; {f.away_score}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-500">Not yet played</span>
                  )}
                </a>
              </li>
            ))}
            {fixtures.length === 0 && <li className="px-3 py-4 text-sm text-ink-500">No fixtures found for this gameweek.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
