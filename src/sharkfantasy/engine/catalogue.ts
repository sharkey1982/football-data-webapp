// ============================================================================
// Shark Fantasy engine: the world's clubs and player types (design update,
// project doc claude/shark-fantasy-design-update-world-2026-10-10.md).
//
// The same ten clubs in every universe (one Beat the Shark world): each name
// says where it should finish, and its quality offset says how good it is.
// Players are TYPES at a club ("Fox in the Box", Yo-Yo Rovers): the type sets
// the ability profile relative to the position, age, fitness, discipline,
// injury risk, potential and a one-line character; the club sets the level.
// Star types exist once in the league, at their club.
// ============================================================================
import type { Position } from './types';

export interface ClubDef {
  id: string; name: string; short: string;
  /** Quality offset from the league average (the spread sets competitive balance). */
  offset: number;
  expectation: 'title' | 'top half' | 'mid-table' | 'lower half' | 'bottom';
  character: string;
  manager: { name: string; rotation: number; attackLean: number; formations: string[] };
  /** Types this club always has (stars and signatures). */
  signature: string[];
}

export const CLUBS: ClubDef[] = [
  { id: 'cwu', name: 'Constant Winners United', short: 'CWU', offset: 5.5, expectation: 'title', character: 'Wins every year; expects to',
    manager: { name: 'The Serial Winner', rotation: 0.2, attackLean: 0.4, formations: ['4-3-3', '4-2-3-1', '4-4-2'] }, signature: ['Golden Ball Forward', 'Club Captain'] },
  { id: 'mbc', name: 'Moneybags City', short: 'MBC', offset: 4.5, expectation: 'title', character: 'Bought the best; impatient owner',
    manager: { name: 'The Galáctico Collector', rotation: 0.5, attackLean: 0.6, formations: ['4-3-3', '3-4-3', '4-2-3-1'] }, signature: ['Expensive Flop', 'Old Superstar', 'Flair Merchant'] },
  { id: 'sgf', name: 'Sleeping Giants FC', short: 'SGF', offset: 3.5, expectation: 'top half', character: 'Huge crowd, memories of glory',
    manager: { name: 'The Old-School Gaffer', rotation: 0.3, attackLean: 0, formations: ['4-4-2', '4-5-1', '4-3-3'] }, signature: ['Ageing Maestro'] },
  { id: 'poc', name: 'Proud Old County', short: 'POC', offset: 2, expectation: 'top half', character: 'Founded 1874; never lets you forget',
    manager: { name: 'The Club Legend', rotation: 0.2, attackLean: -0.1, formations: ['4-4-2', '4-2-3-1', '5-3-2'] }, signature: ['Ageing National Captain', 'Safe Hands'] },
  { id: 'uct', name: 'Up and Coming Town', short: 'UCT', offset: 0.5, expectation: 'top half', character: 'Young, quick, getting better every week',
    manager: { name: 'The Young Coach', rotation: 0.6, attackLean: 0.5, formations: ['4-3-3', '3-4-3', '4-2-3-1'] }, signature: ['Wonderkid Winger', 'Young Full-Back', 'Hungry Young Striker'] },
  { id: 'sca', name: 'Selling Club Albion', short: 'SCA', offset: -0.5, expectation: 'mid-table', character: 'Develops stars, sells them in January',
    manager: { name: 'The Developer', rotation: 0.7, attackLean: 0.2, formations: ['4-2-3-1', '4-3-3', '4-4-2'] }, signature: ['Young Potential', 'Bargain Signing', 'Loan Kid'] },
  { id: 'yyr', name: 'Yo-Yo Rovers', short: 'YYR', offset: -2, expectation: 'mid-table', character: 'Too good to go down, too bad to stay up',
    manager: { name: 'The Firefighter', rotation: 0.4, attackLean: -0.2, formations: ['4-5-1', '4-4-2', '5-3-2'] }, signature: ['Journeyman Defender', 'Late Bloomer'] },
  { id: 'lbw', name: 'Long-Ball Wanderers', short: 'LBW', offset: -3.5, expectation: 'lower half', character: 'Big lads, set pieces, no apologies',
    manager: { name: 'The Long-Ball Merchant', rotation: 0.2, attackLean: -0.3, formations: ['4-4-2', '5-3-2', '4-5-1'] }, signature: ['Veteran Target Man', 'Aerial Giant', 'Destroyer'] },
  { id: 'pua', name: 'Plucky Underdogs Athletic', short: 'PUA', offset: -5, expectation: 'lower half', character: 'Punch above their weight, once a season',
    manager: { name: 'The Motivator', rotation: 0.3, attackLean: 0.1, formations: ['4-4-2', '4-5-1', '3-5-2'] }, signature: ['Hot Head', 'Penalty Specialist'] },
  { id: 'ssf', name: 'Survival Specialists FC', short: 'SSF', offset: -7, expectation: 'bottom', character: 'Have stayed up on the last day nine times',
    manager: { name: 'The Survival Expert', rotation: 0.3, attackLean: -0.7, formations: ['5-3-2', '4-5-1', '5-4-1'] }, signature: ['No-Nonsense Stopper', 'Veteran Keeper'] },
];

