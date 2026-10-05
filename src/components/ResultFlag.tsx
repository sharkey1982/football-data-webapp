// ============================================================================
// src/components/ResultFlag.tsx
//
// The "Upset" / "Shock" badge beside a result, shared by Football and NFL
// (src/lib/expectation.ts has the rule). Text, not colour alone, carries it.
// ============================================================================

import { chanceText, type ResultFlagKind } from '../lib/expectation';

export default function ResultFlag({ kind, chance }: { kind: ResultFlagKind | null; chance?: number | null }) {
  if (!kind) return null;
  const upset = kind === 'upset';
  return (
    <span
      className={`ml-1.5 inline-block rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide align-middle ${upset ? 'bg-amber-400 text-pitch-950' : 'bg-loss-600 text-chalk-100'}`}
      title={upset ? `Won with a ${chanceText(chance)} pre-match chance (betting market)` : `Lost with a ${chanceText(chance)} pre-match chance (betting market)`}
      data-testid={`result-flag-${kind}`}
    >
      {upset ? 'Upset' : 'Shock'}
    </span>
  );
}
