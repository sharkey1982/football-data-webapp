// ============================================================================
// src/components/ThemeHub.tsx
//
// Shared layout for a theme's hub page (Football, FPL) -- both follow the
// exact same shape (Browse -> Predict -> Validate -> Configure, each
// stage possibly linking to more than one existing page), so this is one
// component parameterised by content rather than two near-duplicate
// pages.
// ============================================================================

import { Link } from 'react-router-dom';
import { TriviaCarousel } from './TriviaCarousel';
import type { TriviaFact } from '../lib/landingApi';

export type HubStage = {
  number: string;
  title: string;
  description: string;
  links: { label: string; to: string }[];
  /** Set when this stage's proper page doesn't exist yet -- shown as a
   * note rather than pretending the linked interim page is the real thing. */
  note?: string;
};

export function ThemeHub({
  eyebrow,
  title,
  intro,
  stages,
  trivia,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  stages: HubStage[];
  trivia: TriviaFact[];
}) {
  return (
    <div className="space-y-10">
      <div>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">{eyebrow}</p>
        <h1 className="font-display uppercase tracking-wide text-3xl sm:text-4xl text-ink-900 mt-1">{title}</h1>
        <p className="text-ink-700 mt-2 max-w-prose">{intro}</p>
      </div>

      <div>
        {stages.map((stage) => (
          <div key={stage.number} className="grid sm:grid-cols-[auto_1fr] gap-4 sm:gap-6 py-8 border-t border-chalk-300 first:border-t-0 first:pt-0">
            <div className="font-display text-4xl sm:text-5xl text-pitch-700 leading-none tabular-nums">{stage.number}</div>
            <div>
              <h2 className="font-display uppercase tracking-wide text-xl sm:text-2xl text-ink-900">{stage.title}</h2>
              <p className="text-ink-700 mt-1.5 max-w-prose">{stage.description}</p>
              {stage.note && <p className="text-ink-500 text-sm mt-1.5 italic">{stage.note}</p>}
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
                {stage.links.map((link) => (
                  <Link key={link.to} to={link.to} className="text-sm font-medium text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {trivia.length > 0 && <TriviaCarousel facts={trivia} />}
    </div>
  );
}
