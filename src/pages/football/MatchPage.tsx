// ============================================================================
// src/pages/football/MatchPage.tsx
//
// Canonical public page for one fixture (/football/matches/:slug).
//
// Answers, in plain crawlable HTML, the questions the model can actually
// answer about a specific match: what probability it assigns to each
// outcome, and what the most likely exact score is. Those are stated in
// prose AND in a table -- a probability that exists only as a shaded
// cell in a heatmap can't be read by anything that doesn't render.
//
// The prediction shown is the one frozen on the fixture itself, so for a
// played match this page genuinely says "this is what we forecast before
// kickoff" next to what actually happened, rather than a retrospectively
// recomputed number.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { getMatchBySlug, mostLikelyScore, type MatchPagePrediction } from '../../lib/matchPageApi';
import { formatMatchDateWithYear } from '../../lib/formatDate';
import { getFixtureBroadcast, type FixtureBroadcast } from '../../lib/broadcastsApi';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

/** Injected by the static-site generator -- see PlayerPage's equivalent
 * for the reasoning. Absent in the browser, where the page fetches as
 * before. */
export default function MatchPage({ initialData }: { initialData?: MatchPagePrediction } = {}) {
  const { slug } = useParams<{ slug: string }>();
  const [match, setMatch] = useState<MatchPagePrediction | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [notFound, setNotFound] = useState(false);
  const [broadcasts, setBroadcasts] = useState<FixtureBroadcast[]>([]);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    async function load() {
      if (!slug) return;
      setLoading(true);
      setNotFound(false);
      try {
        const m = await getMatchBySlug(slug);
        if (cancelled) return;
        if (!m) setNotFound(true);
        else setMatch(m);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug, initialData]);

  // Independent of the prediction load above (and of initialData -- static
  // generation covers the prediction only) so a broadcast-data hiccup can
  // never take down the page's core reason for existing. No row at all
  // means not yet determined -- rendered as no section, not a guess.
  useEffect(() => {
    if (!match?.fixture_id) return;
    let live = true;
    getFixtureBroadcast(match.fixture_id)
      .then((b) => live && setBroadcasts(b))
      .catch(() => live && setBroadcasts([]));
    return () => {
      live = false;
    };
  }, [match?.fixture_id]);

  const title = match ? `${match.home_team_name} v ${match.away_team_name}` : 'Match prediction';
  // UK-only for now (the schema already supports other markets -- see
  // broadcastsApi.ts); shown in metadata only once real data exists, so
  // this never generates a page that promises a broadcaster it doesn't know.
  const confirmedBroadcast = broadcasts.filter((b) => b.status === 'confirmed_broadcast');
  const notTelevised = broadcasts.some((b) => b.status === 'confirmed_not_televised');
  const tvSuffix = confirmedBroadcast.length > 0
    ? ` Watch on ${[...new Set(confirmedBroadcast.map((b) => b.broadcaster))].join(' or ')} in the UK.`
    : '';

  useDocumentHead({
    title: match ? `${title} \u2014 prediction` : title,
    description: match
      ? `Model prediction for ${title} on ${formatMatchDateWithYear(match.kickoff_date)}: outcome probabilities, expected goals and the most likely scoreline.${tvSuffix}`
      : 'Football match prediction.',
    path: slug ? `/football/matches/${slug}` : '/football',
  });

  if (loading) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;

  if (notFound || !match) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Match not found</h1>
        <p className="text-ink-700 mt-2">
          No fixture matches that address.{' '}
          <Link to="/fixtures" className="text-pitch-800 underline underline-offset-2">
            Browse all fixtures
          </Link>
          .
        </p>
      </div>
    );
  }

  const likely = match.model ? mostLikelyScore(match.model) : null;
  const played = match.status === 'played' && match.actual_home_goals != null;

  return (
    <article className="space-y-6">
      <header>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900">
          {match.home_team_name} v {match.away_team_name}
        </h1>
        <p className="text-ink-700 mt-1">
          {match.league_name}
          {match.matchweek != null && <> &middot; Matchweek {match.matchweek}</>} &middot;{' '}
          <time dateTime={match.kickoff_date}>{formatMatchDateWithYear(match.kickoff_date)}</time>
        </p>
        {match.predicted_at && (
          <p className="text-xs text-ink-500 font-mono mt-2">
            Prediction made <time dateTime={match.predicted_at}>{formatTimestamp(match.predicted_at)}</time>
            {match.fit_run_id != null && <> &middot; model fit #{match.fit_run_id}</>}
          </p>
        )}
      </header>

      {(confirmedBroadcast.length > 0 || notTelevised) && (
        <section aria-label="Where to watch">
          <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Where to watch (UK)</h2>
          {notTelevised ? (
            <p className="text-ink-700 mt-1">Confirmed not televised in the UK.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {confirmedBroadcast.map((b) => (
                <li key={b.broadcastId} className="text-ink-700">
                  <span className="font-medium text-ink-900">{b.channel ?? b.broadcaster}</span>
                  {b.streamingService && <> &middot; {b.streamingService}</>}
                  {b.isFreeToAir && <span className="text-pitch-800"> &middot; Free-to-air</span>}
                  {b.watchUrl && (
                    <>
                      {' '}
                      &middot;{' '}
                      <a href={b.watchUrl} className="text-pitch-800 underline underline-offset-2" rel="nofollow noopener noreferrer">
                        Watch
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {played && (
        <section>
          <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Result</h2>
          <p className="text-ink-900 mt-1 text-lg">
            {match.home_team_name} {match.actual_home_goals}&ndash;{match.actual_away_goals} {match.away_team_name}
          </p>
        </section>
      )}

      {match.model ? (
        <>
          <section>
            <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">
              {played ? 'What the model predicted beforehand' : 'Prediction'}
            </h2>
            <p className="text-ink-700 mt-1 max-w-prose">
              The model {played ? 'gave' : 'gives'} {match.home_team_name} a {match.model.homeWinPct.toFixed(1)}% chance of
              winning, {match.model.drawPct.toFixed(1)}% for a draw, and {match.model.awayWinPct.toFixed(1)}% for{' '}
              {match.away_team_name}. Expected goals: {match.predicted_home_goals?.toFixed(2)} &ndash;{' '}
              {match.predicted_away_goals?.toFixed(2)}.
              {likely && (
                <>
                  {' '}
                  The single most likely scoreline {played ? 'was' : 'is'}{' '}
                  <strong>
                    {likely.home}&ndash;{likely.away}
                  </strong>{' '}
                  at {(likely.probability * 100).toFixed(1)}%.
                </>
              )}
            </p>
          </section>

          <section>
            <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Outcome probabilities</h2>
            <div className="overflow-x-auto mt-2">
              <table className="w-full max-w-md text-sm border border-chalk-300 rounded-lg overflow-hidden">
                <thead className="bg-chalk-200 text-ink-500">
                  <tr>
                    <th scope="col" className="text-left font-medium text-xs px-3 py-2">Outcome</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">Probability</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row" className="text-left px-3 py-1.5 font-normal text-xs">{match.home_team_name} win</th>
                    <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{match.model.homeWinPct.toFixed(1)}%</td>
                  </tr>
                  <tr className="bg-chalk-100/60">
                    <th scope="row" className="text-left px-3 py-1.5 font-normal text-xs">Draw</th>
                    <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{match.model.drawPct.toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <th scope="row" className="text-left px-3 py-1.5 font-normal text-xs">{match.away_team_name} win</th>
                    <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{match.model.awayWinPct.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <p className="text-ink-500 text-sm">No model prediction is available for this fixture.</p>
      )}

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/fixtures" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          All fixtures &amp; results
        </Link>
        <Link to="/team-strength" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          Team strength ratings
        </Link>
        <Link to="/football" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          Football overview
        </Link>
      </nav>
    </article>
  );
}
