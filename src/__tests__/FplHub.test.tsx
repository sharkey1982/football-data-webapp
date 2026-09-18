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

const mocked = landingApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('FplHub page', () => {
  it('shows all four stages as compact boxes linking to their own stage pages', async () => {
    mocked.getFplTrivia.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <FplHub />
      </MemoryRouter>
    );

    // Each box links to the stage page, not straight to a destination --
    // the destinations and their explanations live on the stage page now,
    // which is what keeps all four boxes on one phone screen.
    expect(screen.getByRole('link', { name: /Discover/ })).toHaveAttribute('href', '/fpl/start/discover');
    expect(screen.getByRole('link', { name: /Predict/ })).toHaveAttribute('href', '/fpl/start/predict');
    expect(screen.getByRole('link', { name: /Validate/ })).toHaveAttribute('href', '/fpl/start/validate');
    expect(screen.getByRole('link', { name: /Configure/ })).toHaveAttribute('href', '/fpl/start/configure');

    await waitFor(() => expect(mocked.getFplTrivia).toHaveBeenCalled());
  });
});
