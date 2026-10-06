// ============================================================================
// src/pages/tennis/TennisTournamentPage.tsx
//
// /tennis/tournaments/:tour/:slug -- one tournament across the years: the
// story, most titles, the longest winning run at the event and champions by
// year (each year links to its draw). Static for every event.
// ============================================================================

import { useNoindex } from '../../hooks/useNoindex';
import { Link, useParams } from 'react-router-dom';
import SortableTable, { type Column } from '../../components/SortableTable';
import { Country, LevelBadge, PlayerLink, Section, TennisHeader } from '../../components/tennis/TennisBits';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { loadTennisEvent, tennisEditionPath, tennisEventPath, tennisSlamsPath, tennisTournamentsPath, type TennisEventData } from '../../lib/tennisApi';
import { eventSentence, type Champion, type TennisEdition } from '../../lib/tennisEvents';
import { DATA_NOTE, parseTour, shortDate } from '../../lib/tennisStats';

export default function TennisTournamentPage({ initialData }: { initialData?: TennisEventData }) {
  const params = useParams<{ tour: string; slug: string }>();
  const tour = parseTour(params.tour) ?? initialData?.event.tour ?? 'ATP';
  const slug = params.slug ?? initialData?.event.slug ?? '';
  const { data, failed, loading } = useKeyedFetch(
    slug ? `${tour}/${slug}` : null,
    () => loadTennisEvent(tour, slug),
    initialData ? { key: `${initialData.event.tour}/${initialData.event.slug}`, data: initialData } : undefined
  );
  const ev = data?.event;
  const s = data?.summary;
  useDocumentHead({
    title: ev ? `${ev.name} (${tour}): champions, records and draws` : `${tour} tournament`,
    description: ev && s ? eventSentence(ev, s) : `A ${tour} tournament's champions and records.`,
    path: tennisEventPath(tour, slug),
  });

  const champColumns: Column<Champion>[] = [
    { key: 'name', label: 'Player', render: (c) => <PlayerLink tour={tour} slug={c.slug} name={c.name} />, sortValue: (c) => c.name },
    { key: 'titles', label: 'Titles', render: (c) => c.titles, sortValue: (c) => c.titles, align: 'right', descFirst: true },
    { key: 'finals', label: 'Finals', render: (c) => c.finals, sortValue: (c) => c.finals, align: 'right', descFirst: true },
    { key: 'years', label: 'Won in', render: (c) => c.years.join(', '), className: 'hidden sm:table-cell' },
  ];
  const editionColumns: Column<TennisEdition>[] = [
    { key: 'year', label: 'Year', render: (e) => <Link to={tennisEditionPath(tour, slug, e.year)} className="text-pitch-800 underline underline-offset-2">{e.year}</Link>, sortValue: (e) => e.year, descFirst: true },
    { key: 'winner', label: 'Champion', render: (e) => (e.winner_slug ? <PlayerLink tour={tour} slug={e.winner_slug} name={e.winner!} /> : <span className="text-ink-500">{e.matches ? 'in progress' : '–'}</span>), sortValue: (e) => e.winner },
    { key: 'runner', label: 'Runner-up', render: (e) => (e.runner_up_slug ? <PlayerLink tour={tour} slug={e.runner_up_slug} name={e.runner_up!} /> : '–'), sortValue: (e) => e.runner_up, className: 'hidden sm:table-cell' },
    { key: 'name', label: 'Played as', render: (e) => <span>{e.name} <LevelBadge level={e.level} /></span>, sortValue: (e) => e.name, className: 'hidden md:table-cell' },
    { key: 'where', label: 'Where', render: (e) => `${e.city ?? ''}, ${e.surface ?? ''}`, className: 'hidden lg:table-cell' },
    { key: 'dates', label: 'Dates', render: (e) => `${shortDate(e.start_date)} – ${shortDate(e.end_date)}`, sortValue: (e) => e.start_date, className: 'hidden lg:table-cell' },
  ];

  useNoindex(!loading && !failed && !data);
  return (
    <article className="space-y-6">
      <TennisHeader title={ev?.name ?? 'Tournament'} crumb={{ to: tennisTournamentsPath(tour), label: 'Tournaments' }}>
        {ev && (
          <p className="text-sm text-ink-700 flex flex-wrap gap-x-3 items-center">
            <LevelBadge level={ev.level} />
            <span>{ev.city}</span>
            <Country code={ev.country} />
            <span>{ev.surface}</span>
            <span>{tour}</span>
            {ev.level === 'Grand Slam' && <Link to={tennisSlamsPath(tour)} className="text-pitch-800 underline underline-offset-2">All four Grand Slams</Link>}
          </p>
        )}
      </TennisHeader>
      {failed && <p className="text-ink-700">This tournament is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {!loading && !failed && !data && <p className="text-ink-700">No {tour} tournament here. <Link to={tennisTournamentsPath(tour)} className="underline">See every tournament</Link>.</p>}
      {ev && s && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="tennis-event-story">{eventSentence(ev, s)}</p>
          {s.bestRun && s.bestRun.wins >= 5 && (
            <p className="text-sm text-ink-700">
              Longest winning run here: <PlayerLink tour={tour} slug={s.bestRun.slug} name={s.bestRun.name} />, {s.bestRun.wins} matches
              {s.bestRun.from === s.bestRun.to ? ` in ${s.bestRun.from}` : ` from ${s.bestRun.from} to ${s.bestRun.to}`}.
            </p>
          )}
          <ChampionStrip editions={s.editions} tour={tour} slug={slug} />
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
            <Section title="Most titles" id="te-most">
              <SortableTable columns={champColumns} rows={s.champions} rowKey={(c) => c.slug} testId="tennis-event-champions" empty="No final played yet." />
            </Section>
            <Section title="Champions by year" id="te-years">
              <SortableTable columns={editionColumns} rows={s.editions} rowKey={(e) => `${e.tournament_id}-${e.year}`} initialSort={{ key: 'year', dir: 'desc' }} testId="tennis-event-editions" />
            </Section>
          </div>
          <p className="text-xs text-ink-500">{`Editions are grouped across sponsor names; "Played as" is the name that year. ${DATA_NOTE}`}</p>
        </>
      )}
    </article>
  );
}

