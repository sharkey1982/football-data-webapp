// ============================================================================
// src/pages/Landing.tsx
//
// New homepage (replaces the old default of going straight into the
// Fixtures table, which is still at /fixtures unchanged). Third design
// pass, after direct feedback that the second pass read as too flat/
// static for a first impression. Leans harder into the app's own
// teleprinter/scoreboard identity rather than introducing a new one: a
// dark, glowing "terminal screen" panel -- amber-on-black, phosphor glow,
// bigger and bolder than anything in the lighter, functional pages
// behind it. That contrast is deliberate: dramatic front door, calm
// utility rooms once you're through it.
// ============================================================================

import { Link } from 'react-router-dom';
import { useDocumentHead } from '../hooks/useDocumentHead';

/* The game is NOT part of this React app: it is its own Netlify site,
   proxied in at /play/beat-the-shark/. So this must be a plain <a>, never
   a router <Link> -- a Link would look for a /play route inside the app,
   find none, and show "not found". The trailing slash matters too: without
   it the game's scripts resolve to the wrong folder (the game corrects this
   itself, but linking to the right address saves a redirect). */
const GAME_URL = '/play/beat-the-shark/';

function GameCard() {
  return (
    <a
      href={GAME_URL}
      className="group block border-2 border-amber-500/60 hover:border-amber-400 rounded-lg bg-pitch-900 hover:bg-pitch-800 p-4 sm:p-6 transition-all hover:shadow-[0_0_30px_rgba(227,180,85,0.25)]"
    >
      <p className="font-mono text-xs text-amber-400 uppercase tracking-widest">Play · five minutes</p>
      <h2 className="font-display uppercase tracking-wide text-2xl sm:text-3xl text-chalk-100 group-hover:text-amber-400 transition-colors mt-1">
        Beat the Shark
      </h2>
      <p className="text-chalk-300 mt-2 max-w-prose">
        The model has already predicted where your club finishes. Take charge for a season and prove it wrong.
      </p>
    </a>
  );
}

function ThemeButton({ to, title, description, className = '' }: { to: string; title: string; description: string; className?: string }) {
  return (
    <Link
      to={to}
      className={`${className} group block border-2 border-pitch-700 hover:border-amber-500 rounded-lg bg-pitch-900 hover:bg-pitch-800 p-4 sm:p-6 transition-all hover:shadow-[0_0_30px_rgba(227,180,85,0.25)]`}
    >
      <h2 className="font-display uppercase tracking-wide text-xl sm:text-2xl text-chalk-100 group-hover:text-amber-400 transition-colors">
        {title}
      </h2>
      <p className="text-chalk-300 mt-2 transition-colors">{description}</p>
    </Link>
  );
}

// One card per top-menu section, in the menu's order. Club finances (The
// Boardroom) live under Club > Discover since 4 Oct 2026, so they are named
// in the Club card rather than given their own. The Club card spans the full
// width wherever the grid has two columns, so five cards never leave a gap.
const SECTIONS = [
  { to: '/football', title: 'Club football', description: 'Results, tables and match predictions for English and European leagues, history back to 1992/93, and club finances in The Boardroom.' },
  { to: '/international', title: 'International', description: 'Every men\u2019s international since 1872: each nation\u2019s record, every World Cup and Euro, and the current squads.' },
  { to: '/fpl/start', title: 'Fantasy Premier League', description: 'Player projections, predicted line-ups, injuries and squad tools.' },
  { to: '/nfl', title: 'NFL', description: 'Schedule, standings and team records since 2002, game predictions and UK TV times.' },
  { to: '/tennis', title: 'Tennis', description: 'ATP and WTA results, players, tournaments, rivalries and win chances.' },
] as const;

// Grid placement for five cards: 1 column on a narrow phone; 2 columns with
// Club football across the top; on large screens 3 + 2 in a 6-unit grid.
const PLACEMENT = [
  'min-[420px]:col-span-2 lg:col-span-2',
  'lg:col-span-2',
  'lg:col-span-2',
  'lg:col-span-3',
  'lg:col-span-3',
];

export default function Landing() {
  useDocumentHead({
    title: 'Football, FPL, NFL and tennis: results and predictions',
    raw: true,
    description:
      'Football results, tables and model predictions, international football since 1872, Fantasy Premier League projections, club finances, the NFL and tennis.',
    path: '/',
  });

  return (
    <div className="rounded-xl bg-pitch-950 border border-pitch-700 p-6 sm:p-10 space-y-8">
      <div>
        <p className="font-mono text-xs text-amber-400 uppercase tracking-widest">FixtureShark &middot; Results &amp; Predictions</p>
        <h1 className="font-display uppercase tracking-wide text-4xl sm:text-6xl text-amber-400 mt-2 glow-amber leading-tight">
          Pick your side.
        </h1>
        <p className="text-chalk-300 mt-4 max-w-prose text-base sm:text-lg">
          Discover what's real, see what's predicted, check how it held up, then tune the model yourself.
        </p>
      </div>

      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4" data-testid="home-sections">
        {SECTIONS.map((s, i) => (
          <ThemeButton key={s.to} to={s.to} title={s.title} description={s.description} className={PLACEMENT[i]} />
        ))}
      </div>

      {/* The trivia game moved to the Football and Fantasy hubs, which
          still have it; the home page offers the full game instead. */}
      <GameCard />
    </div>
  );
}
