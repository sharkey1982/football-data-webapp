import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { COVERAGE, FOOTER_COVERAGE } from '../lib/dataCoverage';
import { currentAndEarlierNames, nameSpans, seasonRange } from '../lib/divisionEras';
import AppLayout from '../components/AppLayout';

describe('data coverage copy', () => {
  it('states first seasons only, so a season rollover cannot make it wrong', () => {
    expect(FOOTER_COVERAGE).toBe(
      'Results from football-data.co.uk and engsoccerdata · England from 1992/93 · 18 other top flights from 2011/12 or 2016/17'
    );
    expect(Object.values(COVERAGE).join(' ')).not.toMatch(/2025\/26|2026\/27/);
  });

  it('the footer shows it', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<p>page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText(FOOTER_COVERAGE)).toBeInTheDocument();
  });
});

describe('division names by era', () => {
  const rows = [
    { season_label: '2526', league_name: 'National League' },
    { season_label: '0405', league_name: 'Conference National' },
    { season_label: '1415', league_name: 'Conference National' },
    { season_label: '1516', league_name: 'National League' },
  ];

  it('runs of the same name, oldest first', () => {
    expect(nameSpans(rows)).toEqual([
      { name: 'Conference National', from: '0405', to: '1415' },
      { name: 'National League', from: '1516', to: '2526' },
    ]);
  });

  it('today’s name with the earlier ones', () => {
    expect(currentAndEarlierNames(rows)).toEqual({ name: 'National League', earlier: 'Conference National 2004/05–2014/15' });
    expect(currentAndEarlierNames(rows.slice(0, 1))).toEqual({ name: 'National League', earlier: null });
    expect(seasonRange('9293', '9293')).toBe('1992/93');
  });
});
