import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StagePage from '../pages/StagePage';
import { THEMES } from '../lib/journey';

function renderStage(themeKey: 'football' | 'fpl', stage: string) {
  const base = THEMES[themeKey].hubPath;
  return render(
    <MemoryRouter initialEntries={[`${base}/${stage}`]}>
      <Routes>
        <Route path={`${base}/:stage`} element={<StagePage themeKey={themeKey} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('StagePage', () => {
  it('renders a stage entirely from the journey config, including every destination', () => {
    renderStage('football', 'discover');
    expect(screen.getByRole('heading', { level: 1, name: 'Discover' })).toBeInTheDocument();
    for (const link of THEMES.football.stages[0].links) {
      expect(screen.getByRole('link', { name: new RegExp(link.label) })).toHaveAttribute('href', link.to);
    }
  });

  it('surfaces a stage note rather than pretending an interim link is the real page', () => {
    renderStage('football', 'validate');
    expect(screen.getByText(/dedicated page for this is planned/)).toBeInTheDocument();
  });

  it('links across to the other three stages', () => {
    renderStage('fpl', 'predict');
    expect(screen.getByRole('link', { name: 'Discover' })).toHaveAttribute('href', '/fpl/start/discover');
    expect(screen.getByRole('link', { name: 'Validate' })).toHaveAttribute('href', '/fpl/start/validate');
    expect(screen.getByRole('link', { name: 'Configure' })).toHaveAttribute('href', '/fpl/start/configure');
  });

  it('shows a not-found state for an unknown stage', () => {
    renderStage('football', 'nonsense');
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeInTheDocument();
  });
});
