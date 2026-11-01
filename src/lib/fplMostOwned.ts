// ============================================================================
// src/lib/fplMostOwned.ts
//
// The most-owned FPL squad (/fpl/most-owned): the "template".
//
// Squad: players taken in order of ownership (selected_by_percent), highest
// first, each added only while it keeps a legal FPL squad -- 2 GK, 5 DEF,
// 5 MID, 3 FWD and at most 3 from one club. The budget is NOT a rule here:
// the page reports what the squad costs against the GBP 100m budget, which
// is the interesting fact (the template is usually close to it).
//
// XI and captain: from those 15, the legal XI (1 GK, 3-5 DEF, 2-5 MID, 1-3
// FWD) with the most projected points for the next gameweek, from our
// projections (current model, baseline scenario); captain and vice are the
// XI's two highest projections. That is our pick for the template, not a
// count of what managers actually captain (FPL doesn't publish one).
//
// Everything is built by buildMostOwned() from plain rows, so the browser
// (getMostOwnedData) and the static build (entry-server) produce the same
// page from the same reads.
// ============================================================================

import { supabase } from './supabase';
import { getCurrentFplSeasonId } from './currentSeason';
import { CURRENT_MODEL_VERSION } from './fplModel';
import { longDate } from './answerFirst';

export const BUDGET = 100;
export const HORIZON = 5;
export const SQUAD_QUOTA: Record<number, number> = { 1: 2, 2: 5, 3: 5, 4: 3 };
export const MAX_PER_CLUB = 3;
export const POSITION_SHORT: Record<number, string> = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

export type MostOwnedPlayerRow = {
  fpl_player_id: number;
  web_name: string | null;
  slug: string | null;
  element_type: number | null;
  now_cost: number | null;
  selected_by_percent: number | string | null;
  status: string | null;
  chance_of_playing_next_round: number | null;
  news: string | null;
  canonical_team_id: number | null;
  team_name: string | null;
};
export type MostOwnedFixtureRow = { fixture_id: number; matchweek: number; kickoff_date: string; home_team_id: number; away_team_id: number };
export type MostOwnedProjectionRow = { fpl_player_id: number; fixture_id: number; expected_fpl_points: number | string | null };
export type DeadlineOwnershipRow = { fpl_player_id: number; fpl_event_id: number; deadline_time: string; selected_by_percent: number | string | null };

export type MostOwnedInput = {
  players: MostOwnedPlayerRow[];
  fixtures: MostOwnedFixtureRow[];
  projections: MostOwnedProjectionRow[];
  /** Ownership at the last deadline (get_deadline_ownership); null when unavailable. */
  deadline: DeadlineOwnershipRow[] | null;
  /** Club names by canonical team id, for opponents. */
  teamNames: Record<number, string>;
  /** Short club names (teams.canonical_name: 'Man City'), which the pitch abbreviates. Falls back to teamNames. */
  teamShortNames?: Record<number, string>;
  nextGw: number;
  asOf: string;
};

export type NextFixture = { opponent: string; opponentShort: string; isHome: boolean; kickoffDate: string };

export type TemplatePlayer = {
  id: number;
  name: string;
  slug: string | null;
  elementType: number;
  position: string;
  teamId: number | null;
  team: string;
  teamShort: string;
  price: number;
  ownership: number;
  /** Ownership at the last deadline; null if not in that snapshot. */
  ownershipAtDeadline: number | null;
  status: string;
  chance: number | null;
  news: string | null;
  /** Next gameweek's fixtures (two in a double, none in a blank). */
  next: NextFixture[];
  projNext: number;
  projHorizon: number;
  /** Projected points by gameweek, for the horizon. */
  byGw: Record<number, number>;
};

export type OwnershipMove = { id: number; name: string; slug: string | null; team: string; from: number | null; to: number; change: number | null };

export type MostOwnedData = {
  asOf: string;
  nextGw: number;
  horizon: number[];
  squad: TemplatePlayer[];
  cost: number;
  xiIds: number[];
  benchIds: number[];
  formation: string;
  captainId: number | null;
  viceId: number | null;
  xiProjNext: number;
  deadlineGw: number | null;
  deadlineTime: string | null;
  /** Squad players with their ownership now and at the last deadline. */
  moves: OwnershipMove[];
  /** In the template now but not at the last deadline, and the reverse. */
  joined: OwnershipMove[];
  dropped: OwnershipMove[];
  weakSpots: string[];
  lead: string;
};

