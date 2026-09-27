// ============================================================================
// src/lib/leagueSeasonApi.ts
//
// Canonical league and league-season pages:
//   /football/leagues                      every league with history
//   /football/leagues/:league              every season of one league
//   /football/leagues/:league/:season      one season: table, story, fingerprint
//
// Reads the history layer (team_season_summary, league_season_summary; see
// docs/methodology/history.md). The same loaders feed the browser and the
// static generator, and the sentence builders return plain strings so the
// server-rendered HTML reads as prose for search engines and AI crawlers.
// ============================================================================

import { supabase } from './supabase';

/** Leagues played within one calendar year: their season is "2024", not
 * "2024/25". Stored under start_year like every other season. */
export const CALENDAR_YEAR_LEAGUES = new Set(['FIN', 'NOR', 'SWE']);

export type LeagueRef = {
  league_id: number;
  code: string;
  name: string;
  slug: string;
  country: string | null;
};

export type SeasonSummary = {
  league_id: number;
  season_id: number;
  start_year: number;
  clubs: number;
  games_in_season: number;
  comparable_group: string;
  is_final: boolean;
  curtailed: boolean;
  split_format: boolean;
  covid_affected: boolean;
  matches: number;
  goals_per_game: number | null;
  home_win_share: number | null;
  draw_share: number | null;
  away_win_share: number | null;
  goalless_share: number | null;
  home_ppg_advantage: number | null;
  champion_points: number | null;
  highest_relegated_points: number | null;
  lowest_safe_points: number | null;
  noll_scully: number | null;
};

export type SeasonTableRow = {
  position: number;
  team_id: number;
  team_name: string;
  team_slug: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  deduction: number;
  points: number;
  split_group: number | null;
  champion: boolean | null;
  relegated: boolean | null;
  promoted: boolean | null;
};

export type LeagueSeasonData = {
  league: LeagueRef;
  season: { season_id: number; start_year: number };
  /** The division's name that season ("First Division" in 1995/96). */
  eraName: string;
  rows: SeasonTableRow[];
  summary: SeasonSummary;
  /** Every season of this league, oldest first (navigation and averages). */
  seasons: SeasonSummary[];
};

export type LeagueIndexSeason = SeasonSummary & {
  eraName: string;
  leader: { team_name: string; team_slug: string | null; points: number } | null;
  relegated: string[];
  promoted: string[];
};

export type LeagueIndexData = { league: LeagueRef; seasons: LeagueIndexSeason[] };

export type LeaguesListEntry = LeagueRef & { seasons: number; from: number; to: number };

// ---------------------------------------------------------------------------
// Naming and URLs
// ---------------------------------------------------------------------------

export function isEnglish(league: Pick<LeagueRef, 'league_id'>): boolean {
  return league.league_id >= 1 && league.league_id <= 5;
}

