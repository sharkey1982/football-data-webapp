// ============================================================================
// src/components/WatchGuideView.tsx
//
// The TV Guide layout, shared by Football (/tv-guide) and NFL
// (/nfl/tv-guide) so the two cannot drift apart (Chris, 4 Oct 2026: keep
// page layouts consistent across sports). Each page only loads its fixtures
// in the WatchGuideFixture shape and passes the words; everything else --
// quick filters, service/competition/team pickers, the calendar, the day
// groups, WatchOptions and the BroadcastEvent structured data -- lives here.
// src/lib/layoutPairs.ts and src/__tests__/layoutPairs.test.ts enforce it.
//
// Only fixtures with evidence are listed: a fixture missing here is "not
// yet confirmed", never "not on TV" (the page says so). Games confirmed not
// on UK TV are hidden by default and shown by the "Not on UK TV" chip
// (Chris, 7 Oct 2026). Filter options are derived from what's loaded,
// never a fixed list.
// ============================================================================

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { formatMatchDateWithYear } from '../lib/formatDate';
import type { WatchGuideFixture } from '../lib/broadcastsApi';
import { getActivePartners, type AffiliatePartner, type AffiliateSection } from '../lib/commercialLinks';
import WatchOptions from './WatchOptions';
import ServiceCoverageCard from './ServiceCoverageCard';
import TeamPicker from './TeamPicker';
import FixtureCalendarHeatmap from './FixtureCalendarHeatmap';
import RangeControl from './RangeControl';
import { emptyRangeText, longDay, nextDateAfter, parseRange, rangeBounds, rangeCaption, stepRange, type DateRange } from '../lib/dateRange';
import { ukToday } from '../lib/ukDate';
import { buildTeamGroups, groupOptionLabel, GROUP_PREFIX, teamsForValue } from '../lib/teamGroups';
import {
  fixtureWatchState,
  isThisWeekend,
  isTonight,
  providerKeys,
  providerLabel,
  watchGuideJsonLd,
} from '../lib/watchGuide';

/** A guide row: a football fixture as it is, or another sport's game mapped
 * to the same shape. The optional fields override the football defaults. */
export type WatchGuideItem = WatchGuideFixture & {
  /** Where the title links (football: the match page from slug; null = no link). */
  href?: string | null;
  /** The small line under the title (football: competition and model xG). */
  subtitle?: ReactNode;
  /** A note under the viewing routes, e.g. "picked week by week", with a listings link. */
  note?: { text: string; link?: { label: string; url: string } };
  /** The row's title when it isn't "Home v Away" (tennis: the tournament). */
  title?: string;
  /** Shown in the time column instead of the kick-off time or "TBC" (tennis: "On now", "Usually"). */
  timeLabel?: string;
};

export type WatchGuideViewProps = {
  fixtures: WatchGuideItem[] | null;
  error: string | null;
  title: string;
  intro: ReactNode;
  emptyText: string;
  head: { title: string; description: string; path: string };
  /** The team picker (football clubs and divisions, NFL teams); off for tennis, whose rows are tournaments. */
  teamPicker?: boolean;
  /** Which section's affiliate partners apply to this guide's links. */
  section: AffiliateSection;
};

type Quick = 'all' | 'tonight' | 'weekend' | 'free' | 'subscription' | 'ppv' | 'not_live';

const QUICK: { key: Quick; label: string }[] = [
  { key: 'all', label: 'On TV' },
  { key: 'tonight', label: 'Tonight' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'free', label: 'Free' },
  { key: 'subscription', label: 'Subscription' },
  { key: 'ppv', label: 'PPV' },
  { key: 'not_live', label: 'Not on UK TV' },
];

