import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SiteTrafficPage from '../pages/admin/SiteTrafficPage';
import * as api from '../lib/siteTrafficApi';
import type { SiteTraffic } from '../lib/siteTrafficApi';

let admin = true;
vi.mock('../lib/auth', () => ({ useAuthOptional: () => ({ isAdmin: admin, session: null, loading: false }) }));
vi.mock('../lib/siteTrafficApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/siteTrafficApi');
  return { ...actual, getSiteTraffic: vi.fn() };
});
const getSiteTraffic = api.getSiteTraffic as unknown as ReturnType<typeof vi.fn>;

const DATA: SiteTraffic = {
  start: '2026-09-14', end: '2026-10-11', days: 28,
  periods: {
    current: { clicks: 17, impressions: 1529, position: 9.4, sessions: 60, engaged: 30, views: 150, eng_s: 9000, user_days: 84, new_users: 40 },
    previous: { clicks: 0, impressions: 200, position: 20, sessions: 30, engaged: 10, views: 60, eng_s: 3000, user_days: 30, new_users: 20 },
  },
  daily: [
    { date: '2026-10-10', clicks: 2, impressions: 120, users: 4, sessions: 5, views: 9, final: true },
    { date: '2026-10-11', clicks: 0, impressions: 0, users: 2, sessions: 3, views: 4, final: false },
  ],
  sections: [{ section: 'fpl', views: 100, sessions: 40, eng_s: 6000 }, { section: '(home)', views: 50, sessions: 20, eng_s: 3000 }],
  pages: [{ page: '/fpl/live', views: 80, sessions: 30, eng_s: 5000 }],
  landing: [{ page: '/fpl/live', sessions: 30, engaged: 20, views: 70 }],
  sources: [
    { channel_group: 'Referral', source: 'reddit.com', medium: 'referral', sessions: 10, engaged: 6, views: 30 },
    { channel_group: 'Organic Search', source: 'google', medium: 'organic', sessions: 40, engaged: 20, views: 100 },
  ],
  devices: [{ device: 'mobile', sessions: 45, views: 100 }],
  countries: [{ country: 'United Kingdom', sessions: 50, views: 130 }],
  search_queries: [{ query: 'fpl live scores', clicks: 3, impressions: 90, position: 7.25 }],
  search_pages: [{ page: 'https://fixtureshark.com/fpl/live', clicks: 5, impressions: 300, position: 8 }],
  search_countries: [{ country: 'gbr', clicks: 10, impressions: 900 }],
  loaded: { gsc_last_date: '2026-10-10', gsc_last_run: '2026-10-12T04:00:00Z', ga_last_date: '2026-10-11', ga_last_run: '2026-10-12T06:27:00Z' },
};

const renderPage = () => render(<MemoryRouter><SiteTrafficPage /></MemoryRouter>);

describe('SiteTrafficPage', () => {
  beforeEach(() => {
    admin = true;
    getSiteTraffic.mockReset();
    getSiteTraffic.mockResolvedValue(DATA);
  });

  it('asks nothing of the database for a non-admin', () => {
    admin = false;
    renderPage();
    expect(screen.getByText('This page is for admins.')).toBeTruthy();
    expect(getSiteTraffic).not.toHaveBeenCalled();
  });

  it('shows totals with change against the previous period', async () => {
    renderPage();
    await screen.findByText('1,529');
    expect(getSiteTraffic).toHaveBeenCalledWith(28);
    expect(screen.getByText('+665% vs previous')).toBeTruthy();       // impressions 200 -> 1529
    expect(screen.getByText('no previous data')).toBeTruthy();        // clicks: previous 0
    expect(screen.getByText(/only counts visitors who accepted the cookie banner/)).toBeTruthy();
  });

  it('sorts sources by sessions and re-sorts on header click', async () => {
    renderPage();
    const table = await screen.findByTestId('traffic-sources');
    const firstCell = () => within(table).getAllByRole('row')[1].textContent ?? '';
    expect(firstCell()).toContain('google');
    await userEvent.click(within(table).getByRole('button', { name: /Sessions/ }));
    expect(firstCell()).toContain('reddit.com');
  });

  it('shows search pages as site paths and country codes as names', async () => {
    renderPage();
    await screen.findByTestId('traffic-search-pages');
    expect(within(screen.getByTestId('traffic-search-pages')).getByText('/fpl/live')).toBeTruthy();
    // Analytics gives the name; Search Console's 'gbr' is mapped to the same name.
    expect(screen.getAllByText('United Kingdom', { selector: 'td' })).toHaveLength(2);
    expect(screen.queryByText('GBR')).toBeNull();
    expect(screen.getByText('Home page')).toBeTruthy();
  });

  it('reloads for another period', async () => {
    renderPage();
    await screen.findByText('1,529');
    await userEvent.click(screen.getByRole('button', { name: 'Last 90 days' }));
    await waitFor(() => expect(getSiteTraffic).toHaveBeenLastCalledWith(90));
  });
});
