// ============================================================================
// src/lib/hubApi.ts
//
// Data for the Club and FPL home pages (/football, /fpl/start). Layout
// review, 21 Oct 2026: each section hub is that sport's home page, opening
// on "this week" -- the games and the model's call, what's on TV, the
// deadline and the picks -- before the full list of pages.
//
// Mostly thin selections over the queries the full pages already use, so a
// hub never says something its own page doesn't.
// ============================================================================

import { supabase } from './supabase';
import { getFixturesForSeason, type FixtureWithNames } from './fixturesApi';
import { getCurrentFplSeasonId } from './currentSeason';
import { CURRENT_MODEL_VERSION } from './fplModel';
import { upcomingGameweek } from './landingApi';

// ---- Club ------------------------------------------------------------------

/** The English divisions the Club home page offers, top flight first. */
export const HUB_LEAGUES = [
  { id: 1, name: 'Premier League' },
  { id: 2, name: 'Championship' },
  { id: 3, name: 'League One' },
  { id: 4, name: 'League Two' },
  { id: 5, name: 'National League' },
] as const;

/** The side the model favours: a clear gap in expected goals, else neither. */
export function favoured(h: number | null | undefined, a: number | null | undefined): 'home' | 'away' | null {
  if (h == null || a == null) return null;
  if (h - a > 0.35) return 'home';
  if (a - h > 0.35) return 'away';
  return null;
}


const isPlayed = (f: FixtureWithNames) => f.full_time_home_goals != null || f.status === 'played';

/** The round coming up: the first matchweek with a game still to play (all
 *  of its games, so a Friday opener shows with the weekend), or, with no
 *  matchweeks, the unplayed games of the next seven days. */
export function nextRound(fixtures: FixtureWithNames[], today: string): { matchweek: number | null; fixtures: FixtureWithNames[] } {
  const byMw = new Map<number, FixtureWithNames[]>();
  for (const f of fixtures) {
    if (f.matchweek == null) continue;
    const list = byMw.get(f.matchweek) ?? [];
    list.push(f);
    byMw.set(f.matchweek, list);
  }
  const order = (a: FixtureWithNames, b: FixtureWithNames) =>
    a.kickoff_date.localeCompare(b.kickoff_date) || (a.kickoff_time ?? '').localeCompare(b.kickoff_time ?? '') || a.home_team_name.localeCompare(b.home_team_name);
  const mw = [...byMw.keys()].sort((a, b) => a - b).find((k) => byMw.get(k)!.some((f) => !isPlayed(f) && f.status !== 'postponed'));
  if (mw != null) return { matchweek: mw, fixtures: byMw.get(mw)!.filter((f) => !isPlayed(f)).sort(order) };
  const end = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 864e5).toISOString().slice(0, 10);
  return { matchweek: null, fixtures: fixtures.filter((f) => !isPlayed(f) && f.kickoff_date >= today && f.kickoff_date <= end).sort(order) };
}

export async function getNextRound(leagueId: number, seasonId: number, today: string) {
  return nextRound(await getFixturesForSeason(leagueId, seasonId), today);
}

export type TvItem = {
  fixtureId: number;
  slug: string | null;
  date: string;
  time: string | null;
  competition: string;
  home: string;
  away: string;
  homeTeamId: number;
  awayTeamId: number;
  channels: string[];
};

const TV_PRIORITY = ['Premier League', 'Champions League', 'Championship', 'Europa League', 'FA Cup', 'Carabao Cup', 'League One', 'League Two', 'Conference League', 'National League'];

/** Confirmed UK broadcasts on the next day that has any (today when it
 *  does), earliest kick-off first. */
export async function getTvNextDay(today: string, limit = 5): Promise<{ date: string; items: TvItem[] } | null> {
  const { data, error } = await supabase
    .from('upcoming_broadcast_fixtures' as never)
    .select('fixture_id, slug, kickoff_date, kickoff_time, league_name, home_team_id, home_team_name, away_team_id, away_team_name, broadcaster, channel')
    .eq('market', 'GB')
    .gte('kickoff_date', today)
    .order('kickoff_date')
    .order('kickoff_time')
    .limit(200);
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return null;
  const date = String(rows[0].kickoff_date);
  const byFixture = new Map<number, TvItem>();
  for (const r of rows) {
    if (String(r.kickoff_date) !== date) break;
    const id = Number(r.fixture_id);
    const item = byFixture.get(id) ?? {
      fixtureId: id,
      slug: (r.slug as string | null) ?? null,
      date,
      time: (r.kickoff_time as string | null) ?? null,
      competition: String(r.league_name),
      home: String(r.home_team_name),
      away: String(r.away_team_name),
      homeTeamId: Number(r.home_team_id),
      awayTeamId: Number(r.away_team_id),
      channels: [],
    };
    const ch = (r.broadcaster as string | null) ?? (r.channel as string | null);
    if (ch && !item.channels.includes(ch)) item.channels.push(ch);
    byFixture.set(id, item);
  }
  // English football and the Champions League first: a hub reader wants
  // Bayern v Arsenal before a Conference League tie in Kazakhstan.
  const rank = (comp: string) => {
    const i = TV_PRIORITY.findIndex((p) => comp.includes(p));
    return i < 0 ? TV_PRIORITY.length : i;
  };
  const items = [...byFixture.values()].sort((x, y) => rank(x.competition) - rank(y.competition) || (x.time ?? '').localeCompare(y.time ?? ''));
  return { date, items: items.slice(0, limit) };
}

