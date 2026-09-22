// ============================================================================
// src/lib/seasonXiApi.ts
//
// The best XI a manager could have picked in August and never touched.
//
// Built at START-of-season prices, which is the point of the exercise:
// a squad with no transfers pays August's price. End-of-season prices
// would let you buy Gabriel at £7.3m -- a price his own 209 points
// created -- rather than the £6.0m you'd actually have paid.
// ============================================================================

import { supabase } from './supabase';

export type SeasonXiPlayer = {
  season_id: number;
  fpl_code: number;
  web_name: string;
  team_name: string | null;
  element_type: number;
  start_cost: number;
  total_points: number;
};

export const POS_LABEL: Record<number, string> = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };

export async function getSeasonBestXi(seasonId: number): Promise<SeasonXiPlayer[]> {
  const { data, error } = await supabase
    .from('season_best_xi')
    .select('*')
    .eq('season_id', seasonId)
    .order('element_type')
    .order('total_points', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    start_cost: Number(r.start_cost),
    total_points: Number(r.total_points),
    element_type: Number(r.element_type),
  }));
}

/** Season totals, for the surrounding context on the page. */
export async function getSeasonValueLeaders(seasonId: number, limit = 10) {
  const { data, error } = await supabase
    .from('fpl_player_season_totals')
    .select('fpl_code, web_name, element_type, start_cost, end_cost, total_points, minutes')
    .eq('season_id', seasonId)
    .gt('minutes', 900)
    .order('total_points', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? [])
    .map((r) => ({
      ...r,
      start_cost: Number(r.start_cost),
      end_cost: Number(r.end_cost),
      total_points: Number(r.total_points),
      // Value at the price you'd have PAID, not the price the season
      // created.
      pointsPerStartMillion: Number((Number(r.total_points) / (Number(r.start_cost) / 10)).toFixed(2)),
    }))
    .sort((a, b) => b.pointsPerStartMillion - a.pointsPerStartMillion)
    .slice(0, limit);
}
export type SeasonValueLeader = Awaited<ReturnType<typeof getSeasonValueLeaders>>[number];

/** Seasons that have a solved best XI, newest first.
 *
 * Driven by the data rather than a hardcoded list, so adding a season
 * is an insert rather than a code change. */
export type XiSeason = { season_id: number; slug: string; label: string; points: number; cost: number };

export async function getXiSeasons(): Promise<XiSeason[]> {
  const { data, error } = await supabase
    .from('season_best_xi')
    .select('season_id, total_points, start_cost, seasons!inner(slug, label)');
  if (error) throw error;
  const by = new Map<number, XiSeason>();
  for (const r of (data ?? [])) {
    const id = Number(r.season_id);
    const cur = by.get(id) ?? {
      season_id: id,
      slug: r.seasons?.slug ?? String(id),
      label: r.seasons?.label ?? String(id),
      points: 0,
      cost: 0,
    };
    cur.points += Number(r.total_points);
    cur.cost += Number(r.start_cost);
    by.set(id, cur);
  }
  return [...by.values()].sort((a, b) => b.season_id - a.season_id);
}

/** Pretty form of the dataset's season slug: "2025-26" -> "2025/26". */
export function seasonName(slug: string): string {
  return slug.replace('-', '/');
}

// ---------------------------------------------------------------------------
// Rolling XI for a season in progress
//
// The completed-season XIs are solved once and stored, because the
// answer can never change. A season in progress changes every gameweek,
// so this one is solved on read from the current pool.
// ---------------------------------------------------------------------------

export type RollingCandidate = {
  fpl_code: number;
  web_name: string;
  team_name: string | null;
  element_type: number;
  august_cost: number;
  now_cost: number;
  total_points: number;
  minutes: number;
};