/** "1995/96", or "2024" for calendar-year leagues. */
export function seasonDisplay(code: string, startYear: number): string {
  if (CALENDAR_YEAR_LEAGUES.has(code)) return String(startYear);
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** URL segment: "1995-96", or "2024" for calendar-year leagues. */
export function seasonSegment(code: string, startYear: number): string {
  return seasonDisplay(code, startYear).replace('/', '-');
}

/** Start year from a URL segment ("1995-96" or "1995"); null if malformed. */
export function parseSeasonSegment(seg: string | undefined): number | null {
  const m = (seg ?? '').match(/^(\d{4})(?:-(\d{2}))?$/);
  if (!m) return null;
  const y = Number(m[1]);
  if (m[2] && Number(m[2]) !== (y + 1) % 100) return null;
  return y;
}

export function leagueSeasonPath(league: Pick<LeagueRef, 'slug' | 'code'>, startYear: number): string {
  return `/football/leagues/${league.slug}/${seasonSegment(league.code, startYear)}`;
}

/** League code -> URL slug, for links from pages that only know the code
 * (mirrors leagues.slug; the static generator reads the table itself). */
export const LEAGUE_SLUGS: Record<string, string> = {
  E0: 'premier-league', E1: 'championship', E2: 'league-one', E3: 'league-two', EC: 'national-league',
  SP1: 'la-liga', D1: 'bundesliga', I1: 'serie-a', F1: 'ligue-1', P1: 'primeira-liga', B1: 'belgian-pro-league',
  T1: 'super-lig', G1: 'super-league-greece', N1: 'eredivisie', SC0: 'scottish-premiership', AUT: 'austrian-bundesliga',
  DNK: 'danish-superliga', NOR: 'eliteserien', POL: 'ekstraklasa', ROU: 'romanian-superliga', SWE: 'allsvenskan',
  SWZ: 'swiss-super-league', FIN: 'veikkausliiga',
};

/** Season page path from a league code, or null for an unknown code. */
export function seasonPathByCode(code: string, startYear: number): string | null {
  const slug = LEAGUE_SLUGS[code];
  return slug ? leagueSeasonPath({ slug, code }, startYear) : null;
}

export function leaguePath(league: Pick<LeagueRef, 'slug'>): string {
  return `/football/leagues/${league.slug}`;
}

// ---------------------------------------------------------------------------
// Sentences (plain strings: one text node each in server-rendered HTML)
// ---------------------------------------------------------------------------

const pct = (v: number | null) => (v == null ? '–' : `${Math.round(v * 100)}%`);
const f2 = (v: number | null) => (v == null ? '–' : v.toFixed(2));

/** "A, B and C" */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function modePlayed(rows: { played: number }[]): number {
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.played, (counts.get(r.played) ?? 0) + 1);
  let best = 0;
  let bestN = -1;
  for (const [p, n] of counts) if (n > bestN || (n === bestN && p > best)) [best, bestN] = [p, n];
  return best;
}

/** The season's story in two or three sentences. */
export function seasonStory(d: Pick<LeagueSeasonData, 'league' | 'season' | 'eraName' | 'rows' | 'summary'>): string {
  const { rows, summary } = d;
  const when = seasonDisplay(d.league.code, d.season.start_year);
  if (rows.length < 2) return '';
  const [first, second] = rows;
  const gap = first.points - second.points;
  const parts: string[] = [];

  if (summary.is_final) {
    const margin = gap > 0 ? `, ${gap} ${gap === 1 ? 'point' : 'points'} ahead of ${second.team_name}` : `, level on points with ${second.team_name}`;
    parts.push(`${first.team_name} won the ${when} ${d.eraName} with ${first.points} points${margin}.`);
    if (summary.curtailed) parts.push('The season was curtailed; the final table was decided on points per game.');
    const promoted = rows.filter((r) => r.promoted).map((r) => r.team_name);
    const relegated = rows.filter((r) => r.relegated).map((r) => r.team_name);
    if (isEnglish(d.league)) {
      if (promoted.length) parts.push(`${listNames(promoted)} ${promoted.length === 1 ? 'was' : 'were'} promoted.`);
      if (relegated.length) parts.push(`${listNames(relegated)} ${relegated.length === 1 ? 'was' : 'were'} relegated.`);
    } else if (relegated.length) {
      parts.push(`${listNames(relegated)} ${relegated.length === 1 ? 'was' : 'were'} not in the ${d.eraName} the next season.`);
    }
  } else {
    const played = modePlayed(rows);
    const lead = gap > 0 ? `, ${gap} ${gap === 1 ? 'point' : 'points'} clear of ${second.team_name}` : `, level with ${second.team_name}`;
    parts.push(`${first.team_name} top the ${when} ${d.eraName} on ${first.points} points after ${played} ${played === 1 ? 'match' : 'matches'}${lead}.`);
  }

  if (summary.goals_per_game != null && summary.matches > 0) {
    parts.push(
      `${summary.goals_per_game.toFixed(2)} goals per game over ${summary.matches} matches; home sides won ${pct(summary.home_win_share)} and ${pct(summary.draw_share)} were drawn.`
    );
  }
  return parts.join(' ');
}

