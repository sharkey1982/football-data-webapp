// ============================================================================
// src/lib/nflStory.ts
//
// The story of an NFL season, and of one team's season, in plain sentences
// built only from the results and the closing lines: the champion and the
// path there, the best and worst records, streaks, upsets (the biggest
// underdog to win outright), blowouts, and how the season compares with
// every other since 2002. In-progress seasons get "so far" versions.
//
// Pure functions: the browser and the static generator both call them, so
// crawlers read the same prose people do.
// ============================================================================

import { recordLabel, weekLabel, type NflGame, type NflSeasonIndexData, type NflStanding } from './nflApi';

export type NflSeasonSummary = {
  season: number;
  reg_games: number;
  reg_played: number;
  points_per_game: number | null;
  home_win_share: number | null;
  one_score_share: number | null;
  overtime_games: number;
  ties: number;
  favourite_win_share: number | null;
  neutral_games: number;
};

export const SUMMARY_COLUMNS =
  'season,reg_games,reg_played,points_per_game,home_win_share,one_score_share,overtime_games,ties,favourite_win_share,neutral_games';

const played = (g: NflGame) => g.home_score != null && g.away_score != null;
const winnerName = (g: NflGame) => (g.home_score! > g.away_score! ? g.home_name : g.away_name);
const loserName = (g: NflGame) => (g.home_score! > g.away_score! ? g.away_name : g.home_name);
const scoreline = (g: NflGame) => `${Math.max(g.home_score!, g.away_score!)}-${Math.min(g.home_score!, g.away_score!)}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const list = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How far the winner was the underdog: points it was getting. 0 if it was
 * favoured or the game was a pick'em/tie. nflverse spread_line is positive
 * when the home team is favoured. */
export function upsetSize(g: NflGame): number {
  if (!played(g) || g.spread_line == null || g.home_score === g.away_score) return 0;
  const homeWon = g.home_score! > g.away_score!;
  if (homeWon && g.spread_line < 0) return -g.spread_line;
  if (!homeWon && g.spread_line > 0) return g.spread_line;
  return 0;
}

/** Against the spread from one team's side: 'cover' | 'miss' | 'push', null without a line. */
export function againstSpread(g: NflGame, franchise: string): 'cover' | 'miss' | 'push' | null {
  if (!played(g) || g.spread_line == null) return null;
  const homeMargin = g.home_score! - g.away_score!;
  const diff = homeMargin - g.spread_line; // > 0: home covered
  if (diff === 0) return 'push';
  const homeCovered = diff > 0;
  return (g.home_franchise === franchise) === homeCovered ? 'cover' : 'miss';
}

type Streak = { franchise: string; name: string; length: number; from: number; to: number; ongoing: boolean };

/** Longest run of regular-season wins per team (ties end a run). */
export function winStreaks(games: NflGame[]): Streak[] {
  const reg = games.filter((g) => g.game_type === 'REG' && played(g)).sort((a, b) => a.week - b.week);
  const byTeam = new Map<string, { name: string; results: { week: number; won: boolean }[] }>();
  for (const g of reg) {
    for (const side of ['home', 'away'] as const) {
      const fr = side === 'home' ? g.home_franchise : g.away_franchise;
      const name = side === 'home' ? g.home_name : g.away_name;
      const us = side === 'home' ? g.home_score! : g.away_score!;
      const them = side === 'home' ? g.away_score! : g.home_score!;
      const e = byTeam.get(fr) ?? { name, results: [] };
      e.results.push({ week: g.week, won: us > them });
      byTeam.set(fr, e);
    }
  }
  const out: Streak[] = [];
  for (const [franchise, { name, results }] of byTeam) {
    let best: Streak | null = null;
    let run = 0;
    let start = 0;
    results.forEach((r, i) => {
      if (r.won) {
        if (run === 0) start = r.week;
        run++;
        if (!best || run > best.length) best = { franchise, name, length: run, from: start, to: r.week, ongoing: i === results.length - 1 };
      } else {
        run = 0;
      }
    });
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.length - a.length || a.name.localeCompare(b.name));
}

export type SeasonFact = { label: string; value: string; average: string | null; note?: string };

/** The season against every other completed season on file. */
export function seasonFingerprint(s: NflSeasonSummary, all: NflSeasonSummary[]): SeasonFact[] {
  const others = all.filter((o) => o.season !== s.season && o.reg_played === o.reg_games && o.reg_games > 0);
  const avg = (k: keyof NflSeasonSummary) => {
    const xs = others.map((o) => Number(o[k])).filter((x) => Number.isFinite(x));
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const games = s.reg_played || 1;
  const ppg = avg('points_per_game');
  const home = avg('home_win_share');
  const close = avg('one_score_share');
  const fav = avg('favourite_win_share');
  const otRate = others.length ? others.reduce((a, o) => a + o.overtime_games / (o.reg_played || 1), 0) / others.length : null;
  return [
    { label: 'Points per game', value: s.points_per_game != null ? Number(s.points_per_game).toFixed(1) : '–', average: ppg != null ? ppg.toFixed(1) : null },
    { label: 'Home win rate', value: s.home_win_share != null ? pct(Number(s.home_win_share)) : '–', average: home != null ? pct(home) : null, note: 'Neutral-site games excluded; a tie counts as half.' },
    { label: 'One-score games', value: s.one_score_share != null ? pct(Number(s.one_score_share)) : '–', average: close != null ? pct(close) : null, note: 'Decided by 8 points or fewer.' },
    { label: 'Favourites won', value: s.favourite_win_share != null ? pct(Number(s.favourite_win_share)) : '–', average: fav != null ? pct(fav) : null, note: 'Against the closing line; pick’ems and ties left out.' },
    { label: 'Overtime games', value: `${s.overtime_games} (${pct(s.overtime_games / games)})`, average: otRate != null ? pct(otRate) : null },
  ];
}

/** Where a season's points per game ranks among completed seasons, as a sentence or null. */
function scoringRank(s: NflSeasonSummary, all: NflSeasonSummary[]): string | null {
  const done = all.filter((o) => o.reg_played === o.reg_games && o.reg_games > 0 && o.points_per_game != null);
  const pool = done.some((o) => o.season === s.season) ? done : [...done, s];
  if (pool.length < 5 || s.points_per_game == null) return null;
  const sorted = [...pool].sort((a, b) => Number(b.points_per_game) - Number(a.points_per_game));
  const rank = sorted.findIndex((o) => o.season === s.season) + 1;
  const first = Math.min(...pool.map((o) => o.season));
  const ppg = Number(s.points_per_game).toFixed(1);
  if (rank === 1) return `At ${ppg} points a game it is the highest-scoring season since ${first}.`;
  if (rank === pool.length) return `At ${ppg} points a game it is the lowest-scoring season since ${first}.`;
  if (rank <= 3) return `At ${ppg} points a game it ranks ${rank === 2 ? 'second' : 'third'}-highest-scoring since ${first}.`;
  if (rank > pool.length - 3) return `At ${ppg} points a game it ranks among the three lowest-scoring since ${first}.`;
  return null;
}

/** ", but lost in the divisional round" -- how the play-offs ended for a team. */
export function playoffFate(r: Pick<NflStanding, 'playoff_result'>): string {
  switch (r.playoff_result) {
    case 'Won Super Bowl':
      return ' and won the Super Bowl';
    case 'Lost Super Bowl':
      return ' and lost the Super Bowl';
    case 'Lost conference championship':
      return ', but lost the conference championship';
    case 'Lost divisional round':
      return ', but lost in the divisional round';
    case 'Lost wild card round':
      return ', but lost in the wild card round';
    default:
      return ', but missed the play-offs';
  }
}

export type NflSeasonStory = { paragraphs: string[]; headline: string };

export function seasonStory(season: number, games: NflGame[], rows: NflStanding[], summaries: NflSeasonSummary[]): NflSeasonStory {
  const reg = games.filter((g) => g.game_type === 'REG' && played(g));
  const summary = summaries.find((s) => s.season === season);
  const complete = rows.length > 0 && rows[0].season_complete;
  const paragraphs: string[] = [];
  if (rows.length === 0 || reg.length === 0) {
    return { headline: `The ${season} NFL season has not started yet.`, paragraphs: [] };
  }
  const byPct = [...rows].sort((a, b) => (b.win_pct ?? 0) - (a.win_pct ?? 0) || b.point_diff - a.point_diff);
  const best = byPct[0];
  const bestTied = byPct.filter((r) => r.win_pct === best.win_pct);
  const worst = byPct[byPct.length - 1];
  const worstTied = byPct.filter((r) => r.win_pct === worst.win_pct);
  const offence = [...rows].sort((a, b) => b.points_for - a.points_for)[0];
  const defence = [...rows].sort((a, b) => a.points_against - b.points_against)[0];
  const maxWeek = Math.max(...reg.map((g) => g.week));

  let headline: string;
  if (complete) {
    const sb = games.find((g) => g.game_type === 'SB' && played(g));
    const champ = rows.find((r) => r.playoff_result === 'Won Super Bowl');
    if (sb && champ) {
      const path = champ.won_division ? `won the ${champ.conference} ${champ.division}` : 'got in as a wild card';
      headline = `The ${winnerName(sb)} won the Super Bowl after the ${season} season, beating the ${loserName(sb)} ${scoreline(sb)}${sb.overtime ? ' in overtime' : ''}${sb.stadium ? ` at ${sb.stadium}` : ''}.`;
      const conf = games.filter((g) => g.game_type === 'CON' && played(g));
      paragraphs.push(
        `They went ${recordLabel(champ)} in the regular season and ${path}.` +
          (conf.length === 2 ? ` The conference championships: ${conf.map((g) => `the ${winnerName(g)} beat the ${loserName(g)} ${scoreline(g)}`).join('; ')}.` : '')
      );
    } else {
      headline = `The ${season} NFL season.`;
    }
    const bestText = bestTied.length > 1 ? `The ${list(bestTied.map((r) => r.team_name)).replace(/, /g, ', the ').replace(/ and /, ' and the ')} shared the best record at ${recordLabel(best)}` : `The ${best.team_name} had the best record at ${recordLabel(best)}`;
    const bestFate = bestTied.length === 1 ? playoffFate(best) : '';
    const worstText = worstTied.length > 1 ? `${list(worstTied.map((r) => `the ${r.team_name}`))} finished bottom at ${recordLabel(worst)}` : `the ${worst.team_name} finished bottom at ${recordLabel(worst)}`;
    paragraphs.push(`${bestText}${bestFate}; ${worstText}.`);
  } else {
    headline = `After ${weekLabel('REG', maxWeek).toLowerCase()} of the ${season} season, ${bestTied.length > 1 ? `${list(bestTied.map((r) => `the ${r.team_name}`))} share the best record at ${recordLabel(best)}` : `the ${best.team_name} have the best record at ${recordLabel(best)}`}.`;
    const unbeaten = rows.filter((r) => r.lost === 0 && r.played > 0);
    const winless = rows.filter((r) => r.won === 0 && r.played > 0);
    const bits: string[] = [];
    if (unbeaten.length) bits.push(`${unbeaten.length === 1 ? 'Still unbeaten' : `${unbeaten.length} teams are still unbeaten`}: ${list(unbeaten.map((r) => `the ${r.team_name} (${recordLabel(r)})`))}.`);
    if (winless.length) bits.push(`${winless.length === 1 ? 'Still looking for a first win' : `${winless.length} teams are still without a win`}: ${list(winless.map((r) => `the ${r.team_name} (${recordLabel(r)})`))}.`);
    if (bits.length) paragraphs.push(bits.join(' '));
  }

  // Offence, defence, streaks.
  const streak = winStreaks(games)[0];
  const streakText = streak && streak.length >= 3
    ? ` The longest winning run${complete ? '' : ' so far'}: the ${streak.name}, ${streak.length} in a row (weeks ${streak.from}-${streak.to})${!complete && streak.ongoing ? ', and counting' : ''}.`
    : '';
  paragraphs.push(
    `The ${offence.team_name} scored the most points (${offence.points_for}${complete ? '' : ' so far'}) and the ${defence.team_name} conceded the fewest (${defence.points_against}).${streakText}`
  );

  // Upsets and blowouts.
  const upsets = reg.map((g) => ({ g, size: upsetSize(g) })).filter((u) => u.size >= 7).sort((a, b) => b.size - a.size);
  const blowout = [...reg].sort((a, b) => Math.abs(b.home_score! - b.away_score!) - Math.abs(a.home_score! - a.away_score!))[0];
  const shootout = [...reg].sort((a, b) => b.home_score! + b.away_score! - (a.home_score! + a.away_score!))[0];
  const upsetText = upsets.length
    ? `The biggest upset${complete ? '' : ' so far'}: the ${winnerName(upsets[0].g)}, ${upsets[0].size}-point underdogs, beat the ${loserName(upsets[0].g)} ${scoreline(upsets[0].g)} in week ${upsets[0].g.week}${upsets.length > 1 ? `, one of ${upsets.length} wins by teams getting 7 or more points` : ''}.`
    : '';
  paragraphs.push(
    [
      upsetText,
      `The widest margin: the ${winnerName(blowout)} beat the ${loserName(blowout)} ${scoreline(blowout)} in week ${blowout.week}.`,
      shootout && shootout.game_id !== blowout.game_id
        ? `The most points in one game: ${shootout.home_score! + shootout.away_score!}, ${shootout.home_score === shootout.away_score ? `when the ${shootout.away_name} and ${shootout.home_name} tied ${scoreline(shootout)}` : `when the ${winnerName(shootout)} beat the ${loserName(shootout)} ${scoreline(shootout)}`} in week ${shootout.week}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ')
  );

  if (summary) {
    const rank = scoringRank(summary, summaries);
    const close = summary.one_score_share != null ? ` ${pct(Number(summary.one_score_share))} of games were decided by one score (8 points or fewer).` : '';
    const ot = summary.overtime_games > 0 ? ` ${plural(summary.overtime_games, 'game')} went to overtime${summary.ties ? ` and ${plural(summary.ties, 'tie')} ended level` : ''}.` : '';
    paragraphs.push(`${rank ?? ''}${close}${ot}`.trim());
  }

  return { headline, paragraphs: paragraphs.filter(Boolean) };
}

