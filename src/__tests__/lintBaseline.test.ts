import { describe, it, expect } from 'vitest';
// @ts-expect-error -- plain .mjs CI script, no type declarations
import { countErrors, compare } from '../../scripts/lint-baseline.mjs';

const msg = (ruleId: string | null, severity = 2) => ({ ruleId, severity });

describe('lint baseline ratchet (pr-checks.yml)', () => {
  it('counts errors per file and rule, ignoring warnings', () => {
    const counts = countErrors(
      [
        { filePath: '/repo/src/a.ts', messages: [msg('no-explicit-any'), msg('no-explicit-any'), msg('prefer-const', 1)] },
        { filePath: '/repo/src/b.tsx', messages: [msg(null)] },
      ],
      '/repo',
    );
    expect(counts).toEqual({ 'src/a.ts :: no-explicit-any': 2, 'src/b.tsx :: parse-error': 1 });
  });

  it('fails only when a file/rule pair exceeds its baseline', () => {
    const baseline = { 'src/a.ts :: no-explicit-any': 2 };
    expect(compare({ 'src/a.ts :: no-explicit-any': 2 }, baseline)).toEqual([]);
    expect(compare({ 'src/a.ts :: no-explicit-any': 1 }, baseline)).toEqual([]);
    expect(compare({ 'src/a.ts :: no-explicit-any': 3 }, baseline)).toEqual([{ key: 'src/a.ts :: no-explicit-any', n: 3, allowed: 2 }]);
    expect(compare({ 'src/c.ts :: react-hooks/refs': 1 }, baseline)).toEqual([{ key: 'src/c.ts :: react-hooks/refs', n: 1, allowed: 0 }]);
  });
});
