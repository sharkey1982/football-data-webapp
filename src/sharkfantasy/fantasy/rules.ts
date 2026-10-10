// ============================================================================
// Shark Fantasy: the game rules, versioned. Money in tenths (1000 = 100.0) so
// no floating-point drift. The database keeps the same rules as data
// (sf.game_rules) and checks squads against them.
//
//   sf-game-1        the first rules (approved 10 Oct): 15-man squad, 4 on the bench
//   sf-game-2        the Beat the Shark world (design update, 10 Oct): your XI
//                    plus one sub, prices on one points scale across positions
//   sf-game-2-nosub  the same with no sub: pick 11, all play
// The bot test settled it (10 Oct, 100 seasons each): no subs. Set-and-forget
// managers finish in the top 54% without a sub (top 58% with one, limit 60%);
// skill beats luck in 100% of seasons. New seasons use sf-game-2-nosub.
// ============================================================================
import type { Position } from '../engine/types';

export interface GameRules {
  version: string;
  budget: number;
  squadSize: number;
  squadMin: Record<Position, number>;
  squadMax: Record<Position, number>;
  xiMin: Record<Position, number>;
  xiMax: Record<Position, number>;
  /** The first bench place must be a keeper (the 15-man squad). */
  reserveKeeperFirst: boolean;
  maxPerClub: number;
  captainMultiplier: number;
  freeTransfersPerRound: number;
  maxBankedTransfers: number;
  hit: number;
  wildcards: number;
  /** Price bands by position (tenths). */
  priceBand: Record<Position, [number, number]>;
  /** How initial prices are set: by rank within each position, or on one points scale. */
  priceScale: 'position-rank' | 'points';
  /** Weekly price change limits (tenths). */
  priceStepMax: number;
  priceSeasonMax: number;
  /** Below this many managers, prices follow form, not transfers. */
  transferDrivenFrom: number;
}

const XI_MIN = { GK: 1, DEF: 3, MID: 2, FWD: 1 };
const XI_MAX = { GK: 1, DEF: 5, MID: 5, FWD: 3 };
const COMMON = {
  xiMin: XI_MIN, xiMax: XI_MAX, maxPerClub: 3, captainMultiplier: 2, freeTransfersPerRound: 1, maxBankedTransfers: 3, hit: 4,
  wildcards: 1, priceStepMax: 2, priceSeasonMax: 6, transferDrivenFrom: 200,
};

export const GAME_RULES_V1: GameRules = {
  ...COMMON,
  version: 'sf-game-1',
  budget: 1000,
  squadSize: 15,
  squadMin: { GK: 2, DEF: 5, MID: 5, FWD: 3 },
  squadMax: { GK: 2, DEF: 5, MID: 5, FWD: 3 },
  reserveKeeperFirst: true,
  priceBand: { GK: [40, 60], DEF: [40, 70], MID: [45, 105], FWD: [45, 120] },
  priceScale: 'position-rank',
};

const V2_PRICES = { priceBand: { GK: [40, 65], DEF: [40, 85], MID: [45, 125], FWD: [45, 130] } as Record<Position, [number, number]>, priceScale: 'points' as const };

export const GAME_RULES_V2: GameRules = {
  ...COMMON, ...V2_PRICES,
  version: 'sf-game-2',
  budget: 900,
  squadSize: 12,
  squadMin: XI_MIN,
  squadMax: { GK: 2, DEF: 6, MID: 6, FWD: 4 },
  reserveKeeperFirst: false,
};

export const GAME_RULES_V2_NOSUB: GameRules = {
  ...COMMON, ...V2_PRICES,
  version: 'sf-game-2-nosub',
  budget: 860,
  squadSize: 11,
  squadMin: XI_MIN,
  squadMax: XI_MAX,
  reserveKeeperFirst: false,
};

export const RULES: Record<string, GameRules> = {
  [GAME_RULES_V1.version]: GAME_RULES_V1,
  [GAME_RULES_V2.version]: GAME_RULES_V2,
  [GAME_RULES_V2_NOSUB.version]: GAME_RULES_V2_NOSUB,
};
export const rulesFor = (version: string | null | undefined): GameRules => RULES[version ?? ''] ?? GAME_RULES_V1;