// ---- One team's season -----------------------------------------------------------

export type TeamSeasonStory = {
  sentences: string[];
  ats: { cover: number; miss: number; push: number };
};

export function teamSeasonStory(franchise: string, games: NflGame[], row: NflStanding | undefined): TeamSeasonStory {
  const mine = games.filter((g) => played(g) && (g.home_franchise === franchise || g.away_franchise === franchise));
  const ats = { cover: 0, miss: 0, push: 0 };
  for (const g of mine.filter((x) => x.game_type === 'REG')) {
    const r = againstSpread(g, franchise);
    if (r) ats[r]++;
  }
  const sentences: string[] = [];
  if (!row || mine.length === 0) return { sentences, ats };
  const margin = (g: NflGame) => (g.home_franchise === franchise ? g.home_score! - g.away_score! : g.away_score! - g.home_score!);
  const opp = (g: NflGame) => (g.home_franchise === franchise ? g.away_name : g.home_name);
  const reg = mine.filter((g) => g.game_type === 'REG').sort((a, b) => a.week - b.week);
  const best = [...reg].sort((a, b) => margin(b) - margin(a))[0];
  const worst = [...reg].sort((a, b) => margin(a) - margin(b))[0];
  const streak = winStreaks(games).find((s) => s.franchise === franchise);
  const record = recordLabel(row);
  const ord = ['', 'first', 'second', 'third', 'fourth'][row.division_rank] ?? String(row.division_rank);
  const place = row.won_division ? `Won the ${row.conference} ${row.division}` : `Finished ${ord} in the ${row.conference} ${row.division}`;
  const post: Record<string, string> = {
    'Won Super Bowl': 'won the Super Bowl',
    'Lost Super Bowl': 'lost the Super Bowl',
    'Lost conference championship': 'lost the conference championship',
    'Lost divisional round': 'lost in the divisional round',
    'Lost wild card round': 'lost in the wild card round',
  };
  sentences.push(
    row.season_complete
      ? `${place} at ${record}${row.playoff_result ? `, then ${post[row.playoff_result]}` : ', and missed the play-offs'}.`
      : `${record} after ${plural(row.played, 'game')}: ${row.points_for} points scored, ${row.points_against} conceded.`
  );
  if (best && margin(best) > 0) sentences.push(`Biggest win: ${scorelineFor(best, franchise)} against the ${opp(best)} in week ${best.week}.`);
  if (worst && margin(worst) < 0) sentences.push(`Heaviest defeat: ${scorelineFor(worst, franchise)} against the ${opp(worst)} in week ${worst.week}.`);
  if (streak && streak.length >= 3) sentences.push(`Longest winning run: ${streak.length} (weeks ${streak.from}-${streak.to}).`);
  const lined = ats.cover + ats.miss + ats.push;
  if (lined > 0) sentences.push(`Against the closing spread they covered ${ats.cover} of ${lined}${ats.push ? ` (${plural(ats.push, 'push', 'pushes')})` : ''}.`);
  return { sentences, ats };
}

