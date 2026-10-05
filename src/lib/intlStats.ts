// ============================================================================
// src/lib/intlStats.ts
//
// International football (Oct 2026): pure helpers behind the International
// pages -- names, scores, Elo expectation, group tables, knockout rounds and a
// team's tournament history. Data comes from the intl_* views (see
// src/lib/intlApi.ts and scripts/intl_import.py).
// ============================================================================

export type IntlMatch = {
  match_key: string;
  match_date: string;
  home_team: string;
  home_slug: string;
  home_name: string;
  away_team: string;
  away_slug: string;
  away_name: string;
  home_score: number;
  away_score: number;
  home_score_90: number | null;
  away_score_90: number | null;
  went_extra_time: boolean | null;
  shootout_winner: string | null;
  competition: string;
  competition_slug: string;
  competition_kind: string;
  edition_key: string | null;
  stage_code: string | null;
  stage_name: string | null;
  stage_type: string | null;
  group_label: string | null;
  matchday: number | null;
  city: string | null;
  country: string | null;
  neutral: boolean;
  elo_home_pre: number | null;
  elo_away_pre: number | null;
  elo_change: number | null;
};

export type IntlFixture = {
  fixture_key: string;
  edition_key: string;
  kickoff_utc: string;
  home_team: string;
  home_slug: string;
  away_team: string;
  away_slug: string;
  group_label: string | null;
  round_number: number | null;
  venue: string | null;
  home_score: number | null;
  away_score: number | null;
  match_key: string | null;
};

export type TeamSummary = {
  team: string;
  slug: string;
  confederation: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  first_match: string;
  last_match: string;
  elo: number;
  elo_rank: number | null;
  elo_peak: number;
  elo_peak_date: string;
  wc_titles: number;
  euro_titles: number;
  unl_titles: number;
  /** Titles per competition slug (intl_competitions.slug), e.g. { "copa-america": 15 }. */
  titles: Record<string, number> | null;
};

export type EditionSummary = {
  edition_key: string;
  competition: string;
  competition_slug: string;
  label: string;
  season_start: number;
  teams: number;
  matches: number;
  goals: number;
  hosts: string[];
  winner: string | null;
  winner_slug: string | null;
  runner_up: string | null;
  runner_up_slug: string | null;
  final_key: string | null;
  first_match: string | null;
  last_match: string | null;
};

export type IntlStage = { stage_key: string; edition_key: string; code: string; name: string; type: 'round_robin' | 'knockout'; stage_order: number };
export type IntlGroup = { group_key: string; edition_key: string; stage_code: string; label: string; league: string | null; size: number; teams: string[] };
export type CompetitionTotal = { team: string; competition: string; competition_kind: string; played: number; won: number; drawn: number; lost: number; goals_for: number; goals_against: number; first_match: string; last_match: string };
export type PairRecord = { team_a: string; team_b: string; played: number; a_won: number; drawn: number; b_won: number; a_goals: number; b_goals: number; first_meeting: string; last_meeting: string };
export type IntlGoal = { match_key: string; seq: number; team: string; scorer: string | null; minute: number | null; own_goal: boolean; penalty: boolean };

