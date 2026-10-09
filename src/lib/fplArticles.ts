// ============================================================================
// src/lib/fplArticles.ts
//
// FPL articles: evergreen pieces that answer one question FPL managers keep
// asking, each backed by an analysis of the site's own data (not opinion).
//
// The figures below come from scripts/analysis/captaincy_*.sql, run on
// 7 Oct 2026 against fpl_player_gameweek_history (2022/23-2025/26) and the
// closing Avg market prices (market_closing_lines). They are fixed numbers
// for a fixed period, so the articles are static and server-rendered; rerun
// the SQL to refresh them, and change ARTICLES_DATA_AS_OF with them.
//
// Method in one line: each gameweek (3-38), the 20 most-owned players who
// started their last match are ranked by a simple pre-deadline estimate
// (points per start over their last 10 starts, scaled by the team's
// market-implied goals for this gameweek against those 10 games). That
// estimate is deliberately simple and NOT the site's projection model:
// the site's own projections were overwritten after kick-off before
// 10 Oct 2026, so they can't be backtested honestly.
// ============================================================================

export const ARTICLES_PATH = '/fpl/articles';
export const ARTICLES_DATA_AS_OF = '7 Oct 2026';

export type ArticleMeta = {
  slug: string;
  path: string;
  title: string;
  /** The question the article answers, as a manager would ask it. */
  question: string;
  description: string;
  /** One-sentence answer shown on the hub and at the top of the article. */
  verdict: string;
  published: string; // ISO date
  /** ISO date of the last substantive revision; defaults to published. */
  updated?: string;
  /** Shown in the byline; defaults to ARTICLES_DATA_AS_OF. */
  dataAsOf?: string;
};

export const CAPTAIN_ARTICLE: ArticleMeta = {
  slug: 'always-captain-the-top-pick',
  path: `${ARTICLES_PATH}/always-captain-the-top-pick`,
  title: 'Should you always captain the top-projected player?',
  question: 'Should I always captain the player with the highest expected points, even when it feels wrong?',
  description:
    'Four FPL seasons of captain picks tested: what the top-ranked captain scored against the second choice, the most-owned player and hindsight, and why the right pick still loses so often.',
  verdict:
    'Yes, on average: the top-ranked captain scored most over four seasons. But the edge over the second choice is about a point a week, small enough that it lost in one season out of four.',
  published: '2026-10-07',
};

export const HAALAND_ARTICLE: ArticleMeta = {
  slug: 'should-you-always-captain-haaland',
  path: `${ARTICLES_PATH}/should-you-always-captain-haaland`,
  title: 'Should you always captain Haaland, even away at Arsenal?',
  question: 'Should Haaland be my captain every week, even in the hardest away games?',
  description:
    'Haaland in FPL from 2022/23 to 2025/26: home against away, easy against hard fixtures, how much of his total came from a few hauls, and what always captaining him cost.',
  verdict:
    'Not every week. He is a strong default at home and when City are expected to score freely, but away at the strongest sides he blanked half the time, and always captaining him cost 129 points over four seasons.',
  published: '2026-10-07',
};

export const CAPTAIN_PAIRS_ARTICLE: ArticleMeta = {
  slug: 'one-captain-or-two',
  path: `${ARTICLES_PATH}/one-captain-or-two`,
  title: 'One captain or two? The mathematics of FPL captaincy',
  question: 'Do I need two premium captaincy options in my FPL squad, or is one enough?',
  description:
    'How much a second or third captaincy option is worth in FPL: the rotation-gain maths, vice-captain insurance, the \u00a3100m opportunity cost, and exact squad solves on FixtureShark\u2019s projections for gameweeks 6 to 15 of 2026/27.',
  verdict:
    'A second captaincy option helps, but the armband alone rarely pays for him. Alongside Haaland, Saka adds about 3.6 projected captain points over ten gameweeks; he is worth owning for his own points. Forcing in Bruno or Palmer as an extra option costs points.',
  published: '2026-10-08',
  updated: '2026-10-09',
  dataAsOf: '8 Oct 2026',
};

// Newest first.
export const ARTICLES: ArticleMeta[] = [CAPTAIN_PAIRS_ARTICLE, CAPTAIN_ARTICLE, HAALAND_ARTICLE];

// ---- Captaincy ------------------------------------------------------------

/** Average FPL points (the extra the armband adds) by estimate rank, 141 gameweeks. */
export const CAPTAIN_LADDER: { rank: number; points: number }[] = [
  { rank: 1, points: 7.26 },
  { rank: 2, points: 6.35 },
  { rank: 3, points: 5.8 },
  { rank: 4, points: 5.24 },
  { rank: 5, points: 4.82 },
  { rank: 6, points: 4.5 },
  { rank: 7, points: 4.35 },
  { rank: 8, points: 4.81 },
  { rank: 9, points: 4.28 },
  { rank: 10, points: 3.82 },
];

