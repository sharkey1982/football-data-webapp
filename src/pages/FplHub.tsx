// ============================================================================
// src/pages/FplHub.tsx
//
// Thin wrapper: the structure lives in src/lib/journey.ts so the hub,
// the stage pages and the nav can't disagree about what the stages are.
// ============================================================================

import { useEffect, useState } from 'react';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { ThemeHub } from '../components/ThemeHub';
import { THEMES } from '../lib/journey';
import { getFplTrivia, type TriviaFact } from '../lib/landingApi';

export default function FplHub() {
  useDocumentHead({
    title: 'Fantasy Premier League',
    description: 'Player projections, an optimal-squad picker, backtests against actual results, and the tools to configure the model behind them.',
    path: '/fpl/start',
  });

  const [trivia, setTrivia] = useState<TriviaFact[]>([]);
  useEffect(() => {
    getFplTrivia()
      .then(setTrivia)
      .catch(() => setTrivia([]));
  }, []);

  return <ThemeHub theme={THEMES.fpl} trivia={trivia} />;
}
