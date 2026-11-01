import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import TeamSheetsPage from '../pages/admin/TeamSheetsPage';
import * as api from '../lib/teamSheetsApi';
import { byClub, byGameweek, summarise, type TeamGame, type TeamSheetDetail, type TeamSheetList } from '../lib/teamSheetsApi';

let admin = true;
vi.mock('../lib/auth', () => ({ useAuthOptional: () => ({ isAdmin: admin, session: null, loading: false }) }));
vi.mock('../lib/teamSheetsApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/teamSheetsApi');
  return { ...actual, getTeamSheets: vi.fn(), getTeamSheetDetail: vi.fn() };
});
const getTeamSheets = api.getTeamSheets as unknown as ReturnType<typeof vi.fn>;
const getTeamSheetDetail = api.getTeamSheetDetail as unknown as ReturnType<typeof vi.fn>;

const game = (o: Partial<TeamGame>): TeamGame => ({
  gw: 1, fixture_id: 1, team_id: 1, team: 'Arsenal', team_short: 'ARS', opponent: 'Chelsea', opponent_short: 'CHE',
  home: true, kickoff: '2026-08-22T14:00:00Z', starters: 11, final: true,
  model_source: null, model_version: null, model_at: null, model_matched: null, baseline_matched: null,
  surprise: null, left_out: null, new_in: [], ...o,
});

const GAMES: TeamGame[] = [
  game({ gw: 1, fixture_id: 1, team_id: 1 }),
  game({ gw: 1, fixture_id: 1, team_id: 2, team: 'Chelsea', team_short: 'CHE', opponent: 'Arsenal', opponent_short: 'ARS', home: false }),
  game({ gw: 2, fixture_id: 11, team_id: 1, baseline_matched: 10, new_in: ['Nwaneri'] }),
  game({ gw: 2, fixture_id: 11, team_id: 2, team: 'Chelsea', team_short: 'CHE', opponent: 'Arsenal', opponent_short: 'ARS', home: false, baseline_matched: 11 }),
  game({ gw: 7, fixture_id: 61, team_id: 1, model_source: 'pre_deadline_snapshot', model_version: 'leaguewide_v6', model_at: '2026-10-17T09:00:00Z',
    model_matched: 9, baseline_matched: 10, surprise: { name: 'Nwaneri', sp: 0.12 }, left_out: { name: 'Saka', sp: 0.9, own: 30.1 } }),
  game({ gw: 7, fixture_id: 61, team_id: 2, team: 'Chelsea', team_short: 'CHE', opponent: 'Arsenal', opponent_short: 'ARS', home: false,
    model_source: 'pre_deadline_snapshot', model_version: 'leaguewide_v6', model_at: '2026-10-17T09:00:00Z',
    model_matched: 11, baseline_matched: 8, final: false }),
];
const DATA: TeamSheetList = { season_id: 13, computed_at: '2026-11-01T10:41:00Z', games: GAMES };

const DETAIL: TeamSheetDetail = {
  fixture_id: 61, team_id: 1, gw: 7, model_source: 'pre_deadline_snapshot', model_version: 'leaguewide_v6', model_at: '2026-10-17T09:00:00Z',
  baseline_fixture_id: 51, baseline_opponent: 'LEE',
  predicted: [
    { id: 10, name: 'Saka', pos: 3, sp: 0.9, own: 30.1, started: false, mins: 25 },
    { id: 11, name: 'Raya', pos: 1, sp: 0.95, own: 12, started: true, mins: 90 },
  ],
  actual: [
    { id: 11, name: 'Raya', pos: 1, mins: 90, sp: 0.95, own: 12, predicted: true, in_baseline: true },
    { id: 12, name: 'Nwaneri', pos: 3, mins: 70, sp: 0.12, own: 1.5, predicted: false, in_baseline: false },
  ],
  baseline: [
    { id: 11, name: 'Raya', pos: 1, own: 12, started: true },
    { id: 10, name: 'Saka', pos: 3, own: 30.1, started: false },
  ],
  formation: '4-2-3-1',
  roles: { '11': 'GK', '12': 'RW' },
  subs: [{ minute: 65, off_id: 12, on_id: 10, off: 'Nwaneri', on: 'Saka' }],
  subs_complete: true,
};

const renderPage = () => render(<MemoryRouter><TeamSheetsPage /></MemoryRouter>);

