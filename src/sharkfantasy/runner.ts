// ============================================================================
// Shark Fantasy: the round runner (design §1, §3.6). Drives a universe in the
// database one step at a time, through service_role functions only:
//
//   create   generate the world and season 1: fixtures, scouting, prices,
//            projections, the engine's starting state;
//   bots     bot managers make their moves for the open round;
//   lock     the deadline: every squad frozen, hits charged (sf_lock_round);
//   play     load the engine state, play the locked round, score every frozen
//            squad, move prices, project ahead, and commit it all in one
//            transaction (sf_commit_round). A round already final is a no-op.
//
// The engine is deterministic: the same universe gives the same results
// whether a season is played in memory or one round a week from here (the
// integration test checks exactly that).
// ============================================================================
import { generateWorld } from './engine/world';
import { startSeason, playRound, roundFixtures } from './engine/season';
import type { SeasonState } from './engine/season';
import type { World } from './engine/types';
import { ENGINE_VERSION } from './engine/params';
import { SCORING_V1, bonusForMatch } from './engine/scoring';
import { GAME_RULES_V2_NOSUB, rulesFor } from './fantasy/rules';
import type { GameRules } from './fantasy/rules';
import type { PlayerInfo, Selection } from './fantasy/squad';
import { roundScore } from './fantasy/squad';
import { initialPrices, formPriceChange } from './fantasy/market';
import { publicView } from './fantasy/publicview';
import { projectRounds } from './fantasy/projection';
import type { BotKind, Solver, BotContext } from './fantasy/bots';
import { newBot, initialSquad, weeklyMoves } from './fantasy/bots';

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;
export interface RunnerDeps { rpc: Rpc; hash: (s: string) => string | Promise<string>; solve?: Solver; log?: (msg: string) => void }

/** JSON with sorted keys, so a state read back from jsonb hashes the same. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).filter(k => (v as Record<string, unknown>)[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

type EngineState = Omit<SeasonState, 'world'>;
const stateOf = (ss: SeasonState): EngineState => { const { world: _w, ...rest } = ss; return rest; };

function projectionRows(ss: SeasonState, fromRound: number) {
  const rounds: number[] = [];
  for (let r = fromRound; r <= 10; r++) rounds.push(r);
  return projectRounds(publicView(ss), rounds).map(x => ({ round: x.round, player_id: x.playerId, x_points: round3(x.xPoints), p_start: round3(x.pStart),
    x_minutes: round3(x.xMinutes), x_goals: round3(x.xGoals), x_assists: round3(x.xAssists), p_clean_sheet: round3(x.pCleanSheet) }));
}
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** A zone's offset from UTC at an instant, in ms (Europe/London: 0 in winter, 3,600,000 in summer). */
export function zoneOffset(t: number, zone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(t)).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(t / 1000) * 1000;
}

export interface CreateOptions {
  universe: string;
  name: string;
  seed: string;
  /** Round 1's deadline; later rounds every `spacingMinutes` (a week = 10080). Kick-off is `kickoffAfterMinutes` later. */
  firstDeadline: Date;
  spacingMinutes: number;
  kickoffAfterMinutes: number;
  /** The game rules version (default: the current one, sf-game-2-nosub: pick 11, all play). */
  rules?: GameRules;
  /** Keep the same wall-clock time in this zone every week (e.g. 'Europe/London':
   *  12:00 stays 12:00 across the clock change). Only with a whole-week spacing. */
  zone?: string;
}

