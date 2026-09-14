import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getSeasonSummary,
  getGameweekFixtures,
  getGameweekPlayerProjections,
  type SeasonGameweekSummary,
  type SeasonFixture,
  type SeasonPlayerProjection,
} from '../../lib/fplSeasonApi';
import GameweekNav from '../../components/fpl/season/GameweekNav';
import GameweekFixtureList from '../../components/fpl/season/GameweekFixtureList';
import SeasonPlayerTable from '../../components/fpl/season/SeasonPlayerTable';
import { getErrorMessage } from '../../lib/errorMessage';

export default function GameweekPage() {
  const { matchweek: matchweekParam } = useParams<{ matchweek: string }>();
  const matchweek = Number(matchweekParam);
  const navigate = useNavigate();

  const [summary, setSummary] = useState<SeasonGameweekSummary[]>([]);
  const [fixtures, setFixtures] = useState<SeasonFixture[]>([]);
  const [players, setPlayers] = useState<SeasonPlayerProjection[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState<number | null>(null);
  const [loadingFixtures, setLoadingFixtures] = useState(true);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Season summary (cheap, 38 rows) -- fetched once, powers the GW picker regardless of which week is selected.
  useEffect(() => {
    let cancelled = false;
    getSeasonSummary()
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load season summary'));
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
    setSelectedFixtureId(null);
    getGameweekFixtures(matchweek)
      .then((data) => {
        if (!cancelled) setFixtures(data);
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load gameweek fixtures'));
      })
      .finally(() => {
        if (!cancelled) setLoadingFixtures(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchweek]);

  // Player projections for the gameweek (or the selected fixture within it) --
  // fetched only once we know the gameweek's own fixtures (for the team-name map),
  // and re-fetched when the fixture filter changes.
  useEffect(() => {
    if (!Number.isFinite(matchweek) || fixtures.length === 0) return;
    let cancelled = false;
    setLoadingPlayers(true);
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
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load player projections'));
      })
      .finally(() => {
        if (!cancelled) setLoadingPlayers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchweek, fixtures, selectedFixtureId]);

  const handleSelectMatchweek = (target: number) => {
    const clamped = summary.length > 0 ? Math.min(Math.max(target, summary[0].matchweek), summary[summary.length - 1].matchweek) : target;
    navigate(`/fpl/gameweek/${clamped}`);
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

      {error && <p className="text-loss-700 text-sm">{error}</p>}

      {summary.length > 0 && <GameweekNav matchweek={matchweek} summary={summary} onSelect={handleSelectMatchweek} />}

      {loadingFixtures && <p className="text-ink-500 font-mono text-sm">{'Loading fixtures\u2026'}</p>}
      {!loadingFixtures && fixtures.length === 0 && !error && (
        <p className="text-ink-500 text-sm">No fixtures found for gameweek {matchweek}.</p>
      )}
      {!loadingFixtures && fixtures.length > 0 && (
        <GameweekFixtureList fixtures={fixtures} selectedFixtureId={selectedFixtureId} onSelectFixture={setSelectedFixtureId} />
      )}

      <div>
        <h2 className="font-display uppercase tracking-wide text-sm text-ink-500 mb-2">
          {'Player projections \u2014 '}{selectedFixtureId ? 'selected fixture' : `all of gameweek ${matchweek}`}
        </h2>
        {loadingPlayers && <p className="text-ink-500 font-mono text-sm">{'Loading players\u2026'}</p>}
        {!loadingPlayers && <SeasonPlayerTable players={players} />}
      </div>
    </div>
  );
}
