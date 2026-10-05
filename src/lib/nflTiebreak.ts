// ============================================================================
// src/lib/nflTiebreak.ts
//
// NFL standings the way the NFL ranks them: the official division and
// wild-card tie-breaking procedures, play-off seeding, and the record splits
// standings pages show (conference, non-conference, streak, last five).
// Everything is worked out from one season's regular-season games.
//
// Tie-breaking procedure (nfl.com/standings/tie-breaking-procedures):
//   Division: head-to-head, division record, common games, conference record,
//     strength of victory, strength of schedule, ... net points in common
//     games, net points in all games.
//   Wild card: division ties first (only the top club of a division goes
//     forward), then head-to-head (two clubs: if they met; three or more: only
//     a sweep), conference record, common games (minimum four), strength of
//     victory, strength of schedule, ... net points in conference games, net
//     points in all games.
//   Three or more clubs: when a step separates some but not all, the leaders
//     go on and the procedure restarts at step 1 (two clubs: the two-club
//     steps). After the top club is found, the rest restart from the top.
// Not modelled: the combined-ranking steps (points scored/allowed ranks) and
// net touchdowns, which almost never decide; the last resort here is the team
// name, standing in for a coin toss. `decidedBy` says which step split a tie.
//
// Seeding: 7 clubs per conference from 2020 (6 before): division winners are
// seeds 1-4 (ordered by the wild-card procedure), then the wild cards.
// ============================================================================

import type { NflGame, NflStanding } from './nflApi';

type Rec = { w: number; l: number; t: number };
const pct = (r: Rec): number | null => (r.w + r.l + r.t === 0 ? null : (r.w + 0.5 * r.t) / (r.w + r.l + r.t));
const add = (r: Rec, res: 'W' | 'L' | 'T') => (res === 'W' ? r.w++ : res === 'L' ? r.l++ : r.t++);
const blank = (): Rec => ({ w: 0, l: 0, t: 0 });

type Result = { opp: string; res: 'W' | 'L' | 'T'; pf: number; pa: number; week: number; conf: boolean; div: boolean };

export type TeamExtras = {
  conf: Rec;
  nonConf: Rec;
  /** "W3", "L1", "T1"; empty before the first game. */
  streak: string;
  /** Oldest to newest, up to five. */
  last5: ('W' | 'L' | 'T')[];
  /** Combined win % of the teams beaten (each win counted), and of every opponent played. */
  sov: number | null;
  sos: number | null;
};

export type Seeded = {
  franchise: string;
  /** 1-7 (1-6 before 2020) for play-off places, null for the rest. */
  seed: number | null;
  divisionWinner: boolean;
  /** Which step put this team ahead of the next team level on win %, if any. */
  decidedBy: string | null;
};

export type StandingsMath = {
  extras: Map<string, TeamExtras>;
  /** Franchises in official order within each division, keyed "AFC East". */
  divisionOrder: Map<string, string[]>;
  /** Each conference: seeds first, then the rest in order. */
  conference: Map<string, Seeded[]>;
  playoffSpots: number;
};

export const playoffSpots = (season: number): number => (season >= 2020 ? 7 : 6);

export const recLabel = (r: Rec): string => (r.t > 0 ? `${r.w}-${r.l}-${r.t}` : `${r.w}-${r.l}`);

