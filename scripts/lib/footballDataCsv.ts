// ============================================================================
// scripts/lib/footballDataCsv.ts
//
// football-data.co.uk publishes two CSV layouts:
//
//   * "main" leagues (E0, SP1, SC0 ...): one file per league per season at
//     /mmz4281/<label>/<code>.csv, columns HomeTeam/AwayTeam/FTHG/FTAG/FTR
//     plus half-time and match stats.
//   * "extra" leagues (AUT, DNK, NOR, POL, ROU, SWE, SWZ, FIN ...): one file
//     per country covering EVERY season at /new/<code>.csv, columns
//     Country/League/Season/Date/Time/Home/Away/HG/AG/Res and no stats.
//
// This module turns either layout into the main-layout row shape the
// importer already understands, keeping only rows for the season being
// imported, so import-daily.ts needs no second code path.
//
// Season mapping (Chris, 2026-09-25): no calendar-year seasons are added to
// `seasons`. A calendar-year league's season N is stored under the split
// season that starts in N -- Norway 2026 -> 2026/27 (label 2627).
//
// Play-offs: extra files also carry promotion/relegation play-offs against
// lower-division clubs (e.g. Romania 2025/26: Chindia and Voluntari, two
// games each). Those aren't league games, so a row is excluded when either
// side has played under a quarter of the season's median games. Early in a
// season every club has played about the same number, so nothing is lost;
// by the play-offs the median is ~30+ and a 2-game visitor falls out. This
// works even when the play-off club is promoted and so has an alias.
//
// Calendar-year rollover: the daily import's season label only moves each
// summer, but Norway/Sweden/Finland start their next season in spring. So a
// run for label 2627 also picks up calendar year 2027 rows, routed to label
// 2728 -- otherwise those leagues would go months without results.
// ============================================================================

export type CsvRow = Record<string, string>;
export type CsvFormat = 'main' | 'extra';
export type SelectedRow = { row: CsvRow; seasonLabel: string };
export type ExcludedRow = SelectedRow & { reason: string };

export function detectFormat(rows: CsvRow[]): CsvFormat {
  const first = rows[0];
  if (!first) return 'main';
  if ('HomeTeam' in first) return 'main';
  if ('Home' in first && 'Season' in first) return 'extra';
  throw new Error(`Unrecognised football-data.co.uk CSV layout (headers: ${Object.keys(first).join(', ')})`);
}

/** Import URL for a league code: 3-letter country codes are the extra files. */
export function csvUrlFor(leagueCode: string, seasonLabel: string): string {
  return /^[A-Z]{3}$/.test(leagueCode)
    ? `https://football-data.co.uk/new/${leagueCode}.csv`
    : `https://football-data.co.uk/mmz4281/${seasonLabel}/${leagueCode}.csv`;
}

/** '2627' -> { startYear: 2026, split: '2026/2027' } */
export function parseSeasonLabel(label: string): { startYear: number; split: string } {
  if (!/^\d{4}$/.test(label)) throw new Error(`Season label must be four digits like 2627, got "${label}"`);
  const startYear = 2000 + Number(label.slice(0, 2));
  return { startYear, split: `${startYear}/${startYear + 1}` };
}

/** 2026 -> '2627' */
export function labelForStartYear(startYear: number): string {
  const yy = (n: number) => String(n % 100).padStart(2, '0');
  return `${yy(startYear)}${yy(startYear + 1)}`;
}

function toMainShape(row: CsvRow): CsvRow {
  return {
    Date: row['Date'] ?? '',
    Time: row['Time'] ?? '',
    HomeTeam: row['Home'] ?? '',
    AwayTeam: row['Away'] ?? '',
    FTHG: row['HG'] ?? '',
    FTAG: row['AG'] ?? '',
    FTR: row['Res'] ?? '',
  };
}

/**
 * Rows to import for `seasonLabel`, each tagged with the season label it
 * belongs under. Main files are single-season already, so every row goes to
 * `seasonLabel`. Extra files keep only the matching season: '2026/2027' for
 * split-year leagues, or calendar year 2026 (plus 2027, see rollover note).
 */
export function selectRows(
  rows: CsvRow[],
  seasonLabel: string
): { format: CsvFormat; selected: SelectedRow[]; excluded: ExcludedRow[] } {
  const format = detectFormat(rows);
  if (format === 'main') return { format, selected: rows.map((row) => ({ row, seasonLabel })), excluded: [] };

  const { startYear, split } = parseSeasonLabel(seasonLabel);
  const nextYear = String(startYear + 1);
  const selected: SelectedRow[] = [];
  for (const row of rows) {
    const s = (row['Season'] ?? '').trim();
    if (s === split || s === String(startYear)) selected.push({ row: toMainShape(row), seasonLabel });
    else if (s === nextYear) selected.push({ row: toMainShape(row), seasonLabel: labelForStartYear(startYear + 1) });
  }
  return excludeOccasionalClubs(format, selected);
}

function excludeOccasionalClubs(format: CsvFormat, candidates: SelectedRow[]) {
  const games = new Map<string, Map<string, number>>(); // season -> club -> games
  for (const { row, seasonLabel } of candidates) {
    const bySeason = games.get(seasonLabel) ?? new Map<string, number>();
    for (const club of [row.HomeTeam, row.AwayTeam]) bySeason.set(club, (bySeason.get(club) ?? 0) + 1);
    games.set(seasonLabel, bySeason);
  }
  const minGames = new Map<string, number>();
  for (const [label, byClub] of games) {
    const counts = [...byClub.values()].sort((a, b) => a - b);
    const median = counts[Math.floor(counts.length / 2)];
    minGames.set(label, Math.max(1, Math.floor(median / 4)));
  }
  const selected: SelectedRow[] = [];
  const excluded: ExcludedRow[] = [];
  for (const c of candidates) {
    const byClub = games.get(c.seasonLabel)!;
    const min = minGames.get(c.seasonLabel)!;
    const occasional = [c.row.HomeTeam, c.row.AwayTeam].filter((club) => byClub.get(club)! < min);
    if (occasional.length > 0) excluded.push({ ...c, reason: `${occasional.join(', ')} played under a quarter of the season's median games -- a play-off, or a renamed club needing a team_aliases row` });
    else selected.push(c);
  }
  return { format, selected, excluded };
}
