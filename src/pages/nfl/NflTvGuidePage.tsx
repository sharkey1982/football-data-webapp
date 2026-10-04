// ============================================================================
// src/pages/nfl/NflTvGuidePage.tsx
//
// /nfl/tv-guide -- the NFL TV Guide. The layout is the shared WatchGuideView,
// exactly as Football's /tv-guide (Chris, 4 Oct 2026: keep layouts
// consistent): this page only maps the rest of the season's games into the
// guide's fixture shape, with the viewing routes from the published UK rights
// (src/lib/nflWatch.ts) and the model's pick where one exists.
// ============================================================================

import { useMemo } from 'react';
import WatchGuideView from '../../components/WatchGuideView';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { NFL_TV_PATH, loadNflUpcoming } from '../../lib/nflApi';
import { NFL_TV_SOURCES, RULES_CHECKED, nflGuideItem } from '../../lib/nflWatch';

export default function NflTvGuidePage() {
  const { data, failed } = useKeyedFetch('upcoming', loadNflUpcoming);
  const fixtures = useMemo(() => (data ? data.games.map((g) => nflGuideItem(g, data.model[g.game_id])) : null), [data]);
  return (
    <WatchGuideView
      fixtures={failed ? [] : fixtures}
      error={failed ? 'Failed to load the TV guide' : null}
      title="NFL on TV"
      intro={
        <>
          Every NFL game left this season and how to watch it live in the UK; times are UK time. Every game streams on DAZN NFL Game Pass; Sky Sports and 5
          (free) show the games below as their published rights say, and pick some Sunday games week by week.{' '}
          {`Rights last checked ${RULES_CHECKED}: `}
          {NFL_TV_SOURCES.map((s, i) => (
            <span key={s.url}>
              {i > 0 && ', '}
              <a href={s.url} className="underline" rel="nofollow noopener noreferrer" target="_blank">{s.label.split(':')[0]}</a>
            </span>
          ))}
          .
        </>
      }
      emptyText="No NFL games left this season."
      head={{
        title: 'NFL on TV — UK Watch Guide',
        description: 'Every NFL game left this season in UK time, with how to watch it live in the UK: Sky Sports, 5 (free) and DAZN NFL Game Pass.',
        path: NFL_TV_PATH,
      }}
    />
  );
}
