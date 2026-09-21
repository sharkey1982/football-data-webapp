// ============================================================================
// src/components/TriviaCarousel.tsx
//
// A multiple-choice trivia callout. Real candidate options (drawn from the
// same query as the answer -- never invented distractors) as clickable
// choices. Picking one locks it in and marks it right or wrong.
//
// Trivia v2 (Chris's feedback, 2026-09-21):
// - After a guess, EVERY option shows its own figure (optionDetails), so a
//   guess teaches something about all of them, not just the winner.
// - Several options can be correct (genuine ties; "all of these" questions);
//   all are marked, and any correct pick counts as right.
// - The answer links to the page on the site that holds it.
// - NO automatic advance. It used to move on 7 seconds after a guess; with
//   every option's figure and a link to read, that was too fast to follow
//   (the same complaint as Beat the Shark's vidiprinter). Moving on is the
//   reader's choice: the arrows, the dots, or "Next question".
// ============================================================================

import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { TriviaFact } from '../lib/landingApi';

export function TriviaCarousel({ facts }: { facts: TriviaFact[] }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const goTo = (next: number) => {
    setIndex(next);
    setSelected(null);
  };

  const current = facts[index % facts.length];
  if (!current) return null;

  const answered = selected !== null;
  const gotIt = answered && current.correct.includes(selected!);
  const allCorrect = current.correct.length === current.options.length;

  return (
    <div className="relative overflow-hidden rounded-lg bg-pitch-900 border border-pitch-700 p-6 sm:p-8 max-w-xl">
      <p className="font-mono text-xs text-amber-400 uppercase tracking-widest">Guess it</p>
      <p className="font-display text-base sm:text-lg text-chalk-100 mt-2 leading-snug">{current.question}</p>

      <div className="grid grid-cols-2 gap-2 mt-4">
        {current.options.map((option, i) => {
          const isCorrect = current.correct.includes(i);
          const isPicked = i === selected;
          let stateClasses = 'border-pitch-600 text-chalk-200 hover:border-amber-500 hover:text-amber-400';
          if (answered && isCorrect) stateClasses = 'border-amber-500 bg-amber-500/10 text-amber-400';
          else if (answered && isPicked) stateClasses = 'border-loss-600 bg-loss-600/10 text-chalk-100';
          else if (answered) stateClasses = 'border-pitch-700 text-chalk-300/70';
          const detail = answered ? current.optionDetails?.[i] : undefined;

          return (
            <button
              key={option}
              type="button"
              disabled={answered}
              onClick={() => setSelected(i)}
              className={['text-left text-xs sm:text-sm border rounded px-3 py-2 transition-colors disabled:cursor-default', stateClasses].join(' ')}
            >
              <span className="block">
                {option}
                {answered && isCorrect && <span className="ml-2" aria-label="correct">&#10003;</span>}
                {answered && isPicked && !isCorrect && <span className="ml-2" aria-label="wrong">&#10007;</span>}
              </span>
              {detail && <span className="block mt-1 font-mono text-[11px] text-chalk-300 leading-snug">{detail}</span>}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="mt-4 space-y-2" aria-live="polite">
          <p className={['font-mono text-xs uppercase tracking-widest', gotIt ? 'text-amber-400' : 'text-loss-600'].join(' ')}>
            {gotIt ? (allCorrect ? 'Right \u2014 and so was every other option' : 'Right') : 'Not this time'}
          </p>
          <p className="font-mono text-chalk-100 text-sm sm:text-base">{current.explanation}</p>
          {current.link && (
            <p>
              <Link to={current.link.to} className="text-sm text-amber-400 underline underline-offset-2 hover:text-amber-500">
                {current.link.label} &rarr;
              </Link>
            </p>
          )}
          {facts.length > 1 && (
            <button type="button" onClick={() => goTo((index + 1) % facts.length)}
              className="text-sm text-chalk-200 border border-pitch-600 rounded px-3 py-1.5 hover:border-amber-500 hover:text-amber-400">
              Next question &rarr;
            </button>
          )}
        </div>
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
