// ============================================================================
// src/pages/FplHub.tsx
//
// FPL's theme hub: Browse -> Predict -> Validate -> Configure. Unlike
// Football, every stage here already has a clean existing home: Actual
// Matches and Optimal Squad So Far are genuine backtests (comparing what
// was projected/would-have-been-optimal against what actually happened),
// and Tactical Roles is a real Configure page -- editing a set-piece
// hierarchy or a player's role there regenerates projections on the next
// refresh, closing the loop back to Predict.
// ============================================================================

import { useEffect, useState } from 'react';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { ThemeHub, type HubStage } from '../components/ThemeHub';
import { getFplTrivia, type TriviaFact } from '../lib/landingApi';

const STAGES: HubStage[] = [
  {
    number: '01',
    title: 'Browse',
    description: 'Every fixture by gameweek, plus the full Fantasy Premier League scoring rulebook -- no projections yet, just the schedule and the rules.',
    links: [
      { label: 'Match List', to: '/fpl' },
      { label: 'Scoring Rules', to: '/fpl/scoring-rules' },
    ],
  },
  {
    number: '02',
    title: 'Predict',
    description: "Forecasts produced from every player's projected points -- factoring in form, fixtures, and set-piece duty -- plus an optimiser that picks the best XV under budget.",
    links: [
      { label: 'Player Points Table', to: '/fpl/player-points' },
      { label: 'Optimal Squad', to: '/fpl/optimal-squad' },
      { label: 'Fixture Heat Map', to: '/fantasy' },
    ],
  },
  {
    number: '03',
    title: 'Validate',
    description: 'Comparing those forecasts to what players actually scored -- and, in hindsight, what the truly optimal squad would have been -- to see how reliable the projections have been.',
    links: [
      { label: 'Actual Matches', to: '/fpl/actual-matches' },
      { label: 'Optimal Squad So Far', to: '/fpl/optimal-squad-so-far' },
    ],
  },
  {
    number: '04',
    title: 'Configure',
    description: "Amend a team's set-piece takers or a player's role directly when the model doesn't reflect something you know, and every future projection regenerates from it.",
    links: [{ label: 'Tactical Roles', to: '/fpl/tactical-roles' }],
  },
];

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

  return (
    <ThemeHub
      eyebrow="Full-Time · Fantasy Premier League"
      title="Fantasy Premier League"
      intro="Browse the schedule and rules, see who's projected to score, check how reliable those projections have been, then adjust the model yourself."
      stages={STAGES}
      trivia={trivia}
    />
  );
}
