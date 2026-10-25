import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from '../pages/Landing';
import { savePrefs, EMPTY_PREFS } from '../lib/myPrefs';
import type { ClubCard } from '../lib/myHomeApi';

vi.mock('../lib/myHomeApi', async () => ({
  ...(await vi.importActual<typeof import('../lib/myHomeApi')>('../lib/myHomeApi')),
  getMyClubCards: vi.fn(),
  getIntlCard: vi.fn(),
  getNflCard: vi.fn(),
  getTennisCard: vi.fn(),
}));
vi.mock('../lib/fplGameweekState', async () => ({
  ...(await vi.importActual<typeof import('../lib/fplGameweekState')>('../lib/fplGameweekState')),
  getOpenGameweek: vi.fn(),
}));
vi.mock('../lib/hubApi', async () => ({
  ...(await vi.importActual<typeof import('../lib/hubApi')>('../lib/hubApi')),
  getNextDeadline: vi.fn(),
}));

import { getMyClubCards } from '../lib/myHomeApi';
import { getOpenGameweek } from '../lib/fplGameweekState';
import { getNextDeadline } from '../lib/hubApi';

const southend: ClubCard = {
  team: { teamId: 70, name: 'Southend United', slug: 'southend-united' },
  league: { leagueId: 5, name: 'National League', slug: 'national-league' },
  next: {
    fixtureId: 1, slug: 'worthing-v-southend', date: '2026-10-27', time: '19:45:00', league: 'National League',
    home: 'Worthing', away: 'Southend United', isHome: false,
    model: { home: 0.45, draw: 0.22, away: 0.33 }, market: null, xg: [1.9, 1.6], tv: null,
  },
  recent: [
    { fixtureId: 2, slug: null, date: '2026-10-24', home: 'Southend United', away: 'Halifax', isHome: true, hg: 2, ag: 2, model: { home: 0.5, draw: 0.25, away: 0.25 }, market: { home: 0.55, draw: 0.24, away: 0.21 } },
    { fixtureId: 3, slug: null, date: '2026-10-18', home: 'Boston', away: 'Southend United', isHome: false, hg: 1, ag: 2, model: null, market: null },
  ],
  table: [
    { position: 2, teamId: 10, name: 'York', slug: 'york', played: 13, gd: 12, points: 29 },
    { position: 3, teamId: 70, name: 'Southend United', slug: 'southend-united', played: 13, gd: 9, points: 27 },
  ],
};
const yeovil: ClubCard = { ...southend, team: { teamId: 71, name: 'Yeovil', slug: 'yeovil' }, table: [] };

function renderAt(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><Landing /></MemoryRouter>);
}

describe('Home page with and without My FixtureShark', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getMyClubCards).mockReset().mockResolvedValue([southend, yeovil]);
    vi.mocked(getOpenGameweek).mockReset().mockRejectedValue(new Error('offline'));
    vi.mocked(getNextDeadline).mockReset().mockResolvedValue({ gw: 9, deadline: '2026-10-31T11:00:00Z' });
  });

  it('without preferences: the usual home page and the strip, which stays dismissed', () => {
    const { unmount } = renderAt();
    expect(screen.getByRole('heading', { level: 1, name: 'Pick your side.' })).toBeInTheDocument();
    const strip = screen.getByTestId('my-strip');
    expect(within(strip).getByRole('link', { name: 'Choose my teams' })).toHaveAttribute('href', '/my');
    fireEvent.click(within(strip).getByRole('button', { name: 'No thanks' }));
    expect(screen.queryByTestId('my-strip')).not.toBeInTheDocument();
    unmount();
    renderAt();
    expect(screen.queryByTestId('my-strip')).not.toBeInTheDocument();
    expect(getMyClubCards).not.toHaveBeenCalled();
  });

  it('with a club: the personal page first, then the usual home page', async () => {
    savePrefs({ ...EMPTY_PREFS, club: { teamId: 70, name: 'Southend United', slug: 'southend-united' }, followed: [{ teamId: 71, name: 'Yeovil', slug: 'yeovil' }], fplId: '123' });
    renderAt();
    expect(screen.getByRole('heading', { level: 1, name: 'Southend United' })).toBeInTheDocument();
    expect(screen.queryByTestId('my-strip')).not.toBeInTheDocument();
    const next = await screen.findByTestId('my-club-next');
    expect(next).toHaveTextContent('Worthing v Southend United');
    expect(next).toHaveTextContent('33%');
    expect(next).toHaveTextContent('appears when prices are published');
    const last = screen.getByTestId('my-club-last');
    expect(last).toHaveTextContent('Southend United 2–2 Halifax');
    expect(last).toHaveTextContent('Our model gave this result 25%, the market 24%');
    expect(screen.getByRole('link', { name: 'Full table' })).toHaveAttribute('href', '/table?league=5');
    expect(within(screen.getByTestId('my-following')).getByRole('link', { name: 'Yeovil' })).toBeInTheDocument();
    expect(await screen.findByText(/Gameweek 9/)).toBeInTheDocument();
    expect(getMyClubCards).toHaveBeenCalledWith([70, 71]);
    // The usual home page follows, its heading one level down.
    expect(screen.getByRole('heading', { level: 2, name: 'Pick your side.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Show the full home page' })).toHaveAttribute('href', '/?view=all');
  });

  it('?view=all and the switch turned off both show the usual home page alone', () => {
    savePrefs({ ...EMPTY_PREFS, club: { teamId: 70, name: 'Southend United', slug: 'southend-united' } });
    const { unmount } = renderAt('/?view=all');
    expect(screen.getByRole('heading', { level: 1, name: 'Pick your side.' })).toBeInTheDocument();
    expect(screen.queryByTestId('my-home')).not.toBeInTheDocument();
    expect(screen.queryByTestId('my-strip')).not.toBeInTheDocument();
    unmount();
    savePrefs({ ...EMPTY_PREFS, club: { teamId: 70, name: 'Southend United', slug: 'southend-united' }, openMyPage: false });
    renderAt();
    expect(screen.queryByTestId('my-home')).not.toBeInTheDocument();
  });
});
