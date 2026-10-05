import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LocalClubsPage from '../pages/football/LocalClubsPage';
import { buildLocalClubs, localSentence, lookupPostcode, milesText, nearestByLevel, nearestClubs, tidyPostcode } from '../lib/localClubs';
import { renderLocalClubsPage } from '../entry-server';

const grounds = [
  { team_id: 70, ground_name: 'Roots Hall', latitude: '51.54901', longitude: '0.70157' },
  { team_id: 56, ground_name: 'Priestfield Stadium', latitude: '51.38425', longitude: '0.56075' },
  { team_id: 24, ground_name: 'The Valley', latitude: '51.48646', longitude: '0.03653' },
  { team_id: 13, ground_name: 'London Stadium', latitude: '51.53869', longitude: '-0.01644' },
  { team_id: 1, ground_name: 'Emirates Stadium', latitude: '51.55515', longitude: '-0.10842' },
  { team_id: 999, ground_name: 'Nowhere Park', latitude: '52', longitude: '-1' },
];
const teams = [
  { team_id: 70, display_name: 'Southend', canonical_name: 'Southend', slug: 'southend' },
  { team_id: 56, display_name: 'Gillingham', canonical_name: 'Gillingham', slug: 'gillingham' },
  { team_id: 24, display_name: 'Charlton', canonical_name: 'Charlton', slug: 'charlton' },
  { team_id: 13, display_name: 'West Ham', canonical_name: 'West Ham', slug: 'west-ham' },
  { team_id: 1, display_name: 'Arsenal', canonical_name: 'Arsenal', slug: 'arsenal' },
];
const standings = [
  { team_id: 70, league_name: 'National League', tier: 5, season_start_year: 2026 },
  { team_id: 56, league_name: 'League Two', tier: 4, season_start_year: 2026 },
  { team_id: 24, league_name: 'Championship', tier: 2, season_start_year: 2026 },
  { team_id: 13, league_name: 'Championship', tier: 2, season_start_year: 2026 },
  { team_id: 1, league_name: 'Premier League', tier: 1, season_start_year: 2026 },
  // Last season's row must not win.
  { team_id: 13, league_name: 'Premier League', tier: 1, season_start_year: 2025 },
];
const data = buildLocalClubs(grounds, teams, standings);
const home = { lat: 51.537, lon: 0.714, label: 'SS1 3JB' };

describe('Your Local Clubs', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds clubs from grounds and this season only (teams embedded or separate)', () => {
    expect(data.season).toBe(2026);
    expect(data.clubs.map((c) => c.name)).toEqual(['Arsenal', 'Charlton', 'West Ham', 'Gillingham', 'Southend']);
    expect(data.clubs.find((c) => c.name === 'West Ham')!.league).toBe('Championship');
    const embedded = buildLocalClubs(grounds.map((g) => ({ ...g, teams: teams.find((t) => t.team_id === g.team_id) ?? null })), [], standings);
    expect(embedded.clubs.map((c) => c.slug)).toEqual(data.clubs.map((c) => c.slug));
  });

  it('nearest club, nearest per division, and the sentence', () => {
    const near = nearestClubs(data.clubs, home);
    expect(near[0].name).toBe('Southend');
    expect(near[0].miles).toBeLessThan(1.2);
    expect(nearestByLevel(near).map((c) => `${c.tier} ${c.name}`)).toEqual(['1 Arsenal', '2 Charlton', '4 Gillingham', '5 Southend']);
    expect(localSentence(home, near)).toBe(
      'Your nearest club to SS1 3JB is Southend, 1 mile away at Roots Hall (National League). The nearest Premier League club is Arsenal, 35 miles away.'
    );
    expect(milesText(12.44)).toBe('12 miles');
  });

  it('postcode lookup: full and outward codes go to postcodes.io; unknown and invalid give null', async () => {
    expect(tidyPostcode(' ss13jb ')).toBe('SS1 3JB');
    const ok = vi.fn(async () => new Response(JSON.stringify({ result: { latitude: 51.537, longitude: 0.714 } }), { status: 200 }));
    expect(await lookupPostcode('ss1 3jb', ok as unknown as typeof fetch)).toEqual({ lat: 51.537, lon: 0.714, label: 'SS1 3JB' });
    expect(ok).toHaveBeenLastCalledWith('https://api.postcodes.io/postcodes/SS1%203JB');
    await lookupPostcode('SS1', ok as unknown as typeof fetch);
    expect(ok).toHaveBeenLastCalledWith('https://api.postcodes.io/outcodes/SS1');
    const missing = vi.fn(async () => new Response('{}', { status: 404 }));
    expect(await lookupPostcode('ZZ9 9ZZ', missing as unknown as typeof fetch)).toBeNull();
    expect(await lookupPostcode('not a postcode', ok as unknown as typeof fetch)).toBeNull();
  });

  it('page: every club by division, then a postcode gives the nearest in each division first', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ result: { latitude: 51.537, longitude: 0.714 } }), { status: 200 })));
    render(<MemoryRouter><LocalClubsPage initialData={data} /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your Local Clubs');
    expect(screen.getByTestId('local-directory').querySelectorAll('a')).toHaveLength(5);
    fireEvent.change(screen.getByLabelText('Postcode'), { target: { value: 'SS1 3JB' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find clubs' }));
    const table = await screen.findByTestId('local-by-level');
    expect([...table.querySelectorAll('tbody tr')].map((r) => r.children[1].textContent)).toEqual(['Arsenal', 'Charlton', 'Gillingham', 'Southend']);
    expect(screen.getByTestId('local-nearest').textContent).toContain('Southend');
    expect(screen.queryByTestId('local-directory')).toBeNull();
  });

  it('server-renders with every club and a page-specific head', () => {
    const page = renderLocalClubsPage(data);
    expect(page.canonical).toBe('https://fixtureshark.com/football/local-clubs');
    expect(page.html).toContain('5 in all, with its ground');
    expect(page.description).toContain('5 clubs from the Premier League to the National League');
  });
});
