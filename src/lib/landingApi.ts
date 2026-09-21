// ============================================================================
// src/lib/landingApi.ts
//
// Small, purpose-built queries for the landing page and the two theme hub
// pages -- deliberately separate from api.ts/fplApi.ts (football-only and
// FPL-only respectively) since this spans both.
//
// Trivia rebuilt again after direct feedback: answers needed more context
// (a percentage of the total, and what came second, rather than a bare
// count) and the experience needed real stakes -- multiple-choice guessing
// rather than a plain reveal. Every option offered is a genuine alternative
// candidate pulled from the same query (the other actual top scorelines,
// the other actual highest-scoring matches, etc.) -- never an invented
// distractor -- so a correct guess still teaches something true about the
// runners-up.
//
// Trivia v2 (Chris's feedback, 2026-09-21):
// - EVERY option's figure is revealed after answering (optionDetails), so
//   a guess teaches something about all of them, not just the winner.
// - Several options can be correct: genuine TIES (three set-piece takers
//   on an identical index; two matches with the same margin) used to mark
//   right answers wrong, and the comeback question is now "all correct".
// - Gameweek questions NAME the gameweek, and use the next gameweek in
//   which no match has been played -- not the gameweek of the next unplayed
//   fixture, which mid-gameweek meant choosing from one leftover match.
// - Answers link to the page that holds them (the Bullpit, set-piece
//   takers, Team Strength...), so the quiz sends people around the site.
// ============================================================================

import { supabase } from './supabase';
// Each page's own data function, so a quiz answer always matches the page
// its link opens (Trivia v3: one question per page, picked for its most
// interesting fact).
import { getCrossLeagueSummary } from './crossLeagueApi';
import { getMarketEfficiency } from './marketApi';
import { getModelAccuracySummary } from './modelAccuracyApi';
import { getCompletedGameweeks, getTeamOfTheWeek } from './teamOfWeekApi';
import { getActualValueTable } from './valueApi';
import { getInjuryReport } from './injuryApi';
import { getFplScoringRules } from './fplScoringRulesApi';
import { getHindsightOptimalSquad } from './fplOptimizerApi';
import { getFantasyFixtureDifficulty } from './modelApi';
import { getGameweekDigest } from './digestApi';

const PL_LEAGUE_ID = 1;
const PL_SEASON_ID = 13;

export type TriviaFact = {
  question: string;
  /** Real candidates, shuffled so a correct one isn't predictably first. */
  options: string[];
  /** Every correct option: usually one; several where the data genuinely
   * ties, or where every option is right. */
  correct: number[];
  /** Shown once a person has guessed -- the headline answer, with context. */
  explanation: string;
  /** Aligned with options: each option's own figure, shown after a guess. */
  optionDetails?: string[];
  /** Where on the site the answer lives. */
  link?: { to: string; label: string };
};

/** Fisher-Yates over options (and their details), tracking where every
 * correct option lands. Returns new arrays; never mutates. */
function shuffleFact(labels: string[], correctOriginal: number[], details?: string[]) {
  const order = labels.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    options: order.map((i) => labels[i]),
    optionDetails: details ? order.map((i) => details[i]) : undefined,
    correct: order.map((orig, pos) => (correctOriginal.includes(orig) ? pos : -1)).filter((pos) => pos >= 0),
  };
}

/** Indexes tied with the first value of a best-first list. */
export function tiedWithFirst(values: number[]): number[] {
  if (values.length === 0) return [];
  return values.map((v, i) => (Math.abs(v - values[0]) < 1e-9 ? i : -1)).filter((i) => i >= 0);
}

function formatPercent(part: number, total: number): string {
  return `${((part / total) * 100).toFixed(1)}%`;
}

