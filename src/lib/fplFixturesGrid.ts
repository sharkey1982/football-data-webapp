// ============================================================================
// src/lib/fplFixturesGrid.ts
//
// /fpl/fixtures (Chris, 25 Oct 2026: approved mock-up): each Premier League
// side's upcoming gameweeks, coloured by expected goals, with the League Cup,
// FA Cup and European games in between, so midweek games, short rest and
// likely rotation are visible next to the league fixtures.
//
// Data: one RPC, get_fpl_fixtures_grid (migration 20261025140000). The grid
// itself is built here (pure functions, tested in fplFixturesGrid.test.ts).
// ============================================================================

import { supabase } from './supabase';

export type GridPl = {
  gw: number; ko: string | null; h: number; a: number;
  hxg: number | null; axg: number | null; finished: boolean; hs: number | null; ascore: number | null;
};
export type GridCup = {
  fixture_id: number; league_id: number; d: string; tm: string | null;
  home_team_id: number; away_team_id: number; home_name: string; away_name: string;
};
export type GridTeam = { fpl_team_id: number; team_id: number; short: string; name: string; owned: { name: string; own: number }[] };
export type GridLineup = {
  fixture_id: number; team_id: number; player_name: string; fpl_player_id: number | null;
  started: boolean; on_minute: number | null; off_minute: number | null; own: number | null;
};
export type GridData = {
  today: string;
  gameweeks: { gw: number; deadline: string | null; finished: boolean }[];
  teams: GridTeam[];
  pl: GridPl[];
  cups: GridCup[];
  lineups: GridLineup[];
};

export async function getFplFixturesGrid(): Promise<GridData> {
  const { data, error } = await supabase.rpc('get_fpl_fixtures_grid' as never);
  if (error) throw error;
  return data as unknown as GridData;
}

export const COMP: Record<number, { short: string; name: string }> = {
  6: { short: 'LC', name: 'League Cup' },
  7: { short: 'FAC', name: 'FA Cup' },
  9: { short: 'UCL', name: 'Champions League' },
  10: { short: 'UEL', name: 'Europa League' },
  11: { short: 'UECL', name: 'Conference League' },
};

export type Range = 'gw' | 'next6' | 'month';
export type View = 'attack' | 'defence';

/** A UK calendar date (YYYY-MM-DD) for a timestamp. */
export function ukDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

export type Column =
  | { kind: 'gw'; key: string; gw: number; first: string; last: string }
  | { kind: 'mid'; key: string; from: string; to: string }
  | { kind: 'break'; key: string; from: string; to: string };

export type PlCell = {
  opp: GridTeam | undefined; home: boolean; date: string | null; ko: string | null;
  xgFor: number | null; xgAgainst: number | null; rest: number | null;
  finished: boolean; score: string | null;
};
export type CupCell = { comp: number; home: boolean; opp: string; date: string };
export type Row = { team: GridTeam; cells: Record<string, PlCell[] | CupCell[]>; ease: number };

/** Every game date for a side (PL and cups), sorted, for rest days. */
function gameDates(data: GridData, t: GridTeam): string[] {
  const ds: string[] = [];
  for (const f of data.pl) if (f.ko && (f.h === t.fpl_team_id || f.a === t.fpl_team_id)) ds.push(ukDate(f.ko));
  for (const c of data.cups) if (c.home_team_id === t.team_id || c.away_team_id === t.team_id) ds.push(c.d);
  return [...new Set(ds)].sort();
}

/** Days since the side's previous game (PL or cup) before this date. */
export function restDays(dates: string[], d: string): number | null {
  let prev: string | null = null;
  for (const x of dates) if (x < d) prev = x;
  return prev ? daysBetween(prev, d) : null;
}

/** Gameweeks still to finish (any fixture unfinished), in order, with their date span. */
export function openGameweeks(data: GridData): { gw: number; first: string; last: string }[] {
  const by = new Map<number, { dates: string[]; open: boolean }>();
  for (const f of data.pl) {
    const g = by.get(f.gw) ?? { dates: [], open: false };
    if (f.ko) g.dates.push(ukDate(f.ko));
    if (!f.finished) g.open = true;
    by.set(f.gw, g);
  }
  return [...by.entries()]
    .filter(([, g]) => g.open && g.dates.length)
    .map(([gw, g]) => ({ gw, first: g.dates.sort()[0], last: g.dates[g.dates.length - 1] }))
    .sort((a, b) => a.gw - b.gw);
}

/** Columns for a range: gameweeks, with midweek columns where Premier League
 *  sides play cup or European games between them, and a break column for a
 *  gap of 10+ days with no club games for them. */
export function buildColumns(data: GridData, range: Range): Column[] {
  const open = openGameweeks(data);
  let gws = open;
  if (range === 'gw') gws = open.slice(0, 1);
  else if (range === 'next6') gws = open.slice(0, 6);
  else gws = open.filter((g) => g.first <= addDays(data.today, 31));
  if (!gws.length) gws = open.slice(0, 1);
  const cols: Column[] = [];
  let prevLast = data.today < (gws[0]?.first ?? data.today) ? addDays(data.today, -1) : null;
  for (const g of gws) {
    if (prevLast) {
      const from = addDays(prevLast, 1);
      const to = addDays(g.first, -1);
      if (from <= to) {
        const cups = data.cups.some((c) => c.d >= from && c.d <= to);
        if (cups) cols.push({ kind: 'mid', key: `m-${from}`, from, to });
        else if (daysBetween(prevLast, g.first) >= 10) cols.push({ kind: 'break', key: `b-${from}`, from, to });
      }
    }
    cols.push({ kind: 'gw', key: `gw-${g.gw}`, gw: g.gw, first: g.first, last: g.last });
    prevLast = g.last;
  }
  return cols;
}

