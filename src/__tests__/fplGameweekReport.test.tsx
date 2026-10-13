import React from 'react';
void React;
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GameweekReportPage from '../pages/fpl/GameweekReportPage';
import GameweekHubPage from '../pages/fpl/GameweekHubPage';
import { reportPath, seasonDisplay, signed, type GameweekReport } from '../lib/fplGameweekReport';

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
});

describe('gameweek reflection page', () => {
  it('renders the five themes, each with its model box', () => {
    renderReport(report);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('GW6 reflection');
    for (const name of ['Team goals', 'Positions and playing time', 'Injuries, suspensions and congestion', 'Set pieces', 'Captaincy']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('heading', { level: 3, name: 'What changes in the model' })).toHaveLength(4);
    // Summary tiles link to each theme and carry its status.
    const tiles = screen.getByRole('heading', { name: 'The week in five lines' }).parentElement!;
    expect(within(tiles).getByRole('link', { name: /36 goals against 29.1 expected/ })).toHaveAttribute('href', '#goals');
    expect(within(tiles).getByText('Ratings updated')).toBeInTheDocument();
    expect(within(tiles).getByText('Flags updated')).toBeInTheDocument();
    // Goals: per-team chart, signal and noise, rating moves.
    const chart = screen.getByRole('table', { name: /Each team: expected goals/ });
    expect(within(chart).getByRole('rowheader', { name: /Chelsea/ })).toBeInTheDocument();
    expect(chart).toHaveTextContent('+3.1'); // 5 goals v 1.94 expected
    expect(screen.getByText(/Nottingham Forest made 3.3 xG against 1.3 expected/)).toBeInTheDocument();
    expect(screen.getByText(/Chelsea scored 5 from 1.1 xG/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Team rating moves since the deadline' })).toHaveTextContent('1.21 → 1.27');
    // Congestion and set pieces against our hierarchy.
    expect(screen.getByText(/followed a 3-week break/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GW7 preview' })).toHaveAttribute('href', '/fpl/gameweek/2026-27/7/preview');
    expect(screen.getByRole('list', { name: /set-piece takers/ })).toHaveTextContent('McGinn (right corners)');
    expect(screen.getByText(/can’t see who took each penalty/)).toBeInTheDocument();
    // Captaincy: ranges and volatility.
    expect(screen.getByRole('table', { name: /simulated range/ })).toHaveTextContent('66%');
    const season = screen.getByRole('table', { name: 'Captain points by approach this season' });
    expect(within(season).getByText('86')).toBeInTheDocument();
    expect(within(season).getByText('2.9')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /should you always captain Haaland/ })).toHaveAttribute('href', '/fpl/articles/should-you-always-captain-haaland');
    expect(screen.queryByText(/Written before FPL confirmed/)).not.toBeInTheDocument();
  });

  it('measures rotation after a midweek match', () => {
    const cup = { team: 'Liverpool', comp: 'Champions League', date: '2026-10-14', opp: 'LASK', home: false,
      league_date: '2026-10-17T14:00:00+00:00', league_opp: 'Brentford', league_home: false, rest: 3 };
    renderReport({ ...report, payload: { ...payload, incidents: { ...payload.incidents,
      congestion: { ...payload.incidents.congestion, before_gw: [cup], days_since_previous: 5 },
      rotation: { busy: { teams: 1, players: 10, expected: 9.2, started: 7 }, rest: { teams: 19, players: 190, expected: 178.4, started: 176 } } } } });
    expect(screen.getByRole('table', { name: /cup or European match/ })).toHaveTextContent('LASK');
    const rot = screen.getByRole('table', { name: /expected starts against actual/ });
    expect(rot).toHaveTextContent('9.2');
    expect(rot).toHaveTextContent('−24%');
    expect(screen.getAllByText('Rotation measured').length).toBeGreaterThan(0);
  });

  it('says when the closing prices are not in yet', () => {
    renderReport({ ...report, payload: { ...payload, prices_in: false, goals: { ...payload.goals, ratings: { status: 'pending', moves: [], deadline: '2026-10-10' } } } });
    expect(screen.getAllByText('Waiting for prices').length).toBeGreaterThan(0);
    expect(screen.getByText(/closing prices hadn’t arrived/)).toBeInTheDocument();
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
    // Midweek matches before the gameweek, and the rest flag in the captaincy table.
    expect(screen.getByRole('heading', { level: 2, name: 'Midweek matches' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /cup or European match/ })).toHaveTextContent('PSG');
    expect(screen.getByRole('table', { name: /Captaincy: projected points/ })).toHaveTextContent('3 days’ rest');
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

describe('gameweek posts admin page', () => {
  it('renders the Reddit text and X thread with copy buttons', async () => {
    const { default: GameweekPostsPage } = await import('../pages/admin/GameweekPostsPage');
    const supa = await import('../lib/supabase');
    const row = { season_label: '2026-27', fpl_event_id: 6, kind: 'reflection', version: 1, frozen: false, published_at: '2026-10-13T06:00:00Z',
      title: 't', reddit_md: '**FPL GW6 reflection**', x_thread: ['FPL GW6 reflection 🧵', 'Link: https://fixtureshark.com/fpl/gameweek/2026-27/6/reflection'] };
    const chain = { select: () => chain, order: () => chain, limit: () => Promise.resolve({ data: [row], error: null }) };
    const spy = vi.spyOn(supa.supabase, 'from').mockReturnValue(chain as never);
    render(<MemoryRouter><GameweekPostsPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { level: 2, name: /GW6 reflection/ })).toBeInTheDocument();
    expect(screen.getByDisplayValue('**FPL GW6 reflection**')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Copy/ }).length).toBe(4);
    spy.mockRestore();
  });
});