/** "Just ahead of X" -- or "level with X" when they tie. */
function joined(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The gameweek the quiz talks about: the next one in which NO match has
 * been played. Mid-gameweek, the next unplayed fixture belongs to a
 * gameweek that is mostly over (Gameweek 5 with only Fulham v Manchester
 * United left), which made "this gameweek" questions pick from one match.
 */
export async function upcomingGameweek(): Promise<{ matchweek: number; fixtureIds: number[] } | null> {
  const { data, error } = await supabase
    .from('fixtures')
    .select('fixture_id, matchweek, status')
    .eq('league_id', PL_LEAGUE_ID)
    .eq('season_id', PL_SEASON_ID)
    .order('kickoff_date', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as { fixture_id: number; matchweek: number | null; status?: string | null }[];
  const byMw = new Map<number, { ids: number[]; played: boolean }>();
  for (const r of rows) {
    if (r.matchweek == null) continue;
    const g = byMw.get(r.matchweek) ?? { ids: [], played: false };
    g.ids.push(r.fixture_id);
    if (r.status === 'played') g.played = true;
    byMw.set(r.matchweek, g);
  }
  const mw = [...byMw.keys()].sort((a, b) => a - b).find((k) => !byMw.get(k)!.played);
  return mw == null ? null : { matchweek: mw, fixtureIds: byMw.get(mw)!.ids };
}

export async function getMostCommonScorelineTrivia(): Promise<TriviaFact | null> {
  const { data } = await supabase.rpc('get_most_common_scoreline', { p_league_id: PL_LEAGUE_ID });
  const rows = (data ?? []) as { home_goals: number; away_goals: number; occurrences: number; total_matches: number }[];
  if (rows.length === 0) return null;
  const labels = rows.map((r) => `${r.home_goals}\u2013${r.away_goals}`);
  const details = rows.map((r) => `${formatPercent(r.occurrences, r.total_matches)} of matches`);
  const win = tiedWithFirst(rows.map((r) => r.occurrences));
  const top = rows[0];
  return {
    question: 'Which scoreline has come up most often in the Premier League?',
    ...shuffleFact(labels, win, details),
    explanation: `${joined(win.map((i) => labels[i]))} \u2014 ${formatPercent(top.occurrences, top.total_matches)} of every match in the archive.`,
    link: { to: '/results-data', label: 'Explore every result' },
  };
}

export async function getGoalsPerGameTrivia(): Promise<TriviaFact | null> {
  const { data: seasonRows } = await supabase
    .from('matches')
    .select('full_time_home_goals, full_time_away_goals')
    .eq('league_id', PL_LEAGUE_ID)
    .eq('season_id', PL_SEASON_ID);
  if (!seasonRows || seasonRows.length === 0) return null;
  const totalGoals = (seasonRows as any[]).reduce((sum, r) => sum + r.full_time_home_goals + r.full_time_away_goals, 0);
  const perGame = totalGoals / seasonRows.length;
  const buckets = ['Under 2.0', '2.0\u20132.5', '2.5\u20133.0', 'Over 3.0'];
  const correctIndex = perGame < 2.0 ? 0 : perGame < 2.5 ? 1 : perGame < 3.0 ? 2 : 3;
  return {
    question: 'Roughly how many goals a game is this Premier League season averaging?',
    options: buckets,
    correct: [correctIndex],
    explanation: `${perGame.toFixed(2)} a game \u2014 ${totalGoals} goals across ${seasonRows.length} matches so far.`,
  };
}

type ScoredMatch = { home_team: { canonical_name: string } | null; away_team: { canonical_name: string } | null; full_time_home_goals: number; full_time_away_goals: number };
const fixtureLabel = (r: ScoredMatch) => `${r.home_team?.canonical_name ?? 'Unknown'} vs ${r.away_team?.canonical_name ?? 'Unknown'}`;
const scoreLabel = (r: ScoredMatch) => `${r.home_team?.canonical_name ?? 'Unknown'} ${r.full_time_home_goals}\u2013${r.full_time_away_goals} ${r.away_team?.canonical_name ?? 'Unknown'}`;

async function seasonMatches(): Promise<ScoredMatch[] | null> {
  const { data: rows } = await supabase
    .from('matches')
    .select('home_team:teams!matches_home_team_id_fkey(canonical_name:display_name), away_team:teams!matches_away_team_id_fkey(canonical_name:display_name), full_time_home_goals, full_time_away_goals')
    .eq('league_id', PL_LEAGUE_ID)
    .eq('season_id', PL_SEASON_ID);
  return rows && rows.length ? (rows as unknown as ScoredMatch[]) : null;
}

export async function getHighestScoringMatchTrivia(): Promise<TriviaFact | null> {
  const rows = await seasonMatches();
  if (!rows) return null;
  const sorted = rows.map((r) => ({ r, total: r.full_time_home_goals + r.full_time_away_goals })).sort((a, b) => b.total - a.total).slice(0, 4);
  // Fixture names only in the options -- showing scores would let someone
  // spot the answer by comparing numbers. Scores are revealed afterwards.
  const win = tiedWithFirst(sorted.map((x) => x.total));
  return {
    question: 'Which match has produced more goals than any other this season?',
    ...shuffleFact(sorted.map((x) => fixtureLabel(x.r)), win, sorted.map((x) => `${x.r.full_time_home_goals}\u2013${x.r.full_time_away_goals} \u00b7 ${x.total} goals`)),
    explanation: `${win.map((i) => scoreLabel(sorted[i].r)).join('; ')} \u2014 ${sorted[0].total} goals.`,
    link: { to: '/results-data', label: 'Explore every result' },
  };
}

export async function getBiggestWinMarginTrivia(): Promise<TriviaFact | null> {
  const rows = await seasonMatches();
  if (!rows) return null;
  const sorted = rows.map((r) => ({ r, margin: Math.abs(r.full_time_home_goals - r.full_time_away_goals) })).sort((a, b) => b.margin - a.margin).slice(0, 4);
  const win = tiedWithFirst(sorted.map((x) => x.margin));
  return {
    question: 'Which Premier League match this season had the biggest winning margin?',
    ...shuffleFact(sorted.map((x) => fixtureLabel(x.r)), win, sorted.map((x) => `${x.r.full_time_home_goals}\u2013${x.r.full_time_away_goals} \u00b7 ${x.margin}-goal margin`)),
    explanation: `${win.map((i) => scoreLabel(sorted[i].r)).join('; ')} \u2014 a ${sorted[0].margin}-goal margin.`,
    link: { to: '/results-data', label: 'Explore every result' },
  };
}

export async function getBestDefenceTrivia(): Promise<TriviaFact | null> {
  const { data, error } = await supabase.rpc('get_best_defence_rating', { p_league_id: PL_LEAGUE_ID });
  if (error) throw error;
  const rows = (data ?? []) as { canonical_name: string; goals_against_per_game: number }[];
  if (rows.length === 0) return null;
  const xga = rows.map((r) => Number(r.goals_against_per_game));
  const win = tiedWithFirst(xga);
  return {
    question: 'Which Premier League team does FixtureShark\u2019s model rate the hardest to score against?',
    ...shuffleFact(rows.map((r) => r.canonical_name), win, xga.map((v) => `expected to concede ${v.toFixed(2)} a game`)),
    explanation: `${joined(win.map((i) => rows[i].canonical_name))} \u2014 the model expects just ${xga[0].toFixed(2)} goals against a game against a neutral opponent.`,
    link: { to: '/team-strength', label: 'See every team\u2019s strength' },
  };
}

export async function getClosestMatchTrivia(): Promise<TriviaFact | null> {
  const gw = await upcomingGameweek();
  if (!gw || gw.fixtureIds.length === 0) return null;
  const { data, error } = await supabase
    .from('fixtures')
    .select('slug, home_team:teams!fixtures_home_team_id_fkey(canonical_name:display_name), away_team:teams!fixtures_away_team_id_fkey(canonical_name:display_name), predicted_home_goals, predicted_away_goals')
    .in('fixture_id', gw.fixtureIds)
    .not('predicted_home_goals', 'is', null);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  const sorted = (data as any[])
    .map((r) => ({ ...r, margin: Math.abs(r.predicted_home_goals - r.predicted_away_goals) }))
    .sort((a, b) => a.margin - b.margin)
    .slice(0, 4);
  const label = (r: any) => `${r.home_team?.canonical_name ?? 'Unknown'} vs ${r.away_team?.canonical_name ?? 'Unknown'}`;
  const win = tiedWithFirst(sorted.map((r) => r.margin));
  const top = sorted[0];
  return {
    question: `Gameweek ${gw.matchweek}: which match is the model most torn on?`,
    ...shuffleFact(sorted.map(label), win, sorted.map((r) => `predicted ${Number(r.predicted_home_goals).toFixed(1)}\u2013${Number(r.predicted_away_goals).toFixed(1)}`)),
    explanation: `${joined(win.map((i) => label(sorted[i])))} \u2014 predicted ${Number(top.predicted_home_goals).toFixed(1)}\u2013${Number(top.predicted_away_goals).toFixed(1)}, the closest scoreline of Gameweek ${gw.matchweek}.`,
    link: top.slug ? { to: `/football/matches/${top.slug}`, label: 'See the full match prediction' } : { to: '/fixtures', label: 'See every fixture' },
  };
}

export type TopFplPick = {
  web_name: string;
  team_name: string;
  expected_fpl_points: number;
  matchweek: number;
};

/** The single highest-projected FPL player for the upcoming gameweek.
 * Still used directly by other parts of the app beyond trivia, so kept as
 * its own function returning one pick. */
export async function getLandingTopFplPick(): Promise<TopFplPick | null> {
  const top4 = await getTopFplPicks();
  return top4[0] ?? null;
}

async function getTopFplPicks(): Promise<TopFplPick[]> {
  const gw = await upcomingGameweek();
  if (!gw || gw.fixtureIds.length === 0) return [];
  const nextMatchweek = gw.matchweek;
  const fixtureIds = gw.fixtureIds;

  // TWO QUERIES, NOT AN EMBED. fpl_player_projections has no foreign key
  // constraints at all, and PostgREST requires a declared FK to embed a
  // related table -- so the previous
  // `.select('..., fpl_players(web_name, ...)')` could never resolve and
  // this whole fact failed every time. It failed SILENTLY because
  // getLandingTrivia wraps each fact in safely(), so the card simply
  // never appeared rather than erroring.
  const { data: projRows, error } = await supabase
    .from('fpl_player_projections')
    .select('fpl_player_id, expected_fpl_points')
    .eq('model_version', 'leaguewide_v6')
    .eq('scenario_key', 'baseline')
    .in('fixture_id', fixtureIds)
    .order('expected_fpl_points', { ascending: false })
    .limit(4);
  if (error) throw error;
  if ((projRows ?? []).length === 0) return [];

  // The join is COMPOSITE -- (fpl_player_id, season_id) -- since element
  // ids are reassigned each season.
  const { data: playerRows, error: playerError } = await supabase
    .from('fpl_players')
    .select('fpl_player_id, web_name, canonical_team_id')
    .eq('season_id', PL_SEASON_ID)
    .in('fpl_player_id', (projRows ?? []).map((p) => p.fpl_player_id));
  if (playerError) throw playerError;

  const teamIds = [...new Set((playerRows ?? []).map((p) => p.canonical_team_id).filter((id): id is number => id != null))];
  const teamNameById = new Map<number, string>();
  if (teamIds.length > 0) {
    const { data: teamRows, error: teamError } = await supabase
      .from('teams')
      .select('team_id, display_name')
      .in('team_id', teamIds);
    if (teamError) throw teamError;
    for (const t of teamRows ?? []) teamNameById.set(t.team_id, t.display_name);
  }

  const playerById = new Map((playerRows ?? []).map((p) => [p.fpl_player_id, p]));

  return (projRows ?? []).map((row) => {
    const player = playerById.get(row.fpl_player_id);
    return {
      web_name: player?.web_name ?? 'Unknown',
      team_name: player?.canonical_team_id != null ? (teamNameById.get(player.canonical_team_id) ?? '') : '',
      expected_fpl_points: Number(row.expected_fpl_points),
      matchweek: nextMatchweek,
    };
  });
}

export async function getTopFplPickTrivia(): Promise<TriviaFact | null> {
  const rows = await getTopFplPicks();
  if (rows.length === 0) return null;
  const gw = rows[0].matchweek;
  const pts = rows.map((r) => r.expected_fpl_points);
  const win = tiedWithFirst(pts);
  return {
    question: `Gameweek ${gw}: one player is projected to outscore everyone else. Who?`,
    ...shuffleFact(rows.map((r) => r.web_name), win, rows.map((r) => `${r.team_name ? `${r.team_name} \u00b7 ` : ''}${r.expected_fpl_points.toFixed(1)} projected points`)),
    explanation: `${joined(win.map((i) => `${rows[i].web_name} (${rows[i].team_name})`))} \u2014 ${pts[0].toFixed(1)} projected points for Gameweek ${gw}.`,
    link: { to: '/fpl/player-points', label: `See every Gameweek ${gw} projection` },
  };
}

export async function getTopActualFplScorerTrivia(): Promise<TriviaFact | null> {
  const { data, error } = await supabase.rpc('get_top_actual_fpl_scorer', { p_season_id: PL_SEASON_ID });
  if (error) throw error;
  const rows = (data ?? []) as { web_name: string; total_points: number }[];
  if (rows.length === 0) return null;
  const win = tiedWithFirst(rows.map((r) => r.total_points));
  return {
    question: 'Forget the projections: who has actually scored the most FPL points this season?',
    ...shuffleFact(rows.map((r) => r.web_name), win, rows.map((r) => `${r.total_points} points so far`)),
    explanation: `${joined(win.map((i) => rows[i].web_name))} \u2014 ${rows[0].total_points} points so far.`,
    link: { to: '/fpl/player-scout', label: 'Scout any player' },
  };
}

/** Whose price is under most pressure to RISE -- the Bullpit's question. */
export async function getPriceRiskTrivia(): Promise<TriviaFact | null> {
  const { data, error } = await supabase.rpc('get_price_change_risk', { p_season_id: PL_SEASON_ID });
  if (error) throw error;
  const risers = ((data ?? []) as { web_name: string; team_name: string; direction: string; pressure: number; net_transfers: number }[])
    .filter((r) => r.direction === 'rise')
    .sort((a, b) => Number(b.pressure) - Number(a.pressure))
    .slice(0, 4);
  if (risers.length < 2) return null;
  const win = tiedWithFirst(risers.map((r) => Number(r.pressure)));
  const net = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n).toLocaleString('en-GB')} net transfers`;
  return {
    question: 'Whose price is under the most pressure to rise right now?',
    ...shuffleFact(risers.map((r) => r.web_name), win, risers.map((r) => `${r.team_name} \u00b7 ${net(Number(r.net_transfers))}`)),
    explanation: `${joined(win.map((i) => `${risers[i].web_name} (${risers[i].team_name})`))} \u2014 ${net(Number(risers[0].net_transfers))}, more pressure than anyone. Pressure changes daily, so check before the deadline.`,
    link: { to: '/fpl/price-risk', label: 'See who\u2019s under pressure in the Bullpit' },
  };
}

export async function getSetPieceTrivia(): Promise<TriviaFact | null> {
  const { data, error } = await supabase.rpc('get_set_piece_index', { p_season_id: PL_SEASON_ID });
  if (error) throw error;
  const rows = ((data ?? []) as { player_name: string; team_name: string; index_score: number; duties: number }[]).slice(0, 4);
  if (rows.length < 2) return null;
  const win = tiedWithFirst(rows.map((r) => Number(r.index_score)));
  // A three-way tie is common here (identical duties give identical
  // scores), so the question says "which of these", and ties all count.
  return {
    question: 'Which of these takes the most valuable set-piece duties in the Premier League?',
    ...shuffleFact(rows.map((r) => r.player_name), win, rows.map((r) => `${r.team_name} \u00b7 set-piece index ${Math.round(Number(r.index_score))}`)),
    explanation: win.length > 1
      ? `Joint top: ${joined(win.map((i) => `${rows[i].player_name} (${rows[i].team_name})`))}, each with a set-piece index of ${Math.round(Number(rows[0].index_score))}.`
      : `${rows[0].player_name} (${rows[0].team_name}) \u2014 a set-piece index of ${Math.round(Number(rows[0].index_score))}.`,
    link: { to: '/fpl/set-pieces', label: 'See every club\u2019s set-piece takers' },
  };
}


// ---------------------------------------------------------------------
// Trivia v3: one question per page, each built from that page's own data
// function and its most interesting fact, linking to the page.
// ---------------------------------------------------------------------

const DIVISION_NAME: Record<string, string> = { E0: 'Premier League', E1: 'Championship', E2: 'League One', E3: 'League Two', EC: 'National League' };

/** League Insights: this season's goals per game by division. The answer
 * surprises most people -- the National League outscores the top flight. */
export async function getLeagueGoalsTrivia(): Promise<TriviaFact | null> {
  const rows = await getCrossLeagueSummary();
  if (!rows.length) return null;
  const season = rows.map((r) => r.season_label).sort().pop()!;
  const cur = rows.filter((r) => r.season_label === season).sort((a, b) => Number(b.goals_per_game) - Number(a.goals_per_game));
  if (cur.length < 2) return null;
  const gpg = cur.map((r) => Number(r.goals_per_game));
  const win = tiedWithFirst(gpg);
  const name = (r: (typeof cur)[number]) => DIVISION_NAME[r.league_code] ?? r.league_name;
  const pl = cur.find((r) => r.league_code === 'E0');
  return {
    question: 'This season, which division is averaging the most goals a game?',
    ...shuffleFact(cur.map(name), win, gpg.map((g) => `${g.toFixed(2)} goals a game`)),
    explanation: `${joined(win.map((i) => name(cur[i])))} \u2014 ${gpg[0].toFixed(2)} a game${pl && !win.includes(cur.indexOf(pl)) ? `, ahead of the Premier League\u2019s ${Number(pl.goals_per_game).toFixed(2)}` : ''}.`,
    link: { to: '/football/leagues-compared', label: 'Compare every division' },
  };
}

/** Market Efficiency: what backing every favourite actually returns. */
export async function getFavouritesTrivia(): Promise<TriviaFact | null> {
  const rows = (await getMarketEfficiency(true)).filter((r) => r.league_code === 'E0');
  if (!rows.length) return null;
  const r = rows.sort((a, b) => b.matches - a.matches)[0];
  const roi = Number(r.roi_favourite); // already a percentage
  const options = ['Lose more than 5%', 'Lose up to 5%', 'Win up to 5%', 'Win more than 5%'];
  const bucket = roi < -5 ? 0 : roi < 0 ? 1 : roi <= 5 ? 2 : 3;
  const verb = roi < 0 ? 'lose' : 'win';
  return {
    question: 'Back every Premier League favourite at average closing odds. What happens to your money?',
    options,
    correct: [bucket],
    explanation: `You\u2019d ${verb} ${Math.abs(roi).toFixed(1)}% of everything you staked, across ${r.matches.toLocaleString('en-GB')} matches. Backing every outsider instead: ${Number(r.roi_outsider) < 0 ? 'lose' : 'win'} ${Math.abs(Number(r.roi_outsider)).toFixed(1)}%.`,
    link: { to: '/football/market-efficiency', label: 'See how efficient the market is' },
  };
}

/** Model Accuracy: the headline hit rate -- told honestly, including that
 * "always back the home team" gets almost as many results right. */
export async function getModelHitRateTrivia(): Promise<TriviaFact | null> {
  const m = await getModelAccuracySummary();
  if (!m || !m.fixtures) return null;
  const hit = Number(m.hit_rate);
  const options = ['About 30%', 'About 40%', 'About 50%', 'About 60%'];
  const bucket = Math.min(3, Math.max(0, Math.round(hit / 10) - 3));
  return {
    question: 'How often does FixtureShark\u2019s model call the result (home win, draw or away win) correctly?',
    options,
    correct: [bucket],
    explanation: `${hit.toFixed(0)}% \u2014 ${m.correct} of ${m.fixtures} matches. Always backing the home team would have scored ${Number(m.always_home_hit_rate).toFixed(0)}%, but the model\u2019s probabilities are better calibrated than guesswork (a Brier score of ${Number(m.model_brier).toFixed(3)} against ${Number(m.uniform_brier).toFixed(3)} \u2014 lower is better). Football is hard to call.`,
    link: { to: '/football/model-accuracy', label: 'See how the model is doing' },
  };
}

/** Team of the Week: the latest completed gameweek's top scorer. */
export async function getTeamOfWeekTrivia(): Promise<TriviaFact | null> {
  const gws = await getCompletedGameweeks();
  if (!gws.length) return null;
  const gw = Math.max(...gws.map((g) => g.fpl_event_id));
  const players = (await getTeamOfTheWeek(gw)).slice().sort((a, b) => b.points - a.points).slice(0, 4);
  if (players.length < 2) return null;
  const win = tiedWithFirst(players.map((p) => p.points));
  const haul = (p: (typeof players)[number]) => [p.goals && `${p.goals} goal${p.goals > 1 ? 's' : ''}`, p.assists && `${p.assists} assist${p.assists > 1 ? 's' : ''}`, p.clean_sheets && 'clean sheet', p.bonus && `${p.bonus} bonus`].filter(Boolean).join(', ');
  return {
    question: `Gameweek ${gw} is done: who scored the most FPL points?`,
    ...shuffleFact(players.map((p) => p.web_name), win, players.map((p) => `${p.points} pts${haul(p) ? ` \u00b7 ${haul(p)}` : ''}`)),
    explanation: `${joined(win.map((i) => `${players[i].web_name}${players[i].team_name ? ` (${players[i].team_name})` : ''}`))} \u2014 ${players[0].points} points in Gameweek ${gw}.`,
    link: { to: `/fpl/team-of-the-week/gw${gw}`, label: `See the Gameweek ${gw} Team of the Week` },
  };
}

/** Bargain Basement: most points per £1m. */
export async function getValueTrivia(): Promise<TriviaFact | null> {
  const rows = (await getActualValueTable()).slice().sort((a, b) => b.points_per_million - a.points_per_million).slice(0, 4);
  if (rows.length < 2) return null;
  const win = tiedWithFirst(rows.map((r) => Number(r.points_per_million)));
  return {
    question: 'Who has earned the most FPL points per \u00a31m of price this season?',
    ...shuffleFact(rows.map((r) => r.web_name), win, rows.map((r) => `\u00a3${Number(r.price).toFixed(1)}m \u00b7 ${r.total_points} pts \u00b7 ${Number(r.points_per_million).toFixed(1)} per \u00a31m`)),
    explanation: `${joined(win.map((i) => `${rows[i].web_name}${rows[i].team_name ? ` (${rows[i].team_name})` : ''}`))} \u2014 ${Number(rows[0].points_per_million).toFixed(1)} points for every \u00a31m.`,
    link: { to: '/fpl/value', label: 'Find more bargains' },
  };
}

/** Physio Room: the club with most players injured, doubtful or suspended. */
export async function getInjuryListTrivia(): Promise<TriviaFact | null> {
  const counts = new Map<string, number>();
  for (const r of await getInjuryReport()) if (r.team_name) counts.set(r.team_name, (counts.get(r.team_name) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4);
  if (top.length < 2) return null;
  const win = tiedWithFirst(top.map(([, n]) => n));
  return {
    question: 'Which Premier League club has the most players injured, doubtful or suspended right now?',
    ...shuffleFact(top.map(([t]) => t), win, top.map(([, n]) => `${n} players`)),
    explanation: `${joined(win.map((i) => top[i][0]))} \u2014 ${top[0][1]} players on the list.`,
    link: { to: '/fpl/injuries', label: 'See the Physio Room' },
  };
}

/** Fixture Heat Map: the next five gameweeks' expected goals, per team. */
export async function getFixtureRunTrivia(): Promise<TriviaFact | null> {
  const gw = await upcomingGameweek();
  if (!gw) return null;
  const last = gw.matchweek + 4;
  const data = await getFantasyFixtureDifficulty(PL_LEAGUE_ID, PL_SEASON_ID);
  const totals = data.teams
    .map((t) => ({ name: t.team_name, xg: t.fixtures.filter((f) => f.matchweek != null && f.matchweek >= gw.matchweek && f.matchweek <= last).reduce((s, f) => s + Number(f.expected_goals_for), 0) }))
    .filter((t) => t.xg > 0)
    .sort((a, b) => b.xg - a.xg)
    .slice(0, 4);
  if (totals.length < 2) return null;
  const win = tiedWithFirst(totals.map((t) => Number(t.xg.toFixed(2))));
  return {
    question: `Gameweeks ${gw.matchweek}\u2013${last}: whose fixtures promise the most goals?`,
    ...shuffleFact(totals.map((t) => t.name), win, totals.map((t) => `${t.xg.toFixed(1)} expected goals`)),
    explanation: `${joined(win.map((i) => totals[i].name))} \u2014 ${totals[0].xg.toFixed(1)} expected goals across Gameweeks ${gw.matchweek}\u2013${last}.`,
    link: { to: '/fantasy', label: 'See the Fixture Heat Map' },
  };
}

/** Scoring Rules: a goal is worth different amounts by position. */
export async function getScoringRuleTrivia(): Promise<TriviaFact | null> {
  const rules = (await getFplScoringRules()).filter((r) => r.rule_code === 'goal' && r.player_position);
  const byPos = new Map(rules.map((r) => [r.player_position!, r.points]));
  const def = byPos.get('DEF');
  if (def == null || byPos.size < 4) return null;
  const order: ['GK' | 'DEF' | 'MID' | 'FWD', string][] = [['GK', 'a goalkeeper'], ['DEF', 'a defender'], ['MID', 'a midfielder'], ['FWD', 'a forward']];
  const labels = order.map(([p]) => `${byPos.get(p)} points`);
  return {
    question: 'How many FPL points does a defender get for scoring a goal?',
    ...shuffleFact(labels, [1], order.map(([, who]) => `what ${who} gets`)),
    explanation: `${def} points \u2014 a goal is worth more the further back the scorer plays.`,
    link: { to: '/fpl/scoring-rules', label: 'See every scoring rule' },
  };
}

/** Squad of the Season: the perfect hindsight squad's points. */
export async function getHindsightSquadTrivia(): Promise<TriviaFact | null> {
  const h = await getHindsightOptimalSquad();
  if (!h || !h.objective_points) return null;
  const pts = Number(h.objective_points);
  const base = Math.round(pts / 50) * 50;
  const values = [base - 160, base - 80, base, base + 80].filter((v) => v > 0);
  return {
    question: 'With perfect hindsight, how many points would the best possible squad have scored so far this season?',
    options: values.map((v) => `About ${v}`),
    correct: [values.indexOf(base)],
    explanation: `${pts.toFixed(0)} points \u2014 the highest total any legal squad could have reached, chosen knowing every result.`,
    link: { to: '/fpl/optimal-squad-so-far', label: 'See the Squad of the Season' },
  };
}

/** In the papers: the biggest ownership climb this gameweek. */
export async function getOwnershipSurgeTrivia(): Promise<TriviaFact | null> {
  const entries = (await getGameweekDigest(PL_SEASON_ID)).filter((e) => e.change_type === 'ownership');
  if (!entries.length) return null;
  const gw = entries[0].gameweek;
  const pct = (v: string | null) => (v == null ? NaN : Number(String(v).replace('%', '')));
  const byPlayer = new Map<number, { name: string; team: string | null; first: string; from: number; last: string; to: number }>();
  for (const e of entries) {
    const cur = byPlayer.get(e.fpl_player_id);
    const from = pct(e.old_value), to = pct(e.new_value);
    if (!cur) byPlayer.set(e.fpl_player_id, { name: e.web_name, team: e.team_name, first: e.event_date, from, last: e.event_date, to });
    else {
      if (e.event_date < cur.first) { cur.first = e.event_date; cur.from = from; }
      if (e.event_date > cur.last) { cur.last = e.event_date; cur.to = to; }
    }
  }
  const risers = [...byPlayer.values()].filter((p) => p.to > p.from).map((p) => ({ ...p, gain: p.to - p.from })).sort((a, b) => b.gain - a.gain).slice(0, 4);
  if (risers.length < 2) return null;
  const win = tiedWithFirst(risers.map((r) => Number(r.gain.toFixed(1))));
  return {
    question: `Gameweek ${gw} so far: whose ownership has climbed the most?`,
    ...shuffleFact(risers.map((r) => r.name), win, risers.map((r) => `${r.from.toFixed(1)}% \u2192 ${r.to.toFixed(1)}%`)),
    explanation: `${joined(win.map((i) => `${risers[i].name}${risers[i].team ? ` (${risers[i].team})` : ''}`))} \u2014 up ${risers[0].gain.toFixed(1)} points of ownership this gameweek.`,
    link: { to: '/fpl/in-the-papers', label: 'Read In the papers' },
  };
}

// ---------------------------------------------------------------------
// Historic trivia. The season-scoped facts below ("biggest thumping this
// season") were weak: anyone following the league already knows them, so
// there's nothing to guess. These span the whole archive and are chosen
// because the answer genuinely isn't in most people's heads -- and each
// one points at a section of the site that can show you more.
// ---------------------------------------------------------------------

const DIVISION: Record<string, string> = { E0: 'Premier League', E1: 'Championship', E2: 'League One', E3: 'League Two', EC: 'National League' };

/**
 * EVERY option is correct. The old question asked which of several 3-0
 * comebacks happened in the Premier League -- guessable without knowing
 * anything, since people know which clubs are in the Premier League. Now
 * each club's story is the payoff.
 */
export async function getComebackTrivia(): Promise<TriviaFact | null> {
  const { data } = await supabase.rpc('get_biggest_comebacks');
  const rows = (data ?? []).filter((r) => r.deficit >= 3).slice(0, 4);
  if (rows.length < 2) return null;
  const winner = (r: (typeof rows)[number]) => (r.ht_home > r.ht_away ? r.away : r.home);
  const story = (r: (typeof rows)[number]) => {
    const home = winner(r) === r.home;
    const opp = home ? r.away : r.home;
    const ht = home ? `${r.ht_home}\u2013${r.ht_away}` : `${r.ht_away}\u2013${r.ht_home}`;
    const ft = home ? `${r.ft_home}\u2013${r.ft_away}` : `${r.ft_away}\u2013${r.ft_home}`;
    const when = new Date(`${r.match_date}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    return `${ht} down ${home ? 'at home to' : 'at'} ${opp}, won ${ft} \u00b7 ${DIVISION[r.league_code] ?? r.league_code}, ${when}`;
  };
  const labels = rows.map(winner);
  return {
    question: 'Which of these clubs came back from 3\u20130 down at half time to win?',
    ...shuffleFact(labels, labels.map((_, i) => i), rows.map(story)),
    explanation: `All of them. Only ${rows.length} clubs in the whole archive have done it \u2014 and each in a different division.`,
    link: { to: '/results-data', label: 'Explore every result' },
  };
}