// ---- FPL -------------------------------------------------------------------

export async function getNextDeadline(): Promise<{ gw: number; deadline: string } | null> {
  const { data, error } = await supabase
    .from('fpl_gameweeks')
    .select('fpl_event_id, deadline_time')
    .eq('season_id', await getCurrentFplSeasonId())
    .gt('deadline_time', new Date().toISOString())
    .order('deadline_time')
    .limit(1);
  if (error) throw error;
  const row = (data ?? [])[0] as { fpl_event_id: number; deadline_time: string } | undefined;
  return row ? { gw: row.fpl_event_id, deadline: row.deadline_time } : null;
}

export type ProjectedPick = { fplPlayerId: number; name: string; slug: string | null; team: string; teamId: number | null; price: number | null; points: number; games: number };

/** Projected points for the coming gameweek, summed per player so a double
 *  gameweek counts both games. Current model, baseline scenario. */
export async function getTopProjected(limit = 5): Promise<{ gw: number; picks: ProjectedPick[] } | null> {
  const gw = await upcomingGameweek();
  if (!gw || gw.fixtureIds.length === 0) return null;
  const { data, error } = await supabase
    .from('fpl_player_projections')
    .select('fpl_player_id, fixture_id, expected_fpl_points')
    .eq('model_version', CURRENT_MODEL_VERSION)
    .eq('scenario_key', 'baseline')
    .in('fixture_id', gw.fixtureIds)
    .gt('expected_fpl_points', 2);
  if (error) throw error;
  const sums = new Map<number, { points: number; games: number }>();
  for (const r of (data ?? []) as { fpl_player_id: number; expected_fpl_points: number }[]) {
    const s = sums.get(r.fpl_player_id) ?? { points: 0, games: 0 };
    s.points += Number(r.expected_fpl_points);
    s.games += 1;
    sums.set(r.fpl_player_id, s);
  }
  const top = [...sums.entries()].sort((a, b) => b[1].points - a[1].points).slice(0, limit);
  if (top.length === 0) return { gw: gw.matchweek, picks: [] };
  const { data: players, error: pErr } = await supabase
    .from('fpl_players')
    .select('fpl_player_id, web_name, slug, now_cost, canonical_team_id')
    .eq('season_id', await getCurrentFplSeasonId())
    .in('fpl_player_id', top.map(([id]) => id));
  if (pErr) throw pErr;
  const byId = new Map(((players ?? []) as { fpl_player_id: number; web_name: string; slug: string | null; now_cost: number | null; canonical_team_id: number | null }[]).map((p) => [p.fpl_player_id, p]));
  const teamIds = [...new Set([...byId.values()].map((p) => p.canonical_team_id).filter((x): x is number => x != null))];
  const teamNames = new Map<number, string>();
  if (teamIds.length) {
    const { data: teams, error: tErr } = await supabase.from('teams').select('team_id, display_name').in('team_id', teamIds);
    if (tErr) throw tErr;
    for (const t of (teams ?? []) as { team_id: number; display_name: string }[]) teamNames.set(t.team_id, t.display_name);
  }
  return {
    gw: gw.matchweek,
    picks: top.map(([id, s]) => {
      const p = byId.get(id);
      return {
        fplPlayerId: id,
        name: p?.web_name ?? 'Unknown',
        slug: p?.slug ?? null,
        team: p?.canonical_team_id != null ? teamNames.get(p.canonical_team_id) ?? '' : '',
        teamId: p?.canonical_team_id ?? null,
        price: p?.now_cost != null ? p.now_cost / 10 : null,
        points: s.points,
        games: s.games,
      };
    }),
  };
}

/** "Fri 23 Oct, 18:30" in UK time. */
export function formatDeadline(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  return `${day}, ${time}`;
}
