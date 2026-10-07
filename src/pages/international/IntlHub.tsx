// ============================================================================
// src/pages/international/IntlHub.tsx
//
// /international -- the International theme hub, built from src/lib/journey.ts
// exactly as the Football, Fantasy, NFL and Tennis hubs are.
// ============================================================================

import { useEffect, useState } from 'react';
import { ThemeHub } from '../../components/ThemeHub';
import { BEAT_THE_SHARK } from '../../components/GameCard';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { THEMES } from '../../lib/journey';
import type { TriviaFact } from '../../lib/landingApi';
import { getIntlTrivia } from '../../lib/intlTrivia';
import { GenderSwitch } from '../../components/intl/IntlBits';

export default function IntlHub() {
  useDocumentHead({
    title: 'International football — every result since 1872, nations and tournaments',
    description: THEMES.international.intro,
    path: '/international',
  });
  const [trivia, setTrivia] = useState<TriviaFact[]>([]);
  useEffect(() => {
    getIntlTrivia()
      .then(setTrivia)
      .catch(() => setTrivia([]));
  }, []);
  // Men | Women: the women's side is reached here and from every page's header.
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <GenderSwitch />
      </div>
      <ThemeHub theme={THEMES.international} trivia={trivia} game={BEAT_THE_SHARK.worldCup} />
    </div>
  );
}