describe('team sheet summaries', () => {
  it('compares model and baseline on the same team-games', () => {
    const s = summarise(GAMES);
    expect(s.model).toMatchObject({ games: 2, matched: 20, full: 1 });
    expect(s.model.pct).toBeCloseTo((100 * 20) / 22);
    expect(s.baselineSame).toMatchObject({ games: 2, matched: 18, full: 0 });
    // The baseline over every game with a previous one includes GW2.
    expect(s.baselineAll).toMatchObject({ games: 4, matched: 39, full: 1 });
    expect(s.teamGames).toBe(6);
    expect(s.provisional).toBe(1);
  });

  it('scores each gameweek, with no model score where nothing was stored', () => {
    const w = byGameweek(GAMES);
    expect(w.map((r) => r.gw)).toEqual([1, 2, 7]);
    expect(w[0].baseline.pct).toBeNull();
    expect(w[1].model.pct).toBeNull();
    expect(w[1].baseline.pct).toBeCloseTo((100 * 21) / 22);
    expect(w[2].source).toBe('pre_deadline_snapshot');
    expect(w[2].provisional).toBe(1);
  });

  it('puts the club the model reads worst first', () => {
    const c = byClub(GAMES);
    expect(c.map((r) => r.team)).toEqual(['Arsenal', 'Chelsea']);
    expect(c[0].gap).toBeCloseTo((100 * 9) / 11 - (100 * 10) / 11);
  });
});

describe('TeamSheetsPage', () => {
  beforeEach(() => {
    admin = true;
    getTeamSheets.mockReset();
    getTeamSheets.mockResolvedValue(DATA);
    getTeamSheetDetail.mockReset();
    getTeamSheetDetail.mockResolvedValue(DETAIL);
  });

  it('asks nothing of the database for a non-admin', () => {
    admin = false;
    renderPage();
    expect(screen.getByText('This page is for admins.')).toBeTruthy();
    expect(getTeamSheets).not.toHaveBeenCalled();
  });

  it('shows the season tiles, the trend and says where predictions come from', async () => {
    renderPage();
    const tile = await screen.findByTestId('tile-model');
    expect(within(tile).getByText('90.9%')).toBeTruthy();
    expect(within(tile).getByText('+9.1 pts v baseline')).toBeTruthy();
    expect(within(screen.getByTestId('tile-baseline')).getByText('81.8%')).toBeTruthy();
    expect(within(screen.getByTestId('tile-full')).getByText('1 v 0')).toBeTruthy();
    expect(screen.getByText(/Predictions are the pre-deadline snapshot/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /model and baseline/ })).toBeTruthy();
    const weeks = screen.getByTestId('by-gameweek');
    expect(within(weeks).getAllByText('None stored')).toHaveLength(2);
  });

  it('lists the latest gameweek and opens a team sheet', async () => {
    renderPage();
    const table = await screen.findByTestId('gw-games');
    expect(within(table).getByText('9/11')).toBeTruthy();
    expect(within(table).getByText('provisional')).toBeTruthy();
    expect(within(table).getByText('(12%)')).toBeTruthy();
    await userEvent.click(within(table).getByRole('button', { name: /Arsenal/ }));
    const detail = await screen.findByTestId('detail-61-1');
    expect(getTeamSheetDetail).toHaveBeenCalledWith(13, 61, 1);
    expect(within(detail).getByText(/Formation \(BBC\): 4-2-3-1/)).toBeTruthy();
    expect(within(detail).getByText('(we gave 12%)')).toBeTruthy();
    expect(within(detail).getByText(/owned 30\.1%, 25′ off the bench/)).toBeTruthy();
    expect(within(detail).getByText('RW')).toBeTruthy();
    expect(within(detail).getByText(/Saka for Nwaneri/)).toBeTruthy();
  });

  it('shows the baseline only for a gameweek with no stored prediction', async () => {
    renderPage();
    await screen.findByTestId('gw-games');
    await userEvent.click(screen.getByRole('button', { name: 'GW2' }));
    const table = screen.getByTestId('gw-games');
    expect(within(table).queryByRole('button', { name: /Model/ })).toBeNull();
    expect(within(table).getByText('Nwaneri')).toBeTruthy();
    expect(within(table).getByText('Same XI')).toBeTruthy();
  });

  it('sorts the gameweek table by the model score', async () => {
    renderPage();
    const table = await screen.findByTestId('gw-games');
    const first = () => within(table).getAllByRole('row')[1].textContent ?? '';
    await userEvent.click(within(table).getByRole('button', { name: /Model/ }));
    expect(first()).toContain('Chelsea');
  });
});

// The SQL behind the page: point-in-time predictions and an admin-only read.
describe('team sheets migration', () => {
  const dir = join(__dirname, '..', '..', 'supabase', 'migrations');
  const file = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().reverse()
    .find((f) => /create or replace function private\.refresh_fpl_team_sheets/.test(readFileSync(join(dir, f), 'utf8')));
  const sql = file ? readFileSync(join(dir, file), 'utf8') : '';

  it('only uses predictions from before the deadline', () => {
    expect(sql).toMatch(/h\.snapshot_at < fx\.dl/);
    expect(sql).toMatch(/p\.generated_at < fx\.dl and p\.generated_at >= fx\.dl - interval '7 days'/);
  });

  it('keeps both read functions admin only', () => {
    for (const fn of ['get_team_sheet_accuracy', 'get_team_sheet_detail']) {
      const body = sql.slice(sql.indexOf(`create or replace function public.${fn}`));
      expect(body.slice(0, body.indexOf('$function$;'))).toMatch(/perform public\._require_admin\(\);/);
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`));
    }
  });
});
