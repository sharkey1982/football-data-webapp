// ============================================================================
// src/lib/seasonLabels.ts
//
// Season labels are two-digit start + end years: '2627' = 2026/27, '9293'
// = 1992/93, '0001' = 2000/01. Two things go wrong without this module now
// that seasons go back to 1992/93:
//   - '20' + label gives '2092/93' for 1992/93;
//   - labels sort as text, so '9293' lands after '2627'.
// season_id is no use either: historic seasons have ids 14+, after
// 2026/27 = 13. Order seasons by start year (seasons.start_year, or
// labelStartYear here when only the label is to hand).
// ============================================================================

/** '2627' -> 2026, '9293' -> 1992, '0001' -> 2000. Null for anything that
 * isn't a four-digit label. Two-digit years 50-99 are the 1900s. */
export function labelStartYear(label: string): number | null {
  if (!/^\d{4}$/.test(label)) return null;
  const yy = Number(label.slice(0, 2));
  return yy >= 50 ? 1900 + yy : 2000 + yy;
}

/** '2526' -> '2025/26', '9293' -> '1992/93'. Anything else is returned as is. */
export function seasonNameFromLabel(label: string): string {
  const start = labelStartYear(label);
  return start === null ? label : `${start}/${label.slice(2)}`;
}

/** Oldest first. Labels that aren't seasons sort last, as text. */
export function compareSeasonLabels(a: string, b: string): number {
  const ya = labelStartYear(a);
  const yb = labelStartYear(b);
  if (ya !== null && yb !== null) return ya - yb;
  if (ya !== null) return -1;
  if (yb !== null) return 1;
  return a.localeCompare(b);
}