export async function getRollingXiCandidates(seasonId = 13): Promise<RollingCandidate[]> {
  const { data, error } = await supabase.rpc('get_rolling_xi_candidates', { p_season_id: seasonId });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    fpl_code: Number(r.fpl_code),
    web_name: String(r.web_name),
    team_name: r.team_name == null ? null : String(r.team_name),
    element_type: Number(r.element_type),
    august_cost: Number(r.august_cost),
    now_cost: Number(r.now_cost),
    total_points: Number(r.total_points),
    minutes: Number(r.minutes),
  }));
}

/** Budget for the XI, in 0.1m units. Leaves roughly £17m of the £100m
 * for a four-man bench, matching how the completed-season XIs were
 * solved so the two are comparable. */
export const ROLLING_XI_BUDGET = 830;

export type SolvedXi = {
  players: RollingCandidate[];
  points: number;
  cost: number;
  formation: string;
};

/**
 * Best XI on points within budget, a valid formation, and at most three
 * players per club.
 *
 * Same constraints as the stored completed-season XIs, including the
 * club limit -- which was NOT enforced originally and produced illegal
 * sides with five from one team. A repair loop drops the
 * lowest-scoring player from an over-represented club and re-solves,
 * which costs the fewest points to reach legality.
 */
export function solveRollingXi(pool: RollingCandidate[], budget = ROLLING_XI_BUDGET): SolvedXi | null {
  const best = solveUnconstrained(pool, budget);
  if (!best) return null;

  // Repair by SWAP, not by banning and re-solving. Banning removes one
  // player per pass, so an XI legitimately holding ten from one club
  // needs many passes and can strip a position bare -- it returned null
  // on a pool that clearly had a legal answer. Swapping replaces the
  // over-represented club's weakest with the best available player in
  // the SAME position from a club with room, which keeps the formation
  // and the budget intact by construction.
  const players = [...best.players];
  const countByClub = () => {
    const m = new Map<string, RollingCandidate[]>();
    for (const p of players) {
      const k = p.team_name ?? 'unknown';
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  };

  for (let pass = 0; pass < 30; pass++) {
    const clubs = countByClub();
    const overEntry = [...clubs.entries()].find(([, ps]) => ps.length > 3);
    if (!overEntry) break;
    const [, overPlayers] = overEntry;

    // Drop the club's lowest scorer: the constraint costs fewest points
    // that way.
    const out = overPlayers.reduce((a, b) => (a.total_points <= b.total_points ? a : b));
    const spend = players.reduce((sum, p) => sum + p.august_cost, 0) - out.august_cost;
    const chosen = new Set(players.map((p) => p.fpl_code));

    const replacement = pool
      .filter(
        (c) =>
          !chosen.has(c.fpl_code) &&
          c.element_type === out.element_type &&
          (clubs.get(c.team_name ?? 'unknown')?.length ?? 0) < 3 &&
          spend + c.august_cost <= budget
      )
      .sort((a, b) => b.total_points - a.total_points)[0];

    // No legal replacement at that position and price: the pool can't
    // support a legal XI, so say so rather than return an illegal one.
    if (!replacement) return null;
    players[players.indexOf(out)] = replacement;
  }

  if ([...countByClub().values()].some((ps) => ps.length > 3)) return null;

  return {
    players,
    points: players.reduce((s, p) => s + p.total_points, 0),
    cost: players.reduce((s, p) => s + p.august_cost, 0),
    formation: best.formation,
  };
}

/** Knapsack over the four positions, ignoring the club limit. */
function solveUnconstrained(pool: RollingCandidate[], budget: number): SolvedXi | null {
  const byPos: Record<number, RollingCandidate[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of pool) byPos[p.element_type]?.push(p);
  // Trim to the top of each position: an optimal XI never reaches past
  // the best ~26, and the full pool makes the DP needlessly slow.
  for (const k of [1, 2, 3, 4]) {
    byPos[k] = byPos[k].sort((a, b) => b.total_points - a.total_points).slice(0, 26);
  }

  // dp[count][cost] -> best points and the squad that got there
  const dp = (list: RollingCandidate[], maxCount: number) => {
    let states = new Map<string, { pts: number; sq: RollingCandidate[] }>([['0:0', { pts: 0, sq: [] }]]);
    for (const p of list) {
      const next = new Map(states);
      for (const [key, val] of states) {
        const [c, cost] = key.split(':').map(Number);
        if (c >= maxCount) continue;
        const nc = c + 1;
        const ncost = cost + p.august_cost;
        if (ncost > budget) continue;
        const nk = `${nc}:${ncost}`;
        const cand = { pts: val.pts + p.total_points, sq: [...val.sq, p] };
        const prev = next.get(nk);
        if (!prev || prev.pts < cand.pts) next.set(nk, cand);
      }
      states = next;
    }
    return states;
  };

  const D = { 1: dp(byPos[1], 1), 2: dp(byPos[2], 5), 3: dp(byPos[3], 5), 4: dp(byPos[4], 3) };
  let best: SolvedXi | null = null;

  for (const nd of [3, 4, 5]) {
    for (const nm of [2, 3, 4, 5]) {
      for (const nf of [1, 2, 3]) {
        if (1 + nd + nm + nf !== 11) continue;
        for (const [gk, gv] of D[1]) {
          const [gc, gcost] = gk.split(':').map(Number);
          if (gc !== 1) continue;
          for (const [dk, dv] of D[2]) {
            const [dc, dcost] = dk.split(':').map(Number);
            if (dc !== nd || gcost + dcost > budget) continue;
            for (const [mk, mv] of D[3]) {
              const [mc, mcost] = mk.split(':').map(Number);
              if (mc !== nm || gcost + dcost + mcost > budget) continue;
              for (const [fk, fv] of D[4]) {
                const [fc, fcost] = fk.split(':').map(Number);
                const cost = gcost + dcost + mcost + fcost;
                if (fc !== nf || cost > budget) continue;
                const pts = gv.pts + dv.pts + mv.pts + fv.pts;
                if (!best || pts > best.points) {
                  best = {
                    players: [...gv.sq, ...dv.sq, ...mv.sq, ...fv.sq],
                    points: pts,
                    cost,
                    formation: `${nd}-${nm}-${nf}`,
                  };
                }
              }
            }
          }
        }
      }
    }
  }
  return best;
}

// ============================================================================
// Week by week for a season's set-and-forget XI.
//
// Eleven players, no captain, no substitutes -- that is the exercise.
//
// Takes the XI's player codes rather than looking up a stored XI, because the
// season in progress HAS no stored XI (it is solved on read) and its weekly
// rows live in a different table. The function unions both sources, so the
// same call answers for a finished season and the current one.
// ============================================================================

export type SeasonXiWeek = {
  gameweek: number;
  total_points: number;
  players_returning: number;
  blanks: number;
};

export async function getSeasonXiWeekly(seasonId: number, fplCodes: number[]): Promise<SeasonXiWeek[]> {
  if (fplCodes.length === 0) return [];
  const { data, error } = await supabase.rpc('get_xi_weekly_by_codes', { p_season_id: seasonId, p_codes: fplCodes });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    gameweek: Number(r.gameweek),
    total_points: Number(r.total_points ?? 0),
    players_returning: Number(r.players_returning ?? 0),
    blanks: Number(r.blanks ?? 0),
  }));
}

export type SeasonXiSpread = {
  weeks: number;
  total: number;
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  worstWeek: number | null;
  bestWeek: number | null;
};

export function seasonXiSpread(weeks: SeasonXiWeek[]): SeasonXiSpread | null {
  if (weeks.length === 0) return null;
  const totals = weeks.map((w) => w.total_points);
  const total = totals.reduce((a, b) => a + b, 0);
  const mean = total / totals.length;
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  return {
    weeks: weeks.length,
    total,
    min,
    max,
    mean,
    stdDev: Math.sqrt(totals.reduce((a, b) => a + (b - mean) ** 2, 0) / totals.length),
    worstWeek: weeks.find((w) => w.total_points === min)?.gameweek ?? null,
    bestWeek: weeks.find((w) => w.total_points === max)?.gameweek ?? null,
  };
}
