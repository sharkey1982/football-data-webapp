// ============================================================================
// src/lib/teamGroups.ts
//
// Groups the clubs in the Watch Guide for the team picker: by country and
// domestic division ("England · Championship"), so a long list becomes
// scannable. A club's group comes from a domestic league fixture it has in
// the guide; clubs that only appear in European fixtures (e.g. Sabah) fall
// back to their country. Grouping only affects the picker -- choosing a
// team still shows every fixture it plays, European ties included.
// ============================================================================

export type TeamGroup = { label: string; teams: string[] };

type FixtureLike = {
  leagueCode: string;
  leagueName: string;
  countryName: string;
  competitionType: string;
  leagueTier: number | null;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamCountry: string | null;
  awayTeamCountry: string | null;
};

// England's divisions have no tier set in the database, so order by code.
const ENGLISH_ORDER: Record<string, number> = { E0: 1, E1: 2, E2: 3, E3: 4, EC: 5 };

type Placement = { label: string; country: string; rank: number; domestic: boolean };

export function buildTeamGroups(fixtures: FixtureLike[]): TeamGroup[] {
  const placement = new Map<string, Placement>();
  const fallbackCountry = new Map<string, string>();

  for (const f of fixtures) {
    const sides: [string, string | null][] = [
      [f.homeTeamName, f.homeTeamCountry],
      [f.awayTeamName, f.awayTeamCountry],
    ];
    for (const [team, country] of sides) {
      if (country && !fallbackCountry.has(team)) fallbackCountry.set(team, country);
      if (f.competitionType !== 'league') continue;
      const rank = ENGLISH_ORDER[f.leagueCode] ?? f.leagueTier ?? 9;
      const current = placement.get(team);
      // A club in two domestic competitions sits in its highest division.
      if (!current || rank < current.rank) {
        placement.set(team, { label: `${f.countryName} \u00b7 ${f.leagueName}`, country: f.countryName, rank, domestic: true });
      }
    }
  }
  for (const [team, country] of fallbackCountry) {
    if (!placement.has(team)) placement.set(team, { label: country, country, rank: 99, domestic: false });
  }

  const groups = new Map<string, { p: Placement; teams: string[] }>();
  for (const [team, p] of placement) {
    const g = groups.get(p.label) ?? { p, teams: [] };
    g.teams.push(team);
    groups.set(p.label, g);
  }

  // UK site: England first, then Scotland, then everyone else A-Z; within a
  // country, divisions top-down; clubs with no domestic group last.
  const countryRank = (c: string) => (c === 'England' ? 0 : c === 'Scotland' ? 1 : 2);
  return [...groups.values()]
    .sort(
      (a, b) =>
        Number(a.p.domestic === false) - Number(b.p.domestic === false) ||
        countryRank(a.p.country) - countryRank(b.p.country) ||
        a.p.country.localeCompare(b.p.country) ||
        a.p.rank - b.p.rank ||
        a.p.label.localeCompare(b.p.label)
    )
    .map(({ p, teams }) => ({ label: p.domestic ? p.label : `${p.label} \u00b7 European competition`, teams: teams.sort((x, y) => x.localeCompare(y)) }));
}

/** Case- and accent-insensitive match ("Bodo" finds "Bodø/Glimt", "munchen" finds "München"). */
export function normaliseForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/gi, 'o')
    .replace(/ß/g, 'ss')
    .toLowerCase();
}

/** Groups filtered by a search: a club matches on its own name, or every
 * club in a group matches if the group label does ("Bundesliga"). */
export function filterTeamGroups(groups: TeamGroup[], query: string): TeamGroup[] {
  const q = normaliseForSearch(query.trim());
  if (!q) return groups;
  // Group labels match from the start of a word only ("bund", "champ"),
  // otherwise "man" would pull in every club under "Germany".
  const labelMatches = (label: string) => normaliseForSearch(label).split(/[^a-z0-9]+/).some((w) => w.startsWith(q));
  return groups
    .map((g) => (labelMatches(g.label) ? g : { ...g, teams: g.teams.filter((t) => normaliseForSearch(t).includes(q)) }))
    .filter((g) => g.teams.length > 0);
}
