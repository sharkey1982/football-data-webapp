import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AppLayout from '../components/AppLayout';

function Stub() {
  return <div>page content</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Stub />} />
          <Route path="table" element={<Stub />} />
          <Route path="team-strength" element={<Stub />} />
          <Route path="teams" element={<Stub />} />
          <Route path="preview" element={<Stub />} />
          <Route path="fantasy" element={<Stub />} />
          <Route path="fpl" element={<Stub />} />
          <Route path="fpl/optimal-squad" element={<Stub />} />
          <Route path="fpl/player-points" element={<Stub />} />
          <Route path="fpl/tactical-roles" element={<Stub />} />
          <Route path="results-data" element={<Stub />} />
          <Route path="source-data" element={<Stub />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('AppLayout main nav', () => {
  it('shows four top-level headings: Football, Fantasy, Data, FPL Admin -- no standalone items alongside them', () => {
    renderAt('/');
    expect(screen.getByRole('button', { name: /Football/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fantasy/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Data/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /FPL Admin/ })).toBeInTheDocument();
    // Old flat top-level items should not exist as their own top-level buttons any more.
    expect(screen.queryByRole('button', { name: /^League Table$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Optimal Squad$/ })).not.toBeInTheDocument();
  });

  it('FPL Admin dropdown links to Team Strength, Tactical Roles, and Optimal Squad -- duplicating them from their own groups, for the described review-then-optimise workflow', async () => {
    renderAt('/');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /FPL Admin/ }));
    expect(screen.getByRole('link', { name: 'Team Strength' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tactical Roles' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Optimal Squad' })).toBeInTheDocument();
  });

  it('Fantasy dropdown contains Optimal Squad, Fixture Heat Map, and Match Projections', async () => {
    renderAt('/');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Fantasy/ }));
    expect(screen.getByRole('link', { name: 'Optimal Squad' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fixture Heat Map' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Match Projections' })).toBeInTheDocument();
  });

  it('highlights Optimal Squad, not Match Projections, when on /fpl/optimal-squad', async () => {
    renderAt('/fpl/optimal-squad');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Fantasy/ }));

    const optimalSquadLink = screen.getByRole('link', { name: 'Optimal Squad' });
    const matchProjectionsLink = screen.getByRole('link', { name: 'Match Projections' });
    expect(optimalSquadLink.className).toContain('bg-amber-500');
    expect(matchProjectionsLink.className).not.toContain('bg-amber-500');
  });

  it('highlights Match Projections, not Optimal Squad, when on /fpl itself', async () => {
    renderAt('/fpl');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Fantasy/ }));

    const optimalSquadLink = screen.getByRole('link', { name: 'Optimal Squad' });
    const matchProjectionsLink = screen.getByRole('link', { name: 'Match Projections' });
    expect(matchProjectionsLink.className).toContain('bg-amber-500');
    expect(optimalSquadLink.className).not.toContain('bg-amber-500');
  });

  it('highlights the Football heading when on the root Fixtures route', () => {
    renderAt('/');
    expect(screen.getByRole('button', { name: /Football/ }).className).toContain('bg-amber-500');
  });

  it('Football dropdown contains Team Strength, and visiting it highlights Football, not League Table', async () => {
    renderAt('/team-strength');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Football/ }));

    expect(screen.getByRole('link', { name: 'Team Strength' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Team Strength' }).className).toContain('bg-amber-500');
    expect(screen.getByRole('link', { name: 'League Table' }).className).not.toContain('bg-amber-500');
    expect(screen.getByRole('button', { name: /Football/ }).className).toContain('bg-amber-500');
  });

  it('Fantasy dropdown also contains Player Points Table, distinct from Match Projections and Optimal Squad', async () => {
    renderAt('/');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Fantasy/ }));
    expect(screen.getByRole('link', { name: 'Player Points Table' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Match Projections' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Optimal Squad' })).toBeInTheDocument();
  });

  it('highlights only Player Points Table, not Match Projections or Optimal Squad, when on /fpl/player-points', async () => {
    renderAt('/fpl/player-points');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Fantasy/ }));

    expect(screen.getByRole('link', { name: 'Player Points Table' }).className).toContain('bg-amber-500');
    expect(screen.getByRole('link', { name: 'Match Projections' }).className).not.toContain('bg-amber-500');
    expect(screen.getByRole('link', { name: 'Optimal Squad' }).className).not.toContain('bg-amber-500');
  });
});