/** The league's history in two sentences. */
export function leagueIndexSentence(d: LeagueIndexData): string {
  const done = d.seasons.filter((s) => s.is_final && s.leader);
  if (done.length === 0) return '';
  const wins = new Map<string, number>();
  for (const s of done) wins.set(s.leader!.team_name, (wins.get(s.leader!.team_name) ?? 0) + 1);
  const most = Math.max(...wins.values());
  const top = [...wins].filter(([, n]) => n === most).map(([t]) => t);
  const oldest = Math.min(...d.seasons.map((s) => s.start_year));
  const latest = done.reduce((a, b) => (b.start_year > a.start_year ? b : a));
  const titles = `${most} ${most === 1 ? 'title' : 'titles'}${top.length > 1 ? ' each' : ''}`;
  return (
    `${d.seasons.length} ${d.league.name} seasons on file since ${seasonDisplay(d.league.code, oldest)}. ` +
    `Most titles: ${listNames(top)} (${titles}). ` +
    `Latest champions: ${latest.leader!.team_name} in ${seasonDisplay(d.league.code, latest.start_year)}, with ${latest.leader!.points} points.`
  );
}

/** Where this season ranks in its league's history, as short sentences --
 * only when it is among the three highest or lowest, so every line is notable.
 * Points comparisons only against complete seasons with the same number of
 * clubs; goals per game against every complete season. */
export function seasonRanks(d: Pick<LeagueSeasonData, 'league' | 'summary' | 'seasons'>): string[] {
  const s = d.summary;
  const out: string[] = [];
  const complete = d.seasons.filter((x) => x.is_final && !x.curtailed);
  const inList = complete.some((x) => x.season_id === s.season_id);
  if (!inList) return out;
  const nth = (n: number) => {
    const v = n % 100;
    return `${n}${['th', 'st', 'nd', 'rd'][(v - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][v] ?? 'th'}`;
  };
  /** "the highest of 31", "2nd lowest of 31", "joint highest of 31" -- or
   * null unless the value is among the three highest or lowest and shared
   * by at most two other seasons. */
  const notable = (vals: SeasonSummary[], key: keyof SeasonSummary, onlyHigh = false): string | null => {
    const v = s[key] as number | null;
    if (v == null) return null;
    const all = vals.map((x) => x[key]).filter((x): x is number => typeof x === 'number');
    if (all.length < 3) return null;
    const ties = all.filter((x) => x === v).length - 1;
    if (ties > 2) return null;
    const hi = all.filter((x) => x > v).length + 1;
    const lo = all.filter((x) => x < v).length + 1;
    const useHigh = onlyHigh || hi <= lo;
    const rank = useHigh ? hi : lo;
    if (rank > 3) return null;
    const word = useHigh ? 'highest' : 'lowest';
    const joint = ties > 0 ? 'joint ' : '';
    return rank === 1 ? `the ${joint}${word} of ${all.length}` : `${joint}${nth(rank)} ${word} of ${all.length}`;
  };
  const g = notable(complete, 'goals_per_game');
  if (g && s.goals_per_game != null) out.push(`${s.goals_per_game.toFixed(2)} goals per game: ${g} complete ${d.league.name} seasons on file.`);
  const same = complete.filter((x) => x.comparable_group === s.comparable_group && !x.split_format);
  if (!s.split_format) {
    const c = notable(same, 'champion_points');
    if (c && s.champion_points != null) out.push(`Champions’ ${s.champion_points} points: ${c} seasons with ${s.clubs} clubs.`);
    if (isEnglish(d.league) && s.highest_relegated_points != null) {
      const r = notable(same, 'highest_relegated_points', true);
      if (r) out.push(`A relegated club had ${s.highest_relegated_points} points: ${r} seasons with ${s.clubs} clubs for a relegated side.`);
    }
  }
  return out;
}

export type FingerprintItem = { label: string; value: string; average: string | null; note?: string };

/** Season fingerprint against the league's own complete seasons (same size
 * for points thresholds). The current and curtailed seasons are left out of
 * the averages. */
