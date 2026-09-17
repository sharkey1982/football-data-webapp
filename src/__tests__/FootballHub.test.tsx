import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FootballHub from '../pages/FootballHub';
import * as landingApi from '../lib/landingApi';

vi.mock('../lib/landingApi', async () => {
  const actual = await vi.importActual<typeof landingApi>('../lib/landingApi');
  return { ...actual, getFootballTrivia: vi.fn() };
});

const mockedApi = landingApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('FootballHub page', () => {
  it('shows all four stages, each linking to the right destination page(s)', async () => {
    mockedApi.getFootballTrivia.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <FootballHub />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Browse' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Predict' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Validate' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Configure' })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Fixtures & Results' })).toHaveAttribute('href', '/fixtures');
    expect(screen.getByRole('link', { name: 'League Table' })).toHaveAttribute('href', '/table');
    expect(screen.getByRole('link', { name: 'Match Preview' })).toHaveAttribute('href', '/preview');

    // Validate has no dedicated page yet -- it should say so, not silently
    // point at the interim page as if it were the real thing.
    expect(screen.getByText(/dedicated page for this is planned/)).toBeInTheDocument();

    await waitFor(() => expect(mockedApi.getFootballTrivia).toHaveBeenCalled());
  });
});