function scorelineFor(g: NflGame, franchise: string): string {
  const us = g.home_franchise === franchise ? g.home_score! : g.away_score!;
  const them = g.home_franchise === franchise ? g.away_score! : g.home_score!;
  return `${us}-${them}`;
}

// ---- Season index ---------------------------------------------------------------------

export type SeasonIndexRow = {
  season: number;
  champion: string | null;
  championSlug: string | null;
  runnerUp: string | null;
  best: string;
  bestRecord: string;
  pointsPerGame: number | null;
  complete: boolean;
};

export function seasonIndex(standings: NflStanding[], summaries: NflSeasonSummary[]): SeasonIndexRow[] {
  const seasons = [...new Set(standings.map((r) => r.season))].sort((a, b) => b - a);
  return seasons.map((season) => {
    const rows = standings.filter((r) => r.season === season);
    const champ = rows.find((r) => r.playoff_result === 'Won Super Bowl') ?? null;
    const runner = rows.find((r) => r.playoff_result === 'Lost Super Bowl') ?? null;
    const best = [...rows].sort((a, b) => (b.win_pct ?? 0) - (a.win_pct ?? 0) || b.point_diff - a.point_diff)[0];
    const s = summaries.find((x) => x.season === season);
    return {
      season,
      champion: champ?.team_name ?? null,
      championSlug: champ?.slug ?? null,
      runnerUp: runner?.team_name ?? null,
      best: best.team_name,
      bestRecord: recordLabel(best),
      pointsPerGame: s?.points_per_game != null ? Number(s.points_per_game) : null,
      complete: rows[0]?.season_complete ?? false,
    };
  });
}

/** Past seasons in one sentence: how many champions, who has won most. */
export function seasonsSentence(d: NflSeasonIndexData): string {
  const rows = seasonIndex(d.standings, d.summaries).filter((r) => r.complete && r.champion);
  if (rows.length === 0) return 'Every NFL season since 2002.';
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.champion!, (counts.get(r.champion!) ?? 0) + 1);
  const [topTeam, topN] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const first = Math.min(...rows.map((r) => r.season));
  return `${rows.length} Super Bowls since the ${first} season, won by ${counts.size} different teams; the ${topTeam} have won the most (${topN}). The latest champions: the ${rows[0].champion}.`;
}

