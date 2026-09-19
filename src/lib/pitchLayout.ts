// ============================================================================
// src/lib/pitchLayout.ts
//
// Positions an arbitrary XI on a pitch, by position band.
//
// Separate from formation_slot_geometry, which stores the real per-slot
// layout for a KNOWN Opta formation. This handles the other case: an XI
// assembled from FPL positions with no formation attached -- a team of
// the week, a squad picker -- where the shape emerges from how many of
// each position happen to be in the side.
//
// The centring rule is the same one the formation geometry needed after
// a bug put goalkeepers off-centre: each band is centred on its own
// rather than inheriting the widest band's spacing, with the gap capped
// so a two-man band reads as a pair instead of being flung to the
// touchlines.
// ============================================================================

/** FPL knows only these four. Deliberately not mapped to real positions
 * (wing-back, false nine): FPL doesn't record them, and inventing one
 * would be a guess presented as data. */
export const FPL_BANDS = ['GKP', 'DEF', 'MID', 'FWD'] as const;
export type FplBand = (typeof FPL_BANDS)[number];

const MAX_GAP = 24;

export type PitchSlot<T> = { item: T; x: number; y: number };

export function layoutByBand<T>(items: T[], bandOf: (item: T) => string): PitchSlot<T>[] {
  const bands = FPL_BANDS.map((b) => items.filter((i) => bandOf(i) === b)).filter((g) => g.length > 0);
  const out: PitchSlot<T>[] = [];
  bands.forEach((group, bandIndex) => {
    const n = group.length;
    const gap = n === 1 ? 0 : Math.min(MAX_GAP, 80 / (n - 1));
    group.forEach((item, i) => {
      out.push({
        item,
        x: Math.round(50 + (i - (n - 1) / 2) * gap),
        // Bands spread from just above the goal line to the far end. A
        // single band would divide by zero, so it sits mid-pitch.
        y: bands.length === 1 ? 50 : Math.round(4 + (bandIndex / (bands.length - 1)) * 88),
      });
    });
  });
  return out;
}