export async function createSeason(d: RunnerDeps, o: CreateOptions): Promise<number> {
  const world = generateWorld(o.seed, o.universe);
  const ss = startSeason(world, 1);
  const pv = publicView(ss);
  const proj = projectionRows(ss, 1);
  const xpSeason: Record<string, number> = {};
  for (const p of world.players) xpSeason[p.id] = 0;
  for (const x of proj) if (x.round <= 9) xpSeason[x.player_id] += x.x_points;
  const rules = o.rules ?? GAME_RULES_V2_NOSUB;
  const prices = initialPrices(world.players.map(p => ({ id: p.id, clubId: p.clubId, position: p.position, xp: xpSeason[p.id] })), rules);
  const at = (n: number, extra = 0) => {
    const naive = o.firstDeadline.getTime() + ((n - 1) * o.spacingMinutes + extra) * 60_000;
    if (!o.zone) return new Date(naive).toISOString();
    // the same local time as round 1: correct by the change in the zone's offset since then
    return new Date(naive + (zoneOffset(o.firstDeadline.getTime(), o.zone) - zoneOffset(naive, o.zone))).toISOString();
  };
  const fixtures = [];
  for (let r = 1; r <= 9; r++) for (const f of roundFixtures(ss, r)) fixtures.push({ round: r, fixture_key: `s1|r${r}|${f.homeId}-${f.awayId}`, home_id: f.homeId, away_id: f.awayId, kind: f.kind });
  const state = stateOf(ss);
  const id = await d.rpc('sf_create_season', { p: {
    universe: { id: o.universe, name: o.name, seed: o.seed, engine_version: ENGINE_VERSION },
    world,
    managers: world.managers, clubs: world.clubs,
    players: world.players.map(p => ({ id: p.id, clubId: p.clubId, name: p.name, nationality: p.nationality, age: p.age, position: p.position })),
    hidden: world.players.map(p => ({ player_id: p.id, attrs: p.hidden })),
    season: { number: 1, rules_version: rules.version, scoring_version: SCORING_V1.version },
    rounds: Array.from({ length: 10 }, (_, i) => ({ number: i + 1, kind: i === 9 ? 'finals' : 'league', deadline_at: at(i + 1), kickoff_at: at(i + 1, o.kickoffAfterMinutes) })),
    fixtures,
    scouting: pv.players.map(p => ({ player_id: p.id, ...p.scout })),
    prices: world.players.map(p => ({ player_id: p.id, price: prices[p.id], inputs: { xp_season: round3(xpSeason[p.id]) } })),
    season_players: world.players.map(p => ({ player_id: p.id, start_price: prices[p.id], expected_per_round: round3(xpSeason[p.id] / 9) })),
    projections: proj,
    snapshot: { state, hash: await d.hash(canonical(state)) },
  } });
  d.log?.(`season created: ${id}`);
  return Number(id);
}

interface RunnerState {
  season: { id: number; universe_id: string; number: number; state: string; rules_version: string };
  world: World;
  snapshot: { after_round: number; state: EngineState; hash: string };
  round: { season_id: number; number: number; state: string; deadline_at: string } | null;
  fixtures: { id: number; round: number; fixture_key: string; home_id: string; away_id: string; kind: string; state: string }[];
  prices: Record<string, number>;
  season_players: { player_id: string; start_price: number; expected_per_round: number }[];
  entries: { id: number; bank: number; free_transfers: number; wildcards_left: number; transfers_this_round: number; wildcard_this_round: boolean;
    joined_round: number; is_bot: boolean; bot_kind: BotKind | null; bot_key: string | null;
    picks: { player_id: string; slot: number; is_captain: boolean; is_vice: boolean; purchase_price: number }[];
    snapshot: { picks: { player_id: string; slot: number; is_captain: boolean; is_vice: boolean }[]; hits: number } | null }[];
}

async function load(d: RunnerDeps, universe: string): Promise<{ st: RunnerState; ss: SeasonState }> {
  const st = await d.rpc('sf_runner_state', { p_universe: universe }) as RunnerState | null;
  if (!st) throw new Error(`no season in universe ${universe}`);
  if ((await d.hash(canonical(st.snapshot.state))) !== st.snapshot.hash) throw new Error('engine state does not match its hash');
  const ss: SeasonState = { world: st.world, ...st.snapshot.state };
  if (ss.roundsPlayed !== st.snapshot.after_round) throw new Error('engine state is out of step with the database');
  return { st, ss };
}