export const CAPTAIN_STRATEGIES = {
  gameweeks: 141,
  topRanked: 7.26,
  secondRanked: 6.35,
  mostOwned: 6.59,
  allCandidates: 4.37,
  hindsight: 14.39,
  /** Paired difference per gameweek, top v second, with its standard error. */
  topVsSecond: { mean: 0.91, se: 0.65 },
  topVsMostOwned: { mean: 0.67, se: 0.47 },
  /** In the 95 weeks the top-ranked player was not the most-owned. */
  topVsMostOwnedWhenDifferent: 0.99,
  /** Share of gameweeks the top-ranked pick was the best of the candidates. */
  topWasBest: 0.199,
  topBlanked: 0.277, // 2 points or fewer
  topHauled: 0.291, // 10 points or more
  sameAsMostOwned: 0.326,
};

/** Captain points per season (the armband's extra points), gameweeks 3-38. */
export const CAPTAIN_BY_SEASON: { season: string; gameweeks: number; top: number; second: number; mostOwned: number; hindsight: number }[] = [
  { season: '2022/23', gameweeks: 33, top: 262, second: 241, mostOwned: 228, hindsight: 499 },
  { season: '2023/24', gameweeks: 36, top: 227, second: 259, mostOwned: 226, hindsight: 540 },
  { season: '2024/25', gameweeks: 36, top: 293, second: 201, mostOwned: 287, hindsight: 520 },
  { season: '2025/26', gameweeks: 36, top: 241, second: 194, mostOwned: 188, hindsight: 470 },
];

/** Gameweeks grouped by how far the top pick's estimate was ahead of the second's. */
export const CAPTAIN_GAP_BINS: { gap: string; gameweeks: number; expected: number; actual: number; topWon: number; topLost: number }[] = [
  { gap: 'Under 0.5', gameweeks: 39, expected: 0.26, actual: 0.28, topWon: 0.487, topLost: 0.462 },
  { gap: '0.5 to 1', gameweeks: 26, expected: 0.74, actual: -0.77, topWon: 0.346, topLost: 0.538 },
  { gap: '1 to 2', gameweeks: 39, expected: 1.4, actual: 1.05, topWon: 0.59, topLost: 0.385 },
  { gap: '2 or more', gameweeks: 37, expected: 3.73, actual: 2.59, topWon: 0.622, topLost: 0.243 },
];

// ---- Haaland ---------------------------------------------------------------

/** Haaland's starts, 2022/23-2025/26. */
export const HAALAND_VENUE = [
  { venue: 'Home', starts: 61, points: 7.93, goals: 1.02, blank: 0.279, haul: 0.344, cityGoals: 2.56 },
  { venue: 'Away', starts: 66, points: 6.24, goals: 0.73, blank: 0.379, haul: 0.197, cityGoals: 2.08 },
];

/** By City's market-implied goals for the match. */
export const HAALAND_BY_CITY_GOALS = [
  { band: 'Under 1.5', starts: 5, points: 5.0, goals: 0.6, blank: 0.4, haul: 0 },
  { band: '1.5 to 2', starts: 27, points: 6.3, goals: 0.63, blank: 0.444, haul: 0.259 },
  { band: '2 to 2.5', starts: 52, points: 6.35, goals: 0.75, blank: 0.327, haul: 0.192 },
  { band: '2.5 or more', starts: 43, points: 8.63, goals: 1.19, blank: 0.256, haul: 0.395 },
];

/** Points per appearance, how many starts scored each total (127 starts). */
export const HAALAND_DISTRIBUTION: { points: number; starts: number }[] = [
  { points: 0, starts: 1 }, { points: 1, starts: 2 }, { points: 2, starts: 39 }, { points: 4, starts: 4 },
  { points: 5, starts: 9 }, { points: 6, starts: 17 }, { points: 7, starts: 8 }, { points: 8, starts: 8 },
  { points: 9, starts: 5 }, { points: 10, starts: 2 }, { points: 11, starts: 2 }, { points: 12, starts: 3 },
  { points: 13, starts: 13 }, { points: 14, starts: 2 }, { points: 16, starts: 4 }, { points: 17, starts: 5 },
  { points: 20, starts: 1 }, { points: 21, starts: 1 }, { points: 23, starts: 1 },
];

export const HAALAND_SEASONS = [
  { season: '2022/23', apps: 35, points: 272, top5: 88, multiGoalGames: 9, multiGoalPoints: 137, blanks: 8, hauls: 11 },
  { season: '2023/24', apps: 31, points: 217, top5: 86, multiGoalGames: 7, multiGoalPoints: 112, blanks: 11, hauls: 8 },
  { season: '2024/25', apps: 31, points: 181, top5: 72, multiGoalGames: 4, multiGoalPoints: 60, blanks: 13, hauls: 5 },
  { season: '2025/26', apps: 35, points: 239, top5: 72, multiGoalGames: 7, multiGoalPoints: 97, blanks: 13, hauls: 10 },
];

