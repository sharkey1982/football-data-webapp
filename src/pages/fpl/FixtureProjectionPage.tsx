import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getFplFixtureProjection, getFplActualVsPredicted, type FplFixtureProjection, type FplActualVsPredictedFixture } from '../../lib/fplApi';
import ProjectionSummary from '../../components/fpl/ProjectionSummary';
import TeamProjectionPanel from '../../components/fpl/TeamProjectionPanel';
import ActualVsPredictedTable from '../../components/fpl/ActualVsPredictedTable';
import { friendlyError } from '../../lib/errorMessage';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useNoindex } from '../../hooks/useNoindex';
import NotFoundPage from '../NotFoundPage';

export default function FixtureProjectionPage() {
  const { fixtureId } = useParams<{ fixtureId: string }>();
  const parsedId = fixtureId ? Number(fixtureId) : NaN;

  const [projection, setProjection] = useState<FplFixtureProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noProjectionsYet, setNoProjectionsYet] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [actual, setActual] = useState<FplActualVsPredictedFixture | null>(null);
  const [loadingActual, setLoadingActual] = useState(true);
  const [actualError, setActualError] = useState<string | null>(null);

  const invalidId = !Number.isFinite(parsedId);

  useEffect(() => {
    if (invalidId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNoProjectionsYet(false);
    setNotFound(false);
    getFplFixtureProjection(parsedId)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setNotFound(true);
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
        if (!cancelled) setError(friendlyError(e, 'Failed to load projection'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [parsedId, invalidId]);

  // Independent of the projection fetch above -- a fixture can have actual
  // (post-match) data with no projection at all, or vice versa, so neither
  // one gates the other.
  useEffect(() => {
    if (invalidId) return;
    let cancelled = false;
    setLoadingActual(true);
    setActualError(null);
    getFplActualVsPredicted(parsedId)
      .then((data) => {
        if (!cancelled) setActual(data);
      })
      .catch((e) => {
        if (!cancelled) setActualError(friendlyError(e, 'Failed to load actual lineup data'));
      })
      .finally(() => {
        if (!cancelled) setLoadingActual(false);
      });
    return () => {
      cancelled = true;
    };
  }, [parsedId, invalidId]);

  // A per-fixture view keyed by FPL fixture id, reached from Match
  // Projections. Not in the sitemap and noindex (also sent as an
  // X-Robots-Tag header, netlify.toml): the indexable page for a match is
  // /football/matches/:slug (audit 22 Oct 2026, S-10).
  useNoindex(true);
  const title = projection ? `${projection.home.team_name} v ${projection.away.team_name} \u2014 FPL player projections` : 'FPL fixture projections';
  useDocumentHead({
    title,
    description: projection
      ? `Projected FPL points and minutes for every ${projection.home.team_name} and ${projection.away.team_name} player.`
      : 'Projected FPL points and minutes for one fixture.',
    path: !invalidId ? `/fpl/fixture/${parsedId}` : undefined,
  });

  // Not found = no projection AND no played-match data for this id. A
  // historical fixture can have the second without the first.
  const missing = invalidId || (notFound && !loading && !loadingActual && !actual && !actualError);
  if (missing) return <NotFoundPage />;

  const displayError = error;
  const displayLoading = loading;

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
              {actual
                ? 'This fixture has been played, so there are no forward-looking player projections for it \u2014 see the actual result below instead.'
                : "Player projections haven't been generated for this fixture yet \u2014 the expected goals above are available, but individual player numbers aren't modelled for every fixture. Try a gameweek that already has them from the "}
              {!actual && (
                <>
                  <Link to="/fpl" className="underline hover:text-ink-900">
                    Match Projections
                  </Link>{' '}
                  home page.
                </>
              )}
            </p>
          )}
          {!noProjectionsYet && (
            <div className="space-y-4">
              <TeamProjectionPanel team={projection.home} />
              <TeamProjectionPanel team={projection.away} />
            </div>
          )}
        </>
      )}

      {!loadingActual && actualError && <p className="text-loss-700 text-sm">{actualError}</p>}
      {!loadingActual && !actualError && actual && (
        <div>
          <h2 className="font-display uppercase tracking-wide text-sm text-ink-500 mb-2">Actual result</h2>
          <ActualVsPredictedTable home={actual.home} away={actual.away} />
        </div>
      )}
    </div>
  );
}
