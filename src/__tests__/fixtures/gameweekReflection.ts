// Sample gameweek reflection (shape of scripts/fpl_gameweek_report.py output).
import type { GameweekReport, ReflectionPayload } from '../../lib/fplGameweekReport';

const p = (id: number, name: string, team: string, own = 10) => ({ id, name, team, pos: 'MID', own });

const sp = (key: 'premium' | 'form' | 'best' | 'model', label: string, cp: number, extra: object) => ({
  key, label, definition: `${label} definition`, weeks: 5, points: cp / 2, captain_points: cp, beat_premium: key === 'premium' ? null : 0,
  mean: null, sd: null, worst: null, best: null, blanks: 0, hauls: 0, ...extra,
});

export const payload: ReflectionPayload = {
  kind: 'reflection', season: '2026-27', gw: 6, deadline: '2026-10-10T10:00:00+00:00', generated_at: '2026-10-13T06:00:00+00:00',
  gameweek_finished: true, bonus_confirmed: true, prices_in: true, average: 54,
  headlines: ['36 goals against 29.1 expected.'],
  verdicts: {
    goals: { head: '36 goals against 29.1 expected.', rest: 'Chances (xG 30.9) were +1.8 against expectation, so most of the difference came from finishing.' },
    minutes: { head: "29 players we had at 70%+ to start didn't.", rest: 'Mbeumo played centre-forward instead of left wing.' },
    incidents: { head: 'Liverpool lost 3 players: Isak, Gakpo and Gravenberch.', rest: "Before GW7, 9 teams play in Europe or the cup." },
    set_pieces: { head: "McGinn replaced Cash on Aston Villa's corners and indirect free kicks.", rest: 'No penalties missed.' },
    captaincy: { head: 'Haaland scored 6; the form pick, Semenyo, 3.', rest: 'Since GW2, the premium has 86 captain points to the form pick’s 38.' },
  },
  model_summary: {
    automatic: [{ theme: 'goals', text: 'Team ratings refreshed from GW6 closing prices' }, { theme: 'minutes', text: 'GW7 start chances: 27 moved by 20+ points' }],
    method: [{ date: '2026-10-12', area: 'prediction', title: 'FPL: start record ignores matches not yet played' }],
    considering: [{ theme: 'minutes', text: 'Mbeumo at centre-forward: one match so far' }, { theme: 'incidents', text: 'Lower start chances after a European or cup midweek' }],
  },
  goals: {
    matches: [
      { home: 'Chelsea', away: 'Bournemouth', finished: true, exp_home: 1.94, exp_away: 1.14, goals_home: 5, goals_away: 1, xg_home: 1.09, xg_away: 1.38 },
    ],
    expected_from: 'recomputed', next5: [], next5_from: 'recomputed point in time', next5_gws: [7, 11],
    season: [
      { team: 'Sunderland', matches: 5, goals_for: 6, xg_for: 9.8, market_for: 5.2, goals_against: 10, xg_against: 8.6, market_against: 8, attack_vs_market: 4.6, defence_vs_market: -0.6 },
      { team: 'Chelsea', matches: 5, goals_for: 10, xg_for: 7.4, market_for: 8.7, goals_against: 12, xg_against: 9.2, market_against: 6.6, attack_vs_market: -1.3, defence_vs_market: -2.6 },
    ],
    teams: [
      { team: 'Chelsea', opp: 'BOU', home: true, exp: 1.94, xg: 1.09, goals: 5 },
      { team: 'Nottingham Forest', opp: 'CRY', home: false, exp: 1.3, xg: 3.34, goals: 1 },
      { team: 'Liverpool', opp: 'MCI', home: true, exp: 1.56, xg: 0.95, goals: 0 },
    ],
    totals: { matches: 10, goals: 36, expected: 29.1, xg: 30.9 },
    ratings: { status: 'updated', deadline: '2026-10-10', moves: [
      { team: 'Nottingham Forest', att_before: 1.21, att_now: 1.27, def_before: 1.38, def_now: 1.36, for5_before: 5.6, for5_now: 5.9, against5_before: 8.3, against5_now: 8.2, size: 0.08 },
    ] },
  },
  minutes: {
    brier: 0.0977, players: 667,
    counts: { absences: 29, absences_flagged: 1, starters: 32, early_subs: 5, line_changes: 9, side_changes: 52, start_moves: 27 },
    surprise_starters: [{ ...p(213, 'Lerma', 'Crystal Palace', 0.1), p: 0.02, minutes: 71, pts: 8 }],
    surprise_absences: [{ ...p(368, 'Szoboszlai', 'Liverpool', 29.2), p: 0.97, flagged: false, news: null, minutes: 0 }],
    early_subs: [{ ...p(94, 'Schade', 'Brentford', 15.6), xmin: 79, minutes: 51 }],
    positions: [
      { ...p(427, 'Mbeumo', 'Manchester United', 20), model_role: 'LW', played_role: 'CF', kind: 'line' },
      { ...p(397, 'Semenyo', 'Manchester City', 13.5), model_role: 'LW', played_role: 'RW', kind: 'side' },
    ],
    lineups_covered: 10, fixtures: 10, next_gw: 7,
    next_gw_moves: [{ ...p(398, 'Foden', 'Manchester City', 1.5), before: 0, now: 0.68, change: 0.68, reason: 'fit again (FPL flag cleared)' }],
  },
  incidents: {
    worse: [{ ...p(379, 'Isak', 'Liverpool', 14.8), before: 'd', now: 'i', news: 'Thigh injury - Unknown return date' }],
    better: [{ ...p(154, 'Palmer', 'Chelsea', 25.1), before: 'd', now: 'a', news: null }],
    worse_count: 17, better_count: 13,
    red_cards: [p(371, 'Gravenberch', 'Liverpool', 1)],
    prices: [{ ...p(165, 'João Pedro', 'Chelsea', 69.1), before: 7.7, now: 7.8 }], price_count: 25,
    congestion: {
      before_gw: [], next_gw: 7, days_since_previous: 19,
      before_next: [{ team: 'Liverpool', comp: 'Champions League', date: '2026-10-14', opp: 'LASK', home: false,
        league_date: '2026-10-17T14:00:00+00:00', league_opp: 'Brentford', league_home: false, rest: 3 }],
      later: [{ gw: 9, teams: 13, comps: ['Carabao Cup'], from: '2026-10-27', to: '2026-10-29' }],
    },
  },
  set_pieces: {
    order_changes: [{ team: 'Aston Villa', type: 'Corners and indirect free kicks', before: ['Cash'], now: ['McGinn'],
      model: [{ type: 'left corners', name: 'Cash' }, { type: 'right corners', name: 'McGinn' }], model_agrees: ['right corners'], needs_review: false }],
    penalties_missed: [], model_mismatches: [], penalty_teams_compared: 20, hierarchy_updated: '2026-09-14',
    note: "Who took each penalty isn't recorded: FPL's data doesn't say which goals were penalties.",
  },
  captaincy: {
    weeks: [
      { gw: 5, premium: { ...p(411, 'Haaland', 'Manchester City', 75), pts: 6 }, form: { ...p(411, 'Haaland', 'Manchester City', 75), pts: 6 }, model: null, best: { ...p(397, 'Semenyo', 'Manchester City'), pts: 17 }, average: 48 },
      { gw: 6, premium: { ...p(411, 'Haaland', 'Manchester City', 75), pts: 6 }, form: { ...p(229, 'Gibbs-White', 'Nottingham Forest'), pts: 2 }, last: { ...p(397, 'Semenyo', 'Manchester City'), pts: 3 }, model: { ...p(12, 'Saka', 'Arsenal'), pts: 2 }, best: { ...p(400, 'Doku', 'Manchester City'), pts: 12 }, average: 54 },
    ],
    season: [
      sp('premium', 'Premium every week', 86, { mean: 8.6, sd: 2.9, worst: 6, best: 13, blanks: 0, hauls: 1 }),
      sp('form', 'Form pick', 38, { mean: 3.8, sd: 2.6, worst: 1, best: 7, blanks: 2, hauls: 0 }),
      sp('last', "Last week's top scorer", 40, { mean: 4, sd: 3.1, worst: 1, best: 9, blanks: 2, hauls: 0 }),
      sp('best', 'Hindsight best', 154, { mean: 15.4, sd: 4.7, worst: 12, best: 23, blanks: 0, hauls: 5, beat_premium: 5 }),
      sp('model', "Model's top projection", 4, { weeks: 1, mean: 2, worst: 2, best: 2, blanks: 1, premium_same_weeks: 6 }),
    ],
    span: [2, 6],
    ranges: [
      { ...p(411, 'Haaland', 'Manchester City', 75), tag: 'most captained', p10: 3, p50: 7, p90: 11, mean: 6.5, p_blank: 0.05, p_haul: 0.2, pts: 6 },
      { ...p(400, 'Doku', 'Manchester City', 1.1), tag: 'best this week', p10: 0, p50: 2, p90: 7, mean: 2.5, p_blank: 0.66, p_haul: 0.02, pts: 12 },
    ],
    blank_at: 2, haul_at: 10,
    context: { top_pick_blank_rate: 27.7, top_pick_best_rate: 19.9, seasons: '2022/23 to 2025/26', article: '/fpl/articles/always-captain-the-top-pick', haaland_article: '/fpl/articles/should-you-always-captain-haaland' },
  },
};

