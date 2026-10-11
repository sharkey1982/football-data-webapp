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

/**
 * Site-wide pitch orientation (11 Oct 2026). Chris: people are used to the
 * goalkeeper at the TOP, with the team's left-sided players on the viewer's
 * RIGHT -- the BBC / Fantasy Football Scout view, as if standing behind the
 * opponents' goal looking back at the team.
 *
 * Layouts are worked out in the team's own view (own goal at the bottom,
 * its left on the left: keeper top 92, left-back left 12). Every pitch
 * passes its positions through this to draw them. It turns the picture
 * through 180 degrees -- a rotation, not a mirror, so a left-back is still
 * on the team's left; he simply appears on the viewer's right.
 */
export function toScreen(top: number, left: number): { top: number; left: number } {
  return { top: 100 - top, left: 100 - left };
}
