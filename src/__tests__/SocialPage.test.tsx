import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import SocialPage from '../pages/admin/SocialPage';
import * as socialApi from '../lib/socialApi';

let admin = true;
vi.mock('../lib/auth', () => ({
  useAuthOptional: () => ({ isAdmin: admin, session: admin ? { user: { email: 'admin@example.com' } } : null, loading: false }),
}));
vi.mock('../lib/socialApi', async () => {
  const actual = await vi.importActual<typeof socialApi>('../lib/socialApi');
  return { ...actual, getSocialState: vi.fn(), review: vi.fn(), publish: vi.fn(), updateSettings: vi.fn(), runDetectors: vi.fn() };
});
void React;
const api = socialApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const text = 'FPL GW7 captaincy: FixtureShark projected points\n1. Haaland (MCI, £15.6m) 8.9\nModel: leaguewide_v6';
const candidate: socialApi.Candidate = {
  candidate_id: 1, post_type: 'fpl_captaincy', text, generated_text: text,
  source_data: { checks: [{ check: 'projections cover every fixture', ok: true }] }, model_version: 'leaguewide_v6',
  snapshot_at: '2026-10-14T09:30:00Z', expires_at: '2026-10-17T10:00:00Z', validation_status: 'passed', validation_errors: [],
  approval_status: 'pending', approved_at: null, rejected_reason: null, scheduled_for: null, publication_status: 'unpublished',
  x_post_id: null, published_at: null, publish_attempts: 0, last_error: null, created_at: '2026-10-14T09:31:00Z',
};
const settings: socialApi.Settings = {
  kill_switch: true, live_enabled: false, auto_publish_enabled: false, detector_enabled: true, allowed_x_username: 'FixtureSharkHQ',
  max_posts_per_day: 3, max_posts_per_month: 40, min_minutes_between_posts: 60, monthly_budget_usd: 2, cost_per_post_usd: 0.015,
  cost_per_post_with_url_usd: 0.2, allow_urls: false, max_live_attempts: 2, updated_at: '2026-10-12T10:00:00Z',
};
const state = (c: socialApi.Candidate) => ({
  settings, candidates: [c], weeks: [], runs: [], audit: [],
  connection: { status: 'disconnected', x_username: null, scopes: null, connected_at: null, access_expires_at: null, last_refreshed_at: null, last_error: null },
});

describe('SocialPage', () => {
  beforeEach(() => {
    admin = true;
    vi.clearAllMocks();
  });

  it('is admin only', () => {
    admin = false;
    render(<MemoryRouter><SocialPage /></MemoryRouter>);
    expect(screen.getByText('This page is for admins.')).toBeInTheDocument();
    expect(api.getSocialState).not.toHaveBeenCalled();
  });

  it('lists a candidate for review; Publish is off while the kill switch is on', async () => {
    api.getSocialState.mockResolvedValue(state(candidate));
    render(<MemoryRouter><SocialPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('social-candidate')).toBeInTheDocument());
    expect(screen.getByText('FPL captaincy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(screen.getByText('Connect @FixtureSharkHQ')).toBeInTheDocument();
  });

  it('blocks an edit that adds a number', async () => {
    api.getSocialState.mockResolvedValue(state(candidate));
    render(<MemoryRouter><SocialPage /></MemoryRouter>);
    const box = await screen.findByLabelText('Text of candidate 1');
    await userEvent.type(box, ' 100% nailed');
    expect(screen.getByText('New numbers not allowed: 100')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save edit' })).toBeDisabled();
  });

  it('dry run shows why a live post would be blocked', async () => {
    api.getSocialState.mockResolvedValue(state({ ...candidate, approval_status: 'approved' }));
    api.publish.mockResolvedValue({ ok: false, mode: 'dry_run', reasons: ['daily limit reached (3)'], estimated_cost_usd: 0.015 });
    render(<MemoryRouter initialEntries={['/admin/social?show=approved']}><SocialPage /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Dry run' }));
    expect(api.publish).toHaveBeenCalledWith(1, 'dry_run');
    expect(await screen.findByText('daily limit reached (3)')).toBeInTheDocument();
  });
});
