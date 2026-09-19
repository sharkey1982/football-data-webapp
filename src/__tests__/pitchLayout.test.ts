import { describe, it, expect } from 'vitest';
import { layoutByBand } from '../lib/pitchLayout';

type P = { name: string; pos: string };
const p = (name: string, pos: string): P => ({ name, pos });
const at = (out: ReturnType<typeof layoutByBand<P>>, name: string) => out.find((s) => s.item.name === name)!;

describe('layoutByBand', () => {
  it('centres a single-player band instead of pushing it to one side', () => {
    // This is the bug that put goalkeepers at x=37 in the formation
    // geometry: a one-man band inheriting the widest band's spacing.
    const out = layoutByBand(
      [p('GK', 'GKP'), p('D1', 'DEF'), p('D2', 'DEF'), p('D3', 'DEF'), p('D4', 'DEF')],
      (x) => x.pos
    );
    expect(at(out, 'GK').x).toBe(50);
  });

  it('keeps a two-player band as a pair rather than on the touchlines', () => {
    const out = layoutByBand([p('GK', 'GKP'), p('F1', 'FWD'), p('F2', 'FWD')], (x) => x.pos);
    // 24% gap either side of centre, not 14/86.
    expect(at(out, 'F1').x).toBe(38);
    expect(at(out, 'F2').x).toBe(62);
  });

  it('orders bands up the pitch, keeper at the back', () => {
    const out = layoutByBand([p('GK', 'GKP'), p('D', 'DEF'), p('M', 'MID'), p('F', 'FWD')], (x) => x.pos);
    expect(at(out, 'GK').y).toBeLessThan(at(out, 'D').y);
    expect(at(out, 'D').y).toBeLessThan(at(out, 'M').y);
    expect(at(out, 'M').y).toBeLessThan(at(out, 'F').y);
  });

  it('skips empty bands, so a 3-5-2 and a 5-3-2 both fill the pitch', () => {
    const out = layoutByBand([p('GK', 'GKP'), p('M', 'MID')], (x) => x.pos);
    // Only two bands present: no division by zero, no wasted thirds.
    expect(out).toHaveLength(2);
    expect(at(out, 'GK').y).toBe(4);
    expect(at(out, 'M').y).toBe(92);
  });
});