export interface PlayerType {
  name: string;
  pos: Position;
  line: string;
  /** Offsets to the position's base profile. */
  fin?: number; cre?: number; def?: number; gk?: number;
  /** Quality relative to the club's level (stars are better than their club). */
  q?: number;
  age: [number, number];
  fitness?: number; discipline?: number; injury?: number; potential?: number;
  /** Starter (0), squad player (1), or either. */
  depth: (0 | 1)[];
  /** Exists once in the league, at a club that lists it as a signature. */
  unique?: boolean;
}

export const TYPES: PlayerType[] = [
  // ---- keepers
  { pos: 'GK', name: 'Safe Hands', line: 'never spectacular, never wrong', gk: 2, age: [26, 31], discipline: 75, injury: 40, depth: [0] },
  { pos: 'GK', name: 'Error-Prone Keeper', line: 'brilliant saves, baffling mistakes', gk: -2, age: [23, 29], depth: [0, 1] },
  { pos: 'GK', name: 'Veteran Keeper', line: 'forty next birthday, organises the whole back line', gk: 1, age: [34, 38], fitness: 50, depth: [0, 1] },
  { pos: 'GK', name: 'Sweeper Keeper', line: 'half keeper, half centre-back', cre: 15, age: [24, 30], depth: [0] },
  { pos: 'GK', name: 'Penalty Specialist', line: 'has saved more penalties than he has conceded', gk: -1, age: [27, 33], depth: [0, 1] },
  { pos: 'GK', name: 'Young Keeper', line: 'one for the future', gk: -6, age: [18, 21], potential: 80, depth: [1] },
  // ---- defenders
  { pos: 'DEF', name: 'Ageing National Captain', line: 'won everything; his knees remember all of it', def: 8, cre: 4, q: 4, age: [33, 35], fitness: 50, injury: 60, discipline: 80, depth: [0], unique: true },
  { pos: 'DEF', name: 'No-Nonsense Stopper', line: 'has never passed forward, has never needed to', def: 5, cre: -10, fin: -5, age: [26, 32], depth: [0, 1] },
  { pos: 'DEF', name: 'Ball-Playing Defender', line: 'lovely on the ball, nervy off it', def: -2, cre: 10, age: [23, 29], depth: [0, 1] },
  { pos: 'DEF', name: 'Attacking Wing-Back', line: 'more winger than defender, whatever the contract says', def: -6, cre: 12, fin: 8, age: [22, 28], depth: [0] },
  { pos: 'DEF', name: 'Aerial Giant', line: 'wins every header, loses every race', def: 3, fin: 6, age: [25, 31], depth: [0] },
  { pos: 'DEF', name: 'Journeyman Defender', line: 'seventh club, never injured', injury: 30, fitness: 75, age: [28, 33], depth: [0, 1] },
  { pos: 'DEF', name: 'Young Full-Back', line: 'raw, quick, better every week', def: -4, cre: 4, age: [18, 21], potential: 80, depth: [0, 1] },
  { pos: 'DEF', name: 'Rash Centre-Back', line: 'one tackle from a red', def: 2, discipline: 30, age: [23, 29], depth: [0, 1] },
  { pos: 'DEF', name: 'Club Captain', line: 'has been here twelve years and runs the dressing room', def: 3, discipline: 70, age: [29, 32], depth: [0] },
  // ---- midfielders
  { pos: 'MID', name: 'Playmaker', line: 'sees passes nobody else does', cre: 12, def: -8, age: [24, 30], depth: [0] },
  { pos: 'MID', name: 'Engine Room', line: 'runs all day, never tires', def: 6, cre: -2, fitness: 85, age: [24, 30], depth: [0, 1] },
  { pos: 'MID', name: 'Hot Head', line: 'brilliant, and one tackle from a red', fin: 2, discipline: 25, age: [22, 28], depth: [0] },
  { pos: 'MID', name: 'Set-Piece Specialist', line: 'worth a goal a month from dead balls', cre: 8, fin: 2, age: [25, 32], depth: [0, 1] },
  { pos: 'MID', name: 'Loan Kid', line: 'on loan from a big club, improving fast', q: -2, age: [19, 21], potential: 82, depth: [1] },
  { pos: 'MID', name: 'Flair Merchant', line: 'unplayable one week, invisible the next', fin: 6, cre: 8, def: -12, fitness: 55, age: [23, 29], depth: [0] },
  { pos: 'MID', name: 'Box-to-Box Grafter', line: 'never the best player, never the worst', fin: 2, def: 4, age: [24, 30], depth: [0, 1] },
  { pos: 'MID', name: 'Destroyer', line: 'breaks up play, and occasionally legs', def: 12, cre: -8, fin: -8, discipline: 40, age: [25, 31], depth: [0] },
  { pos: 'MID', name: 'Wonderkid Winger', line: 'eighteen, and every big club is watching', fin: 10, cre: 12, def: -10, q: 6, age: [18, 19], potential: 95, depth: [0], unique: true },
  { pos: 'MID', name: 'Ageing Maestro', line: 'cannot run any more; does not need to', cre: 16, fin: 4, def: -6, q: 4, age: [33, 35], fitness: 45, depth: [0], unique: true },
  { pos: 'MID', name: 'Bargain Signing', line: 'cost nothing, plays every week', q: -1, age: [24, 30], depth: [0, 1] },
  // ---- forwards
  { pos: 'FWD', name: 'Golden Ball Forward', line: 'the best player in the league, and he knows it', fin: 16, cre: 6, q: 10, age: [26, 29], depth: [0], unique: true },
  { pos: 'FWD', name: 'Old Superstar', line: 'used to be brilliant; still is, for an hour', fin: 10, q: 3, age: [33, 35], fitness: 40, injury: 65, depth: [0] },
  { pos: 'FWD', name: 'Fox in the Box', line: 'does nothing except score', fin: 8, cre: -8, age: [25, 31], depth: [0] },
  { pos: 'FWD', name: 'Greedy but Quick', line: 'shoots from everywhere, passes to nobody', fin: 5, cre: -6, fitness: 75, age: [22, 28], depth: [0, 1] },
  { pos: 'FWD', name: 'Young Potential', line: "the academy's best hope in years", q: -4, age: [18, 20], potential: 85, depth: [1] },
  { pos: 'FWD', name: 'Veteran Target Man', line: 'thirty-three, knees like a deckchair, still scores', fin: 3, def: 6, age: [32, 34], fitness: 50, depth: [0] },
  { pos: 'FWD', name: 'Hungry Young Striker', line: 'released by a bigger club; nobody will say why', fin: 2, age: [20, 23], potential: 75, depth: [0, 1] },
  { pos: 'FWD', name: 'Super-Sub', line: 'twenty minutes of chaos, every week', fin: 4, fitness: 40, age: [24, 30], depth: [1] },
  { pos: 'FWD', name: 'Expensive Flop', line: 'cost a fortune, still settling in', fin: -4, q: 2, age: [25, 28], depth: [0, 1], unique: true },
  { pos: 'FWD', name: 'Late Bloomer', line: 'nobody noticed him until he turned thirty', fin: 4, age: [29, 31], depth: [0, 1] },
];

export const TYPE_BY_NAME = new Map(TYPES.map((t) => [t.name, t]));

/** Squad slots per club: GK, then DEF, MID, FWD; 0 = first choice, 1 = squad player. 15 players. */
export const SLOTS: Record<Position, (0 | 1)[]> = { GK: [0, 1], DEF: [0, 0, 0, 0, 1], MID: [0, 0, 0, 0, 1], FWD: [0, 0, 1] };
