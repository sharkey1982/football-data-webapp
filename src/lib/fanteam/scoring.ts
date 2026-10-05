// ============================================================================
// src/lib/fanteam/scoring.ts
//
// FanTeam football scoring, as data (public.fantasy_scoring_rules), plus:
//   scoreEvents()     points for one player's actual match events
//   expectedPoints()  expected FanTeam points from FixtureShark's existing
//                     FPL projection inputs (fanteam_projection_inputs)
//
// Football projection stays in the FPL stack; this file only translates
// expected events into FanTeam points. Design: Claude Docs "FanTeam private
// optimiser — design", section "Expected FanTeam points".
// ============================================================================

export type Pos = 'GK' | 'DEF' | 'MID' | 'FWD';
export const POSITIONS: Pos[] = ['GK', 'DEF', 'MID', 'FWD'];

export type ScoringRule = {
  rule_code: string;
  position: Pos | null;
  points: number;
  per_n: number | null;
  threshold_minutes: number | null;
};

/** Points for a rule at a position; 0 when the rule doesn't apply there. */
export function rulePoints(rules: ScoringRule[], code: string, pos: Pos): number {
  const exact = rules.find((r) => r.rule_code === code && r.position === pos);
  if (exact) return Number(exact.points);
  const all = rules.find((r) => r.rule_code === code && r.position === null);
  return all ? Number(all.points) : 0;
}

function rulePerN(rules: ScoringRule[], code: string, pos: Pos): number {
  const r = rules.find((x) => x.rule_code === code && (x.position === pos || x.position === null));
  return r?.per_n ?? 1;
}

function ruleThreshold(rules: ScoringRule[], code: string, fallback: number): number {
  const r = rules.find((x) => x.rule_code === code && x.threshold_minutes != null);
  return r?.threshold_minutes ?? fallback;
}

// ---------------------------------------------------------------------------
// Actual events -> points
// ---------------------------------------------------------------------------

export type MatchEvents = {
  minutes: number;               // full minutes played (59:30 = 59)
  completedMatch?: boolean;      // played the whole match without being subbed off
  goals?: number;
  assists?: number;
  goalsConcededWhileOn?: number;
  shotsOnTarget?: number;        // excludes shots that scored (FanTeam definition)
  saves?: number;
  penaltySaves?: number;
  penaltyMisses?: number;
  causedPenalties?: number;
  causedScoringFreeKicks?: number;
  ownGoals?: number;
  yellowCards?: number;
  redCards?: number;
  teamResultWhileOn?: 'won' | 'drew' | 'lost';
};

export function scoreEvents(rules: ScoringRule[], pos: Pos, e: MatchEvents): number {
  if (e.minutes <= 0) return 0;
  const p = (code: string) => rulePoints(rules, code, pos);
  const n = (v?: number) => v ?? 0;
  let pts = p('appearance');
  if (e.minutes >= ruleThreshold(rules, 'minutes_60', 60)) pts += p('minutes_60');
  if (e.completedMatch) pts += p('full_match');
  pts += n(e.goals) * p('goal');
  pts += n(e.assists) * p('assist');
  if (e.minutes >= ruleThreshold(rules, 'clean_sheet', 60) && n(e.goalsConcededWhileOn) === 0) pts += p('clean_sheet');
  pts += Math.floor(n(e.goalsConcededWhileOn) / rulePerN(rules, 'goals_conceded', pos)) * p('goals_conceded');
  pts += n(e.shotsOnTarget) * p('shot_on_target');
  pts += n(e.saves) * p('save');
  pts += n(e.penaltySaves) * p('penalty_save');
  pts += n(e.penaltyMisses) * p('penalty_miss');
  pts += n(e.causedPenalties) * p('caused_penalty');
  pts += n(e.causedScoringFreeKicks) * p('caused_scoring_free_kick');
  pts += n(e.ownGoals) * p('own_goal');
  pts += n(e.yellowCards) * p('yellow_card');
  pts += n(e.redCards) * p('red_card');
  if (e.teamResultWhileOn === 'won') pts += p('impact_positive');
  if (e.teamResultWhileOn === 'lost') pts += p('impact_negative');
  return Math.round(pts * 100) / 100;
}

// ---------------------------------------------------------------------------
// Expected points from projection inputs
// ---------------------------------------------------------------------------

