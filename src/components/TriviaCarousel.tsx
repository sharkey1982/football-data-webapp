// ============================================================================
// src/components/TriviaCarousel.tsx
//
// A click-to-reveal trivia callout -- rebuilt from a plain auto-rotating
// Q+A display after direct feedback: showing the question and answer
// together at once gives nobody a reason to click. Now the question sits
// alone with a "tap to reveal" prompt; the answer only appears once
// someone acts on it. Auto-advance only kicks in after a reveal (so the
// carousel keeps moving once someone's engaged with the current one),
// never past an unrevealed question -- skipping ahead automatically would
// undercut the whole point of making people click to find out.
// ============================================================================

import { useEffect, useState } from 'react';
import type { TriviaFact } from '../lib/landingApi';

const ADVANCE_AFTER_REVEAL_MS = 6000;

export function TriviaCarousel({ facts }: { facts: TriviaFact[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!revealed || paused || facts.length <= 1) return;
    const id = setTimeout(() => {
      setIndex((i) => (i + 1) % facts.length);
      setRevealed(false);
    }, ADVANCE_AFTER_REVEAL_MS);
    return () => clearTimeout(id);
  }, [revealed, paused, facts.length]);

  const goTo = (next: number) => {
    setIndex(next);
    setRevealed(false);
  };

  const current = facts[index % facts.length];
  if (!current) return null;

  return (
    <div
      className="relative overflow-hidden rounded-lg bg-pitch-900 border border-pitch-700 p-6 sm:p-8 max-w-xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p className="font-mono text-xs text-amber-400 uppercase tracking-widest">Did you know?</p>
      <p className="font-display text-xl sm:text-2xl text-chalk-100 mt-2 leading-snug">{current.question}</p>

      {!revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-4 font-mono text-sm text-amber-400 border border-amber-500 rounded px-4 py-2 hover:bg-amber-500 hover:text-ink-900 transition-colors animate-pulse"
        >
          Tap to reveal &rarr;
        </button>
      ) : (
        <p className="font-mono text-chalk-100 mt-4 text-sm sm:text-base tabular-nums tracking-wide">{current.answer}</p>
      )}

      {facts.length > 1 && (
        <div className="flex items-center gap-3 mt-5">
          <button type="button" onClick={() => goTo((index - 1 + facts.length) % facts.length)} aria-label="Previous fact" className="text-chalk-300 hover:text-chalk-100 px-1">
            &larr;
          </button>
          <div className="flex items-center gap-1.5">
            {facts.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show fact ${i + 1} of ${facts.length}`}
                aria-current={i === index}
                className={['w-1.5 h-1.5 rounded-full transition-colors', i === index ? 'bg-amber-400' : 'bg-pitch-700 hover:bg-pitch-600'].join(' ')}
              />
            ))}
          </div>
          <button type="button" onClick={() => goTo((index + 1) % facts.length)} aria-label="Next fact" className="text-chalk-300 hover:text-chalk-100 px-1">
            &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
