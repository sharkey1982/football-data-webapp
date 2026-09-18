// ============================================================================
// src/pages/FootballHub.tsx
//
// Thin wrapper: the structure lives in src/lib/journey.ts so the hub,
// the stage pages and the nav can't disagree about what the stages are.
// ============================================================================

import { useEffect, useState } from 'react';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { ThemeHub } from '../components/ThemeHub';
import { THEMES } from '../lib/journey';
import { getFootballTrivia, type TriviaFact } from '../lib/landingApi';

export default function FootballHub() {
  useDocumentHead({
    title: 'Football',
    description: 'Browse results and fixtures, see Dixon-Coles model predictions, check how reliable they have been, and adjust team ratings yourself.',
    path: '/football',
  });

  const [trivia, setTrivia] = useState<TriviaFact[]>([]);
  useEffect(() => {
    getFootballTrivia()
      .then(setTrivia)
      .catch(() => setTrivia([]));
  }, []);

  return <ThemeHub theme={THEMES.football} trivia={trivia} />;
}
