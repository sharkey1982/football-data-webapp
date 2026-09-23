import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ModelScorecardPage from '../pages/football/ModelScorecardPage';
import * as api from '../lib/scorecardApi';
import { calibration, score, scoreBy, GUESS_LOG_LOSS, type ScorecardRow } from '../lib/scorecardApi';

vi.mock('../lib/scorecardApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/scorecardApi')>('../lib/scorecardApi');
  return { ...actual, getScorecard: vi.fn(), getCalibration: vi.fn() };
});
const mocked = vi.mocked(api);

// Per-match means are set by choosing sums: n matches with mean log-loss m => ll = m * n.
const row = (o: Partial<ScorecardRow>): ScorecardRow => ({
  league_id: 1, season_id: 12, team_type: 'established', phase: '1 Aug-Oct', n: 100,
  ll_model: 104, ll_market: 101, brier_model: 60, brier_market: 59, p_draw: 25, m_draw: 26, draws: 27, pred_goals: 280, goals: 275,
  ...o,
});
const ROWS = [
  row({}),
  row({ team_type: 'promoted', n: 50, ll_model: 55, ll_market: 51 }),
  row({ league_id: 2, season_id: 11, phase: '3 Jan-Mar', n: 200, ll_model: 206, ll_market: 205 }),
];

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getScorecard.mockResolvedValue(ROWS);
  mocked.getCalibration.mockResolvedValue([
    { league_id: 1, season_id: 12, outcome: 'Home', bin: 4, n: 40, predicted: 18, happened: 17 },
    { league_id: 1, season_id: 12, outcome: 'Draw', bin: 2, n: 10, predicted: 2.5, happened: 3 },
    { league_id: 2, season_id: 11, outcome: 'Home', bin: 4, n: 20, predicted: 9, happened: 10 },
  ]);
});

const renderPage = () => render(<MemoryRouter><ModelScorecardPage /></MemoryRouter>);

describe('scorecard arithmetic', () => {
  it('scores means from sums, and skill against the market from guessing', () => {
    const s = score([row({})]);
    expect(s.model).toBeCloseTo(1.04);
    expect(s.market).toBeCloseTo(1.01);
    expect(s.gap).toBeCloseTo(0.03);
    expect(s.skillVsMarket).toBeCloseTo((GUESS_LOG_LOSS - 1.04) / (GUESS_LOG_LOSS - 1.01));
    expect(s.drawActual).toBeCloseTo(0.27);
    expect(score([]).model).toBeNull();
  });

  it('adds groups exactly: the parts sum to the whole', () => {
    const whole = score(ROWS);
    const parts = scoreBy(ROWS, (r) => r.team_type);
    expect(parts.reduce((a, p) => a + p.s.n, 0)).toBe(whole.n);
    const weighted = parts.reduce((a, p) => a + (p.s.model ?? 0) * p.s.n, 0) / whole.n;
    expect(weighted).toBeCloseTo(whole.model!);
  });

  it('calibration sums bins across the filter and drops thin ones', () => {
    const c = calibration([
      { league_id: 1, season_id: 12, outcome: 'Home', bin: 4, n: 40, predicted: 18, happened: 17 },
      { league_id: 2, season_id: 11, outcome: 'Home', bin: 4, n: 20, predicted: 9, happened: 10 },
      { league_id: 1, season_id: 12, outcome: 'Draw', bin: 2, n: 10, predicted: 2.5, happened: 3 },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ outcome: 'Home', bin: 4, n: 60 });
    expect(c[0].predicted).toBeCloseTo(27 / 60);
    expect(c[0].happened).toBeCloseTo(27 / 60);
  });
});

describe('ModelScorecardPage', () => {
  it('shows the headline, the division/season table, team types and phases', async () => {
    renderPage();
    const head = within(await screen.findByRole('region', { name: 'Headline' }));
    expect(head.getByText('350')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Division and season' })).toBeInTheDocument();
    const types = within(screen.getByRole('table', { name: 'Type of team' }));
    expect(types.getByText('Promoted team')).toBeInTheDocument();
    expect(types.getByText('+0.080')).toBeInTheDocument(); // (55-51)/50
    expect(screen.getByRole('table', { name: 'Time of season' })).toBeInTheDocument();
    expect(screen.getAllByTestId('calibration-row')).toHaveLength(1);
  });

  it('filters by division and season', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('region', { name: 'Headline' });
    await user.click(screen.getByRole('button', { name: 'Champ' }));
    const head = within(screen.getByRole('region', { name: 'Headline' }));
    expect(head.getByText('200')).toBeInTheDocument();
    // one division-season left: that table is hidden
    expect(screen.queryByRole('table', { name: 'Division and season' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '25/26' }));
    expect(screen.getByText(/No forecasts with market prices/)).toBeInTheDocument();
  });
});
