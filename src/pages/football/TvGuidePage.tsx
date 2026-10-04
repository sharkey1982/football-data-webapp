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

export default function TvGuidePage() {
  const [fixtures, setFixtures] = useState<WatchGuideFixture[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getWatchGuide('GB')
      .then((f) => live && setFixtures(f))
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
