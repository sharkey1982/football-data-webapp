import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../lib/api';
import { FixtureChangeNotice } from '../components/FixtureChangeNotice';
import FixtureChangesPage from '../pages/FixtureChangesPage';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return { ...actual, getFixtureChanges: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const change = (over: Partial<api.FixtureChange>): api.FixtureChange => ({
  fixture_id: 90, slug: 'arsenal-v-leeds-2026-11-08', league_id: 1, league_code: 'E0', league_name: 'Premier League',
  home_team_name: 'Arsenal', away_team_name: 'Leeds', was_date: '2026-11-07', was_time: '15:00:00', now_date: '2026-11-08', now_time: '14:00:00',
  status: 'scheduled', changes_logged: 3, changed_at: new Date().toISOString(), ...over,
});

beforeEach(() => window.localStorage.clear());

describe('FixtureChangeNotice', () => {
  it('is one line linking to the changes page, and stays hidden once dismissed until a newer change', async () => {
    mocked.getFixtureChanges.mockResolvedValue([change({}), change({ fixture_id: 91, home_team_name: 'Everton' })]);
    const { unmount } = render(<MemoryRouter><FixtureChangeNotice /></MemoryRouter>);
    const notice = await screen.findByTestId('fixture-change-notice');
    expect(notice.textContent).toContain('2 Premier League fixtures have moved in the last week.');
    expect(screen.getByRole('link', { name: 'See the changes' }).getAttribute('href')).toBe('/fixtures/changes?league=E0');
    await userEvent.click(screen.getByRole('button', { name: 'Hide until the next change' }));
    expect(screen.queryByTestId('fixture-change-notice')).toBeNull();
    unmount();

    // A new visit: still hidden.
    render(<MemoryRouter><FixtureChangeNotice /></MemoryRouter>);
    await waitFor(() => expect(mocked.getFixtureChanges).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('fixture-change-notice')).toBeNull();
  });

  it('comes back when a newer change appears', async () => {
    window.localStorage.setItem('fs-fixture-changes-seen', '2026-01-01T00:00:00Z');
    mocked.getFixtureChanges.mockResolvedValue([change({})]);
    render(<MemoryRouter><FixtureChangeNotice /></MemoryRouter>);
    expect(await screen.findByTestId('fixture-change-notice')).toBeTruthy();
  });

  it('ignores old changes and played fixtures', async () => {
    mocked.getFixtureChanges.mockResolvedValue([change({ changed_at: '2026-01-01T00:00:00Z' }), change({ fixture_id: 92, status: 'played' })]);
    const { container } = render(<MemoryRouter><FixtureChangeNotice /></MemoryRouter>);
    await waitFor(() => expect(mocked.getFixtureChanges).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});

describe('FixtureChangesPage', () => {
  it('lists each fixture once, from where it was to where it is now, with times', async () => {
    mocked.getFixtureChanges.mockResolvedValue([change({}), change({ fixture_id: 93, home_team_name: 'Spurs', away_team_name: 'Wolves', was_date: '2026-11-21', now_date: '2026-11-21', was_time: '15:00:00', now_time: '12:30:00' })]);
    render(<MemoryRouter initialEntries={['/fixtures/changes']}><FixtureChangesPage /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Arsenal v Leeds' })).toBeTruthy();
    expect(screen.getByText('Sun 8 Nov 2026 14:00')).toBeTruthy();
    expect(screen.getByText('Moved later')).toBeTruthy();
    expect(screen.getByText('New kick-off time')).toBeTruthy();
    expect(mocked.getFixtureChanges).toHaveBeenCalledWith('E0');
  });
});
