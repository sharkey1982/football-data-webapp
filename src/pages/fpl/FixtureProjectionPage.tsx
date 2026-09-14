import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getFplFixtureProjection, type FplFixtureProjection } from '../../lib/fplApi';
import ProjectionSummary from '../../components/fpl/ProjectionSummary';
import TeamProjectionPanel from '../../components/fpl/TeamProjectionPanel';

export default function FixtureProjectionPage() {
  const { fixtureId } = useParams<{ fixtureId: string }>();
  const parsedId = fixtureId ? Number(fixtureId) : NaN;

  const [projection, setProjection] = useState<FplFixtureProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const invalidId = !Number.isFinite(parsedId);

  useEffect(() => {
    if (invalidId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFplFixtureProjection(parsedId)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setError(`No FPL projection found for fixture ${parsedId}.`);
        } else if (data.home.players.length === 0 && data.away.players.length === 0) {
          setError(`Fixture ${parsedId} exists but has no player projections yet.`);
          setProjection(data);
        } else {
          setProjection(data);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load projection');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [parsedId, invalidId]);

  const displayError = invalidId ? 'Invalid fixture ID.' : error;
  const displayLoading = invalidId ? false : loading;

  return (
    <div className="space-y-4">
      <Link to="/fpl" className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
        &larr; All FPL fixtures
      </Link>

      {displayLoading && <p className="text-ink-500 font-mono text-sm">Loading projection&hellip;</p>}
      {displayError && <p className="text-loss-700 text-sm">{displayError}</p>}

      {!displayLoading && projection && (
        <>
          <ProjectionSummary projection={projection} />
          <div className="space-y-4">
            <TeamProjectionPanel team={projection.home} />
            <TeamProjectionPanel team={projection.away} />
          </div>
        </>
      )}
    </div>
  );
}
