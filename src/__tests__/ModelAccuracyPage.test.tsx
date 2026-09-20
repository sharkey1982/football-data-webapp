import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ModelAccuracyPage from '../pages/football/ModelAccuracyPage';
import * as api from '../lib/modelAccuracyApi';

vi.mock('../lib/modelAccuracyApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/modelAccuracyApi');
  return { ...actual, getModelAccuracySummary: vi.fn(), getModelCalibration: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

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
    expect(screen.getByText(/not whether the method works/)).toBeInTheDocument();
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
