import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import CrossLeaguePage from '../pages/football/CrossLeaguePage';
import { aggregateByLeague, type CrossLeagueRow } from '../lib/crossLeagueApi';
import * as api from '../lib/crossLeagueApi';

vi.mock('../lib/crossLeagueApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/crossLeagueApi');
  return { ...actual, getCrossLeagueSummary: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const row = (over: Partial<CrossLeagueRow>): CrossLeagueRow => ({
  league_code: 'E0', league_name: 'Premier League', season_label: '2526',
  matches: 380, goals_per_game: 2.8, home_win_pct: 44.3, draw_pct: 23.8,
  away_win_pct: 31.9, yellows_per_game: 3.48, reds_per_game: 0.1,
  home_goals_per_game: 1.54, away_goals_per_game: 1.26, over_two_five_pct: 53.8,
  both_scored_pct: 52.4, nil_nil_pct: 6.5, comeback_pct: 24.1, ...over,
});

describe('aggregateByLeague', () => {
  it('weights by matches played, not a flat average of season averages', () => {
    // 380 matches at 3.0 and 620 at 2.0 -> 2.38, not the flat mean 2.5.
    // A Premier League season (380) must not count the same as a
    // Championship one (552) when they're pooled.
    const out = aggregateByLeague([
      row({ season_label: '2425', matches: 380, goals_per_game: 3.0 }),
      row({ season_label: '2526', matches: 620, goals_per_game: 2.0 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].goals_per_game).toBeCloseTo(2.38, 2);
    expect(out[0].matches).toBe(1000);
  });
});

describe('CrossLeaguePage', () => {
  it('states the finding in prose and lets the metric be switched', async () => {
    mocked.getCrossLeagueSummary.mockResolvedValue([
      row({ league_code: 'E0', league_name: 'Premier League', goals_per_game: 2.8, yellows_per_game: 3.48 }),
      row({ league_code: 'EC', league_name: 'National League', goals_per_game: 2.72, yellows_per_game: 3.19 }),
    ]);

    render(
      <MemoryRouter>
        <CrossLeaguePage />
      </MemoryRouter>
    );

    // The finding is stated, not just plotted -- a bar chart alone can't
    // be read by anything that doesn't render.
    await waitFor(() => expect(screen.getByText(/most goals per game/)).toBeInTheDocument());
    expect(screen.getByRole('table')).toBeInTheDocument();

    // Metric picker is a select, not a row of buttons -- twelve metrics
    // as pills wraps badly on a phone.
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox'), 'yellows_per_game');
    expect(screen.getByText(/most bookings per game/)).toBeInTheDocument();
  });
});
