import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FplHub from '../pages/FplHub';
import * as landingApi from '../lib/landingApi';

vi.mock('../lib/landingApi', async () => {
  const actual = await vi.importActual<typeof landingApi>('../lib/landingApi');
  return { ...actual, getFplTrivia: vi.fn() };
});

const mockedApi = landingApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('FplHub page', () => {
  it('shows all four stages as clickable boxes, each linking to its primary destination -- including the two genuine backtest pages available under Validate', async () => {
    mockedApi.getFplTrivia.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <FplHub />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Discover' })).toHaveAttribute('href', '/fpl');
    expect(screen.getByRole('link', { name: 'Predict' })).toHaveAttribute('href', '/fpl/optimal-squad');
    expect(screen.getByRole('link', { name: 'Validate' })).toHaveAttribute('href', '/fpl/actual-matches');
    expect(screen.getByRole('link', { name: 'Configure' })).toHaveAttribute('href', '/fpl/tactical-roles');

    expect(screen.getByRole('link', { name: 'Scoring Rules' })).toHaveAttribute('href', '/fpl/scoring-rules');
    expect(screen.getByRole('link', { name: 'Player Points Table' })).toHaveAttribute('href', '/fpl/player-points');
    expect(screen.getByRole('link', { name: 'Optimal Squad So Far' })).toHaveAttribute('href', '/fpl/optimal-squad-so-far');

    await waitFor(() => expect(mockedApi.getFplTrivia).toHaveBeenCalled());
  });
});
