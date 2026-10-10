// ============================================================================
// Shark Fantasy engine: seeded random numbers.
//
// Every random draw in the engine comes from a named stream:
//   stream("universe-1|s1|r3|fixture-12|v1")
// so the same inputs always give the same match, and adding draws in one
// stream (say, a new event type) never shifts another (say, injuries in a
// different fixture). No Math.random anywhere in the engine.
// ============================================================================

/** 32-bit hash of a string (cyrb53-style, folded to 32 bits). */
export function hashString(s: string): number {
  let h1 = 0xdeadbeef ^ s.length, h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  int(lo: number, hi: number): number;
  chance(p: number): boolean;
  pick<T>(xs: readonly T[]): T;
  /** Index drawn in proportion to the weights (all ≥ 0, sum > 0). */
  weighted(ws: readonly number[]): number;
  normal(mean?: number, sd?: number): number;
  poisson(lambda: number): number;
  shuffle<T>(xs: readonly T[]): T[];
}

/** A stream seeded from a key string (mulberry32 core). */
export function stream(key: string): Rng {
  let a = hashString(key);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare: number | null = null;
  const rng: Rng = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    weighted(ws) {
      let total = 0;
      for (const w of ws) total += w;
      let x = next() * total;
      for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x < 0) return i; }
      return ws.length - 1;
    },
    normal(mean = 0, sd = 1) {
      if (spare !== null) { const s = spare; spare = null; return mean + sd * s; }
      let u = 0, v = 0;
      while (u === 0) u = next();
      v = next();
      const r = Math.sqrt(-2 * Math.log(u)), th = 2 * Math.PI * v;
      spare = r * Math.sin(th);
      return mean + sd * r * Math.cos(th);
    },
    poisson(lambda) {
      if (lambda <= 0) return 0;
      const L = Math.exp(-lambda);
      let k = 0, p = 1;
      do { k++; p *= next(); } while (p > L);
      return k - 1;
    },
    shuffle(xs) {
      const out = xs.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
  return rng;
}

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
