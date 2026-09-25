import { describe, it, expect } from 'vitest';
import { buildTeamGroups, filterTeamGroups } from '../lib/teamGroups';

const fx = (leagueCode: string, leagueName: string, countryName: string, competitionType: string, h: [string, string], a: [string, string], leagueTier: number | null = 1) => ({
  leagueCode, leagueName, countryName, competitionType, leagueTier,
  homeTeamName: h[0], homeTeamCountry: h[1], awayTeamName: a[0], awayTeamCountry: a[1],
});

describe('team groups', () => {
  const fixtures = [
    fx('UCL', 'UEFA Champions League', 'Europe', 'cup', ['Arsenal', 'England'], ['Sabah', 'Azerbaijan'], null),
    fx('E0', 'Premier League', 'England', 'league', ['Arsenal', 'England'], ['Leeds', 'England'], null),
    fx('E1', 'Championship', 'England', 'league', ['Charlton', 'England'], ['Bristol City', 'England'], null),
    fx('D1', 'Bundesliga', 'Germany', 'league', ['FC Bayern München', 'Germany'], ['Borussia Dortmund', 'Germany']),
    fx('SC0', 'Scottish Premiership', 'Scotland', 'league', ['Celtic', 'Scotland'], ['Hearts', 'Scotland']),
    fx('UEL', 'UEFA Europa League', 'Europe', 'cup', ['Bodø/Glimt', 'Norway'], ['Celtic', 'Scotland'], null),
  ];

  it('groups by country and division: England top-down, Scotland, then A-Z, European-only clubs last', () => {
    expect(buildTeamGroups(fixtures).map((g) => g.label)).toEqual([
      'England · Premier League',
      'England · Championship',
      'Scotland · Scottish Premiership',
      'Germany · Bundesliga',
      'Azerbaijan · European competition',
      'Norway · European competition',
    ]);
  });

  it('places a club with European ties in its domestic group, once', () => {
    const groups = buildTeamGroups(fixtures);
    const all = groups.flatMap((g) => g.teams);
    expect(all.filter((t) => t === 'Arsenal')).toHaveLength(1);
    expect(groups.find((g) => g.label === 'England · Premier League')!.teams).toEqual(['Arsenal', 'Leeds']);
  });

  it('search is case- and accent-insensitive, and a division name lists its clubs', () => {
    const groups = buildTeamGroups(fixtures);
    expect(filterTeamGroups(groups, 'munchen').flatMap((g) => g.teams)).toEqual(['FC Bayern München']);
    expect(filterTeamGroups(groups, 'bodo').flatMap((g) => g.teams)).toEqual(['Bodø/Glimt']);
    expect(filterTeamGroups(groups, 'championship').flatMap((g) => g.teams)).toEqual(['Bristol City', 'Charlton']);
    expect(filterTeamGroups(groups, 'zzz')).toEqual([]);
    expect(filterTeamGroups(groups, 'munchen')[0].wholeGroup).toBe(false);
    expect(filterTeamGroups(groups, 'bundes')[0].wholeGroup).toBe(true);
    // "man" is inside "Germany" but that must not list every German club.
    expect(filterTeamGroups(groups, 'man').flatMap((g) => g.teams)).toEqual([]);
    expect(filterTeamGroups(groups, 'germ').flatMap((g) => g.teams)).toEqual(['Borussia Dortmund', 'FC Bayern München']);
  });
});
