// ============================================================================
// src/components/TriviaCarousel.tsx
//
// A multiple-choice trivia callout -- rebuilt again after direct feedback
// that a plain "tap to reveal" wasn't a real guessing game: no stakes, no
// way to be right or wrong. Now shows real candidate options (drawn from
// the same underlying query as the correct answer -- the other genuine
// top scorelines, the other genuine highest-scoring matches, etc., never
// invented distractors) as clickable choices. Picking one locks it in,
// marks it right or wrong, highlights the actual answer, and shows the
// fuller explanation. Auto-advance only kicks in after a guess has been
// made, never past an unanswered question -- skipping ahead automatically
// would undercut the point of asking at all.
// ============================================================================

import { useEffect, useState } from 'react';
import type { TriviaFact } from '../lib/landingApi';

const ADVANCE_AFTER_ANSWER_MS = 7000;

export function TriviaCarousel({ facts }: { facts: TriviaFact[] }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (selected === null || paused || facts.length <= 1) return;
    const id = setTimeout(() => {
      setIndex((i) => (i + 1) % facts.length);
      setSelected(null);
    }, ADVANCE_AFTER_ANSWER_MS);
    return () => clearTimeout(id);
  }, [selected, paused, facts.length]);

  const goTo = (next: number) => {
    setIndex(next);
    setSelected(null);
  };

  const current = facts[index % facts.length];
  if (!current) return null;

  const answered = selected !== null;

  return (
    <div
      className="relative overflow-hidden rounded-lg bg-pitch-900 border border-pitch-700 p-6 sm:p-8 max-w-xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p className="font-mono text-xs text-amber-400 uppercase tracking-widest">Guess it</p>
      <p className="font-display text-xl sm:text-2xl text-chalk-100 mt-2 leading-snug">{current.question}</p>

      <div className="grid grid-cols-2 gap-2 mt-4">
        {current.options.map((option, i) => {
          const isCorrect = i === current.correctIndex;
          const isPicked = i === selected;
          let stateClasses = 'border-pitch-600 text-chalk-200 hover:border-amber-500 hover:text-amber-400';
          if (answered && isCorrect) stateClasses = 'border-amber-500 bg-amber-500/10 text-amber-400';
          else if (answered && isPicked) stateClasses = 'border-loss-600 bg-loss-600/10 text-chalk-100';
          else if (answered) stateClasses = 'border-pitch-700 text-chalk-300/50';

          return (
            <button
              key={option}
              type="button"
              disabled={answered}
              onClick={() => setSelected(i)}
              className={['text-left text-sm sm:text-base border rounded px-3 py-2 transition-colors disabled:cursor-default', stateClasses].join(' ')}
            >
              {option}
              {answered && isCorrect && <span className="ml-2">&#10003;</span>}
              {answered && isPicked && !isCorrect && <span className="ml-2">&#10007;</span>}
            </button>
          );
        })}
      </div>

      {answered && <p className="font-mono text-chalk-100 mt-4 text-sm sm:text-base">{current.explanation}</p>}

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
