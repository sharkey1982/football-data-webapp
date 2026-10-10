// ============================================================================
// Shark Fantasy: the public projection (design §8): expected points for each
// player and fixture, from the public view only (scouting reports and what
// has happened). Published on the site as the Shark's projection; the
// optimiser bots use it too, so they never see the hidden attributes.
//
//   team expected goals: a scouting-based strength, the same shape as the
//     engine's published model, then nudged by goals scored and conceded so
//     far (shrunk: PROJECTION_PARAMS.teamPriorMatches on the prior);
//   chance of starting: the scouting depth chart, blended with starts so far;
//   goal and assist shares: by position and scouting, blended with goals and
//     assists per 90 so far (shrunk: playerPriorMinutes on the prior).
// The shrinkage was fitted on 40 simulated seasons (projected v actual).
// ============================================================================
import type { Position } from '../engine/types';
import { SCORING_V1 } from '../engine/scoring';
import type { PublicPlayer, PublicView } from './publicview';

const XI_SHAPE: Record<Position, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 };
const SHOT_W: Record<Position, number> = { GK: 0, DEF: 1, MID: 2.25, FWD: 2.4 };
const AST_W: Record<Position, number> = { GK: 0.05, DEF: 1, MID: 2.6, FWD: 1.5 };
const ATT_W: Record<Position, number> = { GK: 0, DEF: 0.25, MID: 0.75, FWD: 1 };
const DEF_W: Record<Position, number> = { GK: 1.6, DEF: 1, MID: 0.5, FWD: 0.15 };

const posRating = (p: PublicPlayer) => p.position === 'GK' ? p.scout.keeping : p.position === 'DEF' ? 0.75 * p.scout.defence + 0.25 * p.scout.creativity
  : p.position === 'MID' ? 0.4 * p.scout.creativity + 0.3 * p.scout.attack + 0.3 * p.scout.defence : 0.7 * p.scout.attack + 0.3 * p.scout.creativity;

/** Shrinkage, fitted against simulated seasons (scripts/sf/bots.ts reports the check). */
export const PROJECTION_PARAMS = {
  /** Spread of the scouting-based team strength (the engine's k is 0.40; scouting noise pulls it in). */
  k: 0.4,
  /** Matches' weight on the prior when nudging team goals by results (a season is
   *  short and the scouting prior is good, so results move it only a little). */
  teamPriorMatches: 30,
  /** Minutes' weight on the prior for goals and assists per 90. */
  playerPriorMinutes: 4000,
  /** Starts' weight on the depth chart. */
  startPriorRounds: 1.5,
  pStartXi: 0.85, pStartOther: 0.15, pSub: 0.6,
  /** Shark Rating bonus a starter collects on average beyond goals, assists and clean sheets. */
  bonusBase: 0.2,
};

export interface Projection {
  playerId: string;
  round: number;
  opponentId: string;
  home: boolean;
  pStart: number;
  xMinutes: number;
  xGoals: number;
  xAssists: number;
  pCleanSheet: number;
  xPoints: number;
}

