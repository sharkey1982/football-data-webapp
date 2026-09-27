import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  assembleLeaguePages,
  leagueIndexSentence,
  leagueSeasonPath,
  parseSeasonSegment,
  seasonDisplay,
  seasonFingerprint,
  seasonPathByCode,
  seasonSegment,
  seasonStory,
  type LeaguePagesRaw,
  type SeasonSummary,
} from '../lib/leagueSeasonApi';
import LeagueSeasonPage from '../pages/football/LeagueSeasonPage';
import { renderLeagueSeasonPage, renderLeagueIndexPage } from '../entry-server';

const summary = (over: Partial<SeasonSummary>): SeasonSummary => ({
  league_id: 1, season_id: 17, start_year: 1995, clubs: 20, games_in_season: 38, comparable_group: '20x38',
  is_final: true, curtailed: false, split_format: false, covid_affected: false, matches: 380,
  goals_per_game: 2.6, home_win_share: 0.49, draw_share: 0.26, away_win_share: 0.25, goalless_share: 0.07,
  home_ppg_advantage: 0.71, champion_points: 82, highest_relegated_points: 38, lowest_safe_points: 38, noll_scully: 1.6, ...over,
});

const row = (league_id: number, season_id: number, position: number, team_id: number, points: number, over: object = {}) => ({
  league_id, season_id, team_id, position, played: 38, won: 20, drawn: 5, lost: 13, goals_for: 60, goals_against: 40,
  goal_difference: 20, deduction: 0, points, split_group: null, champion: position === 1, relegated: false, promoted: false, ...over,
});

const raw: LeaguePagesRaw = {
  leagues: [
    { league_id: 1, code: 'E0', name: 'Premier League', slug: 'premier-league', countries: { name: 'England' } },
    { league_id: 2, code: 'E1', name: 'Championship', slug: 'championship', countries: { name: 'England' } },
    { league_id: 28, code: 'SWE', name: 'Allsvenskan', slug: 'allsvenskan', countries: { name: 'Sweden' } },
    { league_id: 99, code: 'XX', name: 'No seasons', slug: 'none', countries: null },
  ],
  summaries: [
    summary({ season_id: 17, start_year: 1995 }),
    summary({ season_id: 18, start_year: 1996, goals_per_game: 2.4, champion_points: 75 }),
    summary({ season_id: 13, start_year: 2026, is_final: false, champion_points: null }),
    summary({ league_id: 2, season_id: 17, start_year: 1995, clubs: 24, comparable_group: '24x46' }),
    summary({ league_id: 28, season_id: 11, start_year: 2024, clubs: 16, comparable_group: '16x30' }),
  ],
  tables: [
    row(1, 17, 1, 5, 82),
    row(1, 17, 2, 17, 78, { champion: false }),
    row(1, 17, 18, 30, 38, { champion: false, relegated: true }),
    row(1, 17, 19, 31, 33, { champion: false, relegated: true }),
    row(1, 18, 1, 5, 75),
    row(1, 18, 2, 17, 68, { champion: false }),
    row(1, 13, 1, 17, 15, { champion: null, played: 6, relegated: null }),
    row(1, 13, 2, 5, 15, { champion: null, played: 6, relegated: null }),
    row(2, 17, 1, 40, 91),
    row(2, 17, 2, 41, 88, { champion: false, promoted: true }),
    row(2, 17, 3, 42, 80, { champion: false }),
    row(28, 11, 1, 50, 60),
    row(28, 11, 2, 51, 58, { champion: false }),
    row(28, 11, 16, 52, 20, { champion: false, relegated: true }),
  ],
  eraNames: [{ league_id: 2, season_id: 17, name: 'First Division' }],
  teams: [
    { team_id: 5, display_name: 'Manchester United', slug: 'manchester-united' },
    { team_id: 17, display_name: 'Newcastle United', slug: 'newcastle-united' },
    { team_id: 30, display_name: 'Manchester City', slug: 'manchester-city' },
    { team_id: 31, display_name: 'QPR', slug: null },
    { team_id: 40, display_name: 'Sunderland', slug: 'sunderland' },
    { team_id: 41, display_name: 'Derby County', slug: 'derby-county' },
    { team_id: 42, display_name: 'Crystal Palace', slug: 'crystal-palace' },
    { team_id: 50, display_name: 'Malmö FF', slug: 'malmo-ff' },
    { team_id: 51, display_name: 'Hammarby', slug: 'hammarby' },
    { team_id: 52, display_name: 'Kalmar', slug: 'kalmar' },
  ],
};

const built = assembleLeaguePages(raw);
const pl = built.leagues.find((l) => l.index.league.code === 'E0')!;
const pl9596 = pl.seasons.find((s) => s.season.start_year === 1995)!;

describe('season URLs and names', () => {
  it('uses 1995-96 for split-year leagues and 2024 for calendar-year leagues', () => {
    expect(seasonSegment('E0', 1995)).toBe('1995-96');
    expect(seasonDisplay('E0', 1999)).toBe('1999/00');
    expect(seasonSegment('SWE', 2024)).toBe('2024');
    expect(seasonDisplay('SWE', 2024)).toBe('2024');
    expect(leagueSeasonPath({ slug: 'premier-league', code: 'E0' }, 1995)).toBe('/football/leagues/premier-league/1995-96');
    expect(seasonPathByCode('SWE', 2024)).toBe('/football/leagues/allsvenskan/2024');
    expect(seasonPathByCode('ZZ', 2024)).toBeNull();
  });

  it('parses a segment and rejects a mismatched one', () => {
    expect(parseSeasonSegment('1995-96')).toBe(1995);
    expect(parseSeasonSegment('1999-00')).toBe(1999);
    expect(parseSeasonSegment('2024')).toBe(2024);
    expect(parseSeasonSegment('1995-97')).toBeNull();
    expect(parseSeasonSegment('latest')).toBeNull();
    expect(parseSeasonSegment(undefined)).toBeNull();
  });
});

