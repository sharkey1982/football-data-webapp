// ============================================================================
// src/lib/divisionEras.ts
//
// A division's names over a run of seasons, from per-season rows that carry
// the name in that season (league_name_for_season() in SQL). Pages that pool
// several seasons into one row show today's name and list the earlier ones
// with their seasons: "Championship" with "First Division 1992/93-2003/04".
// ============================================================================

import { compareSeasonLabels, seasonNameFromLabel } from './seasonLabels';

export type NamedSeason = { season_label: string; league_name: string };

export type NameSpan = { name: string; from: string; to: string };

/** Consecutive seasons under the same name, oldest first. */
export function nameSpans(rows: NamedSeason[]): NameSpan[] {
  const sorted = [...rows].sort((a, b) => compareSeasonLabels(a.season_label, b.season_label));
  const spans: NameSpan[] = [];
  for (const r of sorted) {
    const last = spans[spans.length - 1];
    if (last && last.name === r.league_name) last.to = r.season_label;
    else spans.push({ name: r.league_name, from: r.season_label, to: r.season_label });
  }
  return spans;
}

/** '1992/93' for one season, '1992/93–2003/04' for a run. */
export function seasonRange(from: string, to: string): string {
  return from === to ? seasonNameFromLabel(from) : `${seasonNameFromLabel(from)}–${seasonNameFromLabel(to)}`;
}

/** The name in the latest season, and the earlier names with their seasons
 * (null when the division kept one name throughout). */
export function currentAndEarlierNames(rows: NamedSeason[]): { name: string; earlier: string | null } {
  const spans = nameSpans(rows);
  if (spans.length === 0) return { name: '', earlier: null };
  const current = spans[spans.length - 1];
  const earlier = spans.slice(0, -1);
  return {
    name: current.name,
    earlier: earlier.length ? earlier.map((s) => `${s.name} ${seasonRange(s.from, s.to)}`).join(', ') : null,
  };
}
