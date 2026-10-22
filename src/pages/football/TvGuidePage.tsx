// ============================================================================
// src/pages/football/TvGuidePage.tsx
//
// UK Watch Guide for football: every upcoming fixture we have broadcast
// evidence for (upcoming_watch_guide, one row per viewing offer plus explicit
// not-televised rows, grouped by fixture). The layout is the shared
// WatchGuideView, which the NFL TV Guide uses too.
// ============================================================================

import { useEffect, useState } from 'react';
import WatchGuideView from '../../components/WatchGuideView';
import { getWatchGuide, type WatchGuideFixture } from '../../lib/broadcastsApi';
import { ukToday, addIsoDays } from '../../lib/ukDate';

export default function TvGuidePage() {
  const [fixtures, setFixtures] = useState<WatchGuideFixture[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // The next three weeks first (fast on mobile data), then only the rest
    // of the season, appended (audit S-08: the second pass used to fetch the
    // whole season again, the first three weeks included).
    const until = addIsoDays(ukToday(), 21);
    getWatchGuide('GB', { until })
      .then((first) => {
        if (!live) return;
        setFixtures(first);
        return getWatchGuide('GB', { after: until })
          .then((rest) => live && setFixtures([...first, ...rest]))
          .catch(() => undefined); // keep the first three weeks if only the rest failed
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Failed to load the TV guide'));
    return () => {
      live = false;
    };
  }, []);

  return (
    <WatchGuideView
      fixtures={fixtures}
      error={error}
      title="Football on TV"
      intro={<>Upcoming matches you can watch live in the UK, and how. A match not listed hasn&rsquo;t had its UK broadcast confirmed yet.</>}
      emptyText="No confirmed UK broadcasts right now."
      head={{
        title: 'Football on TV \u2014 UK Watch Guide',
        description:
          'Which football you can watch live in the UK and how: free, subscription or pay-per-view, for the Premier League, Championship, Champions League, Scottish Premiership and more.',
        path: '/tv-guide',
      }}
    />
  );
}