export async function getStrictestRefereeTrivia(): Promise<TriviaFact | null> {
  const { data } = await supabase.rpc('get_strictest_referees');
  const rows = (data ?? []);
  if (rows.length < 2) return null;
  const win = tiedWithFirst(rows.map((r) => Number(r.red_cards)));
  return {
    question: 'Which referee has shown the most red cards in our archive?',
    ...shuffleFact(rows.map((r) => r.referee), win, rows.map((r) => `${r.red_cards} red cards in ${r.matches} matches`)),
    explanation: `${joined(win.map((i) => rows[i].referee))} \u2014 ${rows[0].red_cards} red cards across ${rows[0].matches} matches.`,
  };
}

export async function getAllTimeScorersTrivia(): Promise<TriviaFact | null> {
  const { data } = await supabase.rpc('get_all_time_top_scorers');
  const rows = (data ?? []);
  if (rows.length < 2) return null;
  const win = tiedWithFirst(rows.map((r) => Number(r.goals)));
  return {
    question: 'Across all five divisions in our archive, which club has scored the most goals?',
    ...shuffleFact(rows.map((r) => r.display_name), win, rows.map((r) => `${Number(r.goals).toLocaleString('en-GB')} goals`)),
    explanation: `${joined(win.map((i) => rows[i].display_name))} \u2014 ${Number(rows[0].goals).toLocaleString('en-GB')} goals.`,
    link: { to: '/teams', label: 'Explore any club' },
  };
}

