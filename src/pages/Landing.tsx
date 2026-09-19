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
import { useEffect, useState } from 'react';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { TriviaCarousel } from '../components/TriviaCarousel';
import { getLandingTrivia, type TriviaFact } from '../lib/landingApi';

function ThemeButton({ to, title, description }: { to: string; title: string; description: string }) {
  return (
    <Link
      to={to}
      className="group block border-2 border-pitch-700 hover:border-amber-500 rounded-lg bg-pitch-900 hover:bg-pitch-800 p-4 sm:p-8 transition-all hover:shadow-[0_0_30px_rgba(227,180,85,0.25)]"
    >
      <h2 className="font-display uppercase tracking-wide text-lg sm:text-3xl text-chalk-100 group-hover:text-amber-400 transition-colors">
        {title}
      </h2>
      <p className="text-chalk-300 mt-2 transition-colors">{description}</p>
    </Link>
  );
}

export default function Landing() {
  useDocumentHead({
    title: 'Football results, predictions & Fantasy Premier League tools',
    raw: true,
    description:
      'Browse football results and fixtures, see Dixon-Coles model predictions for upcoming matches, and build your Fantasy Premier League squad.',
    path: '/',
  });

  const [trivia, setTrivia] = useState<TriviaFact[]>([]);

  useEffect(() => {
    getLandingTrivia()
      .then(setTrivia)
      .catch(() => setTrivia([]));
  }, []);

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

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <ThemeButton to="/football" title="Football" description="Results, tables and match predictions." />
        <ThemeButton to="/fpl/start" title="Fantasy Premier League" description="Projections and an optimal-squad picker." />
      </div>

      {trivia.length > 0 && <TriviaCarousel facts={trivia} />}
    </div>
  );
}