const num = (v: number | string | null | undefined): number | null => (v == null || v === '' ? null : Number(v));
const round1 = (x: number) => Math.round(x * 10) / 10;
export const pct = (x: number) => `${x.toFixed(1)}%`;
export const money = (x: number) => `£${x.toFixed(1)}m`;
/** "£10.2m over the £100m budget" / "£0.6m under the £100m budget" / "exactly the £100m budget". */
export function budgetText(cost: number): string {
  const diff = round1(cost - BUDGET);
  if (diff === 0) return `exactly the £${BUDGET}m budget`;
  return `${money(Math.abs(diff))} ${diff > 0 ? 'over' : 'under'} the £${BUDGET}m budget`;
}

type Candidate = { id: number; elementType: number; teamId: number | null; ownership: number };

/** Highest ownership first, each kept only if the squad stays legal. Ties: player id. */
export function pickTemplateSquad<T extends Candidate>(players: T[]): T[] {
  const sorted = players
    .filter((p) => SQUAD_QUOTA[p.elementType] != null)
    .sort((a, b) => b.ownership - a.ownership || a.id - b.id);
  const byPos: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const byClub = new Map<number, number>();
  const out: T[] = [];
  for (const p of sorted) {
    if (out.length === 15) break;
    if (byPos[p.elementType] >= SQUAD_QUOTA[p.elementType]) continue;
    const club = p.teamId != null ? byClub.get(p.teamId) ?? 0 : 0;
    if (p.teamId != null && club >= MAX_PER_CLUB) continue;
    out.push(p);
    byPos[p.elementType] += 1;
    if (p.teamId != null) byClub.set(p.teamId, club + 1);
  }
  return out;
}

/** Legal formations for an XI from a 2-5-5-3 squad. */
const FORMATIONS: [number, number, number][] = [];
for (let d = 3; d <= 5; d++) for (let m = 2; m <= 5; m++) for (let f = 1; f <= 3; f++) if (d + m + f === 10) FORMATIONS.push([d, m, f]);

/** The XI with the most projected points: best GK plus the best legal outfield shape.
 * Ties within a position go to higher ownership. */
export function pickXi<T extends { id: number; elementType: number; projNext: number; ownership: number }>(squad: T[]): { xi: T[]; bench: T[]; formation: string } {
  const rank = (pos: number) => squad.filter((p) => p.elementType === pos).sort((a, b) => b.projNext - a.projNext || b.ownership - a.ownership);
  const gk = rank(1);
  const [def, mid, fwd] = [rank(2), rank(3), rank(4)];
  let best: { pts: number; shape: [number, number, number] } | null = null;
  for (const shape of FORMATIONS) {
    const [d, m, f] = shape;
    if (def.length < d || mid.length < m || fwd.length < f) continue;
    const pts = [...def.slice(0, d), ...mid.slice(0, m), ...fwd.slice(0, f)].reduce((s, p) => s + p.projNext, 0);
    // Strictly better only: the earlier (more defenders) shape wins a tie, a stable choice.
    if (!best || pts > best.pts + 1e-9) best = { pts, shape };
  }
  if (!best || gk.length === 0) return { xi: [], bench: [...squad], formation: '' };
  const [d, m, f] = best.shape;
  const xi = [gk[0], ...def.slice(0, d), ...mid.slice(0, m), ...fwd.slice(0, f)];
  const inXi = new Set(xi.map((p) => p.id));
  // FPL bench: the reserve goalkeeper, then outfielders in auto-sub order (highest projection first).
  const benchOutfield = squad.filter((p) => !inXi.has(p.id) && p.elementType !== 1).sort((a, b) => b.projNext - a.projNext || b.ownership - a.ownership);
  const bench = [...gk.slice(1), ...benchOutfield];
  return { xi, bench, formation: `${d}-${m}-${f}` };
}

