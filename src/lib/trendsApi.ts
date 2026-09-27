// ============================================================================
// src/lib/trendsApi.ts
//
// League Lab: how a league has changed season by season -- goals, home
// advantage, results split, title and relegation thresholds, competitive
// balance. Reads league_season_summary only (docs/methodology/history.md).
//
// Period comparisons use complete seasons (not curtailed, not the current
// one) and leave out the two Covid-affected seasons (2019/20, 2020/21),
// because empty stadiums distorted home advantage.
// ============================================================================

import { leagueBySlug, leagueSummaries, seasonDisplay, type LeagueRef, type SeasonSummary } from './leagueSeasonApi';

export type TrendsData = { league: LeagueRef; seasons: SeasonSummary[] };

export const DEFAULT_TRENDS_LEAGUE = 'premier-league';

export async function loadTrends(slug: string): Promise<TrendsData | null> {
  const league = await leagueBySlug(slug);
  if (!league) return null;
  return { league, seasons: await leagueSummaries(league.league_id) };
}

export function trendsPath(league: Pick<LeagueRef, 'slug'>): string {
  return league.slug === DEFAULT_TRENDS_LEAGUE ? '/football/history/trends' : `/football/history/trends/${league.slug}`;
}

type Metric = { key: string; label: string; get: (s: SeasonSummary) => number | null; fmt: (v: number) => string; noun: string };

const pct = (v: number) => `${Math.round(v * 100)}%`;
const f2 = (v: number) => v.toFixed(2);

export const METRICS: Metric[] = [
  { key: 'gpg', label: 'Goals per game', get: (s) => s.goals_per_game, fmt: f2, noun: 'goals per game' },
  { key: 'home', label: 'Home advantage (points per game)', get: (s) => s.home_ppg_advantage, fmt: f2, noun: 'home advantage (home minus away points per game)' },
  { key: 'draw', label: 'Draws', get: (s) => s.draw_share, fmt: pct, noun: 'the share of draws' },
  { key: 'homewin', label: 'Home wins', get: (s) => s.home_win_share, fmt: pct, noun: 'the share of home wins' },
  { key: 'balance', label: 'Competitive balance (Noll-Scully)', get: (s) => s.noll_scully, fmt: f2, noun: 'the Noll-Scully spread (higher = less even)' },
];

export function comparableSeasons(seasons: SeasonSummary[]): SeasonSummary[] {
  return seasons.filter((s) => s.is_final && !s.curtailed && !s.covid_affected).sort((a, b) => a.start_year - b.start_year);
}

export type PeriodChange = { metric: Metric; from: number; to: number; firstSpan: string; lastSpan: string; n: number };

/** First n vs last n comparable seasons, n = min(5, half of them). */
export function periodChanges(d: TrendsData): PeriodChange[] {
  const c = comparableSeasons(d.seasons);
  const n = Math.min(5, Math.floor(c.length / 2));
  if (n < 2) return [];
  const first = c.slice(0, n);
  const last = c.slice(-n);
  const span = (xs: SeasonSummary[]) => `${seasonDisplay(d.league.code, xs[0].start_year)}\u2013${seasonDisplay(d.league.code, xs[xs.length - 1].start_year)}`;
  const mean = (xs: SeasonSummary[], m: Metric) => {
    const v = xs.map(m.get).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return METRICS.flatMap((metric) => {
    const from = mean(first, metric);
    const to = mean(last, metric);
    return from == null || to == null ? [] : [{ metric, from, to, firstSpan: span(first), lastSpan: span(last), n }];
  });
}

/** Two or three plain sentences for the opening and the meta description. */
export function trendsHeadline(d: TrendsData): string {
  const ch = periodChanges(d);
  if (!ch.length) return '';
  const get = (k: string) => ch.find((c) => c.metric.key === k);
  const verb = (c: PeriodChange) => (Math.abs(c.to - c.from) < (c.metric.fmt === pct ? 0.01 : 0.02) ? 'held at about' : c.to > c.from ? 'rose from' : 'fell from');
  const phrase = (c: PeriodChange) =>
    verb(c) === 'held at about' ? `${c.metric.noun} held at about ${c.metric.fmt(c.to)}` : `${c.metric.noun} ${verb(c)} ${c.metric.fmt(c.from)} to ${c.metric.fmt(c.to)}`;
  const g = get('gpg');
  const h = get('home');
  const dr = get('draw');
  const parts = [g, h, dr].filter((x): x is PeriodChange => Boolean(x)).map(phrase);
  const first = ch[0];
  const text = `${d.league.name}, ${first.firstSpan} against ${first.lastSpan}: ${parts.join('; ')}.`;
  return text;
}

export type SeriesPoint = { x: number; y: number };

export function metricSeries(seasons: SeasonSummary[], get: (s: SeasonSummary) => number | null, scale = 1): SeriesPoint[] {
  return seasons
    .filter((s) => s.matches > 0 && !s.curtailed)
    .map((s) => ({ x: s.start_year, v: get(s) }))
    .filter((p): p is { x: number; v: number } => p.v != null)
    .map((p) => ({ x: p.x, y: Math.round(p.v * scale * 1000) / 1000 }));
}
