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

const mocked = landingApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('FootballHub page', () => {
  it('shows Discover and Predict as compact boxes linking to their own stage pages', async () => {
    mocked.getFootballTrivia.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <FootballHub />
      </MemoryRouter>
    );

    // Each box links to the stage page, not straight to a destination --
    // the destinations and their explanations live on the stage page now,
    // which is what keeps all four boxes on one phone screen.
    expect(screen.getByRole('link', { name: /Discover/ })).toHaveAttribute('href', '/football/discover');
    expect(screen.getByRole('link', { name: /Predict/ })).toHaveAttribute('href', '/football/predict');

    await waitFor(() => expect(mocked.getFootballTrivia).toHaveBeenCalled());
  });
});
