// ============================================================================
// src/lib/fplActualMatchApi.ts
//
// Actual (played) match results with real FPL stats -- the counterpart to
// the Match Projections pages, but for what actually happened rather than
// what was projected. There's a genuine data gap for proper starting
// lineups/formations (no per-fixture "who started in which shape" source
// exists here, only minutes played), so this shows players sorted by
// minutes (a reasonable proxy for starter vs sub) rather than a pitch
// diagram -- real match and FPL stats are solid, lineup shape isn't.
// ============================================================================

import { supabase } from './supabase';

const FPL_LEAGUE_ID = 1;
const FPL_SEASON_ID = 13;

export type ActualMatchFixture = {
  fixture_id: number;
  matchweek: number;
  kickoff_date: string;
  home_team_id: number;
  home_team: string;
  away_team_id: number;
  away_team: string;
  /** Null if the fixture hasn't been played/backfilled yet. */
  home_score: number | null;
  away_score: number | null;
  finished: boolean;
};

/** Every fixture in a gameweek with its actual score where played. Fixtures
 * with no fpl_fixtures row yet (not backfilled) still appear, with null
 * scores -- same "not an error, just not played yet" convention as the
 * rest of this section. */
export async function getActualMatchFixtures(matchweek: number): Promise<ActualMatchFixture[]> {
  const { data: fixtureRows, error: fixtureErr } = await supabase
    .from('fixtures')
    .select(
      `
      fixture_id, matchweek, kickoff_date, home_team_id, away_team_id,
      home_team:teams!fixtures_home_team_id_fkey(canonical_name),
      away_team:teams!fixtures_away_team_id_fkey(canonical_name)
    `
    )
    .eq('league_id', FPL_LEAGUE_ID)
    .eq('season_id', FPL_SEASON_ID)
    .eq('matchweek', matchweek)
    .order('kickoff_date', { ascending: true });
  if (fixtureErr) throw fixtureErr;

  const fixtureIds = (fixtureRows ?? []).map((f: any) => f.fixture_id);
  const { data: scoreRows, error: scoreErr } =
    fixtureIds.length > 0
      ? await supabase.from('fpl_fixtures').select('canonical_fixture_id, team_h_score, team_a_score, finished').in('canonical_fixture_id', fixtureIds)
      : { data: [], error: null };
  if (scoreErr) throw scoreErr;
  const scoreByFixture = new Map<number, any>((scoreRows ?? []).map((r: any) => [r.canonical_fixture_id, r]));

  return (fixtureRows ?? []).map((f: any) => {
    const score = scoreByFixture.get(f.fixture_id);
    return {
      fixture_id: f.fixture_id,
      matchweek: f.matchweek,
      kickoff_date: f.kickoff_date,
      home_team_id: f.home_team_id,
      home_team: f.home_team?.canonical_name ?? 'Unknown',
      away_team_id: f.away_team_id,
      away_team: f.away_team?.canonical_name ?? 'Unknown',
      home_score: score?.team_h_score ?? null,
      away_score: score?.team_a_score ?? null,
      finished: score?.finished ?? false,
    };
  });
}

export type ActualMatchPlayerStat = {
  fpl_player_id: number;
  web_name: string;
  element_type: number;
  minutes: number;
  total_points: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_missed: number;
  penalties_saved: number;
  saves: number;
  yellow_cards: number;
  red_cards: number;
  bonus: number;
  bps: number;
};

export type ActualMatchDetail = {
  fixture: ActualMatchFixture;
  home_players: ActualMatchPlayerStat[];
  away_players: ActualMatchPlayerStat[];
};

/** Full player stat lines for one played fixture, split by team, sorted by
 * minutes played (highest first) within each side -- the closest available
 * proxy for "started" vs "came off the bench" given there's no proper
 * lineup/formation data source here. Returns null if this fixture has no
 * fpl_fixtures row yet (not played/backfilled). */
