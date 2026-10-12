import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreditPanel } from '../pages/admin/aiLabParts';
import * as labApi from '../lib/aiLabApi';

vi.mock('../lib/aiLabApi', async () => {
  const actual = await vi.importActual<typeof labApi>('../lib/aiLabApi');
  return { ...actual, getCreditSummary: vi.fn(), saveCreditCheck: vi.fn() };
});
const api = labApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const base = { month_site_usd: 0.53, month_external_usd: 1.7479, monthly_limit_usd: 20 };

beforeEach(() => vi.clearAllMocks());

describe('CreditPanel', () => {
  it('asks for a Console balance when none has been entered, and shows this month against the limit', async () => {
    api.getCreditSummary.mockResolvedValue({ ...base, last_check: null });
    render(<CreditPanel />);
    expect(await screen.findByText(/copy your balance from the Anthropic Console/)).toBeInTheDocument();
    expect(screen.getByText('This month: site $0.53 of the $20.00 limit · GitHub tests $1.75')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Anthropic Console billing' })).toHaveAttribute('href', labApi.ANTHROPIC_BILLING_URL);
  });

  it('shows the estimate, warns when low, and saves a new balance then reloads', async () => {
    api.getCreditSummary.mockResolvedValueOnce({
      ...base, last_check: { balance_usd: 6, checked_at: '2026-10-11T10:00:00Z', spent_since_usd: 1.78, estimate_left_usd: 4.22 },
    });
    api.getCreditSummary.mockResolvedValueOnce({
      ...base, last_check: { balance_usd: 50, checked_at: '2026-10-12T05:00:00Z', spent_since_usd: 0, estimate_left_usd: 50 },
    });
    api.saveCreditCheck.mockResolvedValue(undefined);
    render(<CreditPanel />);
    expect(await screen.findByText('about $4.22 left')).toBeInTheDocument();
    expect(screen.getByText(/Running low/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Update balance' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Balance shown in the Console/ }), '$50.00');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.saveCreditCheck).toHaveBeenCalledWith(50);
    expect(await screen.findByText('about $50.00 left')).toBeInTheDocument();
    expect(screen.queryByText(/Running low/)).not.toBeInTheDocument();
  });
});