export function buildRows(data: GridData, cols: Column[], view: View): Row[] {
  const byFpl = new Map(data.teams.map((t) => [t.fpl_team_id, t]));
  return data.teams.map((t) => {
    const dates = gameDates(data, t);
    const cells: Row['cells'] = {};
    let ease = 0;
    let gwSeen = 0;
    for (const c of cols) {
      if (c.kind === 'gw') {
        const fs = data.pl.filter((f) => f.gw === c.gw && (f.h === t.fpl_team_id || f.a === t.fpl_team_id));
        cells[c.key] = fs.map((f) => {
          const home = f.h === t.fpl_team_id;
          const d = f.ko ? ukDate(f.ko) : null;
          const xgFor = home ? f.hxg : f.axg;
          const xgAgainst = home ? f.axg : f.hxg;
          return {
            opp: byFpl.get(home ? f.a : f.h), home, date: d, ko: f.ko, xgFor, xgAgainst,
            rest: d ? restDays(dates, d) : null, finished: f.finished,
            score: f.finished && f.hs != null && f.ascore != null ? (home ? `${f.hs}-${f.ascore}` : `${f.ascore}-${f.hs}`) : null,
          };
        });
        if (gwSeen < 3) {
          for (const p of cells[c.key] as PlCell[]) if (!p.finished) ease += view === 'attack' ? p.xgFor ?? 0 : -(p.xgAgainst ?? 0);
        }
        gwSeen++;
      } else if (c.kind === 'mid') {
        cells[c.key] = data.cups
          .filter((x) => x.d >= c.from && x.d <= c.to && (x.home_team_id === t.team_id || x.away_team_id === t.team_id))
          .map((x) => {
            const home = x.home_team_id === t.team_id;
            return { comp: x.league_id, home, opp: home ? x.away_name : x.home_name, date: x.d };
          });
      }
    }
    return { team: t, cells, ease };
  });
}

/** Five colour bands: 1 hardest .. 5 easiest. */
export function band(xg: number | null, view: View): number {
  if (xg == null) return 0;
  const cuts = view === 'attack' ? [1.1, 1.35, 1.6, 1.9] : [1.7, 1.45, 1.25, 1.05];
  let b = 1;
  for (const c of cuts) if (view === 'attack' ? xg >= c : xg <= c) b++;
  return b;
}

/** The next run of cup and European games for Premier League sides (from today). */
export function nextMidweek(data: GridData): { from: string; to: string; games: (GridCup & { sides: { team: GridTeam; next: { date: string; opp: GridTeam | undefined; home: boolean } | null }[] })[] } | null {
  const teamById = new Map(data.teams.map((t) => [t.team_id, t]));
  const byFpl = new Map(data.teams.map((t) => [t.fpl_team_id, t]));
  const upcoming = data.cups.filter((c) => c.d >= data.today).sort((a, b) => a.d.localeCompare(b.d));
  if (!upcoming.length) return null;
  // The cluster: games within 4 days of the first one.
  const from = upcoming[0].d;
  const games = upcoming.filter((c) => daysBetween(from, c.d) <= 4);
  const to = games[games.length - 1].d;
  return {
    from, to,
    games: games.map((g) => ({
      ...g,
      sides: [g.home_team_id, g.away_team_id].map((id) => teamById.get(id)).filter((t): t is GridTeam => !!t).map((team) => {
        const nxt = data.pl
          .filter((f) => f.ko && ukDate(f.ko) > g.d && (f.h === team.fpl_team_id || f.a === team.fpl_team_id))
          .sort((a, b) => (a.ko ?? '').localeCompare(b.ko ?? ''))[0];
        return {
          team,
          next: nxt && nxt.ko ? { date: ukDate(nxt.ko), opp: byFpl.get(nxt.h === team.fpl_team_id ? nxt.a : nxt.h), home: nxt.h === team.fpl_team_id } : null,
        };
      }),
    })),
  };
}

/** Recent cup games we have line-ups for, one entry per side. */
export function lastMidweek(data: GridData): { cup: GridCup; team: GridTeam; started: GridLineup[]; subs: GridLineup[]; unused: GridLineup[] }[] {
  const teamById = new Map(data.teams.map((t) => [t.team_id, t]));
  const out: ReturnType<typeof lastMidweek> = [];
  const keys = [...new Set(data.lineups.map((l) => `${l.fixture_id}:${l.team_id}`))];
  for (const k of keys) {
    const [fx, tm] = k.split(':').map(Number);
    const cup = data.cups.find((c) => c.fixture_id === fx);
    const team = teamById.get(tm);
    if (!cup || !team) continue;
    const ls = data.lineups.filter((l) => l.fixture_id === fx && l.team_id === tm);
    out.push({
      cup, team,
      started: ls.filter((l) => l.started),
      subs: ls.filter((l) => !l.started && l.on_minute != null),
      unused: ls.filter((l) => !l.started && l.on_minute == null),
    });
  }
  return out.sort((a, b) => b.cup.d.localeCompare(a.cup.d) || a.team.name.localeCompare(b.team.name));
}