/** The three competitions with tournament pages, in display order. */
export const TOURNAMENTS = [
  { competition: 'FIFA World Cup', slug: 'world-cup', short: 'World Cup', code: 'WC', confederation: 'FIFA', dbSlug: 'fifa-world-cup' },
  { competition: 'UEFA Euro', slug: 'euro', short: 'Euro', code: 'EURO', confederation: 'UEFA', dbSlug: 'uefa-euro' },
  { competition: 'Copa América', slug: 'copa-america', short: 'Copa América', code: 'COPA', confederation: 'CONMEBOL', dbSlug: 'copa-america' },
  { competition: 'African Cup of Nations', slug: 'africa-cup-of-nations', short: 'AFCON', code: 'AFCON', confederation: 'CAF', dbSlug: 'african-cup-of-nations' },
  { competition: 'AFC Asian Cup', slug: 'asian-cup', short: 'Asian Cup', code: 'ASIAN', confederation: 'AFC', dbSlug: 'afc-asian-cup' },
  { competition: 'Gold Cup', slug: 'gold-cup', short: 'Gold Cup', code: 'GOLD', confederation: 'CONCACAF', dbSlug: 'gold-cup' },
  { competition: 'UEFA Nations League', slug: 'nations-league', short: 'Nations League', code: 'UNL', confederation: 'UEFA', dbSlug: 'uefa-nations-league' },
  { competition: 'Confederations Cup', slug: 'confederations-cup', short: 'Confed Cup', code: 'CONFED', confederation: 'FIFA', dbSlug: 'confederations-cup' },
] as const;
export type Tournament = (typeof TOURNAMENTS)[number];
export type TournamentSlug = (typeof TOURNAMENTS)[number]['slug'];

export const tournamentBySlug = (slug: string) => TOURNAMENTS.find((t) => t.slug === slug) ?? null;
export const tournamentByCompetition = (competition: string) => TOURNAMENTS.find((t) => t.competition === competition) ?? null;

/** Edition label as people say it: "2026", "2024/25". */
export const editionLabel = (label: string) => label.replace(/^(\d{4})-(\d{2})$/, '$1/$2');

export const DATA_NOTE =
  'Results: martj42/international_results (CC0), men’s full internationals since 1872. Rounds and groups: openfootball (CC0). Fixtures: fixturedownload.com.';

export const CONFEDERATIONS = ['UEFA', 'CONMEBOL', 'CONCACAF', 'CAF', 'AFC', 'OFC'] as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "19 Jul 2026" from an ISO date, without time-zone shifts. */
export function shortDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** UK date (YYYY-MM-DD) and time (HH:MM) of a UTC kick-off. */
export function ukDateTime(utc: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(utc));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/** "2–1", "1–0 aet", "1–1 aet, Italy won 4–3 on penalties" (we hold the
 * shoot-out winner, not its score). */
export function scoreText(m: Pick<IntlMatch, 'home_score' | 'away_score' | 'went_extra_time' | 'shootout_winner'> & { shootout_name?: string | null }): string {
  const base = `${m.home_score}–${m.away_score}`;
  const aet = m.went_extra_time ? ' aet' : '';
  const pens = m.shootout_winner ? `, ${m.shootout_name ?? m.shootout_winner} won on penalties` : '';
  return base + aet + pens;
}

/** The winner of a game: by score, then shoot-out; null for a draw. */
export function winnerOf(m: Pick<IntlMatch, 'home_team' | 'away_team' | 'home_score' | 'away_score' | 'shootout_winner'>): string | null {
  if (m.home_score > m.away_score) return m.home_team;
  if (m.away_score > m.home_score) return m.away_team;
  return m.shootout_winner;
}

/** World Football Elo expectation for the home side (0-1: a win counts 1, a
 * draw 0.5), with 100 points for home advantage unless the ground is neutral. */
export function eloExpectation(m: Pick<IntlMatch, 'elo_home_pre' | 'elo_away_pre' | 'neutral'>): number | null {
  if (m.elo_home_pre == null || m.elo_away_pre == null) return null;
  const dr = m.elo_home_pre - m.elo_away_pre + (m.neutral ? 0 : 100);
  return 1 / (10 ** (-dr / 400) + 1);
}

/** Upset: the winner (on the day, so not a shoot-out) had an Elo expectation under 0.3. */
export const UPSET_BELOW = 0.3;
export function isUpset(m: IntlMatch): boolean {
  const e = eloExpectation(m);
  if (e == null || m.home_score === m.away_score) return false;
  return m.home_score > m.away_score ? e < UPSET_BELOW : 1 - e < UPSET_BELOW;
}

