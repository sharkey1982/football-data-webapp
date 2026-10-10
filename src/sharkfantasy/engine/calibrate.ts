// ============================================================================
// Shark Fantasy engine: calibration measures over many simulated seasons,
// compared with TARGETS (params.ts). Used by scripts/sf/sim-season.ts and
// the tests. Pure: worlds and seasons are generated from the seeds given.
// ============================================================================
import { TARGETS } from './params';
import { generateWorld } from './world';
import { playSeason } from './season';
import { rating } from './strength';
import type { World } from './types';

export interface Calibration {
  worlds: number;
  seasons: number;
  matches: number;
  measures: Record<keyof typeof TARGETS, number>;
  pass: Record<keyof typeof TARGETS, boolean>;
  allPass: boolean;
  /** Mean fantasy points per appearance by position (for reference). */
  pointsPerApp: Record<string, number>;
  titleByStrengthRank: number[]; // share of league titles by pre-season strength rank (1 = strongest)
}

function strengthOrder(w: World): string[] {
  const s = (id: string) => w.players.filter(p => p.clubId === id).map(rating).sort((a, b) => b - a).slice(0, 11).reduce((a, b) => a + b, 0);
  return w.clubs.map(c => c.id).sort((a, b) => s(b) - s(a));
}

export function calibrate(worlds: number, seasonsPerWorld: number, seed = 'calib'): Calibration {
  let matches = 0, goals = 0, hg = 0, ag = 0, hw = 0, dr = 0, nil = 0, cs = 0, yel = 0, red = 0;
  let gDef = 0, gMid = 0, gFwd = 0, assists = 0, gkSaves = 0, gk60 = 0, apps = 0, apps60 = 0;
  const pts: Record<string, { s: number; n: number }> = { GK: { s: 0, n: 0 }, DEF: { s: 0, n: 0 }, MID: { s: 0, n: 0 }, FWD: { s: 0, n: 0 } };
  const titles = Array(10).fill(0);
  let seasons = 0;
  for (let w = 0; w < worlds; w++) {
    const world = generateWorld(`${seed}-${w}`);
    const order = strengthOrder(world);
    for (let s = 1; s <= seasonsPerWorld; s++) {
      const res = playSeason(world, s);
      seasons++;
      titles[order.indexOf(res.leagueTable[0].clubId)]++;
      for (const r of res.results) {
        matches++; goals += r.homeGoals + r.awayGoals; hg += r.homeGoals; ag += r.awayGoals;
        if (r.homeGoals > r.awayGoals) hw++; else if (r.homeGoals === r.awayGoals) dr++;
        if (r.homeGoals + r.awayGoals === 0) nil++;
        cs += (r.homeGoals === 0 ? 1 : 0) + (r.awayGoals === 0 ? 1 : 0);
        for (const e of r.events) { if (e.type === 'yellow') yel++; if (e.type === 'red') red++; }
        for (const st of r.stats) {
          if (st.position === 'DEF') gDef += st.goals; else if (st.position === 'MID') gMid += st.goals; else if (st.position === 'FWD') gFwd += st.goals;
          assists += st.assists; apps++; if (st.minutes >= 60) apps60++;
          if (st.position === 'GK' && st.minutes >= 60) { gkSaves += st.saves; gk60++; }
        }
      }
      // points per appearance: only rounds the player featured in
      const featured = new Set<string>();
      for (const r of res.results) { const round = /\|r(\d+)\|/.exec(r.fixtureKey)![1]; for (const x of r.stats) featured.add(`${x.playerId}|${round}`); }
      for (const p of world.players) for (let i = 0; i < 10; i++) {
        if (featured.has(`${p.id}|${i + 1}`)) { pts[p.position].s += res.points[p.id][i]; pts[p.position].n++; }
      }
    }
  }
  const scored = gDef + gMid + gFwd;
  const measures = {
    goalsPerMatch: goals / matches, homeGoals: hg / matches, awayGoals: ag / matches, homeWin: hw / matches, draw: dr / matches,
    nilNil: nil / matches, cleanSheetPerTeam: cs / (2 * matches), yellowsPerMatch: yel / matches, redsPerMatch: red / matches,
    goalShareDef: gDef / scored, goalShareFwd: gFwd / scored, assistsPerGoal: assists / scored, gkSaves: gkSaves / gk60,
    share60: apps60 / apps, favouriteTitleShare: titles[0] / seasons,
  } as Record<keyof typeof TARGETS, number>;
  const pass = {} as Record<keyof typeof TARGETS, boolean>;
  for (const k of Object.keys(TARGETS) as (keyof typeof TARGETS)[]) pass[k] = Math.abs(measures[k] - TARGETS[k].value) <= TARGETS[k].tol;
  const pointsPerApp: Record<string, number> = {};
  for (const k of Object.keys(pts)) pointsPerApp[k] = pts[k].s / Math.max(1, pts[k].n);
  return { worlds, seasons, matches, measures, pass, allPass: Object.values(pass).every(Boolean), pointsPerApp,
    titleByStrengthRank: titles.map(t => t / seasons) };
}
