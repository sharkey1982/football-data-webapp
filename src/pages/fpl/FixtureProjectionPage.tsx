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
  const [noProjectionsYet, setNoProjectionsYet] = useState(false);

  const invalidId = !Number.isFinite(parsedId);

  useEffect(() => {
    if (invalidId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNoProjectionsYet(false);
    getFplFixtureProjection(parsedId)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setError(`No fixture found with ID ${parsedId}.`);
        } else if (data.home.players.length === 0 && data.away.players.length === 0) {
          // Most fixtures don't have a player projection yet -- this is a
          // normal, expected state (the model hasn't been run for them),
          // not a failure, so it's shown as an informational note rather
          // than an error.
          setNoProjectionsYet(true);
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
          {noProjectionsYet && (
            <p className="text-sm text-ink-500 bg-chalk-100 border border-chalk-300 rounded-lg px-3 py-2">
              Player projections haven&rsquo;t been generated for this fixture yet &mdash; the Dixon-Coles scoreline above is
              available, but individual player numbers aren&rsquo;t modelled for every fixture. Try a gameweek that already has
              them from the{' '}
              <Link to="/fpl" className="underline hover:text-ink-900">
                FPL Projections
              </Link>{' '}
              home page.
            </p>
          )}
          <div className="space-y-4">
            <TeamProjectionPanel team={projection.home} />
            <TeamProjectionPanel team={projection.away} />
          </div>
        </>
      )}
    </div>
  );
}
