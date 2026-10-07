import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeHub } from '../components/ThemeHub';
import { BEAT_THE_SHARK } from '../components/GameCard';
import { THEMES } from '../lib/journey';

describe('Beat the Shark game cards on the hubs', () => {
  it('the NFL hub links to the NFL game at its proxied address, with the trailing slash', () => {
    render(
      <MemoryRouter>
        <ThemeHub theme={THEMES.nfl} trivia={[]} game={BEAT_THE_SHARK.nfl} />
      </MemoryRouter>
    );
    // A plain link, not a router link: the game is a separate site behind a proxy.
    expect(screen.getByRole('link', { name: /Beat the Shark: NFL/ })).toHaveAttribute('href', '/play/beat-the-shark/nfl/');
  });

  it('the International hub links to the World Cup game', () => {
    render(
      <MemoryRouter>
        <ThemeHub theme={THEMES.international} trivia={[]} game={BEAT_THE_SHARK.worldCup} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /Beat the Shark: World Cup/ })).toHaveAttribute('href', '/play/beat-the-shark/world-cup/');
  });

  it('the Tennis hub links to the Nations Cup game', () => {
    render(
      <MemoryRouter>
        <ThemeHub theme={THEMES.tennis} trivia={[]} game={BEAT_THE_SHARK.nationsCup} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /Beat the Shark: Nations Cup/ })).toHaveAttribute('href', '/play/beat-the-shark/nations-cup/');
  });

  it('a hub without a game shows no game card', () => {
    render(
      <MemoryRouter>
        <ThemeHub theme={THEMES.nfl} trivia={[]} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('link', { name: /Beat the Shark/ })).not.toBeInTheDocument();
  });

  it('every game address ends in a slash', () => {
    for (const g of Object.values(BEAT_THE_SHARK)) expect(g.href.endsWith('/')).toBe(true);
  });
});
