// Admin daily site update on /admin/email: renders the preview sections and
// "Send today's digest now" calls the send RPC.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({
  getDigest: vi.fn(),
  sendDigestNow: vi.fn(async () => undefined),
}));
vi.mock('../lib/emailAdminApi', () => api);

import DailyDigestPanel from '../components/admin/DailyDigestPanel';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('DailyDigestPanel', () => {
  it('shows the preview and sends on request', async () => {
    api.getDigest.mockResolvedValue({
      day: '2026-11-02', from: '2026-11-02T00:00:00Z', to: '2026-11-02T19:00:00Z',
      subject: 'FixtureShark today: Mon 2 Nov', headline: '1 visitor, 0 pageviews · no failed runs.',
      sections: [{ key: 'fpl', title: 'FPL', link: 'https://fixtureshark.com/fpl/price-risk', lines: ['Fallers (1): A\nNext: GW10'] }],
      sends: [],
    });
    render(<DailyDigestPanel />);
    expect(await screen.findByText('FixtureShark today: Mon 2 Nov')).toBeTruthy();
    expect(screen.getByText('Next: GW10')).toBeTruthy();
    expect(screen.getByText('fixtureshark.com/fpl/price-risk').getAttribute('href')).toBe('https://fixtureshark.com/fpl/price-risk');
    await userEvent.click(screen.getByRole('button', { name: /send today.s digest now/i }));
    await waitFor(() => expect(api.sendDigestNow).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('status')).toBeTruthy();
  });
});
