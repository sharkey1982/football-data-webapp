import { describe, expect, it } from 'vitest';
import { decisionNote, pickDecision } from '../lib/cupDecision';
import { matchAnswer } from '../lib/answerFirst';
import { toCupTies } from '../lib/teamPageApi';
import type { MatchPagePrediction } from '../lib/matchPageApi';

// Fleetwood Town 1-1 Arsenal, Carabao Cup, 27 Oct 2026: Fleetwood won 5-3 on penalties.
const FLEETWOOD = 51;
const ARSENAL = 1;
const sides = { homeTeamId: FLEETWOOD, awayTeamId: ARSENAL, homeName: 'Fleetwood Town', awayName: 'Arsenal' };

describe('decisionNote', () => {
  it('names the shoot-out winner with their score first', () => {
    expect(decisionNote({ decided_by: 'penalties', winner_team_id: FLEETWOOD, home_penalty_goals: 5, away_penalty_goals: 3 }, sides)).toBe(
      'Fleetwood Town won 5–3 on penalties'
    );
    // Away side wins: their score still comes first.
    expect(decisionNote({ decided_by: 'penalties', winner_team_id: ARSENAL, home_penalty_goals: 3, away_penalty_goals: 4 }, sides)).toBe(
      'Arsenal won 4–3 on penalties'
    );
  });

  it('says extra time, and nothing for normal time or an unrecorded tie', () => {
    expect(decisionNote({ decided_by: 'extra_time', winner_team_id: ARSENAL }, sides)).toBe('Arsenal won after extra time');
    expect(decisionNote({ decided_by: 'normal_time', winner_team_id: ARSENAL }, sides)).toBeNull();
    expect(decisionNote({ decided_by: null, winner_team_id: null }, sides)).toBeNull();
    expect(decisionNote(null, sides)).toBeNull();
    // A winner who is neither side is never named.
    expect(decisionNote({ decided_by: 'penalties', winner_team_id: 999, home_penalty_goals: 5, away_penalty_goals: 3 }, sides)).toBeNull();
  });

  it('pickDecision fills absent columns with null', () => {
    expect(pickDecision({ decided_by: 'penalties' })).toEqual({
      decided_by: 'penalties',
      winner_team_id: null,
      home_penalty_goals: null,
      away_penalty_goals: null,
    });
  });
});

const match: MatchPagePrediction = {
  fixture_id: 1,
  slug: 'fleetwood-town-v-arsenal-2026-10-27',
  home_team_name: 'Fleetwood Town',
  away_team_name: 'Arsenal',
  home_team_slug: null,
  away_team_slug: null,
  kickoff_date: '2026-10-27',
  kickoff_time: '19:45:00',
  status: 'played',
  matchweek: 4,
  league_name: 'Carabao Cup',
  predicted_home_goals: null,
  predicted_away_goals: null,
  predicted_at: null,
  fit_run_id: null,
  model: null,
  actual_home_goals: 1,
  actual_away_goals: 1,
  home_team_id: FLEETWOOD,
  away_team_id: ARSENAL,
  decision: { decided_by: 'penalties', winner_team_id: FLEETWOOD, home_penalty_goals: 5, away_penalty_goals: 3 },
};

describe('match page answer for a shoot-out', () => {
  it('says who went through', () => {
    const a = matchAnswer(match, []);
    expect(a.lead).toBe('Fleetwood Town and Arsenal drew 1–1 in the Carabao Cup on Tuesday 27 October 2026; Fleetwood Town won 5–3 on penalties.');
    expect(a.faqs.find((f) => f.q.startsWith('What was the result'))?.a).toContain('Fleetwood Town won 5–3 on penalties');
  });

  it('is unchanged for a league game', () => {
    const a = matchAnswer({ ...match, league_name: 'League One', decision: null, actual_home_goals: 2 }, []);
    expect(a.lead).toBe('Fleetwood Town beat Arsenal 2–1 in the League One on Tuesday 27 October 2026.');
  });
});

describe('toCupTies', () => {
  const row = {
    league_id: 6,
    match_date: '2026-10-27',
    home_team_id: FLEETWOOD,
    away_team_id: ARSENAL,
    full_time_home_goals: 1,
    full_time_away_goals: 1,
    decided_by: 'penalties',
    winner_team_id: FLEETWOOD,
    home_penalty_goals: 5,
    away_penalty_goals: 3,
    league: { name: 'Carabao Cup' },
    home_team: { display_name: 'Fleetwood Town' },
    away_team: { display_name: 'Arsenal' },
  };

  it("shows the club's side: score, whether it went through, the note and the link", () => {
    const slugs = new Map([['6|51|1|2026-10-27', 'fleetwood-town-v-arsenal-2026-10-27']]);
    const [arsenal] = toCupTies([row], ARSENAL, slugs);
    expect(arsenal).toEqual({
      match_date: '2026-10-27',
      competition: 'Carabao Cup',
      opponent_name: 'Fleetwood Town',
      is_home: false,
      goals_for: 1,
      goals_against: 1,
      went_through: false,
      note: 'Fleetwood Town won 5–3 on penalties',
      slug: 'fleetwood-town-v-arsenal-2026-10-27',
    });
    expect(toCupTies([row], FLEETWOOD)[0].went_through).toBe(true);
  });

  it('leaves went_through unknown when no winner is recorded', () => {
    const [t] = toCupTies([{ ...row, decided_by: null, winner_team_id: null, home_penalty_goals: null, away_penalty_goals: null }], ARSENAL);
    expect(t.went_through).toBeNull();
    expect(t.note).toBeNull();
    expect(t.slug).toBeNull();
  });
});
