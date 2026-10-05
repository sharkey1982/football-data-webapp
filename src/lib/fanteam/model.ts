// ============================================================================
// src/lib/fanteam/model.ts
//
// Joins a FanTeam price paste to FPL projection inputs: matches each priced
// row to an FPL player (manual fixes first), computes expected FanTeam points
// per fixture (summed over a double gameweek), applies the safety net when the
// contest has one, and decides the data status that gates the optimiser.
// Pure functions; the page only fetches and renders.
// ============================================================================

import { expectedPoints, safetyNetValue, type Pos, type ScoringRule, type PointsBreakdown } from './scoring';
import { matchPlayer, nameKey, norm, resolveClub, type FplRef, type TeamRef } from './paste';
import type { InputRow, PriceRow } from './api';
import type { Candidate } from './optimiser';

/** FanTeam lineup statuses that mean he won't play: scored 0, left out of lineups. */
export const OUT_STATUSES = new Set(['injured', 'suspended']);

export type PlayerView = {
  key: string;
  row_no: number;
  name: string;
  club_raw: string;
  team_id: number | null;
  team_name: string;
  pos: Pos;
  price: number;
  fpl_code: number | null;
  fpl_name: string | null;
  match: string;
  lineup: string | null;          // FanTeam's lineup status, when the export gave one
  out: boolean;                   // injured or suspended per FanTeam
  opponents: string;
  fixtures: number;
  s: number;
  ifStart: number;
  total: number;
  value: number;              // with safety net when on
  perMillion: number;
  pCleanSheet: number;
  breakdown: PointsBreakdown | null;
};

export type Status = 'Fresh' | 'Stale' | 'Incomplete' | 'Broken';
export type Health = { status: Status; checks: { label: string; ok: boolean; detail: string }[] };

const ZERO: PointsBreakdown = {
  appearance: 0, minutes_60: 0, full_match: 0, goals: 0, assists: 0, clean_sheet: 0, goals_conceded: 0,
  shots_on_target: 0, saves: 0, penalties: 0, cards_own_goals: 0, impact: 0,
};

export function teamsFrom(inputs: InputRow[]): TeamRef[] {
  const m = new Map<number, string>();
  for (const r of inputs) if (r.team_id != null) m.set(r.team_id, r.team_name);
  return [...m].map(([team_id, team_name]) => ({ team_id, team_name }));
}

export function fplRefsFrom(inputs: InputRow[]): FplRef[] {
  const m = new Map<number, FplRef>();
  for (const r of inputs) m.set(r.fpl_code, {
    fpl_code: r.fpl_code, team_id: r.team_id, element_type: r.element_type,
    web_name: r.web_name, first_name: r.first_name, second_name: r.second_name,
  });
  return [...m.values()];
}

export function buildPlayers(
  rows: (Pick<PriceRow, 'row_no' | 'name_raw' | 'club_raw' | 'position' | 'price_m'> &
    Partial<Pick<PriceRow, 'first_name' | 'surname' | 'lineup_status'>>)[],
  inputs: InputRow[],
  scoring: ScoringRule[],
  manual: { players: Map<string, number | null>; clubs: Map<string, number> },
  safetyNet: boolean,
): PlayerView[] {
  const teams = teamsFrom(inputs);
  const teamName = new Map(teams.map((t) => [t.team_id, t.team_name]));
  const refs = fplRefsFrom(inputs);
  const byCode = new Map<number, InputRow[]>();
  for (const r of inputs) {
    if (!byCode.has(r.fpl_code)) byCode.set(r.fpl_code, []);
    byCode.get(r.fpl_code)!.push(r);
  }

  const views: PlayerView[] = rows.map((row) => {
    const teamId = resolveClub(row.club_raw, teams, manual.clubs);
    const m = matchPlayer(row.name_raw, teamId, row.position, refs, manual.players, { first: row.first_name, surname: row.surname });
    const lineup = row.lineup_status ? row.lineup_status.toLowerCase() : null;
    const out = lineup != null && OUT_STATUSES.has(lineup);
    const fx = m.fpl_code != null ? byCode.get(m.fpl_code) ?? [] : [];
    let total = 0, ifStart = 0, s = 0, pcs = 0;
    const bd: PointsBreakdown = { ...ZERO };
    for (const f of fx) {
      const e = expectedPoints(scoring, row.position, f);
      total += e.total; ifStart += e.ifStart; s = Math.max(s, e.startProbability); pcs = Math.max(pcs, e.pCleanSheet60);
      for (const k of Object.keys(bd) as (keyof PointsBreakdown)[]) bd[k] += e.breakdown[k];
    }
    // FanTeam says he won't play: no points, never a safety-net replacement.
    if (out) { total = 0; s = 0; pcs = 0; for (const k of Object.keys(bd) as (keyof PointsBreakdown)[]) bd[k] = 0; }
    const ref = m.fpl_code != null ? refs.find((r) => r.fpl_code === m.fpl_code) : undefined;
    return {
      key: `r${row.row_no}`, row_no: row.row_no, name: row.name_raw, club_raw: row.club_raw,
      team_id: teamId, team_name: teamId != null ? teamName.get(teamId) ?? '' : row.club_raw,
      pos: row.position, price: row.price_m, fpl_code: m.fpl_code,
      fpl_name: ref ? `${ref.first_name} ${ref.second_name}` : null, match: m.method, lineup, out,
      opponents: fx.map((f) => `${f.opponent_name} (${f.is_home ? 'H' : 'A'})`).join(', '),
      fixtures: fx.length, s, ifStart, total, value: total, perMillion: 0, pCleanSheet: pcs,
      breakdown: fx.length ? bd : null,
    };
  });

  if (safetyNet) {
    const pool = views.filter((v) => v.team_id != null && v.fixtures > 0)
      .map((v) => ({ key: v.key, team_id: v.team_id!, pos: v.pos, price: v.price, s: v.s, ifStart: v.ifStart }));
    for (const v of views) {
      const me = pool.find((p) => p.key === v.key);
      if (me && !v.out) v.value = safetyNetValue(me, pool).value;
    }
  }
  for (const v of views) v.perMillion = v.price > 0 ? v.value / v.price : 0;
  return views;
}

