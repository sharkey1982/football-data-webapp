// ============================================================================
// src/pages/football/TvGuidePage.tsx
//
// UK Watch Guide: every upcoming fixture we have broadcast evidence for,
// answering "can I watch this live in the UK, and where/how?" per fixture.
// Reads upcoming_watch_guide (one row per viewing offer, plus explicit
// not-televised rows) and groups by fixture -- a match can have several
// legitimate routes (e.g. BBC iPlayer and a free FAST channel) and each is
// shown, cheapest first.
//
// Only fixtures with evidence are listed: a fixture missing here is "not
// yet confirmed", never "not on TV" (the page says so). Filter options are
// derived from what's loaded, never a fixed list.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { formatMatchDateWithYear } from '../../lib/formatDate';
import { getWatchGuide, type WatchGuideFixture } from '../../lib/broadcastsApi';
import { getActivePartners, type AffiliatePartner } from '../../lib/commercialLinks';
import WatchOptions from '../../components/WatchOptions';
import TeamPicker from '../../components/TeamPicker';
import FixtureCalendarHeatmap from '../../components/FixtureCalendarHeatmap';
import { buildTeamGroups } from '../../lib/teamGroups';
import {
  fixtureWatchState,
  isThisWeekend,
  isTonight,
  offerName,
  providerKeys,
  providerLabel,
  tierOf,
} from '../../lib/watchGuide';

type Quick = 'all' | 'tonight' | 'weekend' | 'free' | 'subscription' | 'ppv' | 'not_live';

const QUICK: { key: Quick; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'tonight', label: 'Tonight' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'free', label: 'Free' },
  { key: 'subscription', label: 'Subscription' },
  { key: 'ppv', label: 'PPV' },
  { key: 'not_live', label: 'Not on UK TV' },
];

const selectClass = 'w-full sm:w-52 border border-chalk-300 rounded px-2 py-1.5 text-sm bg-white focus:border-pitch-700';
const labelClass = 'block text-xs font-medium text-ink-500 mb-1';

function matchesQuick(f: WatchGuideFixture, q: Quick): boolean {
  if (q === 'all') return true;
  if (q === 'tonight') return isTonight(f.kickoffDate, f.kickoffTime);
  if (q === 'weekend') return isThisWeekend(f.kickoffDate, f.kickoffTime);
  const s = fixtureWatchState(f.offers);
  if (q === 'not_live') return s.kind === 'not_live';
  if (s.kind !== 'watch') return false;
  const tiers = s.groups.map((g) => g.tier);
  if (q === 'free') return tiers.includes('free') || tiers.includes('free_compatible_device');
  return tiers.includes(q);
}

