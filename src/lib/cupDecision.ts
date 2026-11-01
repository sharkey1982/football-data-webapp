// ============================================================================
// src/lib/cupDecision.ts
//
// How a knockout tie was settled, from matches.decided_by / winner_team_id /
// home_penalty_goals / away_penalty_goals (filled for the Carabao Cup and
// FA Cup by public.refresh_cup_decisions()). One wording for every page that
// shows a cup result, so the fixtures list, the match page and the team page
// cannot describe the same shoot-out differently.
// ============================================================================

export type DecidedBy = 'normal_time' | 'extra_time' | 'penalties';

export type CupDecision = {
  decided_by?: string | null;
  winner_team_id?: number | null;
  home_penalty_goals?: number | null;
  away_penalty_goals?: number | null;
};

type Sides = {
  homeTeamId: number;
  awayTeamId: number;
  homeName: string;
  awayName: string;
};

/** The columns to read alongside a result, for selects. */
export const CUP_DECISION_COLUMNS = 'decided_by, winner_team_id, home_penalty_goals, away_penalty_goals';

/** Copies the decision columns off a matches row (absent ones become null). */
export function pickDecision(row: CupDecision | null | undefined): Required<CupDecision> {
  return {
    decided_by: row?.decided_by ?? null,
    winner_team_id: row?.winner_team_id ?? null,
    home_penalty_goals: row?.home_penalty_goals ?? null,
    away_penalty_goals: row?.away_penalty_goals ?? null,
  };
}

/** The side that went through, by name, or null when not recorded. */
export function winnerName(d: CupDecision, s: Sides): string | null {
  if (d.winner_team_id == null) return null;
  if (d.winner_team_id === s.homeTeamId) return s.homeName;
  if (d.winner_team_id === s.awayTeamId) return s.awayName;
  return null;
}

/** "Fleetwood Town won 5–3 on penalties" / "Chelsea won after extra time",
 * or null when the tie was settled in normal time (the score says it all)
 * or nothing is recorded. The winner's shoot-out score comes first. */
export function decisionNote(d: CupDecision | null | undefined, s: Sides): string | null {
  if (!d) return null;
  const who = winnerName(d, s);
  if (!who) return null;
  if (d.decided_by === 'penalties') {
    const h = d.home_penalty_goals;
    const a = d.away_penalty_goals;
    if (h == null || a == null) return `${who} won on penalties`;
    const [w, l] = d.winner_team_id === s.homeTeamId ? [h, a] : [a, h];
    return `${who} won ${w}–${l} on penalties`;
  }
  if (d.decided_by === 'extra_time') return `${who} won after extra time`;
  return null;
}
