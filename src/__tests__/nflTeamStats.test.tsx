import React from 'react';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StandingsTables from '../components/nfl/StandingsTables';
import type { NflStanding, NflTeamSeason } from '../lib/nflApi';

const team = (f: string, over: Partial<NflTeamSeason>): NflTeamSeason => ({
  season: 2026, franchise: f, slug: f.toLowerCase(), team_name: f, short_name: f, conference: 'AFC', division: 'East', games: 4,
  points_for: 100, points_against: 80, plays: 260, attempts: 140, carries: 110, sacks_suffered: 10, pass_yards: 900, rush_yards: 500,
  pass_tds: 8, rush_tds: 4, first_downs: 80, giveaways: 4, takeaways: 6, def_sacks: 10, def_st_tds: 1,
  opp_plays: 250, opp_attempts: 130, opp_carries: 105, opp_pass_yards: 800, opp_rush_yards: 450, opp_pass_tds: 6, opp_rush_tds: 3,
  penalties: 20, penalty_yards: 160, offence_epa: 13, dst_points: 30, ...over,
});
const standing = (f: string): NflStanding => ({ season: 2026, franchise: f, slug: f.toLowerCase(), team_name: f, short_name: f, conference: 'AFC', division: 'East', played: 4, won: 2, lost: 2, tied: 0, win_pct: 0.5, points_for: 100, points_against: 80, point_diff: 20, home_won: 1, home_lost: 1, away_won: 1, away_lost: 1, div_won: 0, div_lost: 0, div_tied: 0, conf_won: 1, conf_lost: 1, playoff_result: null, playoff_round: 0, season_complete: false, division_rank: 1, won_division: null });

const stats = [
  team('BUF', { points_for: 127, dst_points: 44, attempts: 150, giveaways: 2, takeaways: 9 }),
  team('MIA', { points_for: 46, dst_points: 12, attempts: 120, giveaways: 9, takeaways: 1 }),
  team('NE', {}),
];

describe('NFL League Table: Team stats view', () => {
  it('appears with team stats, per game, sortable, in offence / defence / fantasy sets', () => {
    render(<MemoryRouter><StandingsTables rows={stats.map((s) => standing(s.franchise))} teamStats={stats} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Team stats' }));
    const table = screen.getByTestId('nfl-team-stats');
    let rows = within(table).getAllByTestId('nfl-team-stats-row');
    // Offence, sorted by points per game: BUF 31.8, NE 25.0, MIA 11.5.
    expect(rows.map((r) => r.querySelector('th')!.textContent)).toEqual(['BUF', 'NE', 'MIA']);
    expect(rows[0].textContent).toContain('31.8');
    // Defence: turnover differential.
    fireEvent.click(within(table).getByRole('button', { name: 'Defence' }));
    fireEvent.click(within(table).getByRole('button', { name: /TO diff/ }));
    rows = within(table).getAllByTestId('nfl-team-stats-row');
    expect(rows[0].textContent).toContain('+7');
    expect(rows[2].textContent).toContain('-8');
    // Fantasy: DST points per game and pass attempts per game.
    fireEvent.click(within(table).getByRole('button', { name: 'Fantasy' }));
    rows = within(table).getAllByTestId('nfl-team-stats-row');
    expect(rows[0].querySelector('th')!.textContent).toBe('BUF');
    expect(rows[0].textContent).toContain('37.5'); // 150 pass attempts / 4
    expect(rows[0].textContent).toContain('11.0'); // 44 DST points / 4
    expect(screen.getByText(/DST points use standard scoring/)).toBeInTheDocument();
  });

  it('is not offered without team stats', () => {
    render(<MemoryRouter><StandingsTables rows={stats.map((s) => standing(s.franchise))} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Team stats' })).toBeNull();
  });
});