/** One row of fanteam_projection_inputs (one player, one fixture). */
export type ProjectionInput = {
  fixture_id: number;
  fpl_player_id: number;
  fpl_code: number;
  element_type: number;          // FPL position 1-4
  team_id: number;
  start_probability: number;
  sub_appearance_probability: number;
  expected_minutes: number;
  expected_goals: number;
  expected_assists: number;
  expected_saves: number | null;
  xpts_clean_sheet: number | null;
  xpts_goals_conceded: number | null;
  xpts_penalties: number | null;
  xpts_cards_own_goals: number | null;
  team_goals: number;
  opp_goals: number;
  p_off_before_60: number | null;
  p_off_60_84: number | null;
  p_full: number | null;
};

/** Non-scoring shots on target per goal: Premier League matches average
 * 3.0-3.1 shots on target per goal (2023/24 to 2026/27, football-data.co.uk,
 * queried 5 Oct 2026); FanTeam doesn't count the scoring shot, so ~2.05. */
export const SOT_PER_XG = 2.05;

/** Average minutes played in each exit band (from the FPL goals-conceded
 * view, migration 20260928160000). */
const BAND_MIN = { before60: 47.0, b60_84: 72.7, full: 90 } as const;
const SUB_MIN = 18.2;

const FPL_CS_POINTS: Record<number, number> = { 1: 4, 2: 4, 3: 1, 4: 0 };
const FPL_POS: Record<number, Pos> = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

export type PointsBreakdown = {
  appearance: number;
  minutes_60: number;
  full_match: number;
  goals: number;
  assists: number;
  clean_sheet: number;
  goals_conceded: number;
  shots_on_target: number;
  saves: number;
  penalties: number;
  cards_own_goals: number;
  impact: number;
};

export type ExpectedPoints = {
  total: number;                  // unconditional expected points
  ifStart: number;                // expected points given he starts
  startProbability: number;
  pCleanSheet60: number;          // P(60+ minutes and no goals conceded while on)
  breakdown: PointsBreakdown;
};