export function seasonFingerprint(summary: SeasonSummary, seasons: SeasonSummary[]): FingerprintItem[] {
  const complete = seasons.filter((s) => s.is_final && !s.curtailed && s.season_id !== summary.season_id);
  const sameSize = complete.filter((s) => s.comparable_group === summary.comparable_group);
  const mean = (xs: SeasonSummary[], k: keyof SeasonSummary): number | null => {
    const v = xs.map((s) => s[k]).filter((x): x is number => typeof x === 'number');
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const avg = (xs: SeasonSummary[], k: keyof SeasonSummary, fmt: (v: number | null) => string) => {
    const m = mean(xs, k);
    return m == null ? null : fmt(m);
  };
  const items: FingerprintItem[] = [
    { label: 'Goals per game', value: f2(summary.goals_per_game), average: avg(complete, 'goals_per_game', f2) },
    { label: 'Home wins', value: pct(summary.home_win_share), average: avg(complete, 'home_win_share', pct) },
    { label: 'Draws', value: pct(summary.draw_share), average: avg(complete, 'draw_share', pct) },
    { label: 'Away wins', value: pct(summary.away_win_share), average: avg(complete, 'away_win_share', pct) },
    { label: 'Goalless draws', value: pct(summary.goalless_share), average: avg(complete, 'goalless_share', pct) },
    {
      label: 'Home advantage',
      value: summary.home_ppg_advantage == null ? '–' : `${f2(summary.home_ppg_advantage)} pts/game`,
      average: avg(complete, 'home_ppg_advantage', (v) => `${f2(v)} pts/game`),
      note: 'Home minus away points per game',
    },
  ];
  if (summary.is_final && !summary.split_format) {
    const pts = (v: number | null) => (v == null ? '–' : String(Math.round(v)));
    items.push(
      { label: 'Champions’ points', value: pts(summary.champion_points), average: avg(sameSize, 'champion_points', pts) },
      { label: 'Most points relegated', value: pts(summary.highest_relegated_points), average: avg(sameSize, 'highest_relegated_points', pts) },
      { label: 'Fewest points safe', value: pts(summary.lowest_safe_points), average: avg(sameSize, 'lowest_safe_points', pts) }
    );
  }
  return items;
}

// ---------------------------------------------------------------------------
// Loaders (browser). The static generator builds the same shapes in bulk.
// ---------------------------------------------------------------------------

const SUMMARY_COLUMNS =
  'league_id, season_id, start_year, clubs, games_in_season, comparable_group, is_final, curtailed, split_format, covid_affected, matches, goals_per_game, home_win_share, draw_share, away_win_share, goalless_share, home_ppg_advantage, champion_points, highest_relegated_points, lowest_safe_points, noll_scully';

export const TABLE_COLUMNS =
  'league_id, season_id, team_id, position, played, won, drawn, lost, goals_for, goals_against, goal_difference, deduction, points, split_group, champion, relegated, promoted';

type LeagueRow = { league_id: number; code: string; name: string; slug: string; countries: { name: string } | null };

export async function leagueBySlug(slug: string): Promise<LeagueRef | null> {
  const { data, error } = await supabase
    .from('leagues')
    .select('league_id, code, name, slug, countries(name)')
    .eq('slug', slug)
    .eq('competition_type', 'league')
    .maybeSingle();
  if (error) throw error;
  const r = data as unknown as LeagueRow | null;
  return r ? { league_id: r.league_id, code: r.code, name: r.name, slug: r.slug, country: r.countries?.name ?? null } : null;
}

export async function leagueSummaries(leagueId: number): Promise<SeasonSummary[]> {
  const { data, error } = await supabase
    .from('league_season_summary' as never)
    .select(SUMMARY_COLUMNS)
    .eq('league_id', leagueId)
    .order('start_year');
  if (error) throw error;
  return (data ?? []) as unknown as SeasonSummary[];
}

export async function eraNames(leagueId: number): Promise<Map<number, string>> {
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => { select: (c: string) => { eq: (k: string, v: number) => PromiseLike<{ data: { season_id: number; name: string }[] | null; error: unknown }> } };
  })
    .from('league_season_display_names')
    .select('season_id, name')
    .eq('league_id', leagueId);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [Number(r.season_id), String(r.name)]));
}

