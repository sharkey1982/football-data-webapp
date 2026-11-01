// ============================================================================
// src/lib/teamSheetsApi.ts
//
// Data for /admin/team-sheets ("Team sheets: expected v actual", Chris,
// 1 Nov 2026): for every Premier League team-game, the model's pre-deadline
// predicted XI against the real XI, and a naive baseline -- the same XI as
// the team's previous league game.
//
// Two admin-only RPCs over public.fpl_team_sheet_results (filled hourly by
// private.refresh_fpl_team_sheets):
//   get_team_sheet_accuracy(p_season_id)  one entry per team-game, no XIs
//   get_team_sheet_detail(season, fixture, team)  the XIs, plus formation,
//     positions and substitutions from the BBC screenshots where we have them
// The summaries (season, per gameweek, per club) are worked out here, from
// the list, so they are easy to test and can't drift from the table.
// To open the page to the public later: drop _require_admin() in the two
// functions, grant anon, and take the page out of the admin gate.
// ============================================================================

import { supabase } from './supabase';

// Not in the generated types until the next schema snapshot (same pattern as
// siteTrafficApi.ts).
const rpc = (supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
}).rpc.bind(supabase);

/** 'pre_deadline_snapshot': what was published before the deadline. 'model_run': the only surviving
 *  pre-deadline model run (GW5: 17 Sep). null: no stored prediction (GW1-4). */
export type ModelSource = 'pre_deadline_snapshot' | 'model_run' | null;

export type TeamGame = {
  gw: number;
  fixture_id: number;
  team_id: number;
  team: string;
  team_short: string;
  opponent: string;
  opponent_short: string;
  home: boolean;
  kickoff: string;
  starters: number;
  /** False until FPL marks the match finished: numbers can still change. */
  final: boolean;
  model_source: ModelSource;
  model_version: string | null;
  model_at: string | null;
  /** Of the 11 predicted, how many started; null when there was no prediction. */
  model_matched: number | null;
  /** Of last game's 11, how many started again; null in the team's first game. */
  baseline_matched: number | null;
  /** The starter we gave the lowest chance. */
  surprise: { name: string; sp: number } | null;
  /** A predicted starter who didn't start, most owned first. */
  left_out: { name: string; sp: number; own: number | null } | null;
  /** Starters who didn't start the previous game. */
  new_in: string[];
};

export type TeamSheetList = { season_id: number; computed_at: string | null; games: TeamGame[] };

export type PredictedPlayer = { id: number; name: string; pos: number; sp: number; own: number | null; started: boolean; mins: number };
export type ActualPlayer = {
  id: number; name: string; pos: number; mins: number;
  /** The chance we gave him (0 if not in the snapshot); null when there was no prediction. */
  sp: number | null;
  own: number | null;
  predicted: boolean | null;
  in_baseline: boolean | null;
};
export type BaselinePlayer = { id: number; name: string; pos: number; own: number | null; started: boolean };
export type TeamSheetDetail = {
  fixture_id: number;
  team_id: number;
  gw: number;
  model_source: ModelSource;
  model_version: string | null;
  model_at: string | null;
  baseline_fixture_id: number | null;
  baseline_opponent: string | null;
  predicted: PredictedPlayer[];
  actual: ActualPlayer[];
  baseline: BaselinePlayer[];
  formation: string | null;
  /** fpl_player_id -> BBC tactical role */
  roles: Record<string, string>;
  subs: { minute: number | null; off_id: number | null; on_id: number | null; off: string | null; on: string | null }[];
  subs_complete: boolean | null;
};

export async function getTeamSheets(seasonId?: number): Promise<TeamSheetList> {
  const { data, error } = await rpc('get_team_sheet_accuracy', seasonId ? { p_season_id: seasonId } : {});
  if (error) throw error;
  return data as TeamSheetList;
}

export async function getTeamSheetDetail(seasonId: number, fixtureId: number, teamId: number): Promise<TeamSheetDetail | null> {
  const { data, error } = await rpc('get_team_sheet_detail', { p_season_id: seasonId, p_fpl_fixture_id: fixtureId, p_fpl_team_id: teamId });
  if (error) throw error;
  return (data as TeamSheetDetail | null) ?? null;
}

export const POS = ['', 'GKP', 'DEF', 'MID', 'FWD'] as const;

/** Share of starters called correctly, as a percentage; null when nothing to score. */
export type Score = { games: number; matched: number; pct: number | null; full: number };

function score(values: (number | null)[]): Score {
  const v = values.filter((x): x is number => x != null);
  const matched = v.reduce((a, b) => a + b, 0);
  return { games: v.length, matched, pct: v.length ? (100 * matched) / (11 * v.length) : null, full: v.filter((x) => x === 11).length };
}

export type Summary = {
  /** Model and baseline on the same team-games (those with a prediction and a previous game). */
  model: Score;
  baselineSame: Score;
  /** Baseline over every team-game that has a previous game. */
  baselineAll: Score;
  teamGames: number;
  provisional: number;
};

export function summarise(games: TeamGame[]): Summary {
  const both = games.filter((g) => g.model_matched != null && g.baseline_matched != null);
  return {
    model: score(both.map((g) => g.model_matched)),
    baselineSame: score(both.map((g) => g.baseline_matched)),
    baselineAll: score(games.map((g) => g.baseline_matched)),
    teamGames: games.length,
    provisional: games.filter((g) => !g.final).length,
  };
}

export type GameweekRow = {
  gw: number;
  teamGames: number;
  model: Score;
  baseline: Score;
  source: ModelSource;
  provisional: number;
};

export function byGameweek(games: TeamGame[]): GameweekRow[] {
  const map = new Map<number, TeamGame[]>();
  for (const g of games) map.set(g.gw, [...(map.get(g.gw) ?? []), g]);
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([gw, gs]) => ({
      gw,
      teamGames: gs.length,
      model: score(gs.map((g) => g.model_matched)),
      baseline: score(gs.map((g) => g.baseline_matched)),
      // One source per gameweek in practice; the commonest wins if not.
      source: (gs.find((g) => g.model_source === 'pre_deadline_snapshot') ?? gs.find((g) => g.model_source))?.model_source ?? null,
      provisional: gs.filter((g) => !g.final).length,
    }));
}

export type ClubRow = { team_id: number; team: string; model: Score; baseline: Score; gap: number | null };

/** Per club, on the team-games with both a prediction and a previous game; worst-read clubs first. */
export function byClub(games: TeamGame[]): ClubRow[] {
  const map = new Map<number, TeamGame[]>();
  for (const g of games) map.set(g.team_id, [...(map.get(g.team_id) ?? []), g]);
  return [...map.values()]
    .map((gs) => {
      const both = gs.filter((g) => g.model_matched != null && g.baseline_matched != null);
      const model = score(both.map((g) => g.model_matched));
      const baseline = score(both.map((g) => g.baseline_matched));
      return {
        team_id: gs[0].team_id,
        team: gs[0].team,
        model,
        baseline,
        gap: model.pct != null && baseline.pct != null ? model.pct - baseline.pct : null,
      };
    })
    .sort((a, b) => (a.model.pct ?? 999) - (b.model.pct ?? 999) || a.team.localeCompare(b.team));
}

export const SOURCE_LABEL: Record<string, string> = {
  pre_deadline_snapshot: 'Pre-deadline snapshot',
  model_run: 'Model run before the deadline',
};