function selectionFromPicks(picks: { player_id: string; slot: number; is_captain: boolean; is_vice: boolean }[]): Selection {
  const sorted = picks.slice().sort((a, b) => a.slot - b.slot);
  return { xi: sorted.filter(p => p.slot <= 11).map(p => p.player_id), bench: sorted.filter(p => p.slot > 11).map(p => p.player_id),
    captain: sorted.find(p => p.is_captain)!.player_id, vice: sorted.find(p => p.is_vice)!.player_id };
}

/** Make sure the bots exist, then let each make its moves for the open round. */
export async function botsMove(d: RunnerDeps, universe: string, lineup: Partial<Record<BotKind, number>>) {
  let { st, ss } = await load(d, universe);
  if (!st.round || st.round.state !== 'open') { d.log?.('bots: no open round'); return 0; }
  const have = new Set(st.entries.filter(e => e.is_bot).map(e => e.bot_key));
  let created = 0;
  for (const [kind, n] of Object.entries(lineup) as [BotKind, number][]) for (let i = 1; i <= n; i++) {
    const key = `${universe}|${kind}-${i}`;
    if (!have.has(key)) { await d.rpc('sf_ensure_bot', { p_season: st.season.id, p_kind: kind, p_key: key, p_name: `Shark bot: ${kind} ${i}` }); created++; }
  }
  if (created) ({ st, ss } = await load(d, universe));
  if (!d.solve) throw new Error('bots need the solver');
  const round = st.round!.number;
  const infoMap = new Map<string, PlayerInfo>(ss.world.players.map(p => [p.id, { id: p.id, clubId: p.clubId, position: p.position }]));
  const players = [...infoMap.values()];
  const xp: Record<string, number[]> = {};
  for (const p of players) xp[p.id] = Array(10).fill(0);
  for (const x of projectRounds(publicView(ss), Array.from({ length: 11 - round }, (_, i) => round + i))) xp[x.playerId][x.round - 1] = x.xPoints;
  const ctx: BotContext = { round, players, info: id => infoMap.get(id)!, price: id => st.prices[id], xp, points: ss.points, solve: d.solve, rules: rulesFor(st.season.rules_version) };
  let moved = 0;
  for (const e of st.entries.filter(x => x.is_bot)) {
    const bot = newBot(e.bot_key!, e.bot_kind!, ss.world.seed, players);
    const hadWildcard = e.wildcard_this_round;
    if (!e.picks.length) {
      if (round !== e.joined_round) continue;
      initialSquad(bot, ctx);
    } else {
      if (round <= e.joined_round) continue;   // squad already picked for its first deadline
      Object.assign(bot.entry, { picks: e.picks.map(p => ({ playerId: p.player_id, purchasePrice: p.purchase_price })), selection: selectionFromPicks(e.picks),
        bank: e.bank, freeTransfers: e.free_transfers, wildcardsLeft: e.wildcards_left, transfersThisRound: e.transfers_this_round, wildcardThisRound: e.wildcard_this_round });
      weeklyMoves(bot, ctx);
    }
    const s = bot.entry.selection;
    const picks = [...s.xi.map((id, i) => ({ player_id: id, slot: i + 1 })), ...s.bench.map((id, i) => ({ player_id: id, slot: 12 + i }))];
    await d.rpc('sf_bot_save_team', { p_entry: e.id, p: { picks, captain: s.captain, vice: s.vice, wildcard: bot.entry.wildcardThisRound && !hadWildcard } });
    moved++;
  }
  d.log?.(`bots: ${created} created, ${moved} moved for round ${round}`);
  return moved;
}

export async function lockRound(d: RunnerDeps, universe: string, force = false) {
  const { st } = await load(d, universe);
  if (!st.round) { d.log?.('lock: season over'); return 'noop'; }
  const r = await d.rpc('sf_lock_round', { p_season: st.season.id, p_round: st.round.number, p_force: force });
  d.log?.(`lock round ${st.round.number}: ${r}`);
  return r as string;
}

