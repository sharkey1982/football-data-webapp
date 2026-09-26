// ============================================================================
// scripts/lib/rawArchive.ts
//
// Which rows of a football-data.co.uk file still need archiving in
// source_match_rows. The daily import downloads the whole season file every
// day; storing a full copy each time the file changes would add thousands of
// near-identical rows a week. Only rows that are new, or whose content
// differs from the latest archived copy, are kept. Row keys match the
// backfill-football-raw edge function (`<code>|<Date>|<HomeTeam>|<AwayTeam>`)
// so rows archived by either path are recognised by both.
//
// backfill_match_odds() reads these rows to fill match_odds, so a result
// imported without its raw row never gets bookmaker odds.
// ============================================================================

export type RawRow = Record<string, string>;

export function rawRowKey(leagueCode: string, row: RawRow): string {
  return `${leagueCode}|${row.Date ?? ''}|${row.HomeTeam ?? ''}|${row.AwayTeam ?? ''}`;
}

/** Same values for the same keys, ignoring key order and surrounding space. */
export function sameRawRow(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const norm = (r: Record<string, unknown>) =>
    JSON.stringify(
      Object.entries(r)
        .map(([k, v]) => [k.trim(), String(v ?? '').trim()])
        .filter(([k, v]) => k !== '' && v !== '')
        .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    );
  return norm(a) === norm(b);
}

/**
 * Rows to archive, with their 1-based position in the file. `latest` maps a
 * row key to the most recently archived raw_data for it.
 */
export function rowsToArchive(
  leagueCode: string,
  rows: RawRow[],
  latest: Map<string, Record<string, unknown>>
): { row: RawRow; key: string; rowNumber: number }[] {
  const out: { row: RawRow; key: string; rowNumber: number }[] = [];
  rows.forEach((row, i) => {
    if (!row.Date || !row.HomeTeam || !row.AwayTeam) return;
    const key = rawRowKey(leagueCode, row);
    const prev = latest.get(key);
    if (!prev || !sameRawRow(prev, row)) out.push({ row, key, rowNumber: i + 1 });
  });
  return out;
}
