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
          <Route path="teams" element={<Stub />} />
          <Route path="preview" element={<Stub />} />
          <Route path="fantasy" element={<Stub />} />
          <Route path="fpl" element={<Stub />} />
          <Route path="fpl/optimal-squad" element={<Stub />} />
          <Route path="results-data" element={<Stub />} />
          <Route path="source-data" element={<Stub />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('AppLayout main nav', () => {
  it('shows three dropdown headings (Football, Fantasy, Data) plus one flat top-level link (Player Projections)', () => {
    renderAt('/');
    expect(screen.getByRole('button', { name: /Football/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fantasy/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Data/ })).toBeInTheDocument();
    // Old flat top-level items should not exist as their own top-level buttons any more.
    expect(screen.queryByRole('button', { name: /^League Table$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Optimal Squad$/ })).not.toBeInTheDocument();
    // Player Projections is a real top-level link (not a dropdown button), always visible.
    expect(screen.getByRole('link', { name: 'Player Projections' })).toBeInTheDocument();
  });

  it('Fantasy dropdown contains Optimal Squad and Fantasy Fixtures -- Player Projections moved out to its own top-level link', async () => {
    renderAt('/');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Fantasy/ }));
    expect(screen.getByRole('link', { name: 'Optimal Squad' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fantasy Fixtures' })).toBeInTheDocument();
    // Not inside the Fantasy dropdown any more -- but still findable as the one standalone link.
    const links = screen.getAllByRole('link', { name: 'Player Projections' });
    expect(links).toHaveLength(1);
  });

  it('highlights Optimal Squad, not Player Projections, when on /fpl/optimal-squad', async () => {
    renderAt('/fpl/optimal-squad');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Fantasy/ }));

    const optimalSquadLink = screen.getByRole('link', { name: 'Optimal Squad' });
    const playerProjectionsLink = screen.getByRole('link', { name: 'Player Projections' });
    expect(optimalSquadLink.className).toContain('bg-amber-500');
    expect(playerProjectionsLink.className).not.toContain('bg-amber-500');
  });

  it('highlights Player Projections, not Optimal Squad, when on /fpl itself', async () => {
    renderAt('/fpl');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Fantasy/ }));

    const optimalSquadLink = screen.getByRole('link', { name: 'Optimal Squad' });
    const playerProjectionsLink = screen.getByRole('link', { name: 'Player Projections' });
    expect(playerProjectionsLink.className).toContain('bg-amber-500');
    expect(optimalSquadLink.className).not.toContain('bg-amber-500');
  });

  it('highlights the Football heading when on the root Fixtures route', () => {
    renderAt('/');
    expect(screen.getByRole('button', { name: /Football/ }).className).toContain('bg-amber-500');
  });
});
