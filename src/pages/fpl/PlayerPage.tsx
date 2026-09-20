// ============================================================================
// src/pages/fpl/PlayerPage.tsx
//
// Canonical public page for one FPL player (/fpl/players/:slug) -- the
// first page in the app addressable by a stable, meaningful URL rather
// than by client-side filter state.
//
// Deliberately built with real semantic HTML (h1, article, a genuine
// table with thead/tbody/th scope, <time datetime>) rather than styled
// divs: the whole point of this page is that a projection of 7.3 xPts
// should be something a human, a search engine or a retrieval system can
// find and cite. That also makes it the first page worth prerendering --
// the markup below is what a crawler would receive once that step
// exists, so it needs to carry the meaning on its own.
//
// Freshness comes from the projection rows' own generated_at, NOT from
// render time -- showing "updated just now" on a page whose numbers are
// three days old would be actively misleading.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import {
  getPlayerBySlug,
  getPlayerSeason,
  type PlayerPageProfile,
  type PlayerPageGameweek,
} from '../../lib/fplPlayerPageApi';
import { formatMatchDateWithYear } from '../../lib/formatDate';
import PlayerCareerRecord from '../../components/fpl/PlayerCareerRecord';
import { getPlayerCareer, type PlayerSeason } from '../../lib/playerScoutApi';

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

/** Data injected by the static-site generator so this page can render
 * fully in Node via renderToString, with no browser and no fetch. When
 * absent (i.e. in the normal browser SPA) the page fetches for itself
 * exactly as before -- the two modes share one component, so there's no
 * second copy of this markup that could silently drift from it. */
export type PlayerPageData = { profile: PlayerPageProfile; season: PlayerPageGameweek[] };

