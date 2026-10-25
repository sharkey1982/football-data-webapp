// ============================================================================
// src/lib/fplGameweekState.ts
//
// Which gameweek the FPL home page (/fpl/start) is about. Once a deadline
// passes, the hub used to jump straight to the next one, so on the Sunday
// of Gameweek 8 it said "Gameweek 9" with five GW8 games still to play
// (Chris, 25 Oct 2026). Now, between a deadline and the end of that
// gameweek's last game, the hub offers both: the gameweek in progress (scores,
// top scorers, the most-captained player's points) and the next deadline.
//
// gameweekState() is the rule, kept pure so it is tested on its own:
//   - open gameweek: the latest one whose deadline has passed;
//   - the toggle shows while FPL hasn't marked it finished and it has games;
//   - default: the open gameweek while any game is unplayed or being
//     played, the next one once the last game has finished (provisionally
//     is enough: bonus confirmation can take hours).
// ============================================================================

import { supabase } from './supabase';
import { getCurrentFplSeasonId } from './currentSeason';

export type GwRow = { gw: number; deadline: string; finished: boolean };
export type FixtureFlags = { started: boolean | null; finished_provisional: boolean | null; finished: boolean | null };

export type GameweekState = {
  /** The gameweek whose deadline has passed most recently, if any. */
  openGw: number | null;
  /** The gameweek with the next deadline, if any. */
  nextGw: number | null;
  /** Show the "in progress / next deadline" toggle. */
  showToggle: boolean;
  /** Games of the open gameweek not yet finished (provisionally). */
  gamesRemaining: number;
  /** The view to open on. */
  defaultView: 'open' | 'next';
};

const fixtureDone = (f: FixtureFlags) => Boolean(f.finished || f.finished_provisional);

export function gameweekState(gameweeks: GwRow[], fixtures: FixtureFlags[], now: number = Date.now()): GameweekState {
  const sorted = [...gameweeks].sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
  const passed = sorted.filter((g) => Date.parse(g.deadline) <= now);
  const open = passed.at(-1) ?? null;
  const next = sorted.find((g) => Date.parse(g.deadline) > now) ?? null;
  const gamesRemaining = fixtures.filter((f) => !fixtureDone(f)).length;
  const showToggle = open != null && !open.finished && next != null && fixtures.length > 0;
  return {
    openGw: open?.gw ?? null,
    nextGw: next?.gw ?? null,
    showToggle,
    gamesRemaining: showToggle ? gamesRemaining : 0,
    defaultView: showToggle && gamesRemaining > 0 ? 'open' : 'next',
  };
}

// ---- Data for the in-progress view -----------------------------------------

export type LiveGame = {
  id: number;
  kickoff: string | null;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  minutes: number;
  state: 'not_started' | 'live' | 'done';
};

export type LivePlayerPoints = { fplPlayerId: number; name: string; slug: string | null; team: string; points: number; minutes: number; ownership: number | null };

export type OpenGameweek = {
  state: GameweekState;
  games: LiveGame[];
  topScorers: LivePlayerPoints[];
  mostCaptained: LivePlayerPoints | null;
  mostSelected: LivePlayerPoints | null;
};

type LiveFixtureRow = FixtureFlags & {
  fpl_fixture_id: number; kickoff_time: string | null; team_h: number; team_a: number;
  team_h_score: number | null; team_a_score: number | null; minutes: number | null;
};

export function liveGameState(f: FixtureFlags): LiveGame['state'] {
  if (fixtureDone(f)) return 'done';
  return f.started ? 'live' : 'not_started';
}

