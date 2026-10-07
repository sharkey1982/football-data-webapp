// ============================================================================
// src/pages/tennis/TennisHub.tsx
//
// /tennis -- the tennis theme hub, built from src/lib/journey.ts exactly as
// the Football, Fantasy and NFL hubs are, so they can't drift apart.
// ============================================================================

import { useEffect, useState } from 'react';
import { ThemeHub } from '../../components/ThemeHub';
import { BEAT_THE_SHARK } from '../../components/GameCard';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { THEMES } from '../../lib/journey';
import type { TriviaFact } from '../../lib/landingApi';
import { getTennisTrivia } from '../../lib/tennisTrivia';

export default function TennisHub() {
  useDocumentHead({
    title: 'Tennis — ATP and WTA results, players and seasons',
    description: THEMES.tennis.intro,
    path: '/tennis',
  });
  const [trivia, setTrivia] = useState<TriviaFact[]>([]);
  useEffect(() => {
    getTennisTrivia()
      .then(setTrivia)
      .catch(() => setTrivia([]));
  }, []);
  return <ThemeHub theme={THEMES.tennis} trivia={trivia} game={BEAT_THE_SHARK.nationsCup} />;
}
