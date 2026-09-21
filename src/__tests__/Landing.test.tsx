import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from '../pages/Landing';

describe('Landing page', () => {
  it('offers Football and Fantasy Premier League as the two themes', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );
    expect(screen.getByText('Pick your side.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Football/ })).toHaveAttribute('href', '/football');
    expect(screen.getByRole('link', { name: /Fantasy Premier League/ })).toHaveAttribute('href', '/fpl/start');
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
