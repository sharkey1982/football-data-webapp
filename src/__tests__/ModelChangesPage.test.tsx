import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ModelChangesPage from '../pages/admin/ModelChangesPage';
import * as api from '../lib/modelChangesApi';
import { metricLines } from '../lib/modelChangesApi';

vi.mock('../lib/modelChangesApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/modelChangesApi')>('../lib/modelChangesApi');
  return { ...actual, getModelVersions: vi.fn(), getModelChanges: vi.fn() };
});
const mocked = vi.mocked(api);

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getModelVersions.mockResolvedValue([
    { version: 'dc_v1', component: 'fit', description: 'Dixon-Coles fit.', params: { half_life_days: 180, window_days: 730 }, introduced_at: '2026-09-13', retired_at: null },
    { version: 'legacy_pre_v1', component: 'fit', description: 'The first fits.', params: {}, introduced_at: '2026-06-22', retired_at: '2026-09-23' },
  ]);
  mocked.getModelChanges.mockResolvedValue([
    {
      change_id: 2, changed_at: '2026-09-23', area: 'fit', title: 'Early fits retired', reason: 'They predicted too few goals.',
      detail: 'Team ratings were sound.', before_metrics: { 'PL goals a game': 2.07 }, after_metrics: { 'PL goals a game': 2.93 },
      version_from: 'legacy_pre_v1', version_to: 'dc_v1', reference: 'PR #54',
    },
    {
      change_id: 1, changed_at: '2026-09-22', area: 'returns', title: 'Market average price', reason: 'Median mixed summaries with books.',
      detail: null, before_metrics: null, after_metrics: null, version_from: null, version_to: null, reference: null,
    },
  ]);
});

const renderPage = () => render(<MemoryRouter><ModelChangesPage /></MemoryRouter>);

describe('ModelChangesPage', () => {
  it('shows versions in use with their settings, and retired ones tucked away', async () => {
    renderPage();
    const inUse = within(await screen.findByRole('region', { name: 'Versions in use' }));
    expect(inUse.getByText('dc_v1')).toBeInTheDocument();
    expect(inUse.getByText('in use')).toBeInTheDocument();
    expect(inUse.getByText('180')).toBeInTheDocument();
    expect(inUse.getByText('Retired versions (1)')).toBeInTheDocument();
  });

  it('lists changes newest first with reason, versions, before/after and reference', async () => {
    renderPage();
    const changes = await screen.findAllByTestId('change');
    expect(changes).toHaveLength(2);
    const first = within(changes[0]);
    expect(first.getByText('Early fits retired')).toBeInTheDocument();
    expect(first.getByText('They predicted too few goals.')).toBeInTheDocument();
    expect(first.getByText(/legacy_pre_v1/)).toHaveTextContent('legacy_pre_v1 → dc_v1');
    expect(first.getByText('2.07')).toBeInTheDocument();
    expect(first.getByText('2.93')).toBeInTheDocument();
    expect(first.getByText('Reference: PR #54')).toBeInTheDocument();
    expect(within(changes[1]).queryByText('Before')).not.toBeInTheDocument();
  });

  it('flattens nested metrics into readable lines', () => {
    expect(metricLines({ 'log_loss_model_vs_market': { '2024/25': [0.977, 0.967] }, bets: 83 })).toEqual([
      { label: 'log loss model vs market — 2024/25', value: '0.977 vs 0.967' },
      { label: 'bets', value: '83' },
    ]);
    expect(metricLines(null)).toEqual([]);
  });
});
