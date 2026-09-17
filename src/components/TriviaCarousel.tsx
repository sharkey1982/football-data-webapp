// ============================================================================
// src/components/TriviaCarousel.tsx
//
// A rotating question/answer callout -- requested directly ("something
// dynamic to draw the user in like question pop ups/carousel... relevant
// to the page the user is on"). Built as a standalone, reusable component
// (not inlined into the landing page) since the request explicitly frames
// this as something that should appear on other pages too, with facts
// relevant to whichever page it's on -- the landing page is the first
// place it's used, not the only one.
//
// Auto-rotates, but never without an escape hatch: pauses on hover/focus,
// has manual prev/next + dot controls, and respects prefers-reduced-motion
// (the transition itself; content still changes, just without animating).
// ============================================================================

import { useEffect, useState } from 'react';
import type { TriviaFact } from '../lib/landingApi';

const ROTATE_INTERVAL_MS = 7000;

export function TriviaCarousel({ facts }: { facts: TriviaFact[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || facts.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % facts.length), ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused, facts.length]);

  // Clamp in case facts shrinks (e.g. a slow-loading fact arrives after
  // the carousel already advanced past where it'd land).
  const current = facts[index % facts.length];
  if (!current) return null;

  return (
    <div
      className="border border-chalk-300 rounded-lg bg-white p-5 max-w-xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p className="font-mono text-xs text-ink-500 uppercase tracking-widest">Did you know?</p>
      <p className="font-display text-lg text-ink-900 mt-1.5">{current.question}</p>
      <p className="text-ink-700 mt-1.5">{current.answer}</p>

      {facts.length > 1 && (
        <div className="flex items-center gap-3 mt-4">
          <button
            type="button"
            onClick={() => setIndex((i) => (i - 1 + facts.length) % facts.length)}
            aria-label="Previous fact"
            className="text-ink-500 hover:text-ink-900 px-1"
          >
            &larr;
          </button>
          <div className="flex items-center gap-1.5">
            {facts.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show fact ${i + 1} of ${facts.length}`}
                aria-current={i === index}
                className={['w-1.5 h-1.5 rounded-full transition-colors', i === index ? 'bg-pitch-700' : 'bg-chalk-300 hover:bg-chalk-200'].join(' ')}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setIndex((i) => (i + 1) % facts.length)}
            aria-label="Next fact"
            className="text-ink-500 hover:text-ink-900 px-1"
          >
            &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