describe('assembleLeaguePages', () => {
  it('builds every league with seasons, skipping leagues without any', () => {
    expect(built.list.map((l) => l.slug)).toEqual(['premier-league', 'championship', 'allsvenskan']);
    expect(pl.seasons).toHaveLength(3);
    expect(pl9596.rows.map((r) => r.team_name)).toEqual(['Manchester United', 'Newcastle United', 'Manchester City', 'QPR']);
  });

  it('uses the division name of the time', () => {
    const e1 = built.leagues.find((l) => l.index.league.code === 'E1')!;
    expect(e1.seasons[0].eraName).toBe('First Division');
    expect(e1.index.seasons[0].promoted).toEqual(['Derby County']);
  });
});

describe('seasonStory', () => {
  it('names the champion, the margin and who went down', () => {
    expect(seasonStory(pl9596)).toBe(
      'Manchester United won the 1995/96 Premier League with 82 points, 4 points ahead of Newcastle United. Manchester City and QPR were relegated. 2.60 goals per game over 380 matches; home sides won 49% and 26% were drawn.'
    );
  });

  it('says who leads a season in progress, and when it is level', () => {
    const live = pl.seasons.find((s) => s.season.start_year === 2026)!;
    expect(seasonStory(live)).toMatch(/^Newcastle United top the 2026\/27 Premier League on 15 points after 6 matches, level with Manchester United\./);
  });

  it('does not call a club outside England relegated: it says it was not in the league next season', () => {
    const swe = built.leagues.find((l) => l.index.league.code === 'SWE')!.seasons[0];
    expect(seasonStory(swe)).toContain('Malmö FF won the 2024 Allsvenskan with 60 points, 2 points ahead of Hammarby. Kalmar was not in the Allsvenskan the next season.');
  });
});

describe('seasonFingerprint', () => {
  it('compares with the other complete seasons, leaving out this one and the current one', () => {
    const f = seasonFingerprint(pl9596.summary, pl9596.seasons);
    const goals = f.find((x) => x.label === 'Goals per game')!;
    expect(goals).toMatchObject({ value: '2.60', average: '2.40' });
    expect(f.find((x) => x.label === 'Champions’ points')).toMatchObject({ value: '82', average: '75' });
  });

  it('leaves out points thresholds for a season in progress', () => {
    const live = pl.seasons.find((s) => s.season.start_year === 2026)!;
    expect(seasonFingerprint(live.summary, live.seasons).some((x) => x.label === 'Champions’ points')).toBe(false);
  });
});

describe('leagueIndexSentence', () => {
  it('counts titles and names the latest champions', () => {
    expect(leagueIndexSentence(pl.index)).toBe(
      '3 Premier League seasons on file since 1995/96. Most titles: Manchester United (2 titles). Latest champions: Manchester United in 1996/97, with 75 points.'
    );
  });
});

describe('LeagueSeasonPage', () => {
  function Where() {
    return <p data-testid="where">{useLocation().pathname}</p>;
  }

  it('renders the story and the table from initial data', () => {
    render(
      <MemoryRouter initialEntries={['/football/leagues/premier-league/1995-96']}>
        <Routes>
          <Route path="/football/leagues/:league/:season" element={<LeagueSeasonPage initialData={pl9596} />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('season-story').textContent).toContain('Manchester United won the 1995/96 Premier League');
    expect(screen.getByRole('link', { name: 'Newcastle United' }).getAttribute('href')).toBe('/football/teams/newcastle-united');
    expect(screen.getByRole('link', { name: /1996\/97/ }).getAttribute('href')).toBe('/football/leagues/premier-league/1996-97');
  });

  it('redirects a non-canonical season segment to the canonical one', () => {
    const swe = built.leagues.find((l) => l.index.league.code === 'SWE')!.seasons[0];
    render(
      <MemoryRouter initialEntries={['/football/leagues/allsvenskan/2024-25']}>
        <Routes>
          <Route path="/football/leagues/:league/:season" element={<><LeagueSeasonPage initialData={swe} /><Where /></>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('where').textContent).toBe('/football/leagues/allsvenskan/2024');
  });
});

describe('server rendering', () => {
  it('puts the story and table into the HTML with a canonical URL and breadcrumbs', () => {
    const page = renderLeagueSeasonPage(pl9596);
    expect(page.html).toContain('Manchester United won the 1995/96 Premier League with 82 points');
    expect(page.html).toContain('Final table');
    expect(page.title).toMatch(/^Premier League 1995\/96: final table and statistics/);
    expect(page.canonical).toMatch(/\/football\/leagues\/premier-league\/1995-96$/);
    expect(JSON.stringify(page.structuredData)).toContain('"name":"1995/96"');
  });

  it('renders the league history page with every season linked', () => {
    const page = renderLeagueIndexPage(pl.index);
    expect(page.html).toContain('href="/football/leagues/premier-league/1995-96"');
    expect(page.description).toContain('Most titles: Manchester United');
  });
});