/** Captain points, gameweeks 3-38: always Haaland (top-ranked when he wasn't a candidate) v always the top-ranked. */
export const HAALAND_CAPTAINCY = [
  { season: '2022/23', alwaysHaaland: 241, topRanked: 262, haalandWeeks: 27, haalandPts: 213, topSameWeeks: 234 },
  { season: '2023/24', alwaysHaaland: 222, topRanked: 227, haalandWeeks: 25, haalandPts: 162, topSameWeeks: 167 },
  { season: '2024/25', alwaysHaaland: 189, topRanked: 293, haalandWeeks: 29, haalandPts: 147, topSameWeeks: 251 },
  { season: '2025/26', alwaysHaaland: 242, topRanked: 241, haalandWeeks: 32, haalandPts: 217, topSameWeeks: 216 },
];

/** Gameweeks where Haaland was a candidate, by where the estimate ranked him. */
export const HAALAND_BY_RANK = [
  { rank: 'Ranked 1st', weeks: 38, haaland: 7.42, alternative: 5.21 },
  { rank: 'Ranked 2nd', weeks: 11, haaland: 8.64, alternative: 6.82 },
  { rank: 'Ranked 3rd', weeks: 12, haaland: 7.08, alternative: 6.17 },
  { rank: 'Ranked 4th or lower', weeks: 52, haaland: 5.33, alternative: 8.4 },
];

/** Away at Arsenal, Liverpool, Chelsea, Tottenham, Man United and Newcastle. */
export const HAALAND_BIG_AWAY: { season: string; gw: number; opponent: string; points: number; goals: number; cityGoals: number }[] = [
  { season: '2022/23', gw: 3, opponent: 'Newcastle', points: 6, goals: 1, cityGoals: 2.2 },
  { season: '2022/23', gw: 11, opponent: 'Liverpool', points: 2, goals: 0, cityGoals: 2.0 },
  { season: '2022/23', gw: 19, opponent: 'Chelsea', points: 2, goals: 0, cityGoals: 1.9 },
  { season: '2022/23', gw: 20, opponent: 'Man United', points: 2, goals: 0, cityGoals: 1.8 },
  { season: '2022/23', gw: 22, opponent: 'Tottenham', points: 2, goals: 0, cityGoals: 1.75 },
  { season: '2022/23', gw: 23, opponent: 'Arsenal', points: 6, goals: 1, cityGoals: 1.45 },
  { season: '2023/24', gw: 8, opponent: 'Arsenal', points: 2, goals: 0, cityGoals: 1.35 },
  { season: '2023/24', gw: 10, opponent: 'Man United', points: 16, goals: 2, cityGoals: 2.0 },
  { season: '2023/24', gw: 12, opponent: 'Chelsea', points: 16, goals: 2, cityGoals: 1.75 },
  { season: '2023/24', gw: 28, opponent: 'Liverpool', points: 2, goals: 0, cityGoals: 1.9 },
  { season: '2023/24', gw: 37, opponent: 'Tottenham', points: 13, goals: 2, cityGoals: 2.7 },
  { season: '2024/25', gw: 1, opponent: 'Chelsea', points: 7, goals: 1, cityGoals: 1.85 },
  { season: '2024/25', gw: 6, opponent: 'Newcastle', points: 2, goals: 0, cityGoals: 2.0 },
  { season: '2024/25', gw: 13, opponent: 'Liverpool', points: 2, goals: 0, cityGoals: 1.4 },
  { season: '2024/25', gw: 24, opponent: 'Arsenal', points: 6, goals: 1, cityGoals: 1.25 },
  { season: '2024/25', gw: 27, opponent: 'Tottenham', points: 8, goals: 1, cityGoals: 2.2 },
  { season: '2025/26', gw: 5, opponent: 'Arsenal', points: 9, goals: 1, cityGoals: 1.2 },
  { season: '2025/26', gw: 12, opponent: 'Newcastle', points: 2, goals: 0, cityGoals: 1.8 },
  { season: '2025/26', gw: 22, opponent: 'Man United', points: 2, goals: 0, cityGoals: 1.75 },
  { season: '2025/26', gw: 24, opponent: 'Tottenham', points: 5, goals: 0, cityGoals: 1.95 },
  { season: '2025/26', gw: 25, opponent: 'Liverpool', points: 11, goals: 1, cityGoals: 1.5 },
  { season: '2025/26', gw: 32, opponent: 'Chelsea', points: 2, goals: 0, cityGoals: 1.85 },
];

/** City's next hard away games in 2026/27, market-implied goals as at 7 Oct 2026. */
export const HAALAND_UPCOMING = [
  { gw: 6, date: '11 Oct', fixture: 'Liverpool v Man City', cityGoals: 1.67 },
  { gw: 12, date: '29 Nov', fixture: 'Arsenal v Man City', cityGoals: 1.14 },
];

export function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}