export async function teamNames(ids: number[]): Promise<Map<number, { name: string; slug: string | null }>> {
  const out = new Map<number, { name: string; slug: string | null }>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase.from('teams').select('team_id, display_name, slug').in('team_id', [...new Set(ids)]);
  if (error) throw error;
  for (const t of (data ?? []) as { team_id: number; display_name: string; slug: string | null }[]) out.set(t.team_id, { name: t.display_name, slug: t.slug });
  return out;
}

type RawTableRow = Omit<SeasonTableRow, 'team_name' | 'team_slug'> & { league_id: number; season_id: number };

function nameRows(rows: RawTableRow[], names: Map<number, { name: string; slug: string | null }>): SeasonTableRow[] {
  return rows.map((r) => ({
    position: r.position, team_id: r.team_id, played: r.played, won: r.won, drawn: r.drawn, lost: r.lost,
    goals_for: r.goals_for, goals_against: r.goals_against, goal_difference: r.goal_difference, deduction: r.deduction,
    points: r.points, split_group: r.split_group, champion: r.champion, relegated: r.relegated, promoted: r.promoted,
    team_name: names.get(r.team_id)?.name ?? 'Unknown', team_slug: names.get(r.team_id)?.slug ?? null,
  }));
}

/** null when the league or season does not exist. */
export async function loadLeagueSeason(leagueSlug: string, startYear: number): Promise<LeagueSeasonData | null> {
  const league = await leagueBySlug(leagueSlug);
  if (!league) return null;
  const [seasons, names] = await Promise.all([leagueSummaries(league.league_id), eraNames(league.league_id)]);
  const summary = seasons.find((s) => s.start_year === startYear);
  if (!summary) return null;
  const { data, error } = await supabase
    .from('team_season_summary' as never)
    .select(TABLE_COLUMNS)
    .eq('league_id', league.league_id)
    .eq('season_id', summary.season_id)
    .order('position');
  if (error) throw error;
  const raw = (data ?? []) as unknown as RawTableRow[];
  const teamMap = await teamNames(raw.map((r) => r.team_id));
  return {
    league,
    season: { season_id: summary.season_id, start_year: startYear },
    eraName: names.get(summary.season_id) ?? league.name,
    rows: nameRows(raw, teamMap),
    summary,
    seasons,
  };
}

export async function loadLeagueIndex(leagueSlug: string): Promise<LeagueIndexData | null> {
  const league = await leagueBySlug(leagueSlug);
  if (!league) return null;
  const [seasons, names, notable] = await Promise.all([
    leagueSummaries(league.league_id),
    eraNames(league.league_id),
    supabase
      .from('team_season_summary' as never)
      .select(TABLE_COLUMNS)
      .eq('league_id', league.league_id)
      .or('position.eq.1,relegated.eq.true,promoted.eq.true')
      .limit(1000)
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as unknown as RawTableRow[];
      }),
  ]);
  const teamMap = await teamNames(notable.map((r) => r.team_id));
  return { league, seasons: buildLeagueIndexSeasons(seasons, names, notable, teamMap, league.name) };
}

