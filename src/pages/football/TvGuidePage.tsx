// ============================================================================
// src/pages/football/TvGuidePage.tsx
//
// Every upcoming fixture with a confirmed UK broadcast, grouped by date --
// "what's on TV this week" in one place, rather than checking each fixture
// individually. Reads upcoming_broadcast_fixtures (fixture_broadcasts
// joined to fixtures/teams/leagues), so it only ever shows fixtures with a
// real confirmed_broadcast row -- nothing guessed, nothing for a fixture
// whose broadcaster isn't known yet.
//
// Market is GB today. getUpcomingBroadcastFixtures already takes a market
// parameter -- a future per-visitor-location guide is a filter added here,
// not new plumbing underneath it.
//
// The model figure next to each fixture is the same predicted_home_goals/
// predicted_away_goals already frozen on the fixture -- deliberately shown
// as plain expected goals, not run back through the full score grid for a
// "most likely scoreline": this page is a scannable list, not a second
// prediction page, and rounding raw expected goals doesn't overclaim
// precision the way a manufactured exact score would.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { formatMatchDateWithYear } from '../../lib/formatDate';
import { getUpcomingBroadcastFixtures, type UpcomingBroadcastFixture } from '../../lib/broadcastsApi';
import { getActivePartners, resolveCommercialLink, type AffiliatePartner } from '../../lib/commercialLinks';
import { trackEvent } from '../../lib/analytics';

const selectClass = 'w-full sm:w-56 border border-chalk-300 rounded px-2.5 py-2 text-sm bg-white focus:border-pitch-700';
const labelClass = 'block text-xs font-medium text-ink-500 mb-1';

function groupByDate(fixtures: UpcomingBroadcastFixture[]): { date: string; fixtures: UpcomingBroadcastFixture[] }[] {
  const groups = new Map<string, UpcomingBroadcastFixture[]>();
  for (const f of fixtures) {
    groups.set(f.kickoffDate, [...(groups.get(f.kickoffDate) ?? []), f]);
  }
  return [...groups.entries()].map(([date, fs]) => ({ date, fixtures: fs }));
}

