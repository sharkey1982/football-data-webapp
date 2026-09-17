// ============================================================================
// src/components/ThemeHub.tsx
//
// Shared layout for a theme's hub page (Football, FPL) -- both follow the
// exact same shape (Browse -> Predict -> Validate -> Configure). Rebuilt
// after direct feedback that the stages weren't actually boxes -- they
// were full-width rows with small text links, not the clickable
// card/button treatment the sketch called for. Now a proper 2x2 grid,
// matching the same visual weight as Landing.tsx's Football/Fantasy
// buttons: the whole box is the click target to that stage's primary
// page, with any other pages the stage covers listed as smaller
// secondary links inside it (several of these stages genuinely cover
// more than one existing page).
//
// The box itself is a <div>, not a <Link> -- nesting a clickable <a>
// (what moreLinks needs) inside another <a> is invalid HTML and
// unreliable across browsers. Instead this uses the standard "stretched
// link" technique: the real <Link> only wraps the title text, with an
// absolutely-positioned span stretching its click target to the whole
// card; moreLinks sit above it in stacking order so they stay
// independently clickable.
// ============================================================================

import { Link } from 'react-router-dom';
import { TriviaCarousel } from './TriviaCarousel';
import type { TriviaFact } from '../lib/landingApi';

export type HubStage = {
  number: string;
  title: string;
  description: string;
  /** The box's own click target -- the primary page for this stage. */
  to: string;
  /** Any further pages this stage covers, shown as smaller links inside
   * the box, each independently clickable over the card's own link. */
  moreLinks?: { label: string; to: string }[];
  /** Set when this stage's proper page doesn't exist yet -- shown as a
   * note rather than pretending the linked interim page is the real thing. */
  note?: string;
};

function StageBox({ stage }: { stage: HubStage }) {
  return (
    <div className="group relative border-2 border-pitch-700 hover:border-amber-500 rounded-lg bg-pitch-900 hover:bg-pitch-800 p-6 transition-all hover:shadow-[0_0_30px_rgba(227,180,85,0.25)]">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-3xl text-pitch-600 leading-none tabular-nums">{stage.number}</span>
        <h2 className="font-display uppercase tracking-wide text-xl sm:text-2xl text-chalk-100 group-hover:text-amber-400 transition-colors">
          <Link to={stage.to}>
            <span className="absolute inset-0" />
            {stage.title}
          </Link>
        </h2>
      </div>
      <p className="text-chalk-300 mt-2">{stage.description}</p>
      {stage.note && <p className="text-chalk-300/70 text-sm mt-1.5 italic">{stage.note}</p>}
      {stage.moreLinks && stage.moreLinks.length > 0 && (
        <div className="relative z-10 flex flex-wrap gap-x-4 gap-y-1 mt-3">
          {stage.moreLinks.map((link) => (
            <Link key={link.to} to={link.to} className="text-sm font-medium text-amber-400 hover:text-amber-300 underline underline-offset-2">
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

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

      {trivia.length > 0 && <TriviaCarousel facts={trivia} />}

      <div className="grid sm:grid-cols-2 gap-4">
        {stages.map((stage) => (
          <StageBox key={stage.number} stage={stage} />
        ))}
      </div>
    </div>
  );
}