export async function getOpenGameweek(): Promise<OpenGameweek> {
  const season = await getCurrentFplSeasonId();
  const { data: gwData, error: gwErr } = await supabase
    .from('fpl_gameweeks')
    .select('fpl_event_id, deadline_time, finished, source_payload')
    .eq('season_id', season)
    .order('deadline_time');
  if (gwErr) throw gwErr;
  const gwRows = (gwData ?? []) as { fpl_event_id: number; deadline_time: string; finished: boolean | null; source_payload: Record<string, unknown> | null }[];
  const gameweeks: GwRow[] = gwRows.map((g) => ({ gw: g.fpl_event_id, deadline: g.deadline_time, finished: Boolean(g.finished) }));
  const preliminary = gameweekState(gameweeks, [{ started: false, finished_provisional: false, finished: false }]);
  const empty: OpenGameweek = { state: gameweekState(gameweeks, []), games: [], topScorers: [], mostCaptained: null, mostSelected: null };
  if (!preliminary.showToggle || preliminary.openGw == null) return empty;
  const gw = preliminary.openGw;

  const { data: fxData, error: fxErr } = await supabase
    .from('fpl_live_fixtures')
    .select('fpl_fixture_id, kickoff_time, team_h, team_a, team_h_score, team_a_score, minutes, started, finished_provisional, finished')
    .eq('season_id', season)
    .eq('fpl_event_id', gw)
    .order('kickoff_time');
  if (fxErr) throw fxErr;
  const fixtures = (fxData ?? []) as LiveFixtureRow[];
  const state = gameweekState(gameweeks, fixtures);
  if (!state.showToggle) return { ...empty, state };

  const payload = gwRows.find((g) => g.fpl_event_id === gw)?.source_payload ?? {};
  const captainId = typeof payload.most_captained === 'number' ? payload.most_captained : null;
  const selectedId = typeof payload.most_selected === 'number' ? payload.most_selected : null;

  const [{ data: elData, error: elErr }, { data: teamData, error: tErr }] = await Promise.all([
    supabase.from('fpl_live_elements').select('fpl_player_id, total_points, minutes').eq('season_id', season).eq('fpl_event_id', gw)
      .order('total_points', { ascending: false }).limit(5),
    supabase.from('fpl_teams').select('fpl_team_id, short_name').eq('season_id', season),
  ]);
  if (elErr) throw elErr;
  if (tErr) throw tErr;
  const teams = new Map(((teamData ?? []) as { fpl_team_id: number; short_name: string }[]).map((t) => [t.fpl_team_id, t.short_name]));
  const top = (elData ?? []) as { fpl_player_id: number; total_points: number; minutes: number }[];

  const extraIds = [captainId, selectedId].filter((x): x is number => x != null && !top.some((t) => t.fpl_player_id === x));
  let extra: { fpl_player_id: number; total_points: number; minutes: number }[] = [];
  if (extraIds.length) {
    const { data, error } = await supabase.from('fpl_live_elements').select('fpl_player_id, total_points, minutes')
      .eq('season_id', season).eq('fpl_event_id', gw).in('fpl_player_id', extraIds);
    if (error) throw error;
    extra = (data ?? []) as typeof extra;
  }
  const pointsById = new Map([...top, ...extra].map((r) => [r.fpl_player_id, r]));
  const playerIds = [...new Set([...top.map((t) => t.fpl_player_id), ...extraIds])];
  const { data: pData, error: pErr } = playerIds.length
    ? await supabase.from('fpl_players').select('fpl_player_id, web_name, slug, fpl_team_id, selected_by_percent').eq('season_id', season).in('fpl_player_id', playerIds)
    : { data: [], error: null };
  if (pErr) throw pErr;
  const players = new Map(((pData ?? []) as { fpl_player_id: number; web_name: string; slug: string | null; fpl_team_id: number | null; selected_by_percent: number | string | null }[]).map((p) => [p.fpl_player_id, p]));

  const person = (id: number | null): LivePlayerPoints | null => {
    if (id == null) return null;
    const p = players.get(id);
    const pts = pointsById.get(id);
    return {
      fplPlayerId: id,
      name: p?.web_name ?? 'Unknown',
      slug: p?.slug ?? null,
      team: p?.fpl_team_id != null ? teams.get(p.fpl_team_id) ?? '' : '',
      points: pts?.total_points ?? 0,
      minutes: pts?.minutes ?? 0,
      ownership: p?.selected_by_percent != null ? Number(p.selected_by_percent) : null,
    };
  };

  return {
    state,
    games: fixtures.map((f) => ({
      id: f.fpl_fixture_id,
      kickoff: f.kickoff_time,
      home: teams.get(f.team_h) ?? '?',
      away: teams.get(f.team_a) ?? '?',
      homeScore: f.team_h_score,
      awayScore: f.team_a_score,
      minutes: f.minutes ?? 0,
      state: liveGameState(f),
    })),
    topScorers: top.map((t) => person(t.fpl_player_id)!),
    mostCaptained: person(captainId),
    mostSelected: selectedId === captainId ? null : person(selectedId),
  };
}
