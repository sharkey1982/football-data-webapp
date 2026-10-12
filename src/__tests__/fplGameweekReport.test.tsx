import React from 'react';
void React;
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GameweekReportPage from '../pages/fpl/GameweekReportPage';
import GameweekHubPage from '../pages/fpl/GameweekHubPage';
import { movedTeams, reportPath, seasonDisplay, signed, type GameweekReport } from '../lib/fplGameweekReport';

import { payload, previewReport, previewPayload, report } from './fixtures/gameweekReflection';

function renderReport(r: GameweekReport, path = reportPath('2026-27', 6, 'reflection')) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/fpl/gameweek/:season/:gw/:kind" element={<GameweekReportPage initialData={r} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('gameweek report helpers', () => {
  it('formats paths, seasons and signed numbers', () => {
    expect(reportPath('2026-27', 7, 'preview')).toBe('/fpl/gameweek/2026-27/7/preview');
    expect(seasonDisplay('2026-27')).toBe('2026/27');
    expect(signed(4.6)).toBe('+4.6');
    expect(signed(-0.6)).toBe('−0.6');
    expect(signed(0.01)).toBe('0.0');
    expect(signed(null)).toBe('–');
  });

  it('only lists teams whose projected goals moved', () => {
    expect(movedTeams(payload.goals.next5).map((r) => r.team)).toEqual(['Chelsea']);
  });
});

describe('gameweek reflection page', () => {
  it('renders every section from the payload', () => {
    renderReport(report);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('GW6 reflection');
    for (const name of ['Goals against the model', 'Minutes and positions', 'Set pieces', 'Captaincy', 'Since the deadline']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    // Unplayed matches are left out of the goals table.
    const goals = screen.getByRole('table', { name: /Each match/ });
    expect(goals).toHaveTextContent('Chelsea v Bournemouth');
    expect(goals).not.toHaveTextContent('Coventry');
    expect(goals).toHaveTextContent('+2.9'); // 6 goals v 3.08 expected
    // Line changes in the table; side swaps behind the disclosure.
    expect(screen.getByRole('table', { name: 'Players who changed line' })).toHaveTextContent('Mbeumo');
    expect(screen.getByRole('table', { name: 'Players who changed line' })).not.toHaveTextContent('Semenyo');
    expect(screen.getByText(/1 more played the same line/)).toBeInTheDocument();
    // Captaincy season table and the honest context.
    const cap = screen.getByRole('table', { name: 'Captain points by approach this season' });
    expect(within(cap).getByText('86')).toBeInTheDocument();
    expect(screen.getByText(/blanked 27.7% of the time/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /should you always captain Haaland/ })).toHaveAttribute('href', '/fpl/articles/should-you-always-captain-haaland');
    // Lag caveat when goals moved, and the set-piece gap stated.
    expect(screen.getByText(/shows up a week later/)).toBeInTheDocument();
    expect(screen.getByText(/Who took each penalty isn't recorded/)).toBeInTheDocument();
    expect(screen.queryByText(/Written before FPL confirmed/)).not.toBeInTheDocument();
  });

  it('flags a report written before bonus was confirmed', () => {
    renderReport({ ...report, payload: { ...payload, bonus_confirmed: false } });
    expect(screen.getByText(/Written before FPL confirmed/)).toBeInTheDocument();
  });

  it('sorts a table when a header is clicked', () => {
    renderReport(report);
    const table = screen.getByRole('table', { name: 'Captain points by approach this season' });
    fireEvent.click(within(table).getByRole('button', { name: 'Captain points' }));
    const rows = within(table).getAllByRole('row').slice(1).map((r) => r.textContent ?? '');
    expect(rows[0]).toContain('Hindsight best');
  });

  it('rejects malformed URLs', () => {
    renderReport(report, '/fpl/gameweek/2026/6/reflection');
    expect(screen.queryByRole('heading', { level: 1, name: /GW6 reflection/ })).not.toBeInTheDocument();
  });
});

describe('gameweek hub', () => {
  it('lists published reports by season with links', () => {
    const { payload: _payload, ...entry } = report;
    void _payload;
    render(<MemoryRouter><GameweekHubPage initialData={[entry]} /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 2, name: '2026/27' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GW6 reflection' })).toHaveAttribute('href', '/fpl/gameweek/2026-27/6/reflection');
  });
});

describe('gameweek preview page', () => {
  it('renders the preview sections', () => {
    render(
      <MemoryRouter initialEntries={['/fpl/gameweek/2026-27/7/preview']}>
        <Routes>
          <Route path="/fpl/gameweek/:season/:gw/:kind" element={<GameweekReportPage initialData={previewReport} />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('GW7 preview');
    for (const name of ['What’s changed since GW6', 'Fixtures', 'Captaincy', 'Best picks by position', 'Minutes watch', 'The next ten gameweeks']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByRole('table', { name: /Captaincy: projected points/ })).toHaveTextContent('30%');
    expect(screen.getByRole('table', { name: /Fixtures: expected goals/ })).toHaveTextContent('45%/6%');
    expect(screen.getByText(/Two fixtures this gameweek: Chelsea/)).toBeInTheDocument();
    expect(screen.getByText(/Since the last version:/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'xG or FDR?' })).toHaveAttribute('href', '/fpl/articles/xg-or-fdr');
    // Home opponents in capitals, away in lower case.
    expect(screen.getByRole('table', { name: /next ten gameweeks/ })).toHaveTextContent('IPS 2.8');
  });

  it('a locked preview says so and hides the changes note', () => {
    render(
      <MemoryRouter initialEntries={['/fpl/gameweek/2026-27/7/preview']}>
        <Routes>
          <Route path="/fpl/gameweek/:season/:gw/:kind" element={<GameweekReportPage initialData={{ ...previewReport, frozen: true, payload: { ...previewPayload, frozen: true } }} />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getAllByText(/Locked at the deadline/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Since the last version:/)).not.toBeInTheDocument();
  });
});
