import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from '../pages/Landing';
import * as landingApi from '../lib/landingApi';

vi.mock('../lib/landingApi', async () => {
  const actual = await vi.importActual<typeof landingApi>('../lib/landingApi');
  return { ...actual, getLandingTrivia: vi.fn() };
});

const mockedApi = landingApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('Landing page', () => {
  it('asks what the visitor is here to do, and offers Football and Fantasy Premier League as the two themes', async () => {
    mockedApi.getLandingTrivia.mockResolvedValue([
      {
        question: 'Which scoreline shows up more than any other in Premier League history?',
        options: ['1\u20131', '1\u20130', '2\u20131'],
        correctIndex: 0,
        explanation: '1\u20131 \u2014 10.8% of every match in the archive, just ahead of 1\u20130 at 8.9%.',
      },
    ]);

    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );

    expect(screen.getByText('What are you here to do?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Football/ })).toHaveAttribute('href', '/football');
    expect(screen.getByRole('link', { name: /Fantasy Premier League/ })).toHaveAttribute('href', '/fpl/start');

    await waitFor(() => expect(screen.getByText(/shows up more than any other in Premier League history/)).toBeInTheDocument());
  });

  it('shows no trivia section at all if the trivia fetch fails or returns nothing -- the two theme buttons are the only thing that must always work', async () => {
    mockedApi.getLandingTrivia.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );

    await waitFor(() => expect(mockedApi.getLandingTrivia).toHaveBeenCalled());
    expect(screen.queryByText('Guess it')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Football/ })).toBeInTheDocument();
  });
});