/** A timeline of champions: one square per year, the same colour for the same multiple champion. */
function ChampionStrip({ editions, tour, slug }: { editions: TennisEdition[]; tour: 'ATP' | 'WTA'; slug: string }) {
  const years = [...editions].sort((a, b) => a.year - b.year);
  if (years.length < 3) return null;
  // Multiple champions get their own shade, by number of titles (top 4); everyone else neutral.
  const counts = new Map<string, number>();
  for (const e of years) if (e.winner_slug) counts.set(e.winner_slug, (counts.get(e.winner_slug) ?? 0) + 1);
  const top = [...counts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s]) => s);
  const shades = ['bg-pitch-800 text-chalk-100', 'bg-amber-500 text-ink-900', 'bg-cup-700 text-chalk-100', 'bg-loss-600 text-chalk-100'];
  const nameOf = (s: string) => years.find((e) => e.winner_slug === s)?.winner ?? s;
  return (
    <figure className="space-y-1" data-testid="tennis-champion-strip">
      <figcaption className="text-sm text-ink-900 font-medium">Champions, year by year</figcaption>
      <ol className="flex flex-wrap gap-1">
        {years.map((e) => {
          const k = e.winner_slug ? top.indexOf(e.winner_slug) : -1;
          return (
            <li key={`${e.tournament_id}-${e.year}`}>
              <Link to={tennisEditionPath(tour, slug, e.year)} title={`${e.year}: ${e.winner ?? 'no champion yet'}`}
                className={`block w-12 rounded px-1 py-0.5 text-center text-[11px] font-mono ${k >= 0 ? shades[k] : 'bg-chalk-200 text-ink-700'} hover:outline hover:outline-1 hover:outline-ink-900`}>
                <span className="block">{e.year}</span>
                <span className="block truncate font-sans">{e.winner ? e.winner.split(' ')[0] : '–'}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      {top.length > 0 && (
        <p className="text-xs text-ink-700 flex flex-wrap gap-3">
          {top.map((s, i) => (
            <span key={s} className="inline-flex items-center gap-1"><span aria-hidden="true" className={`inline-block w-3 h-3 rounded ${shades[i].split(' ')[0]}`} />{`${nameOf(s)} ${counts.get(s)}`}</span>
          ))}
        </p>
      )}
    </figure>
  );
}
