import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TeamLink, MatchLink, PlayerLink } from '../components/EntityLinks';
import { defaultFixtureDate } from '../lib/fixtureDates';

describe('entity links', () => {
  it('link a team, a match and a player to their own pages', () => {
    render(
      <MemoryRouter>
        <TeamLink slug="arsenal">Arsenal</TeamLink>
        <MatchLink slug="arsenal-v-chelsea-2026-10-25">Arsenal v Chelsea</MatchLink>
        <PlayerLink slug="bukayo-saka">Saka</PlayerLink>
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Arsenal' })).toHaveAttribute('href', '/football/teams/arsenal');
    expect(screen.getByRole('link', { name: 'Arsenal v Chelsea' })).toHaveAttribute('href', '/football/matches/arsenal-v-chelsea-2026-10-25');
    expect(screen.getByRole('link', { name: 'Saka' })).toHaveAttribute('href', '/fpl/players/bukayo-saka');
  });

  it('render plain text, never a broken link, when there is no slug', () => {
    render(
      <MemoryRouter>
        <p><TeamLink slug={undefined}>Unknown FC</TeamLink></p>
        <p><MatchLink slug={null}>Some match</MatchLink></p>
      </MemoryRouter>
    );
    expect(screen.getByText('Unknown FC')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('defaultFixtureDate', () => {
  const dates = ['2026-10-18', '2026-10-18', '2026-10-19', '2026-10-25', '2026-10-26'];

  it('opens on today when today has games', () => {
    expect(defaultFixtureDate(dates, '2026-10-19')).toBe('2026-10-19');
  });

  it('opens on the next matchday when today has none', () => {
    expect(defaultFixtureDate(dates, '2026-10-21')).toBe('2026-10-25');
  });

  it('opens on the last matchday once the season is over', () => {
    expect(defaultFixtureDate(dates, '2027-06-01')).toBe('2026-10-26');
  });

  it('opens on the first matchday before the season starts', () => {
    expect(defaultFixtureDate(dates, '2026-08-01')).toBe('2026-10-18');
  });

  it('has nothing to open on with no fixtures', () => {
    expect(defaultFixtureDate([], '2026-10-21')).toBeNull();
  });
});
