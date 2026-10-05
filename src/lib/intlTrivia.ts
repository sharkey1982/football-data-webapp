// ============================================================================
// src/lib/intlTrivia.ts
//
// International hub trivia: ONE question per International page, each linking
// to the page that holds the answer (the trivia is a navigation aid -- Chris's
// rule for every hub). Built from live data; a question that can't be built is
// skipped.
// ============================================================================

import { joined, shuffleFact, tiedWithFirst, type TriviaFact } from './landingApi';
import { EDITION_COLUMNS, INTL_FIXTURES_PATH, INTL_TEAMS_PATH, INTL_TOURNAMENTS_PATH, TEAM_COLUMNS, intlView } from './intlApi';
import type { EditionSummary, TeamSummary } from './intlStats';

async function mostWorldCups(): Promise<TriviaFact | null> {
  const { data, error } = await intlView('intl_team_summary', TEAM_COLUMNS).order('wc_titles', { ascending: false }).limit(4);
  if (error) throw error;
  const top = (data ?? []) as TeamSummary[];
  if (top.length < 2 || top[0].wc_titles === 0) return null;
  const win = tiedWithFirst(top.map((t) => t.wc_titles));
  return {
    question: 'Which nation has won the most World Cups?',
    ...shuffleFact(top.map((t) => t.team), win, top.map((t) => `${t.wc_titles} World Cup${t.wc_titles === 1 ? '' : 's'}`)),
    explanation: `${joined(win.map((i) => top[i].team))} — ${top[0].wc_titles} World Cups.`,
    link: { to: INTL_TOURNAMENTS_PATH, label: 'See every World Cup, Euro and Nations League' },
  };
}

async function topRated(): Promise<TriviaFact | null> {
  const { data, error } = await intlView('intl_team_summary', TEAM_COLUMNS).lte('elo_rank', 4).order('elo_rank', { ascending: true });
  if (error) throw error;
  const top = (data ?? []) as TeamSummary[];
  if (top.length < 2) return null;
  return {
    question: 'Which nation has the highest Elo rating right now?',
    ...shuffleFact(top.map((t) => t.team), [0], top.map((t) => `Elo ${Math.round(t.elo)}`)),
    explanation: `${top[0].team} — rated ${Math.round(top[0].elo)}, from every result since 1872.`,
    link: { to: INTL_TEAMS_PATH, label: 'See every nation’s rating' },
  };
}

async function latestFinal(): Promise<TriviaFact | null> {
  const { data, error } = await intlView('intl_edition_summary', EDITION_COLUMNS).eq('competition', 'FIFA World Cup').not('winner', 'is', null).order('season_start', { ascending: false }).limit(1);
  if (error) throw error;
  const e = ((data ?? []) as EditionSummary[])[0];
  if (!e?.winner || !e.runner_up) return null;
  const { data: teams } = await intlView('intl_team_summary', 'team,elo_rank').lte('elo_rank', 8).order('elo_rank', { ascending: true });
  const others = ((teams ?? []) as { team: string }[]).map((t) => t.team).filter((t) => t !== e.winner && t !== e.runner_up).slice(0, 2);
  return {
    question: `Who won the ${e.label} World Cup final?`,
    ...shuffleFact([e.winner, e.runner_up, ...others], [0]),
    explanation: `${e.winner} beat ${e.runner_up} in the final.`,
    link: { to: INTL_FIXTURES_PATH, label: 'See every international result' },
  };
}

/** One question per International page; failures are skipped. */
export async function getIntlTrivia(): Promise<TriviaFact[]> {
  const out = await Promise.all([latestFinal(), topRated(), mostWorldCups()].map((p) => p.catch(() => null)));
  return out.filter((f): f is TriviaFact => f !== null);
}