export async function getActualMatchDetail(fixtureId: number): Promise<ActualMatchDetail | null> {
  const { data: fixtureRow, error: fixtureErr } = await supabase
    .from('fixtures')
    .select(
      `
      fixture_id, matchweek, kickoff_date, home_team_id, away_team_id,
      home_team:teams!fixtures_home_team_id_fkey(canonical_name),
      away_team:teams!fixtures_away_team_id_fkey(canonical_name)
    `
    )
    .eq('fixture_id', fixtureId)
    .maybeSingle();
  if (fixtureErr) throw fixtureErr;
  if (!fixtureRow) return null;
  const fr = fixtureRow as any;

  const { data: fplFixtureRow, error: fplFixtureErr } = await supabase
    .from('fpl_fixtures')
    .select('fpl_fixture_id, team_h_score, team_a_score, finished')
    .eq('canonical_fixture_id', fixtureId)
    .maybeSingle();
  if (fplFixtureErr) throw fplFixtureErr;
  if (!fplFixtureRow) return null;
  const ff = fplFixtureRow as any;

  const fixture: ActualMatchFixture = {
    fixture_id: fr.fixture_id,
    matchweek: fr.matchweek,
    kickoff_date: fr.kickoff_date,
    home_team_id: fr.home_team_id,
    home_team: fr.home_team?.canonical_name ?? 'Unknown',
    away_team_id: fr.away_team_id,
    away_team: fr.away_team?.canonical_name ?? 'Unknown',
    home_score: ff.team_h_score,
    away_score: ff.team_a_score,
    finished: ff.finished,
  };

  const { data: statRows, error: statErr } = await supabase
    .from('fpl_player_gameweeks')
    .select(
      'fpl_player_id, minutes, total_points, goals_scored, assists, clean_sheets, goals_conceded, own_goals, penalties_missed, penalties_saved, saves, yellow_cards, red_cards, bonus, bps'
    )
    .eq('fpl_fixture_id', ff.fpl_fixture_id)
    .eq('season_id', FPL_SEASON_ID);
  if (statErr) throw statErr;

  const playerIds = (statRows ?? []).map((r: any) => r.fpl_player_id);
  const { data: playerRows, error: playerErr } =
    playerIds.length > 0
      ? await supabase.from('fpl_players').select('fpl_player_id, web_name, element_type, canonical_team_id').in('fpl_player_id', playerIds).eq('season_id', FPL_SEASON_ID)
      : { data: [], error: null };
  if (playerErr) throw playerErr;
  const playerById = new Map((playerRows ?? []).map((p: any) => [p.fpl_player_id, p]));

  const home: ActualMatchPlayerStat[] = [];
  const away: ActualMatchPlayerStat[] = [];
  for (const r of (statRows ?? [])) {
    const player = playerById.get(r.fpl_player_id);
    if (!player) continue;
    const stat: ActualMatchPlayerStat = {
      fpl_player_id: r.fpl_player_id,
      web_name: player.web_name ?? 'Unknown',
      element_type: player.element_type,
      minutes: r.minutes ?? 0,
      total_points: r.total_points ?? 0,
      goals_scored: r.goals_scored ?? 0,
      assists: r.assists ?? 0,
      clean_sheets: r.clean_sheets ?? 0,
      goals_conceded: r.goals_conceded ?? 0,
      own_goals: r.own_goals ?? 0,
      penalties_missed: r.penalties_missed ?? 0,
      penalties_saved: r.penalties_saved ?? 0,
      saves: r.saves ?? 0,
      yellow_cards: r.yellow_cards ?? 0,
      red_cards: r.red_cards ?? 0,
      bonus: r.bonus ?? 0,
      bps: r.bps ?? 0,
    };
    if (player.canonical_team_id === fr.home_team_id) home.push(stat);
    else if (player.canonical_team_id === fr.away_team_id) away.push(stat);
  }
  home.sort((a, b) => b.minutes - a.minutes || b.total_points - a.total_points);
  away.sort((a, b) => b.minutes - a.minutes || b.total_points - a.total_points);

  return { fixture, home_players: home, away_players: away };
}
