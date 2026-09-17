// ============================================================================
// src/components/ThemeHub.tsx
//
// Shared layout for a theme's hub page (Football, FPL) -- both follow the
// exact same shape (Browse -> Predict -> Validate -> Configure, each
// stage possibly linking to more than one existing page), so this is one
// component parameterised by content rather than two near-duplicate
// pages. Matches Landing.tsx's dark "terminal screen" treatment -- the
// same front-of-house identity carried one level deeper, before the
// visitor reaches the calmer, functional pages beneath it.
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
    <div className="rounded-xl bg-pitch-950 border border-pitch-700 p-6 sm:p-10 space-y-8">
      <div>
        <p className="font-mono text-xs text-amber-400 uppercase tracking-widest">{eyebrow}</p>
        <h1 className="font-display uppercase tracking-wide text-4xl sm:text-5xl text-amber-400 mt-2 glow-amber">{title}</h1>
        <p className="text-chalk-300 mt-3 max-w-prose text-base sm:text-lg">{intro}</p>
      </div>

      <div>
        {stages.map((stage) => (
          <div key={stage.number} className="grid sm:grid-cols-[auto_1fr] gap-4 sm:gap-6 py-8 border-t border-pitch-700 first:border-t-0 first:pt-0">
            <div className="font-display text-4xl sm:text-5xl text-pitch-600 leading-none tabular-nums">{stage.number}</div>
            <div>
              <h2 className="font-display uppercase tracking-wide text-xl sm:text-2xl text-chalk-100">{stage.title}</h2>
              <p className="text-chalk-300 mt-1.5 max-w-prose">{stage.description}</p>
              {stage.note && <p className="text-chalk-300/70 text-sm mt-1.5 italic">{stage.note}</p>}
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
                {stage.links.map((link) => (
                  <Link key={link.to} to={link.to} className="text-sm font-medium text-amber-400 hover:text-amber-300 underline underline-offset-2">
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