export function toCandidates(views: PlayerView[], captainMultiplier: number): Candidate[] {
  return views
    .filter((v) => v.team_id != null && v.fpl_code != null && v.fixtures > 0 && !v.out)
    .map((v) => ({
      key: v.key, name: v.name, team_id: v.team_id!, team_name: v.team_name, pos: v.pos, price: v.price,
      value: v.value, captainExtra: (captainMultiplier - 1) * v.s * v.ifStart, s: v.s, ifStart: v.ifStart,
      pCleanSheet: v.pCleanSheet,
    }));
}

export const PROJECTION_MAX_AGE_HOURS = 36;

/** FanTeam doesn't expect him to play. */
export function isUnlikely(lineup: string | null): boolean {
  return lineup != null && (OUT_STATUSES.has(lineup) || lineup === 'unexpected');
}

export function health(args: {
  hasRules: boolean;
  inputs: InputRow[];
  pasteMatchweek: number | null;
  matchweek: number;
  views: PlayerView[];
  now?: Date;
}): Health {
  const now = args.now ?? new Date();
  const checks: Health['checks'] = [];
  const add = (label: string, ok: boolean, detail: string) => checks.push({ label, ok, detail });

  add('Rules', args.hasRules, args.hasRules ? 'FanTeam scoring and Classic 11 rules loaded' : 'Rules missing');
  add('Projections', args.inputs.length > 0, `${args.inputs.length} player-fixture rows for GW${args.matchweek}`);
  const newest = args.inputs.reduce((a, r) => Math.max(a, Date.parse(r.generated_at) || 0), 0);
  const ageH = newest ? (now.getTime() - newest) / 3.6e6 : Infinity;
  add('Projections fresh', ageH <= PROJECTION_MAX_AGE_HOURS, newest ? `refreshed ${ageH.toFixed(0)} h ago (limit ${PROJECTION_MAX_AGE_HOURS} h)` : 'no projections');
  add('Prices for this gameweek', args.pasteMatchweek === args.matchweek,
    args.pasteMatchweek == null ? 'no paste yet' : `latest paste is for GW${args.pasteMatchweek}`);
  const unclub = args.views.filter((v) => v.team_id == null).length;
  // A player marked "Not in FPL" is a decision, not a gap: he is left out of
  // the optimiser and doesn't block it.
  // Unmatched players FanTeam itself doesn't expect to play (unexpected,
  // injured, suspended) are listed but don't block: they would never be picked.
  const open = args.views.filter((v) => v.team_id != null && v.fpl_code == null && v.match !== 'manual');
  const unmatched = open.filter((v) => !isUnlikely(v.lineup)).length;
  const ignored = open.length - unmatched;
  const excluded = args.views.filter((v) => v.fpl_code == null && v.match === 'manual').length;
  add('Clubs recognised', unclub === 0, unclub ? `${unclub} rows with an unknown club` : 'all clubs recognised');
  add('Players matched', unmatched === 0,
    (unmatched ? `${unmatched} likely starters not matched to FPL` : 'all likely starters matched')
      + (ignored ? `; ${ignored} unmatched but not expected to play` : '')
      + (excluded ? `; ${excluded} marked not in FPL` : ''));
  const missingPos = (['GK', 'DEF', 'MID', 'FWD'] as Pos[]).filter((p) => !args.views.some((v) => v.pos === p));
  add('All positions present', args.views.length === 0 || missingPos.length === 0, missingPos.length ? `none for ${missingPos.join(', ')}` : 'GK, DEF, MID, FWD');

  const failed = (l: string) => checks.find((c) => c.label === l && !c.ok);
  let status: Status = 'Fresh';
  if (failed('Rules') || failed('Projections')) status = 'Broken';
  else if (failed('Clubs recognised') || failed('Players matched') || failed('All positions present')) status = 'Incomplete';
  else if (failed('Projections fresh') || failed('Prices for this gameweek')) status = 'Stale';
  return { status, checks };
}

export { nameKey, norm };
