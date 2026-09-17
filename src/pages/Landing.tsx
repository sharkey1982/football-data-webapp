// ============================================================================
// src/pages/Landing.tsx
//
// New homepage (replaces the old default of going straight into the
// Fixtures table, which is still at /fixtures unchanged) -- requested
// directly, second design pass. The site's actual shape: two parallel
// themes (Football, Fantasy Premier League), each following the same
// four-stage journey (Browse -> Predict -> Validate -> Configure), with
// Football's Predict output seeding Fantasy's. This page's job is just to
// name that shape and hand the visitor to whichever theme they're after --
// not to walk them through all four stages itself (that's each theme's
// own hub page, tracked as separate follow-up work once the Validate/
// Configure page mapping for Football specifically is confirmed).
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
      className="group block border-2 border-pitch-800 rounded-lg bg-white hover:bg-pitch-800 p-6 sm:p-8 transition-colors flex-1"
    >
      <h2 className="font-display uppercase tracking-wide text-2xl sm:text-3xl text-pitch-800 group-hover:text-chalk-100 transition-colors">
        {title}
      </h2>
      <p className="text-ink-700 group-hover:text-chalk-200 mt-2 transition-colors">{description}</p>
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
    <div className="space-y-10">
      <div>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Full-Time &middot; Results Archive</p>
        <h1 className="font-display uppercase tracking-wide text-3xl sm:text-4xl text-ink-900 mt-1">What are you here to do?</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Everything here follows the same shape: start by browsing what's real, see what's predicted to happen next, check how those predictions held
          up, then fine-tune the model behind them yourself. Football's predictions are also what feed Fantasy's.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <ThemeButton to="/football" title="Football" description="Results, fixtures, league tables, and Dixon-Coles model predictions." />
        <ThemeButton to="/fpl/start" title="Fantasy Premier League" description="Player projections, an optimal-squad picker, and the tools behind them." />
      </div>

      {trivia.length > 0 && <TriviaCarousel facts={trivia} />}
    </div>
  );
}
