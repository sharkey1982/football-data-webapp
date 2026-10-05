// ============================================================================
// src/pages/tennis/TennisTvGuidePage.tsx
//
// /tennis/tv-guide -- where to watch tennis in the UK, by tournament: what's
// under way (from the latest results), this week, next week and the weeks
// after. Dates for coming events are "usually starts", 52 weeks on from last
// year's edition, because the source has results only (design A4). UK rights
// from tennis.broadcasters (checked 5 Oct 2026). Both tours on one page.
// ============================================================================

import { Link } from 'react-router-dom';
import { Country, LevelBadge, PlayerLink, Section, TennisHeader } from '../../components/tennis/TennisBits';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { TENNIS_TV_GUIDE_PATH, loadTennisGuide, tennisEditionPath, tennisEventPath, type TennisGuideData } from '../../lib/tennisApi';
import { guideGroups, guideSentence, type CalendarRow, type TennisEdition } from '../../lib/tennisEvents';
import { shortDate } from '../../lib/tennisStats';

const dayMonth = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function CalendarList({ rows, testId }: { rows: CalendarRow[]; testId: string }) {
  if (!rows.length) return <p className="text-sm text-ink-500">No tournaments usually start then.</p>;
  return (
    <ul className="divide-y divide-chalk-300 border border-chalk-300 rounded-lg bg-white" data-testid={testId}>
      {rows.map((r) => (
        <li key={r.event_id} className="px-3 py-2 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-1 sm:gap-4">
          <div className="space-y-0.5">
            <p className="text-sm">
              <Link to={tennisEventPath(r.tour, r.slug)} className="font-semibold text-pitch-800 underline underline-offset-2">{r.name}</Link>{' '}
              <span className="text-xs font-mono text-ink-500">{r.tour}</span> <LevelBadge level={r.level} />
            </p>
            <p className="text-xs text-ink-700">
              {r.city} <Country code={r.country} short /> · {r.surface} · usually {dayMonth(r.usual_start)} – {dayMonth(r.usual_end)}
              {r.last_winner_slug && <> · {r.last_year} champion <PlayerLink tour={r.tour} slug={r.last_winner_slug} name={r.last_winner!} /></>}
            </p>
          </div>
          <div className="text-sm sm:text-right">
            <p className="font-semibold text-ink-900">{r.channel ?? 'Channel not confirmed'}</p>
            {r.free_to_air && <p className="text-xs text-pitch-800">Free: {r.free_to_air}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function UnderWay({ rows, calendar }: { rows: TennisEdition[]; calendar: CalendarRow[] }) {
  const channel = (e: TennisEdition) => calendar.find((c) => c.event_id === e.event_id);
  return (
    <ul className="divide-y divide-chalk-300 border border-amber-500 rounded-lg bg-white" data-testid="tennis-guide-underway">
      {rows.map((e) => {
        const c = channel(e);
        return (
          <li key={`${e.tournament_id}-${e.year}`} className="px-3 py-2 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-1 sm:gap-4">
            <div>
              <p className="text-sm">
                <Link to={tennisEditionPath(e.tour, e.event_slug, e.year)} className="font-semibold text-pitch-800 underline underline-offset-2">{e.name}</Link>{' '}
                <span className="text-xs font-mono text-ink-500">{e.tour}</span> <LevelBadge level={e.level} />
              </p>
              <p className="text-xs text-ink-700">{`${e.city ?? ''} · ${e.surface ?? ''} · started ${shortDate(e.start_date)} · results to ${shortDate(e.end_date)} (${e.matches} matches)`}</p>
            </div>
            <div className="text-sm sm:text-right">
              <p className="font-semibold text-ink-900">{c?.channel ?? (e.level === 'Grand Slam' ? 'See the Slam broadcaster' : 'Sky Sports')}</p>
              {c?.free_to_air && <p className="text-xs text-pitch-800">Free: {c.free_to_air}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function TennisTvGuidePage({ initialData, today }: { initialData?: TennisGuideData; today?: string }) {
  const day = today ?? new Date().toISOString().slice(0, 10);
  const { data, failed, loading } = useKeyedFetch(day, () => loadTennisGuide(day), initialData ? { key: day, data: initialData } : undefined);
  const g = data ? guideGroups(data.calendar, data.recent, day) : null;
  useDocumentHead({
    title: 'Tennis on TV in the UK: this week and next',
    description: g ? guideSentence(g) : 'Where to watch ATP and WTA tennis in the UK this week and next: Sky Sports, TNT Sports and the BBC.',
    path: TENNIS_TV_GUIDE_PATH,
  });
  const slam = g ? [...g.underWay, ...g.thisWeek, ...g.nextWeek].find((r) => r.level === 'Grand Slam') : null;

  return (
    <article className="space-y-6">
      <TennisHeader title="TV Guide">
        <p className="text-ink-700 max-w-prose">Where to watch tour-level tennis in the UK, tournament by tournament. Sky Sports shows the ATP and WTA tours; the Grand Slams are split between TNT Sports, the BBC and Sky.</p>
      </TennisHeader>
      {failed && <p className="text-ink-700">The TV guide is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {g && data && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="tennis-guide-story">{guideSentence(g)}</p>
          {slam && (
            <p className="rounded-lg bg-amber-500 text-ink-900 px-3 py-2 text-sm font-semibold" data-testid="tennis-guide-slam">
              {`Grand Slam: ${slam.name}. `}
              {'channel' in slam && slam.channel ? `${slam.channel}${slam.free_to_air ? `; free: ${slam.free_to_air}` : ''}.` : ''}
            </p>
          )}
          {g.underWay.length > 0 && (
            <Section title="Under way" id="tg-now">
              <UnderWay rows={g.underWay} calendar={data.calendar} />
            </Section>
          )}
          <Section title="This week" id="tg-this">
            <CalendarList rows={g.thisWeek} testId="tennis-guide-this-week" />
          </Section>
          <Section title="Next week" id="tg-next">
            <CalendarList rows={g.nextWeek} testId="tennis-guide-next-week" />
          </Section>
          {g.later.length > 0 && (
            <Section title="The weeks after" id="tg-later">
              <CalendarList rows={g.later} testId="tennis-guide-later" />
            </Section>
          )}
          <p className="text-xs text-ink-500">
            {`Coming dates are when each tournament usually starts (52 weeks after last year's), until results arrive; check the broadcaster for match times. UK rights as at 5 Oct 2026. Results to ${data.latestDate ? shortDate(data.latestDate) : '–'}.`}
          </p>
        </>
      )}
    </article>
  );
}
