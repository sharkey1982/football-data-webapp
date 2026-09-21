// ============================================================================
// src/pages/football/TeamPage.tsx
//
// Canonical public page for one team (/football/teams/:slug).
//
// Replaces TeamExplorer on this route. TeamExplorer is an interactive
// browse-and-compare tool and stays at /teams; it was never designed to
// render from injected data, so it can't be prerendered. This page can,
// which is the point -- a team's rating and fixtures should be readable
// without running JavaScript.
//
// Accepts initialData for static generation, exactly as PlayerPage and
// MatchPage do.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import {
  getTeamPageBySlug,
  getTeamPageMatches,
  type TeamPageProfile,
  type TeamPageMatch,
} from '../../lib/teamPageApi';
import { formatMatchDateWithYear } from '../../lib/formatDate';
import { teamHasFinance } from '../../lib/financeApi';

/** hasFinance: whether this club has published accounts. Static generation
 *  supplies it from ONE bulk query for every team; when absent the page asks
 *  once on the client. The Finances link appears only when it is true. */
export type TeamPageData = { profile: TeamPageProfile; matches: TeamPageMatch[]; hasFinance?: boolean };

export default function TeamPage({ initialData }: { initialData?: TeamPageData } = {}) {
  const { slug } = useParams<{ slug: string }>();
  const [hasFinance, setHasFinance] = useState<boolean | null>(initialData?.hasFinance ?? null);
  const [profile, setProfile] = useState<TeamPageProfile | null>(initialData?.profile ?? null);
  const [matches, setMatches] = useState<TeamPageMatch[]>(initialData?.matches ?? []);
  const [loading, setLoading] = useState(!initialData);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    async function load() {
      if (!slug) return;
      setLoading(true);
      setNotFound(false);
      try {
        const p = await getTeamPageBySlug(slug);
        if (cancelled) return;
        if (!p) {
          setNotFound(true);
          return;
        }
        setProfile(p);
        const m = await getTeamPageMatches(p.team_id, p.league_id);
        if (!cancelled) setMatches(m);
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

  // Must sit with the other hooks, BEFORE the early returns below: a hook
  // after a conditional return runs on some renders and not others, which
  // React rejects.
  useEffect(() => {
    if (hasFinance !== null || !profile) return;
    let cancelled = false;
    teamHasFinance(profile.team_id)
      .then((v) => { if (!cancelled) setHasFinance(v); })
      .catch(() => { if (!cancelled) setHasFinance(false); });
    return () => { cancelled = true; };
  }, [hasFinance, profile]);

  useDocumentHead({
    title: profile ? `${profile.display_name} \u2014 ratings & fixtures` : 'Team',
    description: profile
      ? `Model ratings, results and predicted fixtures for ${profile.display_name}.`
      : 'Team ratings and fixtures.',
    path: slug ? `/football/teams/${slug}` : '/teams',
  });

  if (loading) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;

  if (notFound || !profile) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Team not found</h1>
        <p className="text-ink-700 mt-2">
          No team matches that address.{' '}
          <Link to="/teams" className="text-pitch-800 underline underline-offset-2">
            Browse all teams
          </Link>
          .
        </p>
      </div>
    );
  }

  const played = matches.filter((m) => m.goals_for != null);
  const upcoming = matches.filter((m) => m.status !== 'played').slice(0, 5);

  return (
    <article className="space-y-6">
      <header>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900">{profile.display_name}</h1>
        {profile.league_name && <p className="text-ink-700 mt-1">{profile.league_name}</p>}
        {hasFinance && (
          <p className="mt-2">
            <Link to={`/football/teams/${profile.slug}/finances`} className="inline-block rounded border border-pitch-700 px-3 py-1 text-sm text-pitch-800 hover:border-amber-500">
              Finances &rarr;
            </Link>
          </p>
        )}
        {profile.fitted_at && (
          <p className="text-xs text-ink-500 font-mono mt-2">
            Ratings from the model fit of{' '}
            <time dateTime={profile.fitted_at}>{formatMatchDateWithYear(profile.fitted_at.slice(0, 10))}</time>
          </p>
        )}
      </header>

      {profile.goals_for_per_game != null && profile.goals_against_per_game != null && (
        <section>
          <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Model rating</h2>
          <p className="text-ink-700 mt-1 max-w-prose">
            Against an average opponent on neutral ground, the model expects {profile.display_name} to score{' '}
            <strong>{profile.goals_for_per_game.toFixed(2)}</strong> and concede{' '}
            <strong>{profile.goals_against_per_game.toFixed(2)}</strong> goals per game.
            {profile.is_estimated && (
              <> This is an estimated rating — {profile.display_name} don&rsquo;t yet have enough matches in this division to fit directly.</>
            )}
          </p>
        </section>
      )}

      <section>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Next fixtures</h2>
        {upcoming.length === 0 ? (
          <p className="text-ink-500 text-sm mt-1">No upcoming fixtures.</p>
        ) : (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
              <thead className="bg-chalk-200 text-ink-500">
                <tr>
                  <th scope="col" className="text-left font-medium text-xs px-3 py-2">Date</th>
                  <th scope="col" className="text-left font-medium text-xs px-3 py-2">Opponent</th>
                  <th scope="col" className="text-right font-medium text-xs px-3 py-2">Predicted</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((m, i) => (
                  <tr key={`${m.kickoff_date}-${m.opponent_name}`} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                    <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                      <time dateTime={m.kickoff_date}>{formatMatchDateWithYear(m.kickoff_date)}</time>
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {m.slug ? (
                        <Link to={`/football/matches/${m.slug}`} className="text-pitch-800 underline underline-offset-2">
                          {m.opponent_name}
                        </Link>
                      ) : (
                        m.opponent_name
                      )}{' '}
                      <span className="text-ink-500">({m.is_home ? 'H' : 'A'})</span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                      {m.predicted_goals_for != null
                        ? `${m.predicted_goals_for.toFixed(1)}\u2013${m.predicted_goals_against?.toFixed(1)}`
                        : '\u2014'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Results this season</h2>
        {played.length === 0 ? (
          <p className="text-ink-500 text-sm mt-1">No results yet.</p>
        ) : (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
              <thead className="bg-chalk-200 text-ink-500">
                <tr>
                  <th scope="col" className="text-left font-medium text-xs px-3 py-2">Date</th>
                  <th scope="col" className="text-left font-medium text-xs px-3 py-2">Opponent</th>
                  <th scope="col" className="text-right font-medium text-xs px-3 py-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {played.map((m, i) => (
                  <tr key={`${m.kickoff_date}-${m.opponent_name}`} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                    <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                      <time dateTime={m.kickoff_date}>{formatMatchDateWithYear(m.kickoff_date)}</time>
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {m.opponent_name} <span className="text-ink-500">({m.is_home ? 'H' : 'A'})</span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                      {m.goals_for}&ndash;{m.goals_against}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/teams" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          Explore all teams
        </Link>
        <Link to="/team-strength" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          Team strength ratings
        </Link>
        <Link to="/table" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          League table
        </Link>
      </nav>
    </article>
  );
}
