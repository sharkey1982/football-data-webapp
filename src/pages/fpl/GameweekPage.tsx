import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getSeasonSummary,
  getGameweekFixtures,
  getGameweekPlayerProjections,
  getSeasonActualVsProjected,
  type SeasonGameweekSummary,
  type SeasonFixture,
  type SeasonPlayerProjection,
  type SeasonPlayerActualVsProjected,
} from '../../lib/fplSeasonApi';
import GameweekNav from '../../components/fpl/season/GameweekNav';
import GameweekFixtureList from '../../components/fpl/season/GameweekFixtureList';
import SeasonPlayerTable from '../../components/fpl/season/SeasonPlayerTable';
import SeasonActualVsProjectedTable from '../../components/fpl/season/SeasonActualVsProjectedTable';
import { getErrorMessage } from '../../lib/errorMessage';

/** This whole FPL section only covers the Premier League -- matches the convention already used throughout it (no explicit league picker anywhere else here either). */
const FPL_LEAGUE_ID = 1;
const FPL_SEASON_ID = 13;

/** A known, currently-unresolved backend performance issue -- give a calm, specific explanation instead of a raw Postgres error wall. */
function isTimeoutError(message: string): boolean {
  return /statement timeout/i.test(message);
}

export default function GameweekPage() {
  const { matchweek: matchweekParam } = useParams<{ matchweek: string }>();
  const matchweek = Number(matchweekParam);
  const navigate = useNavigate();

  const [summary, setSummary] = useState<SeasonGameweekSummary[]>([]);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [fixtures, setFixtures] = useState<SeasonFixture[]>([]);
  const [loadingFixtures, setLoadingFixtures] = useState(true);
  const [fixturesError, setFixturesError] = useState<string | null>(null);

  const [players, setPlayers] = useState<SeasonPlayerProjection[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState<number | null>(null);
  const [playersRequested, setPlayersRequested] = useState(false);
  const [playersAttempt, setPlayersAttempt] = useState(0);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);

  const [actualVsProjected, setActualVsProjected] = useState<SeasonPlayerActualVsProjected[] | null>(null);
  const [avpRequested, setAvpRequested] = useState(false);
  const [avpAttempt, setAvpAttempt] = useState(0);
  const [loadingAvp, setLoadingAvp] = useState(false);
  const [avpError, setAvpError] = useState<string | null>(null);

  // Season summary (cheap, 38 rows) -- fetched once, powers the GW picker regardless of which week is selected.
  useEffect(() => {
    let cancelled = false;
    getSeasonSummary()
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((e) => {
        if (!cancelled) setSummaryError(getErrorMessage(e, 'Failed to load season summary'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Selected gameweek's fixtures.
  useEffect(() => {
    if (!Number.isFinite(matchweek)) return;
    let cancelled = false;
    setLoadingFixtures(true);
    setFixturesError(null);
    setSelectedFixtureId(null);
    // Player projections are gated behind an explicit request (see below) --
    // the underlying feed is currently slow enough to time out on every
    // call, so a fresh gameweek starts collapsed rather than firing it
    // automatically.
    setPlayersRequested(false);
    setPlayers([]);
    setPlayersError(null);
    getGameweekFixtures(matchweek)
      .then((data) => {
        if (!cancelled) setFixtures(data);
      })
      .catch((e) => {
        if (!cancelled) setFixturesError(getErrorMessage(e, 'Failed to load gameweek fixtures'));
      })
      .finally(() => {
        if (!cancelled) setLoadingFixtures(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchweek]);

  // Player projections -- only once the user has actually asked for them
  // (via the "Load player projections" button or a fixture's "Show
  // players" toggle), not automatically on every gameweek visit.
  useEffect(() => {
    if (!playersRequested || !Number.isFinite(matchweek) || fixtures.length === 0) return;
    let cancelled = false;
    setLoadingPlayers(true);
    setPlayersError(null);
    const teamNames = new Map<number, string>();
    for (const f of fixtures) {
      teamNames.set(f.home_team_id, f.home_team);
      teamNames.set(f.away_team_id, f.away_team);
    }
    getGameweekPlayerProjections(matchweek, teamNames, selectedFixtureId ?? undefined)
      .then((data) => {
        if (!cancelled) setPlayers(data);
      })
      .catch((e) => {
        if (!cancelled) setPlayersError(getErrorMessage(e, 'Failed to load player projections'));
      })
      .finally(() => {
        if (!cancelled) setLoadingPlayers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchweek, fixtures, selectedFixtureId, playersRequested, playersAttempt]);

  // Season-to-date actual vs projected -- gated behind explicit request like
  // player projections above, and independent of which gameweek is
  // currently selected (it always covers every played fixture so far).
  useEffect(() => {
    if (!avpRequested) return;
    let cancelled = false;
    setLoadingAvp(true);
    setAvpError(null);
    getSeasonActualVsProjected(FPL_LEAGUE_ID, FPL_SEASON_ID)
      .then((data) => {
        if (!cancelled) setActualVsProjected(data);
      })
      .catch((e) => {
        if (!cancelled) setAvpError(getErrorMessage(e, 'Failed to load season actual vs projected totals'));
      })
      .finally(() => {
        if (!cancelled) setLoadingAvp(false);
      });
    return () => {
      cancelled = true;
    };
  }, [avpRequested, avpAttempt]);

  const handleSelectMatchweek = (target: number) => {
    const clamped = summary.length > 0 ? Math.min(Math.max(target, summary[0].matchweek), summary[summary.length - 1].matchweek) : target;
    navigate(`/fpl/gameweek/${clamped}`);
  };

  const handleSelectFixture = (fixtureId: number | null) => {
    setSelectedFixtureId(fixtureId);
    setPlayersRequested(true);
  };

  if (!Number.isFinite(matchweek)) {
    return <p className="text-loss-700 text-sm">Invalid gameweek.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">FPL Projections</h1>
        <p className="text-sm text-ink-500 mt-1">
          Player-level fantasy projections built from the Dixon-Coles fixture model, predicted formations and real tactical
          roles. Browse by gameweek, then open a fixture for the full breakdown.
        </p>
      </div>

      {summaryError && <p className="text-loss-700 text-sm">{summaryError}</p>}

      {summary.length > 0 && <GameweekNav matchweek={matchweek} summary={summary} onSelect={handleSelectMatchweek} />}

      {loadingFixtures && <p className="text-ink-500 font-mono text-sm">{'Loading fixtures\u2026'}</p>}
      {fixturesError && <p className="text-loss-700 text-sm">{fixturesError}</p>}
      {!loadingFixtures && !fixturesError && fixtures.length === 0 && (
        <p className="text-ink-500 text-sm">No fixtures found for gameweek {matchweek}.</p>
      )}
      {!loadingFixtures && fixtures.length > 0 && (
        <GameweekFixtureList fixtures={fixtures} selectedFixtureId={selectedFixtureId} onSelectFixture={handleSelectFixture} />
      )}

      <div>
        <h2 className="font-display uppercase tracking-wide text-sm text-ink-500 mb-2">
          {'Player projections \u2014 '}{selectedFixtureId ? 'selected fixture' : `all of gameweek ${matchweek}`}
        </h2>

        {!playersRequested && !loadingFixtures && fixtures.length > 0 && (
          <button
            type="button"
            onClick={() => setPlayersRequested(true)}
            className="px-3 py-2 text-sm font-medium rounded-lg border border-chalk-300 bg-white text-ink-700 hover:bg-chalk-100 transition-colors"
          >
            Load player projections for gameweek {matchweek}
          </button>
        )}

        {loadingPlayers && <p className="text-ink-500 font-mono text-sm">{'Loading players\u2026'}</p>}

        {playersError && (
          <div className="text-sm bg-chalk-100 border border-chalk-300 rounded-lg px-3 py-2 space-y-1">
            {isTimeoutError(playersError) ? (
              <>
                <p className="text-ink-700">
                  Player projections for this gameweek are taking too long to load right now &mdash; this is a known backend
                  performance issue, not a problem with your connection. Individual fixture pages still work fine in the
                  meantime.
                </p>
                <p className="text-ink-500 text-xs font-mono">{playersError}</p>
              </>
            ) : (
              <p className="text-loss-700">{playersError}</p>
            )}
            <button
              type="button"
              onClick={() => setPlayersAttempt((a) => a + 1)}
              className="text-xs font-medium text-ink-700 underline hover:text-ink-900"
            >
              Try again
            </button>
          </div>
        )}

        {playersRequested && !loadingPlayers && !playersError && <SeasonPlayerTable players={players} />}
      </div>

      <div>
        <h2 className="font-display uppercase tracking-wide text-sm text-ink-500 mb-2">Season to date &mdash; actual vs projected</h2>
        <p className="text-xs text-ink-500 mb-2">
          Totals and points-per-game for every player who&rsquo;s played so far this season, real results against the model&rsquo;s
          own projections for those same played fixtures.
        </p>

        {!avpRequested && (
          <button
            type="button"
            onClick={() => setAvpRequested(true)}
            className="px-3 py-2 text-sm font-medium rounded-lg border border-chalk-300 bg-white text-ink-700 hover:bg-chalk-100 transition-colors"
          >
            Load season totals
          </button>
        )}

        {loadingAvp && <p className="text-ink-500 font-mono text-sm">{'Loading season totals\u2026'}</p>}

        {avpError && (
          <div className="text-sm bg-chalk-100 border border-chalk-300 rounded-lg px-3 py-2 space-y-1">
            {isTimeoutError(avpError) ? (
              <>
                <p className="text-ink-700">
                  Season totals are taking too long to load right now &mdash; this is a known backend performance issue, not a
                  problem with your connection.
                </p>
                <p className="text-ink-500 text-xs font-mono">{avpError}</p>
              </>
            ) : (
              <p className="text-loss-700">{avpError}</p>
            )}
            <button type="button" onClick={() => setAvpAttempt((a) => a + 1)} className="text-xs font-medium text-ink-700 underline hover:text-ink-900">
              Try again
            </button>
          </div>
        )}

        {avpRequested && !loadingAvp && !avpError && actualVsProjected && (
          <>
            {actualVsProjected.length > 0 && actualVsProjected.every((r) => r.projected_total_points === null) && (
              <p className="text-xs text-amber-700 bg-amber-400/10 border border-amber-300/40 rounded-lg px-3 py-2 mb-2">
                No player currently shows a projected total below &mdash; the model doesn&rsquo;t yet have {'\u201c'}leaguewide_v6
                {'\u201d'} projections for any gameweek that&rsquo;s actually been played, so there&rsquo;s nothing to compare
                against yet for this season. Actual totals and PPG on the left are still real and current.
              </p>
            )}
            <SeasonActualVsProjectedTable rows={actualVsProjected} />
          </>
        )}
      </div>
    </div>
  );
}