// TV guides list what's coming, so 'All upcoming' is the default here.
const GUIDE_RANGES: readonly DateRange[] = ['all', 'today', 'week', 'month'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const selectClass = 'w-full sm:w-52 border border-chalk-300 rounded px-2 py-1.5 text-sm bg-white focus:border-pitch-700';
const labelClass = 'block text-xs font-medium text-ink-500 mb-1';

function matchesQuick(f: WatchGuideItem, q: Quick): boolean {
  const s = fixtureWatchState(f.offers);
  if (q === 'not_live') return s.kind === 'not_live';
  // Every other view leaves out games confirmed not on UK TV.
  if (s.kind === 'not_live') return false;
  if (q === 'all') return true;
  if (q === 'tonight') return isTonight(f.kickoffDate, f.kickoffTime);
  if (q === 'weekend') return isThisWeekend(f.kickoffDate, f.kickoffTime);
  if (s.kind !== 'watch') return false;
  const tiers = s.groups.map((g) => g.tier);
  if (q === 'free') return tiers.includes('free') || tiers.includes('free_compatible_device');
  return tiers.includes(q);
}

export default function WatchGuideView({ fixtures, error, title, intro, emptyText, head, teamPicker = true, section }: WatchGuideViewProps) {
  const [partners, setPartners] = useState<AffiliatePartner[]>([]);
  const [quick, setQuick] = useState<Quick>('all');
  const [competition, setCompetition] = useState('');
  const [provider, setProvider] = useState('');
  const [team, setTeam] = useState('');
  // Calendar: same two-month heatmap and multi-select behaviour as the
  // fixtures page. No dates selected = no date filter.
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  // ?range=today|week|month (and ?on=YYYY-MM-DD for another week or month).
  const [params, setParams] = useSearchParams();
  const range = parseRange(params.get('range'), GUIDE_RANGES) ?? 'all';
  const ukNow = ukToday();
  const onParam = params.get('on');
  const anchor = range === 'today' || !onParam || !ISO.test(onParam) ? ukNow : onParam;
  const fixed = range === 'today' || range === 'week' || range === 'month' ? range : null;
  const bounds = useMemo(() => (fixed ? rangeBounds(fixed, anchor) : null), [fixed, anchor]);
  function setRange(r: DateRange, on?: string) {
    const next = new URLSearchParams(params);
    if (r === 'all') next.delete('range');
    else next.set('range', r);
    if (on && on !== ukNow) next.set('on', on);
    else next.delete('on');
    setParams(next, { replace: true });
    setSelectedDates(new Set());
  }
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  // Independent of the guide load: a resolver problem must never take the
  // guide down, it just leaves every link canonical.
  useEffect(() => {
    let live = true;
    getActivePartners('streaming', section)
      .then((p) => live && setPartners(p))
      .catch(() => live && setPartners([]));
    return () => {
      live = false;
    };
  }, [section]);

  const all = fixtures ?? [];
  const competitions = useMemo(() => [...new Set(all.map((f) => f.leagueName))].sort(), [all]);
  const providers = useMemo(
    () => [...new Set(all.flatMap((f) => f.offers.flatMap((o) => providerKeys(o))))].sort((a, b) => providerLabel(a).localeCompare(providerLabel(b))),
    [all]
  );
  const teamGroups = useMemo(() => buildTeamGroups(all), [all]);
  // One club or a whole division; either way their European ties count.
  const pickedTeams = useMemo(() => teamsForValue(team, teamGroups), [team, teamGroups]);

  // Everything except the calendar's own date selection -- so the calendar
  // shows where the matching fixtures fall, and picking a team lights up
  // that team's dates (European ties included).
  const beforeDates = useMemo(() => all.filter(
    (f) =>
      matchesQuick(f, quick) &&
      (!bounds || (f.kickoffDate >= bounds.start && f.kickoffDate <= bounds.end)) &&
      (!competition || f.leagueName === competition) &&
      (!provider || f.offers.some((o) => providerKeys(o).includes(provider))) &&
      (!team || pickedTeams.has(f.homeTeamName) || pickedTeams.has(f.awayTeamName))
  ), [all, quick, bounds, competition, provider, team, pickedTeams]);
  // The service summary: the picked team and/or competition, every date,
  // on TV or not -- the question is which service to have, not this week.
  const coverageLabel = [
    team ? (team.startsWith(GROUP_PREFIX) ? groupOptionLabel(team.slice(GROUP_PREFIX.length)) : team) : '',
    competition,
  ].filter(Boolean).join(' \u00b7 ');
  const coverageSet = useMemo(
    () =>
      all.filter(
        (f) =>
          (!competition || f.leagueName === competition) &&
          (!team || pickedTeams.has(f.homeTeamName) || pickedTeams.has(f.awayTeamName))
      ),
    [all, competition, team, pickedTeams]
  );
  const filtered = selectedDates.size === 0 ? beforeDates : beforeDates.filter((f) => selectedDates.has(f.kickoffDate));
  // An empty range points at the next day with games under the same filters.
  const nextGames = bounds && filtered.length === 0
    ? nextDateAfter(
        all.filter((f) => matchesQuick(f, quick) && (!competition || f.leagueName === competition) &&
          (!provider || f.offers.some((o) => providerKeys(o).includes(provider))) &&
          (!team || pickedTeams.has(f.homeTeamName) || pickedTeams.has(f.awayTeamName))).map((f) => f.kickoffDate),
        bounds.end)
    : null;
  const filtersActive = range !== 'all' || quick !== 'all' || competition !== '' || provider !== '' || team !== '' || selectedDates.size > 0;

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
    const m = new Map<string, WatchGuideItem[]>();
    for (const f of filtered) m.set(f.kickoffDate, [...(m.get(f.kickoffDate) ?? []), f]);
    return [...m.entries()];
  }, [filtered]);

  const jsonLd = useMemo(() => watchGuideJsonLd(all), [all]);

  useDocumentHead({ ...head, jsonLd });

  return (
    <div className="max-w-3xl">
      <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">{title}</h1>
      <p className="text-ink-500 text-sm mt-1">{intro}</p>

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
          <div className="mt-3">
            <RangeControl
              options={GUIDE_RANGES}
              value={range}
              onChange={(r) => setRange(r)}
              onStep={(dir) => (fixed === 'week' || fixed === 'month') && setRange(fixed, stepRange(fixed, anchor, dir))}
              caption={fixed ? rangeCaption(fixed, anchor) : undefined}
            />
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
            {teamPicker && (
              <div className="col-span-2 sm:col-span-1 sm:w-64">
                <TeamPicker groups={teamGroups} value={team} onChange={setTeam} />
              </div>
            )}
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setQuick('all');
                  if (range !== 'all') setRange('all');
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

      {coverageLabel && <ServiceCoverageCard label={coverageLabel} fixtures={coverageSet} />}

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
        <p className="text-ink-500 text-sm mt-6">{emptyText}</p>
      )}
      {all.length > 0 && filtered.length === 0 && !bounds && <p className="text-ink-500 text-sm mt-6">No matches for that filter.</p>}
      {all.length > 0 && filtered.length === 0 && bounds && (
        <div className="mt-6 text-sm text-ink-500" data-testid="range-empty">
          <p>
            {emptyRangeText(range)}
            {nextGames ? <>. Next games: {longDay(nextGames)}.</> : ' in the guide yet.'}
          </p>
          {nextGames && (
            <button
              type="button"
              onClick={() => (range === 'today' ? (setRange('all'), setSelectedDates(new Set([nextGames]))) : setRange(range, nextGames))}
              className="mt-2 rounded border border-pitch-700 px-3 py-1 text-xs text-pitch-700"
            >
              Go to {longDay(nextGames)}
            </button>
          )}
        </div>
      )}

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
                  const href = f.href !== undefined ? f.href : f.slug ? `/football/matches/${f.slug}` : null;
                  const name = f.title ?? `${f.homeTeamName} v ${f.awayTeamName}`;
                  return (
                    <li key={f.fixtureId} className="py-3 grid grid-cols-[3.25rem_1fr] gap-x-3">
                      <span className="font-mono text-xs text-ink-500 pt-0.5">{f.timeLabel ?? (f.kickoffTime ? f.kickoffTime.slice(0, 5) : 'TBC')}</span>
                      <div className="min-w-0">
                        {href ? (
                          <Link to={href} className="font-medium text-ink-900 hover:underline">{name}</Link>
                        ) : (
                          <span className="font-medium text-ink-900">{name}</span>
                        )}
                        <p className="text-[11px] text-ink-500">
                          {f.subtitle ?? (
                            <>
                              {f.leagueName}
                              {hasPrediction && <> &middot; Model {f.predictedHomeGoals!.toFixed(1)}&ndash;{f.predictedAwayGoals!.toFixed(1)} xG</>}
                            </>
                          )}
                        </p>
                        <div className="mt-1.5">
                          <WatchOptions offers={f.offers} partners={partners} fixtureId={f.fixtureId} page="tv_guide" />
                          {f.note && (
                            <p className="text-[11px] text-ink-500 mt-1">
                              {f.note.text}
                              {f.note.link && (
                                <>
                                  {' '}
                                  <a href={f.note.link.url} className="underline" rel="nofollow noopener noreferrer" target="_blank">{f.note.link.label}</a>
                                </>
                              )}
                            </p>
                          )}
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
