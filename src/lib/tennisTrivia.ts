// ============================================================================
// src/lib/tennisTrivia.ts
//
// Tennis hub trivia: ONE question per tennis page, each linking to the page
// that holds the answer (the trivia is a navigation aid -- Chris's rule for
// every hub). Built from live data; a question that can't be built is
// skipped.
// ============================================================================

import { joined, shuffleFact, tiedWithFirst, type TriviaFact } from './landingApi';
import { MATCH_COLUMNS, PLAYER_COLUMNS, tennisPlayersPath, tennisResultsPath, tennisSeasonsPath, tennisView } from './tennisApi';
import { slamCounts, seasonIndex, type TennisMatch, type TennisPlayer } from './tennisStats';

async function mostTitles(): Promise<TriviaFact | null> {
  const { data, error } = await tennisView('tennis_players', PLAYER_COLUMNS).eq('tour', 'ATP').order('titles', { ascending: false }).limit(4);
  if (error) throw error;
  const top = (data ?? []) as TennisPlayer[];
  if (top.length < 2) return null;
  const win = tiedWithFirst(top.map((p) => p.titles));
  return {
    question: 'Which man has won the most ATP titles since 2000?',
    ...shuffleFact(top.map((p) => p.name), win, top.map((p) => `${p.titles} titles`)),
    explanation: `${joined(win.map((i) => top[i].name))} — ${top[0].titles} tour-level titles.`,
    link: { to: tennisPlayersPath('ATP'), label: 'See every player' },
  };
}

async function mostSlamsWta(): Promise<TriviaFact | null> {
  const { data, error } = await tennisView('tennis_matches', MATCH_COLUMNS).eq('tour', 'WTA').eq('round', 'The Final').eq('level', 'Grand Slam');
  if (error) throw error;
  const top = slamCounts(seasonIndex((data ?? []) as TennisMatch[])).slice(0, 4);
  if (top.length < 2) return null;
  const win = tiedWithFirst(top.map((t) => t.n));
  return {
    question: 'Who has won the most women’s Grand Slam singles titles since 2007?',
    ...shuffleFact(top.map((t) => t.name), win, top.map((t) => `${t.n} Grand Slams`)),
    explanation: `${joined(win.map((i) => top[i].name))} — ${top[0].n} Grand Slam titles.`,
    link: { to: tennisSeasonsPath('WTA'), label: 'See every WTA season' },
  };
}

async function latestFinal(): Promise<TriviaFact | null> {
  const { data, error } = await tennisView('tennis_matches', MATCH_COLUMNS)
    .eq('tour', 'ATP')
    .eq('round', 'The Final')
    .eq('played', true)
    .order('match_date', { ascending: false })
    .limit(1);
  if (error) throw error;
  const f = ((data ?? []) as TennisMatch[])[0];
  if (!f) return null;
  const { data: semis } = await tennisView('tennis_matches', 'loser')
    .eq('tour', 'ATP')
    .eq('year', f.year)
    .eq('tournament', f.tournament)
    .eq('round', 'Semifinals');
  const others = ((semis ?? []) as { loser: string }[]).map((s) => s.loser).filter((n) => n !== f.winner && n !== f.loser);
  const names = [f.winner, f.loser, ...others].slice(0, 4);
  return {
    question: `Who won the most recent ATP final, at the ${f.tournament}?`,
    ...shuffleFact(names, [0]),
    explanation: `${f.winner} beat ${f.loser} in the final.`,
    link: { to: tennisResultsPath('ATP', f.match_date), label: 'See that day’s results' },
  };
}

export async function getTennisTrivia(): Promise<TriviaFact[]> {
  const built = await Promise.all([latestFinal(), mostTitles(), mostSlamsWta()].map((p) => p.catch(() => null)));
  return built.filter((f): f is TriviaFact => f != null);
}
