// ============================================================================
// src/pages/Landing.tsx
//
// The home page: a dark, glowing "terminal screen" panel (amber on pitch,
// phosphor glow) as the front door to the lighter pages behind it.
//
// 6 Oct 2026 (Chris): one tile per top-menu section, laid out like phone
// app buttons -- an icon, the name and a few words -- instead of cards with
// a paragraph each, which ran to two screens on a phone. The one sentence
// under the headline says what the site covers, so the tiles don't have to.
// Club finances (The Boardroom) live under Club, so they are named in that
// sentence rather than given a tile. Beat the Shark is the sixth tile, in
// amber, so the grid is 2 x 3 on a phone and 3 x 2 on desktop.
// ============================================================================

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../hooks/useDocumentHead';

/* The game is NOT part of this React app: it is its own Netlify site,
   proxied in at /play/beat-the-shark/. So this must be a plain <a>, never
   a router <Link> -- a Link would look for a /play route inside the app,
   find none, and show "not found". The trailing slash matters too: without
   it the game's scripts resolve to the wrong folder (the game corrects this
   itself, but linking to the right address saves a redirect). */
const GAME_URL = '/play/beat-the-shark/';

// Line icons, drawn for this page (24-unit grid, stroke = currentColor).
const ICONS = {
  football: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5l3.6 2.6-1.4 4.2H9.8L8.4 10.1z" />
      <path d="M12 7.5V3M15.6 10.1l4.2-1.4M14.2 14.3l2.7 3.6M9.8 14.3l-2.7 3.6M8.4 10.1L4.2 8.7" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </>
  ),
  shirt: <path d="M9 3.5L4 6l-1.5 4.5L6 12v8.5h12V12l3.5-1.5L20 6l-5-2.5c-.4 1.5-1.6 2.5-3 2.5s-2.6-1-3-2.5z" />,
  gridiron: (
    <>
      <path d="M4.6 19.4c-1.6-1.6-1.2-6.3 2.6-10.2s8.6-4.2 10.2-2.6 1.2 6.3-2.6 10.2-8.6 4.2-10.2 2.6z" />
      <path d="M9.5 14.5l5-5M10.5 11.5l2 2M12 10l2 2M9 13l2 2" />
    </>
  ),
  tennis: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6c3.2 3.2 3.2 9.6 0 12.8M18.4 5.6c-3.2 3.2-3.2 9.6 0 12.8" />
    </>
  ),
  fin: (
    <>
      <path d="M6 16c2-6 6-10.5 11-12-1.5 4-1.6 8.4 0 12" />
      <path d="M2.5 18.5c1.6 0 1.6-1.2 3.2-1.2s1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2 1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2 1.6 1.2 3 1.2" />
    </>
  ),
} satisfies Record<string, ReactNode>;

// short: the name on a phone, where tiles are ~150px wide (the menu's label).
type Tile = { title: string; short?: string; line: string; icon: keyof typeof ICONS };

// The top menu's sections, in its order.
const SECTIONS: (Tile & { to: string })[] = [
  { to: '/football', title: 'Club football', line: 'Results, tables and predictions', icon: 'football' },
  { to: '/international', title: 'International', line: 'Every nation since 1872', icon: 'globe' },
  { to: '/fpl/start', title: 'Fantasy Premier League', short: 'FPL', line: 'Projections and line-ups', icon: 'shirt' },
  { to: '/nfl', title: 'NFL', line: 'Games, standings and UK TV', icon: 'gridiron' },
  { to: '/tennis', title: 'Tennis', line: 'Players, draws and rivalries', icon: 'tennis' },
];
const GAME: Tile = { title: 'Beat the Shark', line: 'Play a season in five minutes', icon: 'fin' };

// Square-ish tile: icon, name, a few words. The whole tile is the link, so its
// accessible name is the name plus the line.
const TILE =
  'group flex flex-col justify-between gap-3 min-h-[8rem] sm:min-h-[10rem] rounded-xl border-2 p-3.5 sm:p-5 transition-all ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400';

function TileBody({ tile, play = false }: { tile: Tile; play?: boolean }) {
  return (
    <>
      <svg
        viewBox="0 0 24 24"
        className={`w-8 h-8 sm:w-9 sm:h-9 ${play ? 'text-pitch-950' : 'text-amber-400'}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {ICONS[tile.icon]}
      </svg>
      <span>
        <span
          className={`block font-display uppercase tracking-normal sm:tracking-wide text-[1.05rem] min-[400px]:text-lg sm:text-2xl leading-tight ${play ? 'text-pitch-950' : 'text-chalk-100 group-hover:text-amber-400 transition-colors'}`}
        >
          {tile.short ? (
            <>
              <span className="sm:hidden">{tile.short}</span>
              <span className="hidden sm:inline">{tile.title}</span>
            </>
          ) : (
            tile.title
          )}
        </span>
        <span className={`block text-[0.8rem] sm:text-sm mt-1 leading-snug ${play ? 'text-pitch-900' : 'text-chalk-300'}`}>{tile.line}</span>
      </span>
    </>
  );
}

export default function Landing() {
  useDocumentHead({
    title: 'Football, FPL, NFL and tennis: results and predictions',
    raw: true,
    description:
      'Football results, tables and model predictions, international football since 1872, Fantasy Premier League projections, club finances, the NFL and tennis.',
    path: '/',
  });

  return (
    <div className="rounded-xl bg-pitch-950 border border-pitch-700 p-4 sm:p-10 space-y-5 sm:space-y-8">
      <div>
        <h1 className="font-display uppercase tracking-wide text-3xl sm:text-6xl text-amber-400 glow-amber leading-tight">Pick your side.</h1>
        <p className="text-chalk-300 mt-3 sm:mt-4 max-w-prose text-base sm:text-lg">
          Results, tables and model predictions for club and international football, plus Fantasy Premier League tools, club finances, the NFL and tennis.
        </p>
      </div>

      <nav aria-label="Sections" className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4" data-testid="home-sections">
        {SECTIONS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className={`${TILE} border-pitch-700 bg-pitch-900 hover:border-amber-500 hover:bg-pitch-800 hover:shadow-[0_0_30px_rgba(227,180,85,0.25)]`}
          >
            <TileBody tile={t} />
          </Link>
        ))}
        <a href={GAME_URL} className={`${TILE} border-amber-400 bg-amber-500 hover:bg-amber-400 hover:shadow-[0_0_30px_rgba(227,180,85,0.45)]`}>
          <TileBody tile={GAME} play />
        </a>
      </nav>
    </div>
  );
}
