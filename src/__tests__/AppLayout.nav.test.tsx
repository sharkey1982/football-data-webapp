import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
          <Route path="football" element={<Stub />} />
          <Route path="fixtures" element={<Stub />} />
          <Route path="table" element={<Stub />} />
          <Route path="team-strength" element={<Stub />} />
          <Route path="teams" element={<Stub />} />
          <Route path="preview" element={<Stub />} />
          <Route path="fantasy" element={<Stub />} />
          <Route path="fpl/start" element={<Stub />} />
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
  it('shows four top-level headings: Football, Fantasy, Admin -- no standalone items alongside them', () => {
    renderAt('/');
    expect(screen.getByRole('button', { name: /Football/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fantasy/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Admin/ })).toBeInTheDocument();
    // Old flat top-level items should not exist as their own top-level buttons any more.
    expect(screen.queryByRole('button', { name: /^League Table$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Optimiser$/ })).not.toBeInTheDocument();
  });

  it('the single Admin menu holds the whole workflow: adjust, optimise, then inspect', async () => {
    renderAt('/');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Admin/ }));
    expect(screen.getByRole('link', { name: 'Adjust Team Ratings' })).toHaveAttribute('href', '/team-strength');
    expect(screen.getByRole('link', { name: 'Tactical Roles' })).toBeInTheDocument();
    // Also present in the page footer, so assert at least one exists
    // in the nav rather than requiring uniqueness across the document.
    expect(screen.getAllByRole('link', { name: 'Data Health' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Optimiser' })).toBeInTheDocument();
  });

  it('Fantasy dropdown contains Optimiser, Fixture Heat Map, and Gameweek Projections', async () => {
    renderAt('/');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Fantasy/ }));
    expect(screen.getByRole('link', { name: 'Optimiser' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fixture Heat Map' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gameweek Projections' })).toBeInTheDocument();
  });

  it('highlights Optimiser, not Gameweek Projections, when on /fpl/optimal-squad', async () => {
    renderAt('/fpl/optimal-squad');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Fantasy/ }));

    const optimalSquadLink = screen.getByRole('link', { name: 'Optimiser' });
    const matchProjectionsLink = screen.getByRole('link', { name: 'Gameweek Projections' });
    expect(optimalSquadLink.className).toContain('bg-amber-500');
    expect(matchProjectionsLink.className).not.toContain('bg-amber-500');
  });

  it('highlights Gameweek Projections, not Optimiser, when on /fpl itself', async () => {
    renderAt('/fpl');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Fantasy/ }));

    const optimalSquadLink = screen.getByRole('link', { name: 'Optimiser' });
    const matchProjectionsLink = screen.getByRole('link', { name: 'Gameweek Projections' });
    expect(matchProjectionsLink.className).toContain('bg-amber-500');
    expect(optimalSquadLink.className).not.toContain('bg-amber-500');
  });

  it('highlights the Football heading when on the Fixtures route (not the new landing page at /, which is outside every nav group)', () => {
    renderAt('/fixtures');
    expect(screen.getByRole('button', { name: /Football/ }).className).toContain('bg-amber-500');
  });

  it('highlights no nav group on the new landing page at / -- it is deliberately outside all four groups', () => {
    renderAt('/');
    expect(screen.getByRole('button', { name: /Football/ }).className).not.toContain('bg-amber-500');
    expect(screen.getByRole('button', { name: /Fantasy/ }).className).not.toContain('bg-amber-500');
    expect(screen.getByRole('button', { name: /^Admin/ }).className).not.toContain('bg-amber-500');

  });

  it('Football dropdown contains Team Strength (public view), and visiting it highlights Football', async () => {
    renderAt('/team-strength');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Football/ }));

    expect(screen.getByRole('link', { name: 'Team Strength' })).toHaveAttribute('href', '/team-strength');
    expect(screen.getByRole('link', { name: 'Team Strength' }).className).toContain('bg-amber-500');
    expect(screen.getByRole('link', { name: 'League Table' }).className).not.toContain('bg-amber-500');
    expect(screen.getByRole('button', { name: /Football/ }).className).toContain('bg-amber-500');
  });

  it('Fantasy dropdown also contains Player Projections, distinct from Gameweek Projections and Optimiser', async () => {
    renderAt('/');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Fantasy/ }));
    expect(screen.getByRole('link', { name: 'Player Projections' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gameweek Projections' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Optimiser' })).toBeInTheDocument();
  });

  it('highlights only Player Projections, not Gameweek Projections or Optimiser, when on /fpl/player-points', async () => {
    renderAt('/fpl/player-points');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Fantasy/ }));

    expect(screen.getByRole('link', { name: 'Player Projections' }).className).toContain('bg-amber-500');
    expect(screen.getByRole('link', { name: 'Gameweek Projections' }).className).not.toContain('bg-amber-500');
    expect(screen.getByRole('link', { name: 'Optimiser' }).className).not.toContain('bg-amber-500');
  });

  it('groups the Football menu into Discover and Predict', async () => {
    renderAt('/fixtures');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Football/ }));

    for (const stage of ['Discover', 'Predict']) {
      expect(screen.getByText(stage)).toBeInTheDocument();
    }
    // Validate folded into Predict -- it was QA language for an audience
    // that wants to know whether to trust a number, not to audit one.
    // Configure moved to Admin, since every page in it is admin-gated.
    expect(screen.queryByText('Validate')).not.toBeInTheDocument();
    expect(screen.queryByText('Configure')).not.toBeInTheDocument();
    // Renamed from "Browse" -- and the old label should be gone entirely.
    expect(screen.queryByText('Browse')).not.toBeInTheDocument();
  });

  it('keeps Team Strength public under Predict while its editing lives in Admin', async () => {
    renderAt('/fixtures');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Football/ }));
    expect(screen.getByRole('link', { name: 'Team Strength' })).toHaveAttribute('href', '/team-strength');

    await user.click(screen.getByRole('button', { name: /^Admin/ }));
    expect(screen.getByRole('link', { name: 'Adjust Team Ratings' })).toHaveAttribute('href', '/team-strength');
  });

  it('treats Results Data as a Football page now it lives under Discover', () => {
    renderAt('/results-data');
    expect(screen.getByRole('link', { name: /Back to Football/ })).toHaveAttribute('href', '/football');
  });

  it('shows a back-to-hub link on a Football destination page, pointing at /football', () => {
    renderAt('/team-strength');
    expect(screen.getByRole('link', { name: /Back to Football/ })).toHaveAttribute('href', '/football');
  });

  it('shows a back-to-hub link on a Fantasy destination page, pointing at /fpl/start', () => {
    renderAt('/fpl/optimal-squad');
    expect(screen.getByRole('link', { name: /Back to Fantasy Premier League/ })).toHaveAttribute('href', '/fpl/start');
  });

  it('shows no back-to-hub link on the hub pages themselves, the landing page, or Admin pages -- there is nothing to loop back to', () => {
    // /results-data deliberately NOT in this list any more: it moved into
    // Football > Discover, so it's a theme page and correctly DOES offer
    // a way back to the hub.
    for (const path of ['/football', '/fpl/start', '/', '/source-data']) {
      renderAt(path);
      expect(screen.queryByText(/Back to/)).not.toBeInTheDocument();
      cleanup();
    }
  });
});