export function buildStandingsMath(rows: NflStanding[], games: NflGame[]): StandingsMath {
  const info = new Map(rows.map((r) => [r.franchise, r]));
  const results = new Map<string, Result[]>(rows.map((r) => [r.franchise, []]));
  const played = games
    .filter((g) => g.game_type === 'REG' && g.home_score != null && g.away_score != null && info.has(g.home_franchise) && info.has(g.away_franchise))
    .sort((a, b) => a.week - b.week);
  for (const g of played) {
    const h = info.get(g.home_franchise)!;
    const a = info.get(g.away_franchise)!;
    const conf = h.conference === a.conference;
    const div = conf && h.division === a.division;
    const hs = Number(g.home_score);
    const as = Number(g.away_score);
    const hr = hs > as ? 'W' : hs < as ? 'L' : 'T';
    const ar = hr === 'W' ? 'L' : hr === 'L' ? 'W' : 'T';
    results.get(h.franchise)!.push({ opp: a.franchise, res: hr, pf: hs, pa: as, week: g.week, conf, div });
    results.get(a.franchise)!.push({ opp: h.franchise, res: ar, pf: as, pa: hs, week: g.week, conf, div });
  }

  const overall = new Map<string, Rec>();
  for (const [f, rs] of results) {
    const r = blank();
    rs.forEach((x) => add(r, x.res));
    overall.set(f, r);
  }
  const recOf = (f: string, keep: (x: Result) => boolean): Rec => {
    const r = blank();
    results.get(f)!.filter(keep).forEach((x) => add(r, x.res));
    return r;
  };
  const combined = (fs: string[]): number | null => {
    const r = blank();
    for (const f of fs) {
      const o = overall.get(f)!;
      r.w += o.w;
      r.l += o.l;
      r.t += o.t;
    }
    return pct(r);
  };
  const sov = (f: string) => combined(results.get(f)!.filter((x) => x.res === 'W').map((x) => x.opp));
  const sos = (f: string) => combined(results.get(f)!.map((x) => x.opp));
  const winPct = (f: string) => pct(overall.get(f)!) ?? 0;
  const net = (f: string, keep: (x: Result) => boolean) => results.get(f)!.filter(keep).reduce((s, x) => s + x.pf - x.pa, 0);

  const extras = new Map<string, TeamExtras>();
  for (const [f, rs] of results) {
    let streak = '';
    if (rs.length) {
      const last = rs[rs.length - 1].res;
      let n = 0;
      for (let i = rs.length - 1; i >= 0 && rs[i].res === last; i--) n++;
      streak = `${last}${n}`;
    }
    extras.set(f, {
      conf: recOf(f, (x) => x.conf),
      nonConf: recOf(f, (x) => !x.conf),
      streak,
      last5: rs.slice(-5).map((x) => x.res),
      sov: sov(f),
      sos: sos(f),
    });
  }

  // ---- Tie-breaking ------------------------------------------------------------------------
  type Step = { name: string; value: (f: string, group: string[]) => number | null };
  const commonOpps = (group: string[]): Set<string> => {
    const sets = group.map((f) => new Set(results.get(f)!.map((x) => x.opp)));
    return new Set([...sets[0]].filter((o) => sets.every((s) => s.has(o)) && !group.includes(o)));
  };
  const h2h: Step = { name: 'head-to-head', value: (f, g) => pct(recOf(f, (x) => g.includes(x.opp))) };
  const divRec: Step = { name: 'division record', value: (f) => pct(recOf(f, (x) => x.div)) };
  const confRec: Step = { name: 'conference record', value: (f) => pct(recOf(f, (x) => x.conf)) };
  const common = (min: number): Step => ({
    name: 'record in common games',
    value: (f, g) => {
      const c = commonOpps(g);
      const r = recOf(f, (x) => c.has(x.opp));
      return r.w + r.l + r.t >= min ? pct(r) : null;
    },
  });
  const sovStep: Step = { name: 'strength of victory', value: (f) => sov(f) };
  const sosStep: Step = { name: 'strength of schedule', value: (f) => sos(f) };
  const netCommon: Step = { name: 'net points in common games', value: (f, g) => { const c = commonOpps(g); return net(f, (x) => c.has(x.opp)); } };
  const netConf: Step = { name: 'net points in conference games', value: (f) => net(f, (x) => x.conf) };
  const netAll: Step = { name: 'net points', value: (f) => net(f, () => true) };

  // Wild-card head-to-head: two clubs only if they met; more only for a sweep.
  const wcH2h: Step = {
    name: 'head-to-head',
    value: (f, g) => {
      if (g.length === 2) {
        const r = recOf(f, (x) => g.includes(x.opp));
        return r.w + r.l + r.t === 0 ? null : pct(r);
      }
      const others = g.filter((o) => o !== f);
      const beat = others.every((o) => results.get(f)!.some((x) => x.opp === o) && results.get(f)!.filter((x) => x.opp === o).every((x) => x.res === 'W'));
      const lost = others.every((o) => results.get(f)!.some((x) => x.opp === o) && results.get(f)!.filter((x) => x.opp === o).every((x) => x.res === 'L'));
      return beat ? 1 : lost ? 0 : 0.5;
    },
  };

  const DIVISION_STEPS = [h2h, divRec, common(0), confRec, sovStep, sosStep, netCommon, netAll];
  const WILDCARD_STEPS = [wcH2h, confRec, common(4), sovStep, sosStep, netConf, netAll];

  /** The single best club of a group level on win %, and the step that decided it. */
  function best(group: string[], steps: Step[], divisionFirst: boolean): { f: string; by: string | null } {
    let g = [...group];
    let by: string | null = null;
    while (g.length > 1) {
      if (divisionFirst) {
        // Only the top club of each division goes forward.
        const byDiv = new Map<string, string[]>();
        for (const f of g) {
          const k = `${info.get(f)!.conference} ${info.get(f)!.division}`;
          byDiv.set(k, [...(byDiv.get(k) ?? []), f]);
        }
        if ([...byDiv.values()].some((v) => v.length > 1)) {
          g = [...byDiv.values()].map((v) => (v.length > 1 ? best(v, DIVISION_STEPS, false).f : v[0]));
          if (g.length === 1) return { f: g[0], by: 'division tie-break' };
        }
      }
      let cut = false;
      for (const s of steps) {
        const vals = g.map((f) => ({ f, v: s.value(f, g) }));
        if (vals.some((x) => x.v == null)) continue; // step does not apply
        const top = Math.max(...vals.map((x) => x.v as number));
        const leaders = vals.filter((x) => Math.abs((x.v as number) - top) < 1e-9).map((x) => x.f);
        if (leaders.length < g.length) {
          by = s.name;
          g = leaders;
          cut = true;
          break; // restart at step 1 with the leaders
        }
      }
      if (!cut) {
        g = [[...g].sort((a, b) => info.get(a)!.team_name.localeCompare(info.get(b)!.team_name))[0]];
        by = 'coin toss (not modelled: alphabetical)';
      }
    }
    return { f: g[0], by };
  }

  /** Full order of a set of clubs: by win %, ties broken one place at a time. */
  function order(teams: string[], steps: Step[], divisionFirst: boolean): { f: string; by: string | null }[] {
    const left = [...teams];
    const out: { f: string; by: string | null }[] = [];
    while (left.length) {
      const top = Math.max(...left.map(winPct));
      const level = left.filter((f) => Math.abs(winPct(f) - top) < 1e-9);
      const pick = level.length === 1 ? { f: level[0], by: null } : best(level, steps, divisionFirst);
      out.push(pick);
      left.splice(left.indexOf(pick.f), 1);
    }
    return out;
  }

  const divisionOrder = new Map<string, string[]>();
  const winners = new Set<string>();
  const divBy = new Map<string, string | null>();
  for (const conf of ['AFC', 'NFC']) {
    for (const div of ['East', 'North', 'South', 'West']) {
      const teams = rows.filter((r) => r.conference === conf && r.division === div).map((r) => r.franchise);
      if (!teams.length) continue;
      const o = order(teams, DIVISION_STEPS, false);
      o.forEach((x) => divBy.set(x.f, x.by));
      divisionOrder.set(`${conf} ${div}`, o.map((x) => x.f));
      winners.add(o[0].f);
    }
  }

  const season = rows[0]?.season ?? 0;
  const spots = playoffSpots(season);
  const conference = new Map<string, Seeded[]>();
  for (const conf of ['AFC', 'NFC']) {
    const teams = rows.filter((r) => r.conference === conf).map((r) => r.franchise);
    const w = order(teams.filter((f) => winners.has(f)), WILDCARD_STEPS, false);
    const rest = order(teams.filter((f) => !winners.has(f)), WILDCARD_STEPS, true);
    const seeded: Seeded[] = [
      ...w.map((x, i) => ({ franchise: x.f, seed: i + 1, divisionWinner: true, decidedBy: x.by })),
      ...rest.map((x, i) => ({ franchise: x.f, seed: w.length + i < spots ? w.length + i + 1 : null, divisionWinner: false, decidedBy: x.by })),
    ];
    conference.set(conf, seeded);
  }
  return { extras, divisionOrder, conference, playoffSpots: spots };
}