export default function PlayerPage({ initialData }: { initialData?: PlayerPageData } = {}) {
  const { slug } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<PlayerPageProfile | null>(initialData?.profile ?? null);
  const [season, setSeason] = useState<PlayerPageGameweek[]>(initialData?.season ?? []);
  const [loading, setLoading] = useState(!initialData);
  const [notFound, setNotFound] = useState(false);
  // The player's actual record across every season held. Fetched
  // SEPARATELY from the profile+projections above, and deliberately
  // allowed to fail on its own: this is a secondary section, and a
  // player with no career history (or a career fetch that errors) should
  // still get their projections page, not a broken one.
  const [career, setCareer] = useState<PlayerSeason[]>([]);

  useEffect(() => {
    // Prerendered: the data is already here, so don't refetch it on
    // hydration and cause a pointless request + flash.
    if (initialData) return;
    let cancelled = false;
    async function load() {
      if (!slug) return;
      setLoading(true);
      setNotFound(false);
      try {
        const p = await getPlayerBySlug(slug);
        if (cancelled) return;
        if (!p) {
          setNotFound(true);
          setProfile(null);
          return;
        }
        setProfile(p);
        const rows = p.canonical_team_id != null ? await getPlayerSeason(p.fpl_player_id, p.canonical_team_id) : [];
        if (!cancelled) setSeason(rows);
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

  // Keyed on fpl_code, not fpl_player_id: FPL reassigns element ids each
  // season, so the cross-season record has to resolve through
  // player_identity. Runs for prerendered pages too -- initialData
  // carries the profile and projections, not the career.
  useEffect(() => {
    const fplCode = profile?.fpl_code;
    if (fplCode == null) {
      setCareer([]);
      return;
    }
    let cancelled = false;
    getPlayerCareer(fplCode)
      .then((rows) => {
        if (!cancelled) setCareer(rows);
      })
      .catch(() => {
        if (!cancelled) setCareer([]);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.fpl_code]);

  const upcoming = season.filter((g) => g.projected_points != null && g.status !== 'played');
  const projectedTotal = upcoming.reduce((sum, g) => sum + (g.projected_points ?? 0), 0);
  const lastGenerated = season.map((g) => g.generated_at).filter((v): v is string => v != null).sort().at(-1) ?? null;
  const modelVersion = season.find((g) => g.model_version != null)?.model_version ?? null;

  useDocumentHead({
    title: profile ? `${profile.full_name} \u2014 FPL projections` : 'Player projections',
    description: profile
      ? `Fantasy Premier League point projections, expected minutes and results for ${profile.full_name} (${profile.team_name}), from the FixtureShark model.`
      : 'Fantasy Premier League player projections.',
    path: slug ? `/fpl/players/${slug}` : '/fpl/players',
  });

  if (loading) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;

  if (notFound || !profile) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Player not found</h1>
        <p className="text-ink-700 mt-2">
          No player matches that address.{' '}
          <Link to="/fpl/player-points" className="text-pitch-800 underline underline-offset-2">
            Browse all players
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <article className="space-y-6">
      <header>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900">{profile.full_name}</h1>
        <p className="text-ink-700 mt-1">
          {profile.position_label} &middot; {profile.team_name}
          {profile.price != null && <> &middot; &pound;{profile.price.toFixed(1)}m</>}
        </p>
        {lastGenerated && (
          <p className="text-xs text-ink-500 font-mono mt-2">
            Projections updated <time dateTime={lastGenerated}>{formatTimestamp(lastGenerated)}</time>
            {modelVersion && <> &middot; model {modelVersion}</>}
          </p>
        )}
      </header>

      {upcoming.length > 0 && (
        <section>
          <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Projected points</h2>
          <p className="text-ink-700 mt-1">
            {profile.full_name} is projected {projectedTotal.toFixed(1)} points across the next {upcoming.length} gameweek
            {upcoming.length === 1 ? '' : 's'}.
          </p>
        </section>
      )}

      <section>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Gameweek by gameweek</h2>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
            <thead className="bg-chalk-200 text-ink-500">
              <tr>
                <th scope="col" className="text-left font-medium text-xs px-3 py-2">Gameweek</th>
                <th scope="col" className="text-left font-medium text-xs px-3 py-2">Date</th>
                <th scope="col" className="text-left font-medium text-xs px-3 py-2">Opponent</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Expected minutes</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Projected points</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Actual points</th>
              </tr>
            </thead>
            <tbody>
              {season.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-ink-500 text-xs">
                    No fixtures found for this player&rsquo;s team.
                  </td>
                </tr>
              )}
              {season.map((g, i) => (
                <tr key={g.matchweek} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                  <th scope="row" className="text-left px-3 py-1.5 font-mono text-xs font-normal">GW{g.matchweek}</th>
                  <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                    <time dateTime={g.kickoff_date}>{formatMatchDateWithYear(g.kickoff_date)}</time>
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    {g.opponent_name} <span className="text-ink-500">({g.is_home ? 'H' : 'A'})</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                    {g.expected_minutes != null ? g.expected_minutes.toFixed(0) : '\u2014'}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                    {g.projected_points != null ? g.projected_points.toFixed(1) : '\u2014'}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                    {g.actual_points != null ? g.actual_points : '\u2014'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* The actual record, below the projections rather than above: this
          page is reached from projection-shaped links, so the forecast
          stays the lede and the history is the evidence under it. Same
          component the scout page uses, so the two can't disagree. */}
      <PlayerCareerRecord career={career} heading="Every season so far" />

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {/* Deep link to the full career view, which still carries what
            this page deliberately doesn't: the contribution split, the
            cumulative line and the per-gameweek breakdown per season.
            ASSUMPTION, checked: the scout route keys on
            player_identity.slug while this page keys on fpl_players.slug
            -- two separately maintained columns that happen to agree for
            all 667 current players today (verified, zero mismatches).
            They're generated by the same rule, so divergence is
            unlikely; if it ever happens this degrades to the scout
            page's own "player not found" state rather than breaking
            anything here. */}
        {profile.slug && career.length > 0 && (
          <Link to={`/fpl/player-scout/${profile.slug}`} className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
            Full career record
          </Link>
        )}
        <Link to="/fpl/player-points" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          All player projections
        </Link>
        <Link to="/fpl/start" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          Fantasy Premier League overview
        </Link>
      </nav>
    </article>
  );
}
