import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import ValuePage from '../pages/fpl/ValuePage';
import * as api from '../lib/valueApi';

vi.mock('../lib/valueApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/valueApi');
  return { ...actual, getActualValueTable: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const row = (over: Partial<api.ValueRow>): api.ValueRow => ({
  fpl_player_id: 1, web_name: 'Bogle', slug: 'bogle', team_name: 'Leeds',
  position_label: 'DEF', price: 4.6, total_points: 37, points_per_million: 8.04,
  minutes: 299, goals: 2, assists: 0, clean_sheets: 2, bonus: 6, ownership: 5.1, ...over,
});

describe('ValuePage', () => {
  it('filters out cameo players via the minutes floor', async () => {
    mocked.getActualValueTable.mockResolvedValue([
      row({}),
      // Scored once off the bench and never played again -- a great
      // ratio that means nothing, which is exactly what the floor is for.
      row({ fpl_player_id: 2, web_name: 'Cameo', slug: 'cameo', minutes: 12, points_per_million: 9.9 }),
    ]);

    render(<MemoryRouter><ValuePage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('Bogle')).toBeInTheDocument());
    expect(screen.queryByText('Cameo')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox'), '0');
    expect(screen.getByText('Cameo')).toBeInTheDocument();
  });

  it('shows the contributions behind each ratio, so it can be interrogated', async () => {
    mocked.getActualValueTable.mockResolvedValue([row({})]);
    render(<MemoryRouter><ValuePage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('8.04')).toBeInTheDocument());
    // Goals, assists, clean sheets and bonus all present: 8.04 from
    // bonus is a different proposition from 8.04 from goals.
    for (const col of ['G', 'A', 'CS', 'Bonus']) {
      expect(screen.getByRole('columnheader', { name: col })).toBeInTheDocument();
    }
  });
});
