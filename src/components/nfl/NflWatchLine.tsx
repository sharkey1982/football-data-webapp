// ============================================================================
// src/components/nfl/NflWatchLine.tsx
//
// Where an NFL game is on in the UK, in one line (free first); the TV Guide
// has the detail. Used on Fixtures & Results and the team pages.
// ============================================================================

import { Link } from 'react-router-dom';
import { NFL_TV_PATH, type NflGame } from '../../lib/nflApi';
import { nflWatch } from '../../lib/nflWatch';
import { offerName, tierOf } from '../../lib/watchGuide';

/** One line: where to watch, free first; the TV Guide has the detail. */
export default function NflWatchLine({ g }: { g: NflGame }) {
  const w = nflWatch(g);
  const names = [...w.offers]
    .sort((a, b) => (tierOf(a) === 'free' ? -1 : 0) - (tierOf(b) === 'free' ? -1 : 0))
    .map((o) => `${offerName(o)}${tierOf(o) === 'free' ? ' (free)' : ''}`);
  return (
    <div className="text-pitch-800" data-testid="nfl-watch-line">
      {`Watch: ${names.join(', ')}`}
      {w.pickedWeekly && (
        <>
          {' '}&middot;{' '}
          <Link to={NFL_TV_PATH} className="underline underline-offset-2">may also be on Sky or 5</Link>
        </>
      )}
    </div>
  );
}