/** Points for a win in an edition: 2 until the 1994 World Cup (other tournaments: until 1995), then 3. */
export function pointsForWin(editionKey: string): number {
  const year = Number(editionKey.replace(/^[A-Z]+-/, '').slice(0, 4));
  if (editionKey.startsWith('WC-')) return year >= 1994 ? 3 : 2;
  if (editionKey.startsWith('UNL-')) return 3;
  return year >= 1995 ? 3 : 2;
}

export type TableRow = { team: string; slug: string; name: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number; through: boolean };

/** A group's table from its games. Ordered by points, goal difference, goals
 * scored (official tie-breakers vary by tournament: "through" comes from who
 * actually played in a later round, so it is right whatever the ordering). */
export function groupTable(games: IntlMatch[], editionKey: string, advanced: Set<string>, members: string[] = []): TableRow[] {
  const win = pointsForWin(editionKey);
  const rows = new Map<string, TableRow>();
  const row = (team: string, slug: string, name: string) => {
    if (!rows.has(team)) rows.set(team, { team, slug, name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, through: advanced.has(team) });
    return rows.get(team)!;
  };
  for (const m of games) {
    const h = row(m.home_team, m.home_slug, m.home_name);
    const a = row(m.away_team, m.away_slug, m.away_name);
    const hs = m.home_score_90 ?? m.home_score;
    const as = m.away_score_90 ?? m.away_score;
    h.p++; a.p++;
    h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
    if (hs > as) { h.w++; a.l++; h.pts += win; } else if (hs < as) { a.w++; h.l++; a.pts += win; } else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  for (const t of members) if (!rows.has(t)) rows.set(t, { team: t, slug: '', name: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, through: advanced.has(t) });
  return [...rows.values()].sort((x, y) => y.pts - x.pts || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || x.name.localeCompare(y.name));
}

/** Teams that played in a stage later than the given order. */
export function teamsAfter(games: IntlMatch[], stages: IntlStage[], order: number): Set<string> {
  const later = new Set(stages.filter((s) => s.stage_order > order).map((s) => s.code));
  const out = new Set<string>();
  for (const m of games) if (m.stage_code && later.has(m.stage_code)) { out.add(m.home_team); out.add(m.away_team); }
  return out;
}

/** Round reached by a team in an edition: the latest stage it played, "Winner" if it won the edition. */
export type HistoryCell = { edition_key: string; label: string; reached: string; order: number; won: boolean };

const ROUND_SHORT: Record<string, string> = {
  PRE: 'Prelim', R1: 'R1', GRP: 'Group', GPO: 'Group', GRP2: 'Round 2', FR: 'Final group', R32: 'Last 32', R16: 'Last 16',
  QF: 'QF', SF: 'SF', '3P': 'SF', F: 'Final', PO: 'Play-off', ALL: 'Played', LP: 'League', PO_AB: 'Play-off', PO_BC: 'Play-off', PO_CD: 'Play-off', PO_C: 'Play-out',
};
const ROUND_DEPTH: Record<string, number> = { PRE: 1, R1: 2, GRP: 2, LP: 2, GPO: 2, PO_AB: 3, PO_BC: 3, PO_CD: 3, PO_C: 3, GRP2: 4, R32: 3, R16: 4, QF: 5, SF: 6, '3P': 6, FR: 7, F: 7, PO: 7, ALL: 1 };

export function tournamentHistory(team: string, games: IntlMatch[], editions: EditionSummary[]): HistoryCell[] {
  const best = new Map<string, string>();
  for (const m of games) {
    if (!m.edition_key || !m.stage_code) continue;
    if (m.home_team !== team && m.away_team !== team) continue;
    const cur = best.get(m.edition_key);
    if (!cur || (ROUND_DEPTH[m.stage_code] ?? 0) > (ROUND_DEPTH[cur] ?? 0)) best.set(m.edition_key, m.stage_code);
  }
  return editions
    .filter((e) => best.has(e.edition_key))
    .map((e) => {
      const code = best.get(e.edition_key)!;
      const won = e.winner === team;
      const reached = won ? 'Winner' : e.runner_up === team || code === 'F' ? 'Runner-up' : ROUND_SHORT[code] ?? code;
      return { edition_key: e.edition_key, label: e.label, reached, order: won ? 9 : ROUND_DEPTH[code] ?? 0, won };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** The team's Elo after each game, one point per year (its last game that year). */
export function eloByYear(team: string, games: IntlMatch[]): { year: number; elo: number }[] {
  const out = new Map<number, number>();
  const sorted = [...games].sort((a, b) => a.match_date.localeCompare(b.match_date));
  for (const m of sorted) {
    if (m.elo_change == null || m.elo_home_pre == null || m.elo_away_pre == null) continue;
    const after = m.home_team === team ? m.elo_home_pre + m.elo_change : m.away_team === team ? m.elo_away_pre - m.elo_change : null;
    if (after != null) out.set(Number(m.match_date.slice(0, 4)), Math.round(after));
  }
  return [...out.entries()].map(([year, elo]) => ({ year, elo }));
}

/** W / D / L for a team in a game (a shoot-out counts as a draw). */
export function outcomeFor(team: string, m: IntlMatch): 'W' | 'D' | 'L' {
  const mine = m.home_team === team ? m.home_score : m.away_score;
  const theirs = m.home_team === team ? m.away_score : m.home_score;
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
}

/** A fixture the feed has a score for but the results file doesn't yet: a
 * reported result. Shown, and counted in provisional group tables, until the
 * results file confirms it (then the fixture carries a match_key). */
export const isReported = (f: IntlFixture) => !f.match_key && f.home_score != null && f.away_score != null;

/** A reported fixture as a game row: no Elo, flagged by competition_kind 'reported'. */
export function reportedAsMatch(f: IntlFixture): IntlMatch {
  return {
    match_key: `reported|${f.fixture_key}`, match_date: ukDateTime(f.kickoff_utc).date,
    home_team: f.home_team, home_slug: f.home_slug, home_name: f.home_team, away_team: f.away_team, away_slug: f.away_slug, away_name: f.away_team,
    home_score: f.home_score!, away_score: f.away_score!, home_score_90: f.home_score, away_score_90: f.away_score, went_extra_time: false, shootout_winner: null,
    competition: 'UEFA Nations League', competition_slug: 'uefa-nations-league', competition_kind: 'reported', edition_key: f.edition_key, stage_code: 'LP',
    stage_name: 'League phase', stage_type: 'round_robin', group_label: f.group_label, matchday: f.round_number, city: f.venue, country: null, neutral: false,
    elo_home_pre: null, elo_away_pre: null, elo_change: null,
  };
}

/** Games per UK date, for the calendar heat map. */
export function countsByDate(matches: IntlMatch[], fixtures: IntlFixture[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of matches) out[m.match_date] = (out[m.match_date] ?? 0) + 1;
  for (const f of fixtures) {
    if (f.match_key) continue; // already counted as a result
    const d = ukDateTime(f.kickoff_utc).date;
    out[d] = (out[d] ?? 0) + 1;
  }
  return out;
}

/** Competition display order on a day: the TOURNAMENTS in order, other tournaments, qualifiers, friendlies. */
export function competitionRank(competition: string, kind: string): number {
  const t = TOURNAMENTS.findIndex((x) => x.competition === competition);
  if (t >= 0) return t;
  return kind === 'tournament' ? 10 : kind === 'nations_league' ? 11 : kind === 'qualifying' ? 12 : 13;
}

/** Titles a team has won, biggest first, as "5 World Cups, 9 Copa Américas". */
export function titleList(t: Pick<TeamSummary, 'titles'>): { tournament: Tournament; n: number }[] {
  const got = t.titles ?? {};
  return TOURNAMENTS.map((tt) => ({ tournament: tt, n: got[tt.dbSlug] ?? 0 })).filter((x) => x.n > 0);
}
export const majorTitles = (t: Pick<TeamSummary, 'titles'>) => titleList(t).reduce((a, x) => a + x.n, 0);
export const titleText = (tt: Tournament, n: number) => `${n} ${tt.short}${n === 1 ? '' : tt.short.endsWith('s') ? '' : 's'}`;

/** Filter groups for a day's games. */
export const COMPETITION_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'tournaments', label: 'Tournaments' },
  { key: 'qualifying', label: 'Qualifiers' },
  { key: 'nations_league', label: 'Nations League' },
  { key: 'friendly', label: 'Friendlies' },
] as const;
export type CompetitionFilter = (typeof COMPETITION_FILTERS)[number]['key'];
export function matchesFilter(m: Pick<IntlMatch, 'competition_kind'>, f: CompetitionFilter): boolean {
  if (f === 'all') return true;
  const kind = m.competition_kind === 'reported' ? 'nations_league' : m.competition_kind;
  return f === 'tournaments' ? kind === 'tournament' : kind === f;
}

/** Cumulative titles per team by edition year, for the titles race. */
export function titlesRace(editions: EditionSummary[]): { years: number[]; series: { team: string; slug: string | null; values: (number | null)[] }[] } {
  const won = editions.filter((e) => e.winner).sort((a, b) => a.season_start - b.season_start);
  const years = [...new Set(won.map((e) => e.season_start))];
  const teams = new Map<string, { slug: string | null; byYear: Map<number, number> }>();
  for (const e of won) {
    const t = teams.get(e.winner!) ?? { slug: e.winner_slug, byYear: new Map() };
    t.byYear.set(e.season_start, (t.byYear.get(e.season_start) ?? 0) + 1);
    teams.set(e.winner!, t);
  }
  const series = [...teams.entries()].map(([team, t]) => {
    let n = 0;
    const values = years.map((y) => {
      n += t.byYear.get(y) ?? 0;
      return n > 0 ? n : null;
    });
    return { team, slug: t.slug, values };
  });
  return { years, series };
}

// ---- Knockout bracket ------------------------------------------------------------

const BRACKET_ROUNDS = ['R32', 'R16', 'QF', 'SF', 'F'] as const;

const tiePair = (m: IntlMatch) => [m.home_team, m.away_team].sort().join('|');

/** The deciding game of each tie in a round (the last game between the pair). */
function ties(games: IntlMatch[]): IntlMatch[] {
  const last = new Map<string, IntlMatch>();
  for (const m of [...games].sort((a, b) => a.match_date.localeCompare(b.match_date))) last.set(tiePair(m), m);
  return [...last.values()];
}

/** Rounds in bracket order, worked back from the final. */
export function bracketRounds(matches: IntlMatch[]): { code: string; games: IntlMatch[] }[] {
  const present = BRACKET_ROUNDS.filter((r) => matches.some((m) => m.stage_code === r));
  if (!present.includes('F') || present.length < 2) return [];
  const out: { code: string; games: IntlMatch[] }[] = [];
  let next: IntlMatch[] = ties(matches.filter((m) => m.stage_code === 'F'));
  out.unshift({ code: 'F', games: next });
  for (let i = present.length - 2; i >= 0; i--) {
    const pool = ties(matches.filter((m) => m.stage_code === present[i]));
    const used = new Set<string>();
    const ordered: IntlMatch[] = [];
    for (const g of next) {
      for (const team of [g.home_team, g.away_team]) {
        const feed = pool.find((m) => !used.has(m.match_key) && (m.home_team === team || m.away_team === team));
        if (feed) {
          used.add(feed.match_key);
          ordered.push(feed);
        }
      }
    }
    ordered.push(...pool.filter((m) => !used.has(m.match_key)));
    out.unshift({ code: present[i], games: ordered });
    next = ordered;
  }
  return out;
}

