// Sample gameweek reflection (shape of scripts/fpl_gameweek_report.py output).
import type { GameweekReport, ReflectionPayload } from '../../lib/fplGameweekReport';

const p = (id: number, name: string, team: string, own = 10) => ({ id, name, team, pos: 'MID', own });

export const payload: ReflectionPayload = {
  kind: 'reflection', season: '2026-27', gw: 6, deadline: '2026-10-10T10:00:00+00:00', generated_at: '2026-10-13T06:00:00+00:00',
  gameweek_finished: true, bonus_confirmed: true, average: 54,
  headlines: ['Chelsea scored 5 against Bournemouth where the model expected 1.9.', 'Captaincy since GW2: premium 86, form 38.'],
  goals: {
    matches: [
      { home: 'Chelsea', away: 'Bournemouth', finished: true, exp_home: 1.94, exp_away: 1.14, goals_home: 5, goals_away: 1, xg_home: 1.09, xg_away: 1.38 },
      { home: 'Coventry', away: 'Newcastle', finished: false, exp_home: 1.35, exp_away: 1.7, goals_home: null, goals_away: null, xg_home: null, xg_away: null },
    ],
    expected_from: 'recomputed', next5: [
      { team: 'Chelsea', fixtures: 5, for_before: 8.1, for_now: 8.4, against_before: 5.0, against_now: 5.0, for_change: 0.3, against_change: 0 },
      { team: 'Everton', fixtures: 5, for_before: 6.18, for_now: 6.18, against_before: 8.37, against_now: 8.37, for_change: 0, against_change: 0 },
    ],
    next5_from: 'recomputed point in time', next5_gws: [7, 11],
    season: [{ team: 'Sunderland', matches: 5, goals_for: 6, xg_for: 9.8, market_for: 5.2, goals_against: 10, xg_against: 8.6, market_against: 8, attack_vs_market: 4.6, defence_vs_market: -0.6 }],
  },
  minutes: {
    brier: 0.1015, players: 596,
    surprise_starters: [{ ...p(213, 'Lerma', 'Crystal Palace', 0.1), p: 0.02, minutes: 71, pts: 8 }],
    surprise_absences: [{ ...p(368, 'Szoboszlai', 'Liverpool', 29.2), p: 0.97, flagged: false, news: null, minutes: 0 }],
    early_subs: [{ ...p(94, 'Schade', 'Brentford', 15.6), xmin: 79, minutes: 51 }],
    positions: [
      { ...p(427, 'Mbeumo', 'Manchester United', 20), model_role: 'LW', played_role: 'CF', kind: 'line' },
      { ...p(397, 'Semenyo', 'Manchester City', 13.5), model_role: 'LW', played_role: 'RW', kind: 'side' },
    ],
    lineups_covered: 9, fixtures: 10, next_gw: 7,
    next_gw_moves: [{ ...p(398, 'Foden', 'Manchester City', 1.5), before: 0, now: 0.76, change: 0.76, reason: 'fit again (FPL flag cleared)' }],
  },
  set_pieces: {
    order_changes: [{ team: 'Aston Villa', type: 'Corners and indirect free kicks', before: ['Cash'], now: ['McGinn'] }],
    penalties_missed: [], model_mismatches: [], hierarchy_updated: '2026-09-14',
    note: "Who took each penalty isn't recorded: FPL's data doesn't say which goals were penalties.",
  },
  captaincy: {
    weeks: [
      { gw: 5, premium: { ...p(411, 'Haaland', 'Manchester City', 75), pts: 6 }, form: { ...p(411, 'Haaland', 'Manchester City', 75), pts: 6 }, model: null, best: { ...p(397, 'Semenyo', 'Manchester City'), pts: 17 }, average: 48 },
      { gw: 6, premium: { ...p(411, 'Haaland', 'Manchester City', 75), pts: 6 }, form: { ...p(397, 'Semenyo', 'Manchester City'), pts: 3 }, model: { ...p(12, 'Saka', 'Arsenal'), pts: 2 }, best: { ...p(400, 'Doku', 'Manchester City'), pts: 12 }, average: 54 },
    ],
    season: [
      { key: 'premium', label: 'Premium every week', definition: "FPL's most-captained player each gameweek", weeks: 5, points: 43, captain_points: 86, beat_premium: null, worst: 6 },
      { key: 'form', label: 'Form pick', definition: 'most points in the previous 3 gameweeks', weeks: 5, points: 19, captain_points: 38, beat_premium: 0, worst: 1 },
      { key: 'best', label: 'Hindsight best', definition: 'the top scorer (a ceiling)', weeks: 5, points: 77, captain_points: 154, beat_premium: 5, worst: 12 },
      { key: 'model', label: "Model's top projection", definition: 'saved from GW6', weeks: 1, points: 2, captain_points: 4, beat_premium: 0, worst: 2, premium_same_weeks: 6 },
    ],
    span: [2, 6],
    context: { top_pick_blank_rate: 27.7, top_pick_best_rate: 19.9, seasons: '2022/23 to 2025/26', article: '/fpl/articles/always-captain-the-top-pick', haaland_article: '/fpl/articles/should-you-always-captain-haaland' },
  },
  during: {
    injuries: [{ ...p(368, 'Szoboszlai', 'Liverpool', 29.2), before: 'a', now: 'd', news: 'Hamstring injury - 75% chance of playing' }],
    prices: [{ ...p(155, 'João Pedro', 'Chelsea', 68.4), before: 7.7, now: 7.8 }],
    red_cards: [p(371, 'Gravenberch', 'Liverpool', 1)],
    model_changes: [{ date: '2026-10-12', area: 'prediction', title: 'FPL: start record ignores matches not yet played' }],
  },
};

export const report: GameweekReport = {
  season_label: '2026-27', fpl_event_id: 6, kind: 'reflection', version: 1, frozen: false,
  generated_at: '2026-10-13T06:00:00+00:00', published_at: '2026-10-13T06:00:00+00:00',
  title: 'FPL GW6 reflection (2026/27): goals, minutes, set pieces and captaincy', summary: 'Chelsea scored 5.', payload,
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
