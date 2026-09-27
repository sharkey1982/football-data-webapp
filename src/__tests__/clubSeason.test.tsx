import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { buildClubSeason, clubSeasonPath, clubSeasonStory, longestRun, type ClubSeasonMatch, type RawSnapshotRow } from '../lib/clubSeasonApi';
import ClubSeasonPage from '../pages/football/ClubSeasonPage';
import { renderClubSeasonPage } from '../entry-server';

const results = 'WWWDWLDDLLLLLWDW'.split('') as ('W' | 'D' | 'L')[];
let pts = 0;
const snaps: RawSnapshotRow[] = results.map((r, i) => {
  pts += r === 'W' ? 3 : r === 'D' ? 1 : 0;
  return {
    league_id: 2, season_id: 17, team_id: 40, matches_played: i + 1, match_date: `1995-${String(8 + Math.floor(i / 4)).padStart(2, '0')}-${String(1 + (i % 4) * 7).padStart(2, '0')}`,
    venue: i % 2 ? 'A' : 'H', opponent_team_id: 100 + i, goals_for: r === 'W' ? 2 : r === 'D' ? 1 : 0, goals_against: r === 'L' ? 1 : r === 'D' ? 1 : 0,
    result: r, points: pts, position_on_date: i < 3 ? 1 : 3 + (i % 5), teams_in_league: 24,
  };
});
const names = new Map<number, { name: string; slug: string | null }>(results.map((_, i) => [100 + i, { name: `Opp ${i + 1}`, slug: i === 0 ? 'opp-1' : null }]));

const row = {
  league_id: 2, season_id: 17, start_year: 1995, team_id: 40, position: 1, played: 16, won: 7, drawn: 4, lost: 5, goals_for: 18, goals_against: 9,
  goal_difference: 9, deduction: 0, points: pts, split_group: null, champion: true, relegated: false, promoted: true,
  is_final: true, curtailed: false, split_format: false, clubs: 24, comparable_group: '24x46', games_in_season: 46,
};
const data = buildClubSeason({
  team: { team_id: 40, name: 'Sunderland', slug: 'sunderland' },
  league: { league_id: 2, code: 'E1', name: 'Championship', slug: 'championship', country: 'England' },
  eraName: 'First Division',
  row,
  snaps,
  names,
  bench: [
    { league_id: 2, comparable_group: '24x46', matches_played: 1, outcome: 'champion', p25: 1, p50: 3, p75: 3 },
    { league_id: 2, comparable_group: '24x46', matches_played: 1, outcome: 'relegated', p25: 0, p50: 0, p75: 1 },
    { league_id: 2, comparable_group: '22x42', matches_played: 1, outcome: 'champion', p25: 9, p50: 9, p75: 9 },
  ],
  clubSeasons: [
    { league_code: 'E1', start_year: 1994, position: 20 },
    { league_code: 'E1', start_year: 1995, position: 1 },
    { league_code: 'E0', start_year: 1996, position: 18 },
  ],
});

describe('longestRun', () => {
  const ms = data.matches as ClubSeasonMatch[];
  it('finds the longest run and where it started and ended', () => {
    expect(longestRun(ms, (m) => m.result === 'L')).toEqual({ length: 5, from: 9, to: 13 });
    expect(longestRun(ms, (m) => m.result === 'W')).toEqual({ length: 3, from: 1, to: 3 });
    expect(longestRun(ms, () => false)).toBeNull();
  });
});

describe('clubSeasonStory', () => {
  it('gives the finish, record, outcome, time at the top and runs', () => {
    expect(clubSeasonStory(data)).toBe(
      'Sunderland finished 1st of 24 in the 1995/96 First Division with 22 points (won 7, drawn 4, lost 5; scored 18, conceded 9) and won the title and promotion. ' +
        'They were top of the table after 3 matches of 16; lowest 7th, after match 5. Longest runs: 3 wins in a row, 5 unbeaten and 8 without a win.'
    );
  });

  it('speaks in the present for a season in progress and mentions a deduction', () => {
    const live = { ...data, summary: { ...data.summary, is_final: false }, record: { ...data.record, position: 5, deduction: 3 } };
    expect(clubSeasonStory(live)).toMatch(/^Sunderland are 5th of 24 in the 1995\/96 First Division with 22 points after 16 matches .*That includes a 3-point deduction\./);
  });
});

describe('buildClubSeason', () => {
  it('keeps only this league size in the benchmarks and names opponents', () => {
    expect(data.benchmarks).toHaveLength(2);
    expect(data.matches[0]).toMatchObject({ opponent_name: 'Opp 1', opponent_slug: 'opp-1', venue: 'H' });
    expect(clubSeasonPath('sunderland', 'E1', 1995)).toBe('/football/teams/sunderland/1995-96');
  });
});

describe('ClubSeasonPage', () => {
  it('renders story, results and links to neighbouring seasons and opponents', () => {
    render(
      <MemoryRouter initialEntries={['/football/teams/sunderland/1995-96']}>
        <Routes>
          <Route path="/football/teams/:slug/:season" element={<ClubSeasonPage initialData={data} />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('club-season-story').textContent).toContain('finished 1st of 24');
    expect(screen.getByRole('link', { name: /1996\/97/ }).getAttribute('href')).toBe('/football/teams/sunderland/1996-97');
    expect(screen.getByRole('link', { name: 'Opp 1' }).getAttribute('href')).toBe('/football/teams/opp-1/1995-96');
    expect(screen.getByRole('link', { name: 'First Division 1995/96 table' }).getAttribute('href')).toBe('/football/leagues/championship/1995-96');
  });

  it('server-renders the story and every result', () => {
    const page = renderClubSeasonPage(data);
    expect(page.html).toContain('Sunderland finished 1st of 24');
    expect(page.html).toContain('Opp 16');
    expect(page.title).toMatch(/^Sunderland 1995\/96: First Division results and table position/);
    expect(page.canonical).toMatch(/\/football\/teams\/sunderland\/1995-96$/);
  });
});
