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
      className="group block border-2 border-pitch-700 hover:border-amber-500 rounded-lg bg-pitch-900 hover:bg-pitch-800 p-6 sm:p-8 transition-all flex-1 hover:shadow-[0_0_30px_rgba(227,180,85,0.25)]"
    >
      <h2 className="font-display uppercase tracking-wide text-2xl sm:text-3xl text-chalk-100 group-hover:text-amber-400 transition-colors">
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
        <p className="font-mono text-xs text-amber-400 uppercase tracking-widest">Full-Time &middot; Results Archive</p>
        <h1 className="font-display uppercase tracking-wide text-4xl sm:text-6xl text-amber-400 mt-2 glow-amber leading-tight">
          What are you here to do?
        </h1>
        <p className="text-chalk-300 mt-4 max-w-prose text-base sm:text-lg">
          Everything here follows the same shape: start by browsing what's real, see what's predicted to happen next, check how those predictions held
          up, then fine-tune the model behind them yourself. Football's predictions are also what feed Fantasy's.
        </p>
      </div>

      {trivia.length > 0 && <TriviaCarousel facts={trivia} />}

      <div className="flex flex-col sm:flex-row gap-4">
        <ThemeButton to="/football" title="Football" description="Results, fixtures, league tables, and Dixon-Coles model predictions." />
        <ThemeButton to="/fpl/start" title="Fantasy Premier League" description="Player projections, an optimal-squad picker, and the tools behind them." />
      </div>
    </div>
  );
}
