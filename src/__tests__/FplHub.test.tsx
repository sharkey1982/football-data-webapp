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
  it('shows all four stages, each linking to the right destination page(s) -- including the two genuine backtest pages under Validate', async () => {
    mockedApi.getFplTrivia.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <FplHub />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Browse' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Predict' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Validate' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Configure' })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Optimal Squad' })).toHaveAttribute('href', '/fpl/optimal-squad');
    expect(screen.getByRole('link', { name: 'Actual Matches' })).toHaveAttribute('href', '/fpl/actual-matches');
    expect(screen.getByRole('link', { name: 'Optimal Squad So Far' })).toHaveAttribute('href', '/fpl/optimal-squad-so-far');
    expect(screen.getByRole('link', { name: 'Tactical Roles' })).toHaveAttribute('href', '/fpl/tactical-roles');

    await waitFor(() => expect(mockedApi.getFplTrivia).toHaveBeenCalled());
  });
});