export default function TvGuidePage() {
  const [fixtures, setFixtures] = useState<WatchGuideFixture[] | null>(null);
  const [partners, setPartners] = useState<AffiliatePartner[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [quick, setQuick] = useState<Quick>('all');
  const [competition, setCompetition] = useState('');
  const [provider, setProvider] = useState('');
  const [team, setTeam] = useState('');
  // Calendar: same two-month heatmap and multi-select behaviour as the
  // fixtures page. No dates selected = no date filter.
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  useEffect(() => {
    let live = true;
    getWatchGuide('GB')
      .then((f) => live && setFixtures(f))
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Failed to load the TV guide'));
    return () => {
      live = false;
    };
  }, []);

  // Independent of the guide load: a resolver problem must never take the
  // guide down, it just leaves every link canonical.
  useEffect(() => {
    let live = true;
    getActivePartners('streaming')
      .then((p) => live && setPartners(p))
      .catch(() => live && setPartners([]));
    return () => {
      live = false;
    };
  }, []);

  const all = fixtures ?? [];
  const competitions = useMemo(() => [...new Set(all.map((f) => f.leagueName))].sort(), [all]);
  const providers = useMemo(
    () => [...new Set(all.flatMap((f) => f.offers.flatMap((o) => providerKeys(o))))].sort((a, b) => providerLabel(a).localeCompare(providerLabel(b))),
    [all]
  );
  const teamGroups = useMemo(() => buildTeamGroups(all), [all]);

  // Everything except the calendar's own date selection -- so the calendar
  // shows where the matching fixtures fall, and picking a team lights up
  // that team's dates (European ties included).
  const beforeDates = all.filter(
    (f) =>
      matchesQuick(f, quick) &&
      (!competition || f.leagueName === competition) &&
      (!provider || f.offers.some((o) => providerKeys(o).includes(provider))) &&
      (!team || f.homeTeamName === team || f.awayTeamName === team)
  );
  const filtered = selectedDates.size === 0 ? beforeDates : beforeDates.filter((f) => selectedDates.has(f.kickoffDate));
  const filtersActive = quick !== 'all' || competition !== '' || provider !== '' || team !== '' || selectedDates.size > 0;

  const { dateCounts, dateTypes } = useMemo(() => {
    const counts: Record<string, number> = {};
    const types: Record<string, 'league' | 'cup' | 'mixed'> = {};
    for (const f of beforeDates) {
      counts[f.kickoffDate] = (counts[f.kickoffDate] ?? 0) + 1;
      const t = f.competitionType === 'league' ? 'league' : 'cup';
      types[f.kickoffDate] = types[f.kickoffDate] && types[f.kickoffDate] !== t ? 'mixed' : t;
    }
    return { dateCounts: counts, dateTypes: types };
  }, [beforeDates]);

  function toggleDate(d: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  const groups = useMemo(() => {
    const m = new Map<string, WatchGuideFixture[]>();
    for (const f of filtered) m.set(f.kickoffDate, [...(m.get(f.kickoffDate) ?? []), f]);
    return [...m.entries()];
  }, [filtered]);

  // Structured data: each listed fixture as a BroadcastEvent naming its
  // services, so "where to watch X v Y" is machine-readable fact. Capped so
  // the head stays small; confirmed offers only.
  const jsonLd = useMemo(() => {
    const events = all
      .filter((f) => fixtureWatchState(f.offers).kind === 'watch')
      .slice(0, 40)
      .map((f) => ({
        '@type': 'BroadcastEvent',
        name: `${f.homeTeamName} v ${f.awayTeamName}`,
        startDate: f.kickoffTime ? `${f.kickoffDate}T${f.kickoffTime}` : f.kickoffDate,
        isLiveBroadcast: true,
        isAccessibleForFree: f.offers.some((o) => ['free', 'free_compatible_device'].includes(tierOf(o))),
        publishedOn: f.offers
          .filter((o) => o.status === 'confirmed_broadcast')
          .map((o) => ({ '@type': 'BroadcastService', name: offerName(o), broadcastDisplayName: o.broadcaster ?? undefined })),
      }));
    return events.length > 0 ? { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: events } : undefined;
  }, [all]);

  useDocumentHead({
    title: 'Football on TV \u2014 UK Watch Guide',
    description:
      'Which football you can watch live in the UK and how: free, subscription or pay-per-view, for the Premier League, Championship, Champions League, Scottish Premiership and more.',
    path: '/tv-guide',
    jsonLd,
  });

  return (
    <div className="max-w-3xl">
      <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Football on TV</h1>
      <p className="text-ink-500 text-sm mt-1">
        Upcoming matches you can watch live in the UK, and how. A match not listed hasn&rsquo;t had its UK broadcast confirmed yet.
      </p>

      {all.length > 0 && (
        <>
          <div className="flex gap-1.5 overflow-x-auto mt-4 pb-1 -mx-1 px-1" role="group" aria-label="Quick filters">
            {QUICK.map((q) => (
              <button
                key={q.key}
                type="button"
                aria-pressed={quick === q.key}
                onClick={() => setQuick(q.key)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
                  quick === q.key ? 'bg-pitch-700 border-pitch-700 text-chalk-100' : 'bg-white border-chalk-300 text-ink-700'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
          {/* Two-across on phones so the matches start within the first screen. */}
          <div className="grid grid-cols-2 gap-2 mt-3 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
            <div>
              <label className={labelClass} htmlFor="provider-filter">Service</label>
              <select id="provider-filter" className={selectClass} value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="">All services</option>
                {providers.map((p) => (
                  <option key={p} value={p}>{providerLabel(p)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="competition-filter">Competition</label>
              <select id="competition-filter" className={selectClass} value={competition} onChange={(e) => setCompetition(e.target.value)}>
                <option value="">All competitions</option>
                {competitions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1 sm:w-64">
              <TeamPicker groups={teamGroups} value={team} onChange={setTeam} />
            </div>
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setQuick('all');
                  setCompetition('');
                  setProvider('');
                  setTeam('');
                  setSelectedDates(new Set());
                }}
                className="text-xs text-ink-500 underline underline-offset-2 mb-2"
              >
                Clear filters
              </button>
            )}
          </div>
        </>
      )}

      {all.length > 0 && (
        <div className="mt-4">
          <FixtureCalendarHeatmap
            dateCounts={dateCounts}
            dateTypes={dateTypes}
            loading={fixtures === null}
            selectedDates={selectedDates}
            onToggleDate={toggleDate}
            viewYear={calYear}
            viewMonth={calMonth}
            onChangeMonth={(y, m) => {
              setCalYear(y);
              setCalMonth(m);
            }}
          />
          {selectedDates.size > 0 && (
            <button type="button" onClick={() => setSelectedDates(new Set())} className="text-xs text-ink-500 underline underline-offset-2 mt-1">
              Show all dates
            </button>
          )}
        </div>
      )}

      {error && <p className="text-loss-700 text-sm mt-4">{error}</p>}
      {fixtures && fixtures.length === 0 && !error && (
        <p className="text-ink-500 text-sm mt-6">No confirmed UK broadcasts right now.</p>
      )}
      {all.length > 0 && filtered.length === 0 && <p className="text-ink-500 text-sm mt-6">No matches for that filter.</p>}

      {groups.length > 0 && (
        <div className="mt-5 space-y-6">
          {groups.map(([date, fs]) => (
            <section key={date} aria-label={formatMatchDateWithYear(date)}>
              <h2 className="font-display uppercase tracking-wide text-sm text-ink-500 border-b border-chalk-300 pb-1 mb-2">
                {formatMatchDateWithYear(date)}
              </h2>
              <ul className="divide-y divide-chalk-300">
                {fs.map((f) => {
                  const hasPrediction = f.predictedHomeGoals != null && f.predictedAwayGoals != null;
                  return (
                    <li key={f.fixtureId} className="py-3 grid grid-cols-[3.25rem_1fr] gap-x-3">
                      <span className="font-mono text-xs text-ink-500 pt-0.5">{f.kickoffTime ? f.kickoffTime.slice(0, 5) : 'TBC'}</span>
                      <div className="min-w-0">
                        {f.slug ? (
                          <Link to={`/football/matches/${f.slug}`} className="font-medium text-ink-900 hover:underline">
                            {f.homeTeamName} v {f.awayTeamName}
                          </Link>
                        ) : (
                          <span className="font-medium text-ink-900">{f.homeTeamName} v {f.awayTeamName}</span>
                        )}
                        <p className="text-[11px] text-ink-500">
                          {f.leagueName}
                          {hasPrediction && <> &middot; Model {f.predictedHomeGoals!.toFixed(1)}&ndash;{f.predictedAwayGoals!.toFixed(1)} xG</>}
                        </p>
                        <div className="mt-1.5">
                          <WatchOptions offers={f.offers} partners={partners} fixtureId={f.fixtureId} page="tv_guide" />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