const STATUS_WORD: Record<string, string> = { d: 'doubtful', i: 'injured', s: 'suspended', u: 'unavailable', n: 'not in the squad' };

/** "Saka (Arsenal) is doubtful: Knock - 75% chance of playing". */
function flagLine(p: TemplatePlayer): string {
  const word = STATUS_WORD[p.status] ?? 'flagged';
  const chance = p.chance != null && p.status === 'd' && !(p.news ?? '').includes('%') ? ` (${p.chance}% chance of playing)` : '';
  return `${p.name} (${p.team}, ${pct(p.ownership)} owned) is ${word}${p.news ? `: ${p.news}` : ''}${chance}.`;
}

export function buildMostOwned(input: MostOwnedInput): MostOwnedData | null {
  const { nextGw, asOf, teamNames } = input;
  const short = (id: number | null, fallback: string) => (id == null ? fallback : input.teamShortNames?.[id] ?? teamNames[id] ?? fallback);
  const horizon = Array.from({ length: HORIZON }, (_, i) => nextGw + i);
  const horizonSet = new Set(horizon);
  const fixtures = input.fixtures.filter((f) => horizonSet.has(f.matchweek));
  const gwOfFixture = new Map(fixtures.map((f) => [f.fixture_id, f.matchweek]));

  // Projected points by player and gameweek (a double gameweek sums both games).
  const proj = new Map<number, Record<number, number>>();
  for (const r of input.projections) {
    const gw = gwOfFixture.get(r.fixture_id);
    const pts = num(r.expected_fpl_points);
    if (gw == null || pts == null) continue;
    const m = proj.get(r.fpl_player_id) ?? {};
    m[gw] = (m[gw] ?? 0) + pts;
    proj.set(r.fpl_player_id, m);
  }

  const deadlineOwn = new Map<number, number>();
  for (const r of input.deadline ?? []) {
    const v = num(r.selected_by_percent);
    if (v != null) deadlineOwn.set(r.fpl_player_id, v);
  }
  const deadlineGw = input.deadline && input.deadline.length > 0 ? input.deadline[0].fpl_event_id : null;
  const deadlineTime = input.deadline && input.deadline.length > 0 ? input.deadline[0].deadline_time : null;

  const nextFor = (teamId: number | null): NextFixture[] =>
    teamId == null
      ? []
      : fixtures
          .filter((f) => f.matchweek === nextGw && (f.home_team_id === teamId || f.away_team_id === teamId))
          .sort((a, b) => a.kickoff_date.localeCompare(b.kickoff_date))
          .map((f) => {
            const isHome = f.home_team_id === teamId;
            const opp = isHome ? f.away_team_id : f.home_team_id;
            return { opponent: teamNames[opp] ?? 'Unknown', opponentShort: short(opp, 'Unknown'), isHome, kickoffDate: f.kickoff_date };
          });

  const all: TemplatePlayer[] = input.players
    .filter((p) => p.element_type != null && SQUAD_QUOTA[p.element_type] != null && num(p.selected_by_percent) != null)
    .map((p) => {
      const byGw = proj.get(p.fpl_player_id) ?? {};
      return {
        id: p.fpl_player_id,
        name: p.web_name ?? 'Unknown',
        slug: p.slug,
        elementType: p.element_type!,
        position: POSITION_SHORT[p.element_type!],
        teamId: p.canonical_team_id,
        team: p.team_name ?? 'Unknown',
        teamShort: short(p.canonical_team_id, p.team_name ?? 'Unknown'),
        price: p.now_cost != null ? p.now_cost / 10 : 0,
        ownership: num(p.selected_by_percent)!,
        ownershipAtDeadline: deadlineOwn.get(p.fpl_player_id) ?? null,
        status: p.status ?? 'a',
        chance: p.chance_of_playing_next_round,
        news: p.news && p.news.trim() ? p.news.trim() : null,
        next: nextFor(p.canonical_team_id),
        projNext: round1(byGw[nextGw] ?? 0),
        projHorizon: round1(horizon.reduce((s, gw) => s + (byGw[gw] ?? 0), 0)),
        byGw,
      };
    });

  const squad = pickTemplateSquad(all).sort((a, b) => a.elementType - b.elementType || b.ownership - a.ownership);
  if (squad.length < 15) return null;
  const cost = round1(squad.reduce((s, p) => s + p.price, 0));
  const { xi, bench, formation } = pickXi(squad);
  const byXiProj = [...xi].sort((a, b) => b.projNext - a.projNext || b.ownership - a.ownership);
  const captain = byXiProj[0] ?? null;
  const vice = byXiProj[1] ?? null;
  const xiProjNext = round1(xi.reduce((s, p) => s + p.projNext, 0) + (captain?.projNext ?? 0));

  // Ownership moves since the last deadline, and how the template itself changed.
  const move = (p: TemplatePlayer): OwnershipMove => ({
    id: p.id, name: p.name, slug: p.slug, team: p.team, from: p.ownershipAtDeadline, to: p.ownership,
    change: p.ownershipAtDeadline == null ? null : round1(p.ownership - p.ownershipAtDeadline),
  });
  const moves = squad.map(move);
  let joined: OwnershipMove[] = [];
  let dropped: OwnershipMove[] = [];
  if (deadlineOwn.size > 0) {
    const then = pickTemplateSquad(
      all.filter((p) => deadlineOwn.has(p.id)).map((p) => ({ ...p, ownership: deadlineOwn.get(p.id)! }))
    );
    const thenIds = new Set(then.map((p) => p.id));
    const nowIds = new Set(squad.map((p) => p.id));
    joined = squad.filter((p) => !thenIds.has(p.id)).map(move);
    const byId = new Map(all.map((p) => [p.id, p]));
    dropped = then.filter((p) => !nowIds.has(p.id)).map((p) => move(byId.get(p.id)!));
  }

  // Weak spots: facts only -- flags, blanks, the lowest projections.
  const weakSpots: string[] = [];
  for (const p of squad.filter((x) => x.status !== 'a')) weakSpots.push(flagLine(p));
  for (const p of squad.filter((x) => x.next.length === 0)) weakSpots.push(`${p.name} (${p.team}) has no fixture in gameweek ${nextGw}.`);
  const lowest = [...xi].sort((a, b) => a.projHorizon - b.projHorizon).slice(0, 2);
  for (const p of lowest) {
    weakSpots.push(
      `${p.name} (${p.position}, ${money(p.price)}) has the ${p === lowest[0] ? 'lowest' : 'second-lowest'} projection in the XI: ${p.projHorizon.toFixed(1)} points over gameweeks ${horizon[0]}–${horizon[horizon.length - 1]}.`
    );
  }
  const reserveGk = bench.find((p) => p.elementType === 1);
  if (reserveGk && reserveGk.projNext < 1) weakSpots.push(`The reserve goalkeeper, ${reserveGk.name}, is projected ${reserveGk.projNext.toFixed(1)} points in gameweek ${nextGw}.`);

  const top = [...squad].sort((a, b) => b.ownership - a.ownership)[0];
  const flagged = squad.filter((p) => p.status !== 'a').length;
  const lead =
    `As of ${longDate(asOf)}, the most-owned FPL squad costs ${money(cost)}, ${budgetText(cost)}; its most-owned player is ${top.name} (${pct(top.ownership)}).` +
    (captain ? ` Our projections pick a ${formation} XI from it for gameweek ${nextGw}, ${xiProjNext.toFixed(1)} points with ${captain.name} as captain` : '') +
    (captain ? (flagged > 0 ? `; ${flagged} of the 15 ${flagged === 1 ? 'is' : 'are'} flagged.` : '.') : '');

  return {
    asOf, nextGw, horizon, squad, cost,
    xiIds: xi.map((p) => p.id), benchIds: bench.map((p) => p.id), formation,
    captainId: captain?.id ?? null, viceId: vice?.id ?? null, xiProjNext,
    deadlineGw, deadlineTime, moves, joined, dropped, weakSpots, lead,
  };
}