export default function TvGuidePage() {
  const [fixtures, setFixtures] = useState<UpcomingBroadcastFixture[] | null>(null);
  const [partners, setPartners] = useState<AffiliatePartner[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [competitionFilter, setCompetitionFilter] = useState<string>('');
  const [broadcasterFilter, setBroadcasterFilter] = useState<string>('');

  useEffect(() => {
    let live = true;
    getUpcomingBroadcastFixtures('GB')
      .then((f) => live && setFixtures(f))
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Failed to load the TV guide'));
    return () => {
      live = false;
    };
  }, []);

  // Independent of the fixture load, same reasoning as everywhere else
  // this pairing appears: a resolver problem must never take the guide
  // itself down, it just falls back to every link being canonical.
  useEffect(() => {
    let live = true;
    getActivePartners('streaming')
      .then((p) => live && setPartners(p))
      .catch(() => live && setPartners([]));
    return () => {
      live = false;
    };
  }, []);

  useDocumentHead({
    title: 'TV Guide',
    description: 'Every upcoming football fixture confirmed for UK TV or streaming, in order, across the Premier League, Bundesliga, Serie A, Ligue 1 and La Liga.',
    path: '/tv-guide',
  });

  // Filter options are derived from what's actually loaded, not a fixed
  // list -- a competition or broadcaster with nothing confirmed right now
  // simply isn't offered, rather than showing an option that filters to
  // an empty list.
  const competitions = useMemo(
    () => [...new Set((fixtures ?? []).map((f) => f.leagueName))].sort(),
    [fixtures]
  );
  const broadcasters = useMemo(
    () => [...new Set((fixtures ?? []).map((f) => f.broadcaster).filter((b): b is string => !!b))].sort(),
    [fixtures]
  );

  const filtersActive = competitionFilter !== '' || broadcasterFilter !== '';
  const filtered = (fixtures ?? []).filter(
    (f) =>
      (!competitionFilter || f.leagueName === competitionFilter) &&
      (!broadcasterFilter || f.broadcaster === broadcasterFilter)
  );
  const groups = groupByDate(filtered);

  return (
    <div className="max-w-3xl">
      <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">TV Guide</h1>
      <p className="text-ink-500 text-sm mt-1">
        Every upcoming fixture with a confirmed UK broadcast, earliest first. A fixture not listed here doesn&rsquo;t
        mean it&rsquo;s not televised &mdash; it means we don&rsquo;t have a confirmed broadcaster for it yet.
      </p>

      {fixtures && fixtures.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 mt-4">
          <div>
            <label className={labelClass} htmlFor="competition-filter">Competition</label>
            <select id="competition-filter" className={selectClass} value={competitionFilter} onChange={(e) => setCompetitionFilter(e.target.value)}>
              <option value="">All competitions</option>
              {competitions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="broadcaster-filter">Broadcaster</label>
            <select id="broadcaster-filter" className={selectClass} value={broadcasterFilter} onChange={(e) => setBroadcasterFilter(e.target.value)}>
              <option value="">All broadcasters</option>
              {broadcasters.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setCompetitionFilter('');
                setBroadcasterFilter('');
              }}
              className="text-xs text-ink-500 underline underline-offset-2 mb-2"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {error && <p className="text-loss-700 text-sm mt-4">{error}</p>}

      {fixtures && fixtures.length === 0 && !error && (
        <p className="text-ink-500 text-sm mt-6">No fixtures with a confirmed UK broadcast right now &mdash; check back closer to kick-off.</p>
      )}

      {fixtures && fixtures.length > 0 && filtered.length === 0 && (
        <p className="text-ink-500 text-sm mt-6">No fixtures match that filter right now.</p>
      )}

      {groups.length > 0 && (
        <div className="mt-6 space-y-6">
          {groups.map((g) => (
            <div key={g.date}>
              <h2 className="font-display uppercase tracking-wide text-sm text-ink-500 border-b border-chalk-300 pb-1 mb-2">
                {formatMatchDateWithYear(g.date)}
              </h2>
              <ul className="divide-y divide-chalk-300">
                {g.fixtures.map((f) => {
                  const link = f.watchUrl ? resolveCommercialLink(f.watchUrl, partners) : null;
                  const hasPrediction = f.predictedHomeGoals != null && f.predictedAwayGoals != null;
                  return (
                    <li key={f.broadcastId} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <span className="font-mono text-xs text-ink-500 w-16 shrink-0">
                        {f.kickoffTime ? f.kickoffTime.slice(0, 5) : ''}
                      </span>
                      <div className="flex-1 min-w-0">
                        <Link to={`/football/matches/${f.slug}`} className="font-medium text-ink-900 hover:underline">
                          {f.homeTeamName} v {f.awayTeamName}
                        </Link>
                        <p className="text-[11px] text-ink-500">
                          {f.leagueName} &middot; {f.countryName}
                          {hasPrediction && (
                            <>
                              {' '}
                              &middot; Model: {f.predictedHomeGoals!.toFixed(1)}&ndash;{f.predictedAwayGoals!.toFixed(1)} expected goals
                            </>
                          )}
                        </p>
                      </div>
                      <div className="text-sm text-ink-700 sm:text-right">
                        <span className="font-medium">{f.channel ?? f.broadcaster}</span>
                        {f.streamingService && <span className="text-ink-500"> &middot; {f.streamingService}</span>}
                        {f.isFreeToAir && <span className="text-pitch-800"> &middot; Free</span>}
                        {link && (
                          <>
                            {' '}
                            &middot;{' '}
                            <a
                              href={link.url}
                              className="text-pitch-800 underline underline-offset-2"
                              rel={link.isAffiliate ? 'sponsored noopener noreferrer' : 'nofollow noopener noreferrer'}
                              onClick={() => {
                                if (link.isAffiliate) {
                                  trackEvent('affiliate_click', {
                                    partner: link.partner?.name ?? '',
                                    category: 'streaming',
                                    fixture_id: f.fixtureId,
                                    page: 'tv_guide',
                                    destination: f.watchUrl ?? '',
                                  });
                                }
                              }}
                            >
                              Watch
                            </a>
                            {link.isAffiliate && (
                              <Link to="/affiliate-disclosure" className="text-[10px] text-ink-500 ml-1 underline" title="This is an affiliate link -- see our affiliate disclosure">
                                Ad
                              </Link>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