/** Shared with the static generator. */
export function buildLeagueIndexSeasons(
  seasons: SeasonSummary[],
  names: Map<number, string>,
  notable: RawTableRow[],
  teamMap: Map<number, { name: string; slug: string | null }>,
  fallbackName: string
): LeagueIndexSeason[] {
  const bySeason = new Map<number, RawTableRow[]>();
  for (const r of notable) bySeason.set(r.season_id, [...(bySeason.get(r.season_id) ?? []), r]);
  const name = (id: number) => teamMap.get(id)?.name ?? 'Unknown';
  return seasons
    .map((s) => {
      const rows = (bySeason.get(s.season_id) ?? []).sort((a, b) => a.position - b.position);
      const top = rows.find((r) => r.position === 1);
      return {
        ...s,
        eraName: names.get(s.season_id) ?? fallbackName,
        leader: top ? { team_name: name(top.team_id), team_slug: teamMap.get(top.team_id)?.slug ?? null, points: top.points } : null,
        relegated: rows.filter((r) => r.relegated).map((r) => name(r.team_id)),
        promoted: rows.filter((r) => r.promoted).map((r) => name(r.team_id)),
      };
    })
    .sort((a, b) => b.start_year - a.start_year);
}

export async function loadLeaguesList(): Promise<LeaguesListEntry[]> {
  const [{ data: leagues, error: e1 }, { data: sums, error: e2 }] = await Promise.all([
    supabase.from('leagues').select('league_id, code, name, slug, countries(name)').eq('competition_type', 'league'),
    supabase.from('league_season_summary' as never).select('league_id, start_year').limit(2000),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return buildLeaguesList((leagues ?? []) as unknown as LeagueRow[], (sums ?? []) as unknown as { league_id: number; start_year: number }[]);
}

export function buildLeaguesList(leagues: LeagueRow[], sums: { league_id: number; start_year: number }[]): LeaguesListEntry[] {
  const out: LeaguesListEntry[] = [];
  for (const l of leagues) {
    const years = sums.filter((s) => s.league_id === l.league_id).map((s) => s.start_year);
    if (!years.length || !l.slug) continue;
    out.push({ league_id: l.league_id, code: l.code, name: l.name, slug: l.slug, country: l.countries?.name ?? null, seasons: years.length, from: Math.min(...years), to: Math.max(...years) });
  }
  return out.sort((a, b) => a.league_id - b.league_id);
}

export type { LeagueRow, RawTableRow };

export const SUMMARY_SELECT = SUMMARY_COLUMNS;

export type LeaguePagesRaw = {
  leagues: LeagueRow[];
  summaries: SeasonSummary[];
  tables: RawTableRow[];
  eraNames: { league_id: number; season_id: number; name: string }[];
  teams: { team_id: number; display_name: string; slug: string | null }[];
};

/** Every league, league index and league-season page from bulk rows (the
 * static generator's four queries), in the same shapes the loaders return. */
export function assembleLeaguePages(raw: LeaguePagesRaw): {
  list: LeaguesListEntry[];
  leagues: { index: LeagueIndexData; seasons: LeagueSeasonData[] }[];
} {
  const list = buildLeaguesList(raw.leagues, raw.summaries);
  const teamMap = new Map(raw.teams.map((t) => [t.team_id, { name: t.display_name, slug: t.slug }]));
  const out: { index: LeagueIndexData; seasons: LeagueSeasonData[] }[] = [];
  for (const entry of list) {
    const league: LeagueRef = { league_id: entry.league_id, code: entry.code, name: entry.name, slug: entry.slug, country: entry.country };
    const seasons = raw.summaries.filter((s) => s.league_id === league.league_id).sort((a, b) => a.start_year - b.start_year);
    const names = new Map(raw.eraNames.filter((n) => n.league_id === league.league_id).map((n) => [Number(n.season_id), n.name]));
    const tables = raw.tables.filter((r) => r.league_id === league.league_id);
    const notable = tables.filter((r) => r.position === 1 || r.relegated === true || r.promoted === true);
    const index: LeagueIndexData = { league, seasons: buildLeagueIndexSeasons(seasons, names, notable, teamMap, league.name) };
    const seasonPages = seasons.map((summary) => ({
      league,
      season: { season_id: summary.season_id, start_year: summary.start_year },
      eraName: names.get(summary.season_id) ?? league.name,
      rows: nameRows(tables.filter((r) => r.season_id === summary.season_id).sort((a, b) => a.position - b.position), teamMap),
      summary,
      seasons,
    }));
    out.push({ index, seasons: seasonPages });
  }
  return { list, leagues: out };
}