// ---- Reads ------------------------------------------------------------------

export const MOST_OWNED_PLAYER_SELECT =
  'fpl_player_id, web_name, slug, element_type, now_cost, selected_by_percent, status, chance_of_playing_next_round, news, canonical_team_id';

/** Shapes fpl_players rows (with teams(display_name) embedded, or a name map) into MostOwnedPlayerRow. */
export function toPlayerRows(rows: Record<string, unknown>[], teamNames: Record<number, string>): MostOwnedPlayerRow[] {
  return rows.map((r) => ({
    fpl_player_id: Number(r.fpl_player_id),
    web_name: (r.web_name as string | null) ?? null,
    slug: (r.slug as string | null) ?? null,
    element_type: r.element_type == null ? null : Number(r.element_type),
    now_cost: r.now_cost == null ? null : Number(r.now_cost),
    selected_by_percent: (r.selected_by_percent as number | string | null) ?? null,
    status: (r.status as string | null) ?? null,
    chance_of_playing_next_round: r.chance_of_playing_next_round == null ? null : Number(r.chance_of_playing_next_round),
    news: (r.news as string | null) ?? null,
    canonical_team_id: r.canonical_team_id == null ? null : Number(r.canonical_team_id),
    team_name: r.canonical_team_id == null ? null : teamNames[Number(r.canonical_team_id)] ?? null,
  }));
}

