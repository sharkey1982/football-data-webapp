// ============================================================================
// src/components/CommonQuestions.tsx
//
// The "Common questions" section on entity pages: plain questions with
// answers built from the page's own data (src/lib/answerFirst.ts). The
// server renderer emits FAQPage JSON-LD from the same list, so the visible
// text and the structured data are always identical.
// ============================================================================

import type { Faq } from '../lib/answerFirst';

export default function CommonQuestions({ faqs }: { faqs: Faq[] }) {
  if (faqs.length === 0) return null;
  return (
    <section aria-labelledby="common-questions" data-testid="common-questions">
      <h2 id="common-questions" className="font-display uppercase tracking-wide text-lg text-ink-900">Common questions</h2>
      <dl className="mt-2 space-y-3 max-w-prose">
        {faqs.map((f) => (
          <div key={f.q}>
            <dt className="text-sm font-medium text-ink-900">{f.q}</dt>
            <dd className="text-sm text-ink-700 mt-0.5">{f.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The opening answer sentence, under the page heading. */
export function AnswerLead({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="text-ink-900 mt-2 max-w-prose" data-testid="answer-lead">
      {text}
    </p>
  );
}
