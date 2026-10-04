// ============================================================================
// src/pages/nfl/NflHub.tsx
//
// /nfl -- the NFL theme hub, built from src/lib/journey.ts exactly as the
// Football and Fantasy hubs are, so the three can't drift apart.
// ============================================================================

import { useEffect, useState } from 'react';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { ThemeHub } from '../../components/ThemeHub';
import { THEMES } from '../../lib/journey';
import type { TriviaFact } from '../../lib/landingApi';
import { getNflTrivia } from '../../lib/nflTrivia';

export default function NflHub() {
  useDocumentHead({
    title: 'NFL — results, standings, UK TV and fantasy stats',
    description: THEMES.nfl.intro,
    path: '/nfl',
  });
  const [trivia, setTrivia] = useState<TriviaFact[]>([]);
  useEffect(() => {
    getNflTrivia()
      .then(setTrivia)
      .catch(() => setTrivia([]));
  }, []);
  return <ThemeHub theme={THEMES.nfl} trivia={trivia} />;
}
