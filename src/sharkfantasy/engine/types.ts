// ============================================================================
// Shark Fantasy engine: the shapes everything shares. No logic here.
// Hidden attributes (0–100) never leave the engine/server: public views get
// projections built from results and noisy scouting reports instead.
// ============================================================================

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';
export const POSITIONS: readonly Position[] = ['GK', 'DEF', 'MID', 'FWD'];

export interface HiddenAttrs {
  finishing: number;   // shooting / goal threat
  creativity: number;  // chance creation, assists
  defending: number;   // tackling, positioning
  goalkeeping: number; // GKs only; ~5 for outfielders
  fitness: number;     // stamina: how often subbed, injury recovery
  discipline: number;  // high = fewer cards
  injuryProneness: number; // high = more injuries
  potential: number;   // ceiling for young players (used at season transitions)
}

export interface Player {
  id: string;
  clubId: string;
  name: string;
  nationality: string;
  age: number;
  position: Position;
  identity: 'original' | 'comic' | 'historical';
  hidden: HiddenAttrs;
}

export interface Manager {
  id: string;
  name: string;
  /** 0 = always picks the strongest XI, 1 = rotates a lot. */
  rotation: number;
  /** −1 cautious … +1 gung-ho: nudges formation choice and late-game risk. */
  attackLean: number;
  formations: readonly string[];
}

export interface Club {
  id: string;
  name: string;
  short: string;
  managerId: string;
  /** Home advantage multiplier on expected goals (crowd, pitch): ~1.0–1.1. */
  homeBoost: number;
}

export interface World {
  universe: string;
  engineVersion: string;
  seed: string;
  clubs: Club[];
  managers: Manager[];
  players: Player[];
  /** Calibration constants fixed at generation (see params.ts). */
  baseline: { attack: number; defence: number };
}

export type EventType =
  | 'kickoff' | 'shot' | 'goal' | 'assist' | 'save' | 'pen_goal' | 'pen_miss' | 'pen_save'
  | 'own_goal' | 'yellow' | 'red' | 'sub_on' | 'sub_off' | 'injury' | 'full_time' | 'shootout';

export interface MatchEvent {
  seq: number;
  minute: number;
  type: EventType;
  side: 'home' | 'away';
  playerId?: string;
  detail?: Record<string, string | number | boolean>;
}

export interface PlayerMatchStats {
  playerId: string;
  side: 'home' | 'away';
  position: Position;
  started: boolean;
  minutes: number;
  goals: number;
  assists: number;
  ownGoals: number;
  penMisses: number;
  penSaves: number;
  saves: number;
  conceded: number;       // goals conceded while on the pitch
  yellow: number;
  red: number;
  cleanSheet: boolean;    // 60+ minutes and nothing conceded while on
  injured: boolean;
}

export interface MatchResult {
  fixtureKey: string;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  xg: { home: number; away: number };
  shootout?: { winner: 'home' | 'away'; home: number; away: number };
  events: MatchEvent[];
  stats: PlayerMatchStats[];
  seed: string;
  engineVersion: string;
}