// get_deadline_ownership is newer than the generated database types.
const untypedRpc = (fn: string, args: Record<string, unknown>) =>
  (supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }).rpc(fn, args);

/** Browser read: the same rows the static build reads, then buildMostOwned. */
export async function getMostOwnedData(asOf: string): Promise<MostOwnedData | null> {
  const seasonId = await getCurrentFplSeasonId();
  const { data: gws, error: gwErr } = await supabase
    .from('fpl_gameweeks')
    .select('fpl_event_id, deadline_time')
    .eq('season_id', seasonId)
    .gt('deadline_time', new Date().toISOString())
    .order('deadline_time')
    .limit(1);
  if (gwErr) throw gwErr;
  const nextGw = gws?.[0]?.fpl_event_id;
  if (nextGw == null) return null;

  const [playersRes, fixturesRes, teamsRes, deadlineRes] = await Promise.all([
    supabase.from('fpl_players').select(MOST_OWNED_PLAYER_SELECT).eq('season_id', seasonId).order('selected_by_percent', { ascending: false }).limit(250),
    supabase
      .from('fixtures')
      .select('fixture_id, matchweek, kickoff_date, home_team_id, away_team_id')
      .eq('league_id', 1)
      .eq('season_id', seasonId)
      .gte('matchweek', nextGw)
      .lt('matchweek', nextGw + HORIZON),
    supabase.from('teams').select('team_id, display_name, canonical_name'),
    // An extra: without it the page just has no "since the deadline" column.
    untypedRpc('get_deadline_ownership', { p_season_id: seasonId }),
  ]);
  if (playersRes.error) throw playersRes.error;
  if (fixturesRes.error) throw fixturesRes.error;
  if (teamsRes.error) throw teamsRes.error;
  const teamNames: Record<number, string> = {};
  const teamShortNames: Record<number, string> = {};
  for (const t of teamsRes.data ?? []) {
    teamNames[t.team_id] = t.display_name;
    teamShortNames[t.team_id] = t.canonical_name;
  }
  const players = toPlayerRows((playersRes.data ?? []) as unknown as Record<string, unknown>[], teamNames);
  const fixtures = (fixturesRes.data ?? []).filter((f) => f.matchweek != null) as MostOwnedFixtureRow[];

  // Projections only for the candidates (the 250 most owned) and the horizon's fixtures.
  const { data: projRows, error: projErr } = await supabase
    .from('fpl_player_projections')
    .select('fpl_player_id, fixture_id, expected_fpl_points')
    .eq('model_version', CURRENT_MODEL_VERSION)
    .eq('scenario_key', 'baseline')
    .in('fixture_id', fixtures.map((f) => f.fixture_id))
    .in('fpl_player_id', players.slice(0, 120).map((p) => p.fpl_player_id))
    .limit(5000);
  if (projErr) throw projErr;

  return buildMostOwned({
    players,
    fixtures,
    projections: (projRows ?? []) as MostOwnedProjectionRow[],
    deadline: deadlineRes.error ? null : ((deadlineRes.data ?? []) as DeadlineOwnershipRow[]),
    teamNames,
    teamShortNames,
    nextGw,
    asOf,
  });
}
