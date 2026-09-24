import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ModelAccuracyPage from '../pages/football/ModelAccuracyPage';
import * as api from '../lib/modelAccuracyApi';
import * as scApi from '../lib/scorecardApi';
import type { ScorecardRow } from '../lib/scorecardApi';

vi.mock('../lib/modelAccuracyApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/modelAccuracyApi');
  return { ...actual, getModelAccuracySummary: vi.fn(), getModelCalibration: vi.fn() };
});
vi.mock('../lib/scorecardApi', async () => {
  const actual = await vi.importActual<typeof scApi>('../lib/scorecardApi');
  return { ...actual, getScorecard: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockedSc = vi.mocked(scApi);

const row = (o: Partial<ScorecardRow> = {}): ScorecardRow => ({
  league_id: 1, season_id: 12, team_type: 'established', phase: '1 Aug-Oct', n: 100,
  ll_model: 104, ll_market: 101, brier_model: 60, brier_market: 59, p_draw: 25, m_draw: 26, draws: 27, pred_goals: 280, goals: 275,
  ...o,
});
const SCORECARD: ScorecardRow[] = [row({}), row({ league_id: 2, season_id: 11 })];

// The real numbers as of the first scoring run, so the test fails if the
// page ever starts flattering them.
const REAL_SUMMARY: api.ModelAccuracySummary = {
  fixtures: 166, correct: 68, hit_rate: 41.0, always_home_hit_rate: 41.6,
  model_brier: 0.6614, uniform_brier: 0.6667, mean_p_actual: 35.6,
};
const REAL_BANDS: api.CalibrationBand[] = [
  { band: '0-10', forecasts: 8, mean_predicted: 7.4, actual_rate: 37.5, gap: 30.1 },
  { band: '20-30', forecasts: 170, mean_predicted: 25.4, actual_rate: 25.3, gap: -0.1 },
  { band: '30-40', forecasts: 173, mean_predicted: 34.3, actual_rate: 33.5, gap: -0.8 },
  { band: '60+', forecasts: 14, mean_predicted: 67.3, actual_rate: 50.0, gap: -17.3 },
];

const renderPage = () => render(<MemoryRouter><ModelAccuracyPage /></MemoryRouter>);

describe('ModelAccuracyPage', () => {
  beforeEach(() => {
    mocked.getModelAccuracySummary.mockResolvedValue(REAL_SUMMARY);
    mocked.getModelCalibration.mockResolvedValue(REAL_BANDS);
    mockedSc.getScorecard.mockResolvedValue(SCORECARD);
  });

  it('shows the home-team baseline the model fails to beat, not just its own hit rate', async () => {
    // A hit rate with no baseline reads as a score. 41% looks fine until
    // you know that always picking home gets 41.6%.
    renderPage();
    await waitFor(() => expect(screen.getByText('41%')).toBeInTheDocument());
    expect(screen.getByText('41.6%')).toBeInTheDocument();
    expect(screen.getByText('0.6614')).toBeInTheDocument();
    expect(screen.getByText('0.6667')).toBeInTheDocument();
  });

  it('marks thin calibration bands as unreadable rather than printing their gap', async () => {
    // The 0-10 band is +30.1 on EIGHT forecasts. Printing that beside a
    // -0.1 built on 170 invites reading noise as a finding.
    renderPage();
    await waitFor(() => expect(screen.getAllByText('too few').length).toBe(2));
    // The well-populated bands still show their gaps.
    expect(screen.getByText('-0.1')).toBeInTheDocument();
    expect(screen.getByText('-0.8')).toBeInTheDocument();
    expect(screen.queryByText('+30.1')).not.toBeInTheDocument();
  });

  it('states the sample size and what it cannot tell you', async () => {
    renderPage();
// Stated in both the header and the caveat, deliberately.
    await waitFor(() => expect(screen.getAllByText(/166 fixtures/).length).toBeGreaterThan(0));
    // The old copy claimed the walk-forward backtest "hasn't been done" --
    // it has, and the page must not say otherwise now that it's shown above.
    expect(screen.queryByText(/hasn.t been done/)).not.toBeInTheDocument();
    expect(screen.getByText(/freshness check/)).toBeInTheDocument();
  });

  it('shows the out-of-sample backtest with its headline numbers and a link to the full scorecard', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Out of sample backtest' });
    expect(screen.getByText('200 matches')).toBeInTheDocument();
    expect(screen.getByText('1.040')).toBeInTheDocument(); // model log-loss, weighted mean of the two rows
    expect(screen.getByText('1.010')).toBeInTheDocument(); // market log-loss
    expect(screen.getByLabelText('Out of sample backtest').querySelector('a[href="/football/model-scorecard"]')).toBeTruthy();
  });

  it('does not let a scorecard fetch failure take down the live accuracy section', async () => {
    mockedSc.getScorecard.mockRejectedValue(new Error('boom'));
    renderPage();
    await waitFor(() => expect(screen.getByText('41%')).toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Out of sample backtest' })).not.toBeInTheDocument();
  });

  it('explains why hit rate and calibration disagree', async () => {
    // Without this the two sections look contradictory, and a reader is
    // entitled to conclude one of them is wrong.
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/draw is almost never the single most likely scoreline/)).toBeInTheDocument()
    );
  });

  it('says so plainly when nothing has been scored yet', async () => {
    mocked.getModelAccuracySummary.mockResolvedValue({ ...REAL_SUMMARY, fixtures: 0 });
    mocked.getModelCalibration.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/No scored fixtures yet/)).toBeInTheDocument());
  });
});
