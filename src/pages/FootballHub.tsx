// ============================================================================
// src/pages/FootballHub.tsx
//
// Football's theme hub: Browse -> Predict -> Validate -> Configure, per
// the agreed framework (Predict = forecasts produced; Validate = comparing
// those forecasts to actuals, surfacing anomalies/reliability; Configure =
// amending inputs, which regenerates predictions and loops back around).
//
// Validate has no dedicated page yet -- agreed as separate future work
// (a proper predicted-vs-actual reliability view), so it points at Team
// Strength's own proj-vs-actual columns as the closest existing thing for
// now, with an explicit note rather than pretending that's the real page.
// ============================================================================

import { useEffect, useState } from 'react';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { ThemeHub, type HubStage } from '../components/ThemeHub';
import { getFootballTrivia, type TriviaFact } from '../lib/landingApi';

const STAGES: HubStage[] = [
  {
    number: '01',
    title: 'Browse',
    description: "Every match, by division or by team, with what's already happened and what's coming up next -- no model involved, just the record.",
    links: [
      { label: 'Fixtures & Results', to: '/fixtures' },
      { label: 'League Table', to: '/table' },
      { label: 'Team Explorer', to: '/teams' },
    ],
  },
  {
    number: '02',
    title: 'Predict',
    description: "Forecasts produced by a Dixon-Coles model fitted on real results: a predicted scoreline for every upcoming fixture, built from each team's own attack and defence ratings.",
    links: [
      { label: 'Match Preview', to: '/preview' },
      { label: 'Team Strength', to: '/team-strength' },
    ],
  },
  {
    number: '03',
    title: 'Validate',
    description: "Comparing those forecasts to what actually happened, to see how reliable the model's been and flag where it's missed.",
    note: "A dedicated page for this is planned. For now, Team Strength's own projected-vs-actual columns are the closest thing.",
    links: [{ label: 'Team Strength (proj. vs actual)', to: '/team-strength' }],
  },
  {
    number: '04',
    title: 'Configure',
    description: "Amend a team's rating directly when the model doesn't reflect something you know -- an injury, a new signing -- and every future fixture prediction regenerates from it.",
    links: [{ label: 'Team Strength (adjust ratings)', to: '/team-strength' }],
  },
];

export default function FootballHub() {
  useDocumentHead({
    title: 'Football',
    description: 'Browse results and fixtures, see Dixon-Coles model predictions, check how reliable they\u2019ve been, and adjust team ratings yourself.',
    path: '/football',
  });

  const [trivia, setTrivia] = useState<TriviaFact[]>([]);
  useEffect(() => {
    getFootballTrivia()
      .then(setTrivia)
      .catch(() => setTrivia([]));
  }, []);

  return (
    <ThemeHub
      eyebrow="Full-Time · Football"
      title="Football"
      intro="Browse what's real, see what's predicted, check how reliable those predictions have been, then adjust the model yourself."
      stages={STAGES}
      trivia={trivia}
    />
  );
}
