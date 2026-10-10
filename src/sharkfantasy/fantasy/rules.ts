// ============================================================================
// Shark Fantasy: the game rules v1 (approved by Chris, 10 Oct 2026; design
// §3). Money in tenths (1000 = 100.0) so no floating-point drift.
// ============================================================================
import type { Position } from '../engine/types';

export const GAME_RULES_V1 = {
  version: 'sf-game-1',
  budget: 1000,
  squad: { GK: 2, DEF: 5, MID: 5, FWD: 3 } as Record<Position, number>,
  xiMin: { GK: 1, DEF: 3, MID: 2, FWD: 1 } as Record<Position, number>,
  xiMax: { GK: 1, DEF: 5, MID: 5, FWD: 3 } as Record<Position, number>,
  maxPerClub: 3,
  captainMultiplier: 2,
  freeTransfersPerRound: 1,
  maxBankedTransfers: 3,
  hit: 4,
  wildcards: 1,
  /** Price bands by position (tenths). */
  priceBand: { GK: [40, 60], DEF: [40, 70], MID: [45, 105], FWD: [45, 120] } as Record<Position, [number, number]>,
  /** Weekly price change limits (tenths). */
  priceStepMax: 2,
  priceSeasonMax: 6,
  /** Below this many managers, prices follow form, not transfers. */
  transferDrivenFrom: 200,
} as const;

export type GameRules = typeof GAME_RULES_V1;
