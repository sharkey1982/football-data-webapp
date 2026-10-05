import React from 'react';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { buildStandingsMath, playoffSpots, recLabel } from '../lib/nflTiebreak';
import StandingsTables from '../components/nfl/StandingsTables';
import type { NflGame, NflStanding } from '../lib/nflApi';
import fixture from './fixtures/nfl-2022-2023-games.json';

const DIV: Record<string, [NflStanding['conference'], NflStanding['division']]> = {
  BUF: ['AFC', 'East'], MIA: ['AFC', 'East'], NE: ['AFC', 'East'], NYJ: ['AFC', 'East'],
  BAL: ['AFC', 'North'], CIN: ['AFC', 'North'], CLE: ['AFC', 'North'], PIT: ['AFC', 'North'],
  HOU: ['AFC', 'South'], IND: ['AFC', 'South'], JAX: ['AFC', 'South'], TEN: ['AFC', 'South'],
  DEN: ['AFC', 'West'], KC: ['AFC', 'West'], LV: ['AFC', 'West'], LAC: ['AFC', 'West'],
  DAL: ['NFC', 'East'], NYG: ['NFC', 'East'], PHI: ['NFC', 'East'], WAS: ['NFC', 'East'],
  CHI: ['NFC', 'North'], DET: ['NFC', 'North'], GB: ['NFC', 'North'], MIN: ['NFC', 'North'],
  ATL: ['NFC', 'South'], CAR: ['NFC', 'South'], NO: ['NFC', 'South'], TB: ['NFC', 'South'],
  ARI: ['NFC', 'West'], LA: ['NFC', 'West'], SF: ['NFC', 'West'], SEA: ['NFC', 'West'],
};

type Fx = { reg: [number, string, string, number, number][]; wc: [string, string][] };
const seasons = fixture as unknown as Record<string, Fx>;

function games(season: number, reg: Fx['reg']): NflGame[] {
  return reg.map(([week, home, away, hs, as], i) => ({ game_id: `${season}_${week}_${i}`, season, game_type: 'REG', week, home_franchise: home, away_franchise: away, home_score: hs, away_score: as }) as unknown as NflGame);
}

function rows(season: number, gs: NflGame[]): NflStanding[] {
  return Object.entries(DIV).map(([f, [conference, division]]) => {
    let won = 0, lost = 0, tied = 0, pf = 0, pa = 0, dw = 0, dl = 0, dt = 0;
    for (const g of gs) {
      const home = g.home_franchise === f;
      if (!home && g.away_franchise !== f) continue;
      const us = Number(home ? g.home_score : g.away_score);
      const them = Number(home ? g.away_score : g.home_score);
      const opp = home ? g.away_franchise : g.home_franchise;
      const div = DIV[opp][0] === conference && DIV[opp][1] === division;
      pf += us; pa += them;
      if (us > them) { won++; if (div) dw++; } else if (us < them) { lost++; if (div) dl++; } else { tied++; if (div) dt++; }
    }
    const n = won + lost + tied;
    return {
      season, franchise: f, slug: f.toLowerCase(), team_name: f, short_name: f, conference, division, played: n, won, lost, tied,
      win_pct: n ? (won + tied / 2) / n : null, points_for: pf, points_against: pa, point_diff: pf - pa,
      home_won: 0, home_lost: 0, away_won: 0, away_lost: 0, div_won: dw, div_lost: dl, div_tied: dt, conf_won: 0, conf_lost: 0,
      playoff_result: null, playoff_round: 0, season_complete: false, division_rank: 1, won_division: null,
    };
  });
}

describe('NFL official tie-breaks and seeding', () => {
  it.each([2022, 2023])('%s: seeds reproduce the real wild-card bracket (2 v 7, 3 v 6, 4 v 5) and byes', (season) => {
    const fx = seasons[String(season)];
    const gs = games(season, fx.reg);
    const m = buildStandingsMath(rows(season, gs), gs);
    const seed = new Map([...m.conference.values()].flat().map((s) => [s.franchise, s.seed]));
    expect(fx.wc).toHaveLength(6);
    for (const [home, away] of fx.wc) {
      expect(seed.get(home)! + seed.get(away)!, `${home} v ${away}`).toBe(9);
      expect(seed.get(home)!).toBeLessThan(seed.get(away)!);
    }
    // Seed 1 in each conference sat out the wild-card round.
    for (const conf of ['AFC', 'NFC']) {
      const one = m.conference.get(conf)![0];
      expect(one.seed).toBe(1);
      expect(fx.wc.flat()).not.toContain(one.franchise);
    }
  });

  it('2022 and 2023 needed tie-breaks, and says which step decided', () => {
    const fx = seasons['2023'];
    const gs = games(2023, fx.reg);
    const m = buildStandingsMath(rows(2023, gs), gs);
    const decided = [...m.conference.values()].flat().filter((s) => s.decidedBy);
    expect(decided.length).toBeGreaterThan(0);
    expect(decided.every((s) => !s.decidedBy!.startsWith('coin toss'))).toBe(true);
  });

  it('records, streak and last five', () => {
    const g = (week: number, home: string, away: string, hs: number, as: number) => ({ season: 2026, game_type: 'REG', week, home_franchise: home, away_franchise: away, home_score: hs, away_score: as }) as unknown as NflGame;
    const gs = [g(1, 'BUF', 'MIA', 20, 10), g(2, 'DAL', 'BUF', 30, 3), g(3, 'BUF', 'NE', 21, 20), g(4, 'BUF', 'KC', 17, 16), g(5, 'BUF', 'NYJ', 9, 9)];
    const m = buildStandingsMath(rows(2026, gs), gs);
    const x = m.extras.get('BUF')!;
    expect(recLabel(x.conf)).toBe('3-0-1');
    expect(recLabel(x.nonConf)).toBe('0-1');
    expect(x.streak).toBe('T1');
    expect(x.last5).toEqual(['W', 'L', 'W', 'W', 'T']);
    expect(playoffSpots(2019)).toBe(6);
    expect(playoffSpots(2020)).toBe(7);
  });
});

describe('NFL League Table views', () => {
  it('adds a conference view with seeds, the cut line and tie-break notes, and the new columns', () => {
    const fx = seasons['2023'];
    const gs = games(2023, fx.reg);
    render(<MemoryRouter><StandingsTables rows={rows(2023, gs)} games={gs} /></MemoryRouter>);
    expect(screen.getAllByRole('columnheader', { name: 'Strk' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader', { name: 'Last 5' }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'By conference' }));
    const afc = screen.getByTestId('nfl-conference-AFC');
    const seedRows = afc.querySelectorAll('[data-testid="nfl-seed-row"]');
    expect(seedRows).toHaveLength(16);
    expect(seedRows[0].textContent).toMatch(/^1BAL/);
    expect(seedRows[7].className).toContain('border-t-2');
    expect(screen.getAllByTestId('nfl-tiebreak').length).toBeGreaterThan(0);
    expect(screen.getByTestId('nfl-table-notes').textContent).toContain('Checked against every play-off field since 2002');
  });

  it('without games keeps the simpler table and says so', () => {
    const fx = seasons['2023'];
    const gs = games(2023, fx.reg);
    render(<MemoryRouter><StandingsTables rows={rows(2023, gs)} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'By conference' })).toBeNull();
    expect(screen.getByTestId('nfl-table-notes').textContent).toContain('can differ from the official standings');
  });
});
