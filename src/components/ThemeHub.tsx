// ============================================================================
// src/components/ThemeHub.tsx
//
// A theme's hub: four compact stage boxes in a 2x2 grid, plus trivia.
//
// The boxes are deliberately sparse -- a number, a title and a few
// words. All four have to fit one phone screen, which the previous
// version didn't come close to: each box carried a full paragraph and
// its own list of links, so Configure sat well below the fold and the
// journey stopped looking like four equal steps.
//
// The detail those boxes used to hold now lives on each stage's own
// page, which is also where it can be expanded without the hub growing.
// ============================================================================

import { Link } from 'react-router-dom';
import { TriviaCarousel } from './TriviaCarousel';
import type { TriviaFact } from '../lib/landingApi';
import { stagePath, type JourneyTheme } from '../lib/journey';

export function ThemeHub({ theme, trivia }: { theme: JourneyTheme; trivia: TriviaFact[] }) {
  return (
    <div className="rounded-xl bg-pitch-950 border border-pitch-700 p-5 sm:p-10 space-y-6">
      <div>
        <p className="font-mono text-xs text-amber-400 uppercase tracking-widest">{theme.eyebrow}</p>
        <h1 className="font-display uppercase tracking-wide text-3xl sm:text-5xl text-amber-400 mt-2 glow-amber">{theme.title}</h1>
        <p className="text-chalk-300 mt-2 max-w-prose text-sm sm:text-base">{theme.intro}</p>
      </div>

      {/* grid-cols-2 at every width -- 2x2 on mobile as well as desktop. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {theme.stages.map((stage) => (
          <Link
            key={stage.key}
            to={stagePath(theme, stage)}
            className="group block border-2 border-pitch-700 hover:border-amber-500 rounded-lg bg-pitch-900 hover:bg-pitch-800 p-4 sm:p-6 transition-all hover:shadow-[0_0_30px_rgba(227,180,85,0.25)]"
          >
            <span className="font-display text-2xl sm:text-3xl text-pitch-600 leading-none tabular-nums">{stage.number}</span>
            <h2 className="font-display uppercase tracking-wide text-base sm:text-xl text-chalk-100 group-hover:text-amber-400 transition-colors mt-1">
              {stage.title}
            </h2>
            <p className="text-chalk-300 text-xs sm:text-sm mt-1">{stage.tagline}</p>
          </Link>
        ))}
      </div>

      {trivia.length > 0 && <TriviaCarousel facts={trivia} />}
    </div>
  );
}
