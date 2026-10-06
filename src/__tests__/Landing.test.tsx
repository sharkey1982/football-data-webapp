import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from '../pages/Landing';

describe('Landing page', () => {
  it('one tile per top-menu section, then Beat the Shark', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );
    expect(screen.getByText('Pick your side.')).toBeInTheDocument();
    const tiles = screen.getByTestId('home-sections').querySelectorAll('a');
    expect([...tiles].map((a) => a.getAttribute('href'))).toEqual(['/football', '/international', '/fpl/start', '/nfl', '/tennis', '/play/beat-the-shark/']);
    expect(screen.getByRole('link', { name: /Club football/ })).toHaveAttribute('href', '/football');
    expect(screen.getByText('Fantasy Premier League').closest('a')).toHaveAttribute('href', '/fpl/start');
    // Club finances have no tile (they sit under Club) but are named in the summary.
    expect(screen.getByText(/club finances, the NFL and tennis/)).toBeInTheDocument();
  });

  it('links to Beat the Shark at its proxied address, with the trailing slash', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );
    // The exact href matters: the game lives on its own site behind a
    // proxy, and without the trailing slash its scripts resolve to the
    // wrong folder.
    expect(screen.getByRole('link', { name: /Beat the Shark/ })).toHaveAttribute('href', '/play/beat-the-shark/');
  });

  it('no longer shows the trivia game, which now lives on the Football and Fantasy hubs', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );
    expect(screen.queryByText('Guess it')).not.toBeInTheDocument();
  });
});
