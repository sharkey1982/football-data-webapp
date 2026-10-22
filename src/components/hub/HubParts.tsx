// ============================================================================
// src/components/hub/HubParts.tsx
//
// Building blocks shared by the Club and FPL home pages (/football,
// /fpl/start): a "this week" card, the grouped list of every page in the
// section, and the trivia + game strip that closes the page.
// ============================================================================

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { JourneyLink } from '../../lib/journey';
import type { TriviaFact } from '../../lib/landingApi';
import { TriviaCarousel } from '../TriviaCarousel';
import { GameCard, type BeatTheSharkGame } from '../GameCard';

export const HUB_LINK = 'text-pitch-800 hover:text-pitch-700 underline underline-offset-2';

/** A white card with a titled band: the unit "this week" is built from. */
export function HubCard({ title, more, children, className = '', testId }: {
  title: string;
  more?: { to: string; label: string };
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section className={`bg-white border border-chalk-300 rounded-lg overflow-hidden ${className}`} data-testid={testId}>
      <div className="flex items-baseline justify-between gap-3 px-4 py-3 bg-chalk-200 border-b border-chalk-300">
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">{title}</h2>
        {more && (
          <Link to={more.to} className={`${HUB_LINK} text-sm whitespace-nowrap`}>
            {more.label} &rarr;
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** A card body placeholder while its data loads, or when there is none. */
export function HubNote({ children }: { children: ReactNode }) {
  return <p className="px-4 py-4 text-sm text-ink-500">{children}</p>;
}

/** Every page in the section, in groups named for what people come to do. */
export function HubPageList({ title, groups }: { title: string; groups: { name: string; links: JourneyLink[] }[] }) {
  return (
    <section aria-labelledby="hub-all-pages" className="border-t-2 border-pitch-900 pt-5 space-y-4">
      <h2 id="hub-all-pages" className="font-display uppercase tracking-wide text-2xl text-ink-900">{title}</h2>
      <div className="grid gap-x-8 gap-y-6 grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
        {groups.map((g) => (
          <div key={g.name}>
            <h3 className="font-mono text-xs uppercase tracking-widest text-amber-600 mb-2">{g.name}</h3>
            <ul className="space-y-1.5">
              {g.links.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className={HUB_LINK} title={l.blurb}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Trivia (one question per page, each linking to its answer) and the
 *  section's game, on the dark panel the hub used to be. */
export function HubPlayStrip({ trivia, game }: { trivia: TriviaFact[]; game?: BeatTheSharkGame }) {
  if (trivia.length === 0 && !game) return null;
  return (
    <div className="rounded-xl bg-pitch-950 border border-pitch-700 p-5 sm:p-8 space-y-6">
      {trivia.length > 0 && <TriviaCarousel facts={trivia} />}
      {game && <GameCard game={game} />}
    </div>
  );
}

/** The page's own heading: section name over "This week" controls. */
export function HubHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">{eyebrow}</p>
        <h1 className="font-display uppercase tracking-wide text-3xl sm:text-5xl text-ink-900 mt-1">{title}</h1>
      </div>
      {children}
    </header>
  );
}

/** Placeholder rows the same height as the loaded rows, so a card doesn't
 *  grow when its data arrives and push the page down. The Club hub moved by
 *  0.37 (layout shift) on a phone before these (audit 22 Oct 2026, S-01). */
export function HubSkeleton({ rows, rowClass }: { rows: number; rowClass: string }) {
  return (
    <ul aria-hidden="true" className="divide-y divide-chalk-200">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className={`px-4 flex items-center ${rowClass}`}>
          <span className="block h-3 w-2/3 rounded bg-chalk-200" />
        </li>
      ))}
    </ul>
  );
}