function poissonPmf(lambda: number, k: number): number {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

/** P(team wins), P(team loses), independent Poisson goals. */
export function winLoss(teamGoals: number, oppGoals: number): { win: number; loss: number } {
  let win = 0, loss = 0;
  for (let a = 0; a <= 12; a++) {
    const pa = poissonPmf(teamGoals, a);
    for (let b = 0; b <= 12; b++) {
      const pb = poissonPmf(oppGoals, b);
      if (a > b) win += pa * pb; else if (a < b) loss += pa * pb;
    }
  }
  return { win, loss };
}

/** E[floor(N / n)] for N ~ Poisson(lambda). */
function expectedFloorDiv(lambda: number, n: number): number {
  let e = 0;
  for (let k = n; k <= 20; k++) e += Math.floor(k / n) * poissonPmf(lambda, k);
  return e;
}

export function expectedPoints(rules: ScoringRule[], pos: Pos, x: ProjectionInput): ExpectedPoints {
  const p = (code: string) => rulePoints(rules, code, pos);
  const s = clamp01(x.start_probability);
  const u = clamp01(Math.min(x.sub_appearance_probability, 1 - s));
  const bands = normaliseBands(x);
  const fplPos = FPL_POS[x.element_type];

  // Minutes split: starts vs sub appearances, to allocate per-minute events.
  const startMin = s * (bands.before60 * BAND_MIN.before60 + bands.b60_84 * BAND_MIN.b60_84 + bands.full * BAND_MIN.full);
  const totalMin = Math.max(x.expected_minutes, startMin + u * SUB_MIN, 1e-9);
  const startShare = Math.min(1, startMin / totalMin);

  // Start-driven components (sub appearances: appearance point only).
  const appStart = s * p('appearance');
  const appSub = u * p('appearance');
  const m60 = s * (bands.b60_84 + bands.full) * p('minutes_60');
  const full = s * bands.full * p('full_match');

  // Clean sheet: P(on 60+ and none conceded while on).
  const teamCs = Math.exp(-Math.max(0, x.opp_goals));
  let pCs60: number;
  if (x.xpts_clean_sheet != null && FPL_CS_POINTS[x.element_type] > 0) {
    pCs60 = Number(x.xpts_clean_sheet) / FPL_CS_POINTS[x.element_type];
  } else {
    pCs60 = s * (bands.full * teamCs + bands.b60_84 * Math.pow(teamCs, BAND_MIN.b60_84 / 90));
  }
  pCs60 = clamp01(pCs60);
  const cs = pCs60 * p('clean_sheet');

  // Goals conceded while on (GK/DEF): reuse FPL's value when FPL scores the
  // same rule for this player (GK/DEF, -1 per 2), else compute.
  let gc = 0;
  if (p('goals_conceded') !== 0) {
    const perN = rulePerN(rules, 'goals_conceded', pos);
    if (x.xpts_goals_conceded != null && (fplPos === 'GK' || fplPos === 'DEF') && perN === 2 && p('goals_conceded') === -1) {
      gc = Number(x.xpts_goals_conceded);
    } else {
      const startLambda = x.opp_goals * (startMin / Math.max(s, 1e-9)) / 90;
      gc = s * expectedFloorDiv(startLambda, perN) * p('goals_conceded');
    }
  }

  // Per-minute events: allocated between starts and sub appearances by minutes.
  const goals = x.expected_goals * p('goal');
  const assists = x.expected_assists * p('assist');
  const sot = x.expected_goals * SOT_PER_XG * p('shot_on_target');
  const saves = (x.expected_saves ?? 0) * p('save');
  // FanTeam penalty save +5 / miss -2 and cards -1/-3 / own goal -2 equal FPL's.
  const pens = Number(x.xpts_penalties ?? 0);
  const cards = Number(x.xpts_cards_own_goals ?? 0);
  const { win, loss } = winLoss(Math.max(0, x.team_goals), Math.max(0, x.opp_goals));
  const impact = (win * p('impact_positive') + loss * p('impact_negative')) * Math.min(totalMin, 90) / 90;

  const perMinute = goals + assists + sot + saves + pens + cards + impact;
  const startOnly = appStart + m60 + full + cs + gc;
  const total = startOnly + appSub + perMinute;
  const ifStart = s > 1e-6 ? (startOnly + perMinute * startShare) / s : 0;

  return {
    total,
    ifStart,
    startProbability: s,
    pCleanSheet60: pCs60,
    breakdown: {
      appearance: appStart + appSub, minutes_60: m60, full_match: full, goals, assists,
      clean_sheet: cs, goals_conceded: gc, shots_on_target: sot, saves, penalties: pens,
      cards_own_goals: cards, impact,
    },
  };
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/** Exit bands, defaulting to "plays the full match" when missing (the FPL
 * projection makes the same fallback). */
function normaliseBands(x: ProjectionInput) {
  const before60 = Number(x.p_off_before_60 ?? 0);
  const b60_84 = Number(x.p_off_60_84 ?? 0);
  const full = x.p_full == null ? 1 : Number(x.p_full);
  const sum = before60 + b60_84 + full;
  if (sum <= 0) return { before60: 0, b60_84: 0, full: 1 };
  return { before60: before60 / sum, b60_84: b60_84 / sum, full: full / sum };
}

// ---------------------------------------------------------------------------
// Safety net (weekly contests)
// ---------------------------------------------------------------------------

export type NetCandidate = { key: string; team_id: number; pos: Pos; price: number; s: number; ifStart: number; total?: number };

/** Expected value with FanTeam's safety net: a non-starter is replaced at
 * kick-off by a same-club, same-position player at an equal or lower price,
 * closest price first; if that one doesn't start either, the next. If no
 * eligible player starts, the original stays and keeps whatever he scores
 * off the bench (his expected points as a non-starter). */
export function safetyNetValue(player: NetCandidate, pool: NetCandidate[]): { value: number; replacementValue: number } {
  const subs = pool
    .filter((c) => c.key !== player.key && c.team_id === player.team_id && c.pos === player.pos && c.price <= player.price + 1e-9)
    .sort((a, b) => b.price - a.price || b.s * b.ifStart - a.s * a.ifStart);
  let remaining = 1, repl = 0;
  for (const c of subs) {
    repl += remaining * c.s * c.ifStart;
    remaining *= 1 - c.s;
    if (remaining < 1e-4) break;
  }
  // Expected points if he doesn't start (sub appearances), from his total.
  const benchPts = player.total != null && player.s < 1 - 1e-9
    ? Math.max(0, (player.total - player.s * player.ifStart) / (1 - player.s)) : 0;
  const ifNotStart = repl + remaining * benchPts;
  return { value: player.s * player.ifStart + (1 - player.s) * ifNotStart, replacementValue: ifNotStart };
}
