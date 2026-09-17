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
  it('shows all four stages as clickable boxes, each linking to its primary destination, with any further pages as secondary links', async () => {
    mockedApi.getFootballTrivia.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <FootballHub />
      </MemoryRouter>
    );

    // The stage title itself is the box's own primary link.
    expect(screen.getByRole('link', { name: 'Browse' })).toHaveAttribute('href', '/fixtures');
    expect(screen.getByRole('link', { name: 'Predict' })).toHaveAttribute('href', '/preview');
    expect(screen.getByRole('link', { name: 'Validate' })).toHaveAttribute('href', '/team-strength');
    expect(screen.getByRole('link', { name: 'Configure' })).toHaveAttribute('href', '/team-strength');

    // Secondary pages a stage also covers are separate, independently
    // clickable links inside the box.
    expect(screen.getByRole('link', { name: 'League Table' })).toHaveAttribute('href', '/table');
    expect(screen.getByRole('link', { name: 'Team Explorer' })).toHaveAttribute('href', '/teams');
    expect(screen.getByRole('link', { name: 'Team Strength' })).toHaveAttribute('href', '/team-strength');

    // Validate has no dedicated page yet -- it should say so, not silently
    // point at the interim page as if it were the real thing.
    expect(screen.getByText(/dedicated page for this is planned/)).toBeInTheDocument();

    await waitFor(() => expect(mockedApi.getFootballTrivia).toHaveBeenCalled());
  });
});