export const report: GameweekReport = {
  season_label: '2026-27', fpl_event_id: 6, kind: 'reflection', version: 1, frozen: false,
  generated_at: '2026-10-13T06:00:00+00:00', published_at: '2026-10-13T06:00:00+00:00',
  title: 'FPL GW6 reflection (2026/27): goals, minutes, incidents, set pieces and captaincy', summary: 'Chelsea scored 5.', payload,
};


// Sample gameweek preview.
import type { PreviewPayload, PreviewPlayer } from '../../lib/fplGameweekReport';

const pp = (id: number, name: string, team: string, x: number, own = 10, price = 7.5, start = 0.95): PreviewPlayer => ({
  id, name, team, pos: 'MID', own, price, gw_xpts: x, xpts_5: x * 5, xpts_10: x * 10, start, xmin: 85, fixtures: 1, status: 'a', news: null,
});

export const previewPayload: PreviewPayload = {
  kind: 'preview', season: '2026-27', gw: 7, frozen: false, deadline: '2026-10-17T10:00:00+00:00', generated_at: '2026-10-15T05:50:00+00:00',
  source: 'live projections',
  headlines: ['Haaland leads the captaincy table on 8.9 projected points and a 30% chance of outscoring the other seven.'],
  changes_since_last: ['Szoboszlai: Hamstring injury - 75% chance of playing'],
  fixtures: [
    { home: 'Manchester City', away: 'Ipswich', kickoff: '2026-10-17T14:00:00+00:00', goals_home: 2.81, goals_away: 0.8, cs_home: 0.449, cs_away: 0.06, fdr_home: 2, fdr_away: 5 },
  ],
  congestion: {
    before_gw: [{ team: 'Manchester City', comp: 'Champions League', date: '2026-10-14', opp: 'PSG', home: true,
      league_date: '2026-10-17T14:00:00+00:00', league_opp: 'Ipswich', league_home: true, rest: 3 }],
    ahead: [{ gw: 8, teams: 9, comps: ['Champions League'], from: '2026-10-20', to: '2026-10-22' }], days_since_previous: 5,
  },
  captains: [
    { ...pp(411, 'Haaland', 'Manchester City', 8.89, 74.8, 15.6, 0.97), top_chance: 0.301 },
    { ...pp(12, 'Saka', 'Arsenal', 6.15, 16.9, 9.6, 0.94), top_chance: 0.136 },
  ],
  sim_worlds: 20000,
  picks: {
    GK: [pp(1, 'Raya', 'Arsenal', 4.8, 20, 6.1)],
    DEF: [pp(8, 'Calafiori', 'Arsenal', 5.0, 52, 5.9)],
    MID: [pp(12, 'Saka', 'Arsenal', 6.15, 16.9, 9.6)],
    FWD: [pp(411, 'Haaland', 'Manchester City', 8.89, 74.8, 15.6)],
  },
  value: [{ ...pp(600, 'Tavernier', 'Bournemouth', 6.03, 7.3, 6.1), per_m: 4.72 }],
  differentials: [pp(316, 'Emersonn', 'Ipswich', 4.7, 4, 5.6)],
  minutes_watch: [{ ...pp(368, 'Szoboszlai', 'Liverpool', 3.1, 29.2, 6.9, 0.58), why: 'Hamstring injury - 75% chance of playing' }],
  fixture_run: [
    { team: 'Manchester City', for_5: 11.2, against_5: 4.8, for_10: 21.0, against_10: 9.9,
      weeks: [{ gw: 7, fixtures: [{ opp: 'IPS', home: true, for: 2.81, against: 0.8 }] }, { gw: 8, fixtures: [] }] },
  ],
  changes: {
    since_gw: 6,
    injuries: [{ id: 368, name: 'Szoboszlai', team: 'Liverpool', pos: 'MID', own: 29.2, before: 'a', now: 'd', news: 'Hamstring injury - 75% chance of playing' }],
    prices: [{ id: 165, name: 'João Pedro', team: 'Chelsea', pos: 'FWD', own: 68.4, before: 7.7, now: 7.8 }],
    set_pieces: [{ team: 'Aston Villa', type: 'Corners and indirect free kicks', before: ['Cash'], now: ['McGinn'] }],
    model_changes: [],
    blanks: [], doubles: ['Chelsea'],
  },
};

export const previewReport: GameweekReport = {
  season_label: '2026-27', fpl_event_id: 7, kind: 'preview', version: 2, frozen: false,
  generated_at: '2026-10-15T05:50:00+00:00', published_at: '2026-10-15T05:51:00+00:00',
  title: 'FPL GW7 preview (2026/27): captains, fixtures, transfers', summary: 'Haaland leads.', payload: previewPayload,
};