/** Play the locked round and commit it. */
export async function playLockedRound(d: RunnerDeps, universe: string) {
  const { st, ss } = await load(d, universe);
  if (!st.round || st.round.state !== 'locked') { d.log?.(`play: round ${st.round?.number ?? '-'} is ${st.round?.state ?? 'over'}, nothing to play`); return 'noop'; }
  const round = st.round.number, rules = rulesFor(st.season.rules_version);
  if (ss.roundsPlayed !== round - 1) throw new Error(`engine has played ${ss.roundsPlayed} rounds, the database is on round ${round}`);
  const want = st.fixtures.filter(f => f.round === round).map(f => f.fixture_key).sort();
  const results = playRound(ss);
  const got = results.map(r => r.fixtureKey).sort();
  if (canonical(want) !== canonical(got)) throw new Error(`fixtures differ: database ${want.join(',')} engine ${got.join(',')}`);

  const infoMap = new Map<string, PlayerInfo>(ss.world.players.map(p => [p.id, { id: p.id, clubId: p.clubId, position: p.position }]));
  const info = (id: string) => infoMap.get(id)!;
  const pts = (id: string) => ss.points[id][round - 1], mins = (id: string) => ss.minutes[id][round - 1];
  const scores = st.entries.filter(e => e.snapshot).map(e => {
    const s = roundScore(selectionFromPicks(e.snapshot!.picks), pts, mins, info, rules);
    return { entry_id: e.id, points: s.total, captain_used: s.captainUsed, subs: s.subs };
  });

  // prices for the next round, by form
  const prices = [];
  if (round < 10) for (const sp of st.season_players) {
    const now = st.prices[sp.player_id], recent = ss.points[sp.player_id].slice(Math.max(0, round - 3), round);
    const next = formPriceChange(now, sp.start_price, Number(sp.expected_per_round), recent, info(sp.player_id).position, rules);
    if (next !== now) prices.push({ player_id: sp.player_id, price: next, inputs: { from: now, recent, expected: Number(sp.expected_per_round) } });
  }
  const pv = publicView(ss);
  const next_fixtures = round === 9 ? roundFixtures(ss, 10).map(f => ({ round: 10, fixture_key: `s${ss.season}|r10|${f.homeId}-${f.awayId}`, home_id: f.homeId, away_id: f.awayId, kind: f.kind })) : [];
  const state = stateOf(ss);
  const r = await d.rpc('sf_commit_round', { p: {
    season_id: st.season.id, round, engine_version: ENGINE_VERSION,
    snapshot: { state, hash: await d.hash(canonical(state)) },
    results: results.map(m => {
      const bonus = bonusForMatch(m.stats);
      return { fixture_key: m.fixtureKey, home_goals: m.homeGoals, away_goals: m.awayGoals, xg_home: round3(m.xg.home), xg_away: round3(m.xg.away),
        shootout: m.shootout ?? null, seed: m.seed, events: m.events,
        stats: m.stats.map(s => ({ ...s, bonus: bonus[s.playerId] ?? 0, points: pts(s.playerId) })) };   // one match a club a round
    }),
    scores,
    status: pv.players.map(p => ({ player_id: p.id, available_from: p.availableFrom })),
    prices,
    projections: round < 10 ? projectionRows(ss, round + 1) : [],
    next_fixtures,
    shield_winner: round === 10 ? ss.shieldWinner : null,
  } });
  d.log?.(`play round ${round}: ${r} (${results.map(m => `${m.homeId} ${m.homeGoals}-${m.awayGoals} ${m.awayId}`).join(', ')})`);
  return r as string;
}

/** The next step for a universe: at the deadline (or forced, test universes only)
 *  the bots make their moves, the round locks, and it is played. */
export async function advance(d: RunnerDeps, universe: string, o: { force: boolean; lineup: Partial<Record<BotKind, number>> }) {
  const { st } = await load(d, universe);
  if (!st.round) return 'season over';
  if (st.round.state === 'open') {
    const due = Date.now() >= new Date(st.round.deadline_at).getTime();
    if (!due && !o.force) return `round ${st.round.number} open until ${st.round.deadline_at}`;
    if (Object.keys(o.lineup).length) await botsMove(d, universe, o.lineup);
    await lockRound(d, universe, o.force && !due);
  }
  return playLockedRound(d, universe);
}
