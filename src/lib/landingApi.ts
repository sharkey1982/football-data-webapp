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
    question: 'Which scoreline shows up more than any other in Premier League history?',
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
    question: 'Somebody got thumped by a bigger margin than anyone else this season. Who?',
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
    question: 'Which Premier League team does the model rate as the toughest to score against?',
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
    question: 'Forget the projections \u2014 who\u2019s actually scored the most Fantasy points so far this season?',
    ...shuffleFact(rows.map((r) => r.web_name), win, rows.map((r) => `${r.total_points} points so far`)),
    explanation: `${joined(win.map((i) => rows[i].web_name))} \u2014 ${rows[0].total_points} points so far.`,
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

/** Set-piece duties change slowly, so this question would go stale: it
 * appears on alternate weeks only (even ISO weeks). */
export function isSetPieceWeek(now = new Date()): boolean {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const week = Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  return week % 2 === 0;
}

export async function getSetPieceTrivia(): Promise<TriviaFact | null> {
  if (!isSetPieceWeek()) return null;
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
    question: 'Which referee has sent off more players than any other in this archive?',
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
    question: 'Across every English division in this archive, which club has scored the most goals?',
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

/** Football hub. Leads with the upcoming gameweek's projection question so
 * the quiz refreshes itself every week. */
export async function getFootballTrivia(): Promise<TriviaFact[]> {
  const results = await Promise.all([
    safely(getClosestMatchTrivia),
    safely(getComebackTrivia),
    safely(getAllTimeScorersTrivia),
    safely(getStrictestRefereeTrivia),
    safely(getMostCommonScorelineTrivia),
    safely(getBestDefenceTrivia),
  ]);
  return results.filter((f): f is TriviaFact => f !== null);
}

/** Fantasy hub. Leads with the upcoming gameweek's projection question. */
export async function getFplTrivia(): Promise<TriviaFact[]> {
  const results = await Promise.all([
    safely(getTopFplPickTrivia),
    safely(getPriceRiskTrivia),
    safely(getTopActualFplScorerTrivia),
    safely(getSetPieceTrivia),
    safely(getClosestMatchTrivia),
  ]);
  return results.filter((f): f is TriviaFact => f !== null);
}
