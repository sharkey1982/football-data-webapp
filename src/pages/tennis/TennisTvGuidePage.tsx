// ============================================================================
// src/pages/tennis/TennisTvGuidePage.tsx
//
// /tennis/tv-guide -- the tennis TV Guide. The layout is the shared
// WatchGuideView, as Football's /tv-guide and the NFL's (Chris, 6 Oct 2026:
// keep the guides consistent): quick filters, service and competition
// pickers, the calendar, day groups and the viewing routes. This page only
// maps tournaments into the guide's shape (src/lib/tennisWatch.ts). Rows are
// tournaments, not matches, because the source has results only: each sits
// on the day it usually starts, or today while it's on.
// ============================================================================

import { useMemo } from 'react';
import WatchGuideView from '../../components/WatchGuideView';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { TENNIS_TV_GUIDE_PATH, loadTennisGuide, type TennisGuideData } from '../../lib/tennisApi';
import { tennisGuideItems } from '../../lib/tennisWatch';

const SOURCES = [
  { label: 'Sky Sports Tennis', url: 'https://www.sportspro.com/news/sky-sports-tennis-channel-uk-broadcast/' },
  { label: 'UK rights list', url: 'https://en.wikipedia.org/wiki/Sports_broadcasting_contracts_in_the_United_Kingdom' },
];

export default function TennisTvGuidePage({ initialData, today }: { initialData?: TennisGuideData; today?: string }) {
  const day = today ?? new Date().toISOString().slice(0, 10);
  const { data, failed } = useKeyedFetch(day, () => loadTennisGuide(day), initialData ? { key: day, data: initialData } : undefined);
  const fixtures = useMemo(() => (data ? tennisGuideItems(data.calendar, data.recent, day) : null), [data, day]);
  return (
    <WatchGuideView
      fixtures={failed ? [] : fixtures}
      error={failed ? 'Failed to load the TV guide' : null}
      title="Tennis on TV"
      teamPicker={false}
      intro={
        <>
          Tour-level tennis in the UK, tournament by tournament. Sky Sports Tennis shows the ATP and WTA tours; the BBC has Queen’s, Eastbourne and
          Nottingham; the Grand Slams are split between TNT Sports, the BBC and Sky. Coming tournaments are listed on the day they usually start (52 weeks
          after last year’s), as there are no order-of-play times yet. Rights checked 5 Oct 2026:{' '}
          {SOURCES.map((s, i) => (
            <span key={s.url}>
              {i > 0 && ', '}
              <a href={s.url} className="underline" rel="nofollow noopener noreferrer" target="_blank">{s.label}</a>
            </span>
          ))}
          .
        </>
      }
      emptyText="No tournaments in the next few weeks."
      head={{
        title: 'Tennis on TV — UK Watch Guide',
        description: 'Which ATP and WTA tournaments are on this week and next, and how to watch them in the UK: Sky Sports Tennis, the BBC and TNT Sports.',
        path: TENNIS_TV_GUIDE_PATH,
      }}
    />
  );
}