/** Each function's own failure just means that one fact is skipped -- a
 * decorative feature degrading gracefully rather than blocking the page
 * shell is the right trade-off, so every call here is wrapped
 * individually rather than one try/catch around the whole batch. */
async function safely(fn: () => Promise<TriviaFact | null>): Promise<TriviaFact | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/** Mixed set for the top-level landing page, before a visitor has picked
 * a theme -- one taste of each. */
export async function getLandingTrivia(): Promise<TriviaFact[]> {
  const results = await Promise.all([
    safely(getComebackTrivia),
    safely(getMostCommonScorelineTrivia),
    safely(getAllTimeScorersTrivia),
    safely(getBestDefenceTrivia),
    safely(getTopFplPickTrivia),
  ]);
  return results.filter((f): f is TriviaFact => f !== null);
}

/** Football hub: one question per Football page, leading with the
 * upcoming gameweek's so the quiz refreshes itself every week. */
export async function getFootballTrivia(): Promise<TriviaFact[]> {
  const results = await Promise.all([
    safely(getClosestMatchTrivia),        // Fixtures & Results (match page)
    safely(getLeagueGoalsTrivia),         // League Insights
    safely(getModelHitRateTrivia),        // Model Accuracy
    safely(getFavouritesTrivia),          // Market Efficiency
    safely(getBestDefenceTrivia),         // Team Strength
    safely(getComebackTrivia),            // Raw Data
    safely(getAllTimeScorersTrivia),      // Your Team
    safely(getMostCommonScorelineTrivia), // Raw Data
    safely(getBiggestWinMarginTrivia),    // Raw Data
    safely(getStrictestRefereeTrivia),
  ]);
  return results.filter((f): f is TriviaFact => f !== null);
}

/** Fantasy hub: one question per Fantasy page, leading with the upcoming
 * gameweek's projections. */
export async function getFplTrivia(): Promise<TriviaFact[]> {
  const results = await Promise.all([
    safely(getTopFplPickTrivia),        // Player Projections
    safely(getFixtureRunTrivia),        // Fixture Heat Map
    safely(getPriceRiskTrivia),         // Bullpit
    safely(getOwnershipSurgeTrivia),    // In the papers
    safely(getTeamOfWeekTrivia),        // Team of the Week
    safely(getValueTrivia),             // Bargain Basement
    safely(getInjuryListTrivia),        // Physio Room
    safely(getSetPieceTrivia),          // Set-Piece Takers
    safely(getHindsightSquadTrivia),    // Squad of the Season
    safely(getTopActualFplScorerTrivia),// Player Scout
    safely(getScoringRuleTrivia),       // Scoring Rules
  ]);
  return results.filter((f): f is TriviaFact => f !== null);
}