export function projectRounds(pv: PublicView, rounds: number[], P = PROJECTION_PARAMS): Projection[] {
  const byClub = new Map<string, PublicPlayer[]>();
  for (const p of pv.players) { if (!byClub.has(p.clubId)) byClub.set(p.clubId, []); byClub.get(p.clubId)!.push(p); }
  // scouting XI and strength per club
  const xiOf = (club: string, round: number) => {
    const squad = byClub.get(club)!.filter(p => p.availableFrom <= round);
    const xi: PublicPlayer[] = [];
    for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as Position[]) xi.push(...squad.filter(p => p.position === pos).sort((a, b) => posRating(b) - posRating(a)).slice(0, XI_SHAPE[pos]));
    return xi;
  };
  const strength = (xi: PublicPlayer[]) => {
    let a = 0, aw = 0, d = 0, dw = 0;
    for (const p of xi) { a += ATT_W[p.position] * (0.6 * p.scout.attack + 0.4 * p.scout.creativity); aw += ATT_W[p.position];
      d += DEF_W[p.position] * (p.position === 'GK' ? p.scout.keeping : p.scout.defence); dw += DEF_W[p.position]; }
    return { attack: a / aw, defence: d / dw };
  };
  const clubs = pv.clubs.map(c => c.id);
  const base = clubs.map(c => strength(xiOf(c, 1)));
  const bar = { attack: base.reduce((s, x) => s + x.attack, 0) / base.length, defence: base.reduce((s, x) => s + x.defence, 0) / base.length };
  const priorXg = (home: string, away: string, round: number) => {
    const h = strength(xiOf(home, round)), a = strength(xiOf(away, round));
    return { home: 1.6 * Math.exp(P.k * ((h.attack - bar.attack) - (a.defence - bar.defence)) / 10), away: 1.33 * Math.exp(P.k * ((a.attack - bar.attack) - (h.defence - bar.defence)) / 10) };
  };
  // nudge by goals so far against what the prior expected
  const adj: Record<string, { att: number; def: number }> = {};
  for (const c of clubs) {
    let gf = 0, ga = 0, egf = 0, ega = 0;
    for (const r of pv.results) {
      if (r.homeId !== c && r.awayId !== c) continue;
      const x = priorXg(r.homeId, r.awayId, r.round), home = r.homeId === c;
      gf += home ? r.homeGoals : r.awayGoals; ga += home ? r.awayGoals : r.homeGoals;
      egf += home ? x.home : x.away; ega += home ? x.away : x.home;
    }
    const k = P.teamPriorMatches * 1.465;
    adj[c] = { att: (gf + k) / (egf + k), def: (ga + k) / (ega + k) };
  }
  const out: Projection[] = [];
  for (const round of rounds) {
    for (const f of pv.fixtures.filter(x => x.round === round)) {
      const x = priorXg(f.homeId, f.awayId, round);
      const lam = { home: x.home * adj[f.homeId].att * adj[f.awayId].def, away: x.away * adj[f.awayId].att * adj[f.homeId].def };
      for (const [club, opp, home] of [[f.homeId, f.awayId, true], [f.awayId, f.homeId, false]] as [string, string, boolean][]) {
        const forG = home ? lam.home : lam.away, against = home ? lam.away : lam.home;
        const xi = xiOf(club, round);
        const shotTot = xi.reduce((s, p) => s + SHOT_W[p.position] * p.scout.attack / 60, 0);
        const astTot = xi.reduce((s, p) => s + AST_W[p.position] * (p.scout.creativity / 60) ** 2, 0);
        const clubRounds = new Set(pv.results.filter(r => r.homeId === club || r.awayId === club).map(r => r.round)).size;
        for (const p of byClub.get(club)!) {
          const available = p.availableFrom <= round;
          const inXi = xi.includes(p);
          const starts = p.history.filter(h => h.started).length;
          const wObs = clubRounds / (clubRounds + P.startPriorRounds);
          const pStart = available ? (1 - wObs) * (inXi ? P.pStartXi : P.pStartOther) + wObs * (clubRounds ? starts / clubRounds : 0) : 0;
          const pSub = available ? (1 - pStart) * P.pSub : 0;
          const xMinutes = pStart * 82 + pSub * 22;
          const mins = p.history.reduce((s, h) => s + h.minutes, 0), w = mins / (mins + P.playerPriorMinutes);
          const priorG = (SHOT_W[p.position] * p.scout.attack / 60) / Math.max(0.01, shotTot) * 1.465;   // team goals share at average strength, per 90
          const priorA = (AST_W[p.position] * (p.scout.creativity / 60) ** 2) / Math.max(0.01, astTot) * 1.465 * 0.8;
          const obsG = mins ? p.history.reduce((s, h) => s + h.goals, 0) / mins * 90 : 0, obsA = mins ? p.history.reduce((s, h) => s + h.assists, 0) / mins * 90 : 0;
          const g90 = ((1 - w) * priorG + w * obsG) * forG / 1.465, a90 = ((1 - w) * priorA + w * obsA) * forG / 1.465;
          const xGoals = g90 * xMinutes / 90, xAssists = a90 * xMinutes / 90;
          const p60 = pStart * 0.85, pCS = Math.exp(-against);
          const sc = SCORING_V1, pos = p.position, back = pos === 'GK' || pos === 'DEF';
          let xp = pStart * (0.85 * sc.played.long + 0.15 * sc.played.short) + pSub * sc.played.short;
          xp += xGoals * sc.goal[pos] + xAssists * sc.assist + p60 * pCS * sc.cleanSheet[pos];
          if (back) xp -= p60 * against / sc.concededPer;
          if (pos === 'GK') xp += p60 * (3.16 * against / 1.33) / sc.savesPer;
          xp += 0.9 * (xGoals + xAssists) + (back ? 0.35 * p60 * pCS : 0) + P.bonusBase * pStart;    // Shark Rating bonus, roughly
          xp -= 0.15 * (pStart + pSub);                                      // cards
          out.push({ playerId: p.id, round, opponentId: opp, home, pStart, xMinutes, xGoals, xAssists, pCleanSheet: p60 * pCS, xPoints: xp });
        }
      }
    }
  }
  return out;
}

/** Expected points per player summed over the given rounds. */
export function xpOver(pv: PublicView, rounds: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of pv.players) out[p.id] = 0;
  for (const x of projectRounds(pv, rounds)) out[x.playerId] += x.xPoints;
  return out;
}
