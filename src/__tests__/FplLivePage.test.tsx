import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FplLivePage from '../pages/fpl/FplLivePage';
import { parseFplLive, shouldPoll } from '../lib/fplLiveApi';
import type { LiveFixture } from '../lib/fplLiveScore';
import { availabilityOf, AVAILABILITY_CLASSES, buildPitchExtras } from '../lib/fplLivePitch';

const rpc = vi.fn();
// Table reads for the pitch's availability / projection extras: every
// builder method chains, and awaiting it gives tables[name].
let tables: Record<string, unknown[]> = {};
const from = vi.fn((name: string) => {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'gte', 'order', 'limit', 'not', 'or', 'is']) b[m] = () => b;
  b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data: tables[name] ?? [], error: null }).then(ok, bad);
  return b;
});
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (n: string) => from(n) } }));

// Shaped like public.fpl_live_entry's output (checked against a local run of
// the migration). 15 players, player i on team i; team i's fixture id is i.
//   1-5 done (FT, bonus confirmed for 1), 6 live 60', 7 FT 0 mins (subbed),
//   8-11 not started, bench 12-15 all done and played.
function rawResponse(over: Partial<Record<string, unknown>> = {}) {
  const type = (i: number) => (i === 1 || i === 12 ? 1 : i <= 5 || i === 13 ? 2 : i <= 9 || i === 14 ? 3 : 4);
  const state = (i: number) => (i <= 5 || i === 7 || i >= 12 ? 'done' : i === 6 ? 'live' : 'ns');
  const mins = (i: number) => (i === 7 ? 0 : state(i) === 'ns' ? 0 : state(i) === 'live' ? 60 : 90);
  const players = Array.from({ length: 15 }, (_, k) => {
    const i = k + 1;
    const m = mins(i);
    const stats = state(i) === 'ns' ? [] : [{ identifier: 'minutes', value: m, points: m === 0 ? 0 : m >= 60 ? 2 : 1 }];
    if (i === 1) stats.push({ identifier: 'bonus', value: 3, points: 3 });
    if (i === 10) stats.length = 0;
    return { id: i, web_name: `Player${i}`, slug: `player-${i}`, team: i, type: type(i), minutes: m, explain: stats.length ? [{ fixture: i, stats }] : [] };
  });
  const fixtures = Array.from({ length: 15 }, (_, k) => {
    const i = k + 1;
    const s = state(i);
    return {
      id: i, team_h: i, team_a: 100 + i, kickoff_time: '2026-10-11T13:00:00Z',
      started: s !== 'ns', finished_provisional: s === 'done', finished: s === 'done' && i === 1,
      minutes: s === 'live' ? 60 : s === 'done' ? 90 : 0, team_h_score: s === 'ns' ? null : 1, team_a_score: s === 'ns' ? null : 0,
      bps: i === 6 ? [{ element: 6, value: 30 }, { element: 999, value: 10 }] : [],
      bonus: i === 1 ? [{ element: 1, value: 3 }] : [],
    };
  });
  return {
    status: 'ok',
    entry: { id: 123, name: 'Shark Attack', player_name: 'Chris S' },
    event: { id: 6, name: 'Gameweek 6', deadline: '2026-10-10T10:00:00Z', finished: false, data_checked: false, is_current: true, current_event: 6 },
    picks: {
      active_chip: null,
      event_transfers_cost: 4,
      automatic_subs: [],
      picks: Array.from({ length: 15 }, (_, k) => ({ element: k + 1, position: k + 1, multiplier: k < 11 ? 1 : 0, is_captain: k + 1 === 6, is_vice_captain: k + 1 === 1 })),
    },
    players,
    teams: [...Array.from({ length: 15 }, (_, k) => ({ id: k + 1, short_name: `T${k + 1}`, name: `Team ${k + 1}` })), ...Array.from({ length: 15 }, (_, k) => ({ id: 101 + k, short_name: `O${k + 1}`, name: `Opp ${k + 1}` }))],
    fixtures,
    projections: [{ element: 8, fixture: 8, xp: 4.5 }, { element: 6, fixture: 6, xp: 6 }],
    projection_model: 'leaguewide_v6',
    live_updated_at: '2026-10-11T14:00:00Z',
    picks_fetched_at: '2026-10-11T13:00:00Z',
    ...over,
  };
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/fpl/live" element={<FplLivePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  rpc.mockReset();
  from.mockClear();
  tables = {};
  try { localStorage.clear(); } catch { /* ignore */ }
});

describe('FplLivePage', () => {
  it('shows the live score, captain, subs and bench for a team', async () => {
    rpc.mockResolvedValue({ data: rawResponse(), error: null });
    try { localStorage.setItem('fixtureshark.fplLive.view', 'list'); } catch { /* ignore */ }
    renderAt('/fpl/live?id=123');
    expect(await screen.findByText('Shark Attack')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('fpl_live_entry', { p_entry_id: 123 });
    // Starters: 1 = 2+3 bonus = 5; 2-5 = 2 each = 8; 6 (C, live 60', 3 live bonus) = (2+3)x2 = 10;
    // 7 subbed off for 13 (DEF bench, 2); 8-11 not started = 0. Total 25, minus 4 = 21.
    const points = await screen.findByTestId('live-points');
    expect(within(points).getByText('21')).toBeInTheDocument();
    expect(within(points).getByText('25 minus a 4-point hit')).toBeInTheDocument();
    expect(screen.getByTestId('live-captain')).toHaveTextContent('Captain: Player6.');
    expect(screen.getByTestId('live-captain')).toHaveTextContent('Automatic subs: Player13 for Player7');
    const xi = screen.getByTestId('live-xi');
    expect(within(xi).getByTestId('live-player-13')).toHaveTextContent('on');
    expect(within(screen.getByTestId('live-bench')).getByTestId('live-player-7')).toHaveTextContent('off');
    // Projected final: 21 + 4.5 (player 8) + captain (6 - 2 appearance) x 30/90 x 2 = 2.67 -> 28.2.
    expect(within(screen.getByTestId('live-projected')).getByText('28.2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Player6' })).toHaveAttribute('href', '/fpl/players/player-6');
  });

  it('asks for a past gameweek with gw in the URL', async () => {
    rpc.mockResolvedValue({ data: rawResponse(), error: null });
    renderAt('/fpl/live?id=123&gw=4');
    await screen.findByText('Shark Attack');
    expect(rpc).toHaveBeenCalledWith('fpl_live_entry', { p_entry_id: 123, p_event_id: 4 });
  });

  it('explains an unknown team', async () => {
    rpc.mockResolvedValue({ data: { status: 'not_found' }, error: null });
    renderAt('/fpl/live?id=99999999');
    expect(await screen.findByRole('alert')).toHaveTextContent('no FPL team with that ID');
  });

  it('does nothing until an ID is given', () => {
    renderAt('/fpl/live');
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Show my score' })).toBeInTheDocument();
  });
});

describe('FplLivePage pitch view', () => {
  const player = (id: number, status: string, next: number | null, news = '') => ({
    fpl_player_id: id, first_name: 'First', second_name: `Second${id}`, web_name: `Player${id}`, canonical_team_id: 500 + id,
    status, chance_of_playing_next_round: next, chance_of_playing_this_round: null, news, news_added: '2026-10-31T09:15:00Z',
  });

  it('shows the XI in formation rows and the bench below, by default', async () => {
    rpc.mockResolvedValue({ data: rawResponse(), error: null });
    renderAt('/fpl/live?id=123');
    const pitch = await screen.findByTestId('live-pitch');
    // Player 7 (MID, 0 mins) is subbed off for 13 (DEF): 1 GKP, 5 DEF, 3 MID, 2 FWD.
    const ids = (row: string) => within(within(pitch).getByTestId(row)).getAllByRole('listitem').map((li) => li.getAttribute('data-testid'));
    expect(ids('pitch-row-GKP')).toEqual(['pitch-player-1']);
    expect(ids('pitch-row-DEF')).toEqual(['pitch-player-2', 'pitch-player-3', 'pitch-player-4', 'pitch-player-5', 'pitch-player-13']);
    expect(ids('pitch-row-MID')).toEqual(['pitch-player-6', 'pitch-player-8', 'pitch-player-9']);
    expect(ids('pitch-row-FWD')).toEqual(['pitch-player-10', 'pitch-player-11']);
    const bench = screen.getByTestId('pitch-bench');
    expect(within(bench).getAllByRole('listitem')).toHaveLength(4);
    expect(within(bench).getByText('GKP')).toBeInTheDocument();
    expect(within(bench).getByTestId('pitch-player-7')).toHaveTextContent('MID');
    expect(screen.queryByTestId('live-xi')).toBeNull();
    // Captain (6, live): doubled points; not-started player shows his opponent.
    expect(within(screen.getByTestId('pitch-player-6')).getByRole('button')).toHaveAccessibleName(/Player6, Team 6, midfielder, captain, 10 points, playing now/);
    expect(within(screen.getByTestId('pitch-player-8')).getByRole('button')).toHaveTextContent('O8 (H)');
    expect(within(screen.getByTestId('pitch-player-1')).getByTestId('state-done')).toBeInTheDocument();
  });

  it('flags availability on the tile and shows news in the panel', async () => {
    rpc.mockResolvedValue({ data: rawResponse(), error: null });
    tables = {
      fpl_players: [player(8, 'd', 75, 'Knock - 75% chance of playing'), player(9, 'i', 0, 'Hamstring injury'), player(10, 'd', 25), player(2, 'a', null)],
      fixtures: [{ fixture_id: 900, matchweek: 7, kickoff_date: '2026-10-18', home_team_id: 508, away_team_id: 777 }],
      fpl_player_projections: [{ fpl_player_id: 8, fixture_id: 900, expected_fpl_points: 5.25, start_probability: 0.82 }],
      fpl_teams: [{ canonical_team_id: 777, short_name: 'HUL' }],
    };
    renderAt('/fpl/live?id=123');
    const flag8 = await screen.findByTestId('flag-8');
    expect(flag8).toHaveAttribute('data-tone', 'yellow');
    expect(screen.getByTestId('flag-9')).toHaveAttribute('data-tone', 'red');
    expect(screen.getByTestId('flag-10')).toHaveAttribute('data-tone', 'orange');
    expect(screen.queryByTestId('flag-2')).toBeNull();
    expect(screen.getByTestId('namebar-8').className).toContain('bg-yellow-300');
    expect(screen.getByTestId('namebar-9').className).toContain('bg-red-600');
    const btn = within(screen.getByTestId('pitch-player-8')).getByRole('button');
    expect(btn).toHaveAccessibleName(/Player8, Team 8, midfielder, doubtful 75%/);
    fireEvent.click(btn);
    const panel = screen.getByTestId('pitch-detail');
    expect(panel).toHaveTextContent('First Second8');
    expect(panel).toHaveTextContent('Knock - 75% chance of playing');
    expect(panel).toHaveTextContent('News added');
    expect(panel).toHaveTextContent('75% chance of playing next round');
    expect(within(panel).getByTestId('pitch-detail-next')).toHaveTextContent('Next: HUL (H), GW7');
    expect(within(panel).getByTestId('pitch-detail-next')).toHaveTextContent('Projected 5.3 pts, 82% to start');
    expect(within(panel).getByRole('link')).toHaveAttribute('href', '/fpl/players/player-8');
  });

  it('remembers the Pitch / List choice', async () => {
    rpc.mockResolvedValue({ data: rawResponse(), error: null });
    const first = renderAt('/fpl/live?id=123');
    await screen.findByTestId('live-pitch');
    fireEvent.click(within(screen.getByTestId('live-view-toggle')).getByRole('button', { name: 'List' }));
    expect(screen.getByTestId('live-xi')).toBeInTheDocument();
    expect(localStorage.getItem('fixtureshark.fplLive.view')).toBe('list');
    first.unmount();
    renderAt('/fpl/live?id=123');
    expect(await screen.findByTestId('live-xi')).toBeInTheDocument();
    expect(screen.queryByTestId('live-pitch')).toBeNull();
    expect(within(screen.getByTestId('live-view-toggle')).getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('still renders when storage throws', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    rpc.mockResolvedValue({ data: rawResponse(), error: null });
    renderAt('/fpl/live?id=123');
    expect(await screen.findByTestId('live-pitch')).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe('availabilityOf', () => {
  it('colours by chance of playing, then by status', () => {
    expect(availabilityOf('a', 100).tone).toBe('none');
    expect(availabilityOf('a', null).tone).toBe('none');
    expect(availabilityOf('d', 75)).toEqual({ tone: 'yellow', chance: 75, label: 'Doubtful 75%' });
    expect(availabilityOf('d', 50).tone).toBe('yellow');
    expect(availabilityOf('d', 25).tone).toBe('orange');
    expect(availabilityOf('i', 25).tone).toBe('orange');
    expect(availabilityOf('i', 0)).toEqual({ tone: 'red', chance: 0, label: 'Injured' });
    expect(availabilityOf('s', null).label).toBe('Suspended');
    expect(availabilityOf('u', null).tone).toBe('red');
    expect(availabilityOf('d', null, 50).chance).toBe(50);
    expect(availabilityOf('d', null).tone).toBe('yellow');
    expect(AVAILABILITY_CLASSES.orange.flag).toContain('bg-orange-500');
  });

  it('picks each player\'s earliest upcoming fixture for the projection', () => {
    const m = buildPitchExtras(
      [{ fpl_player_id: 1, first_name: 'Bukayo', second_name: 'Saka', web_name: 'Saka', canonical_team_id: 1, status: 'a', chance_of_playing_next_round: null, chance_of_playing_this_round: null, news: '', news_added: null }],
      [
        { fixture_id: 2, matchweek: 11, kickoff_date: '2026-11-08', home_team_id: 9, away_team_id: 1 },
        { fixture_id: 1, matchweek: 10, kickoff_date: '2026-11-06', home_team_id: 1, away_team_id: 8 },
      ],
      [{ fpl_player_id: 1, fixture_id: 1, expected_fpl_points: 6.1, start_probability: 0.9 }],
      new Map([[8, 'HUL'], [9, 'LIV']]),
    );
    expect(m.get(1)).toMatchObject({ fullName: 'Bukayo Saka', news: null, next: { matchweek: 10, opponent: 'HUL', home: true, xp: 6.1, startProbability: 0.9 } });
  });
});

describe('parseFplLive', () => {
  it('turns no_picks into a message naming the team', () => {
    expect(() => parseFplLive({ status: 'no_picks', event: 2, entry: { id: 1, name: 'Late Joiner' } })).toThrow('Late Joiner has no picks for gameweek 2');
  });
});

describe('shouldPoll', () => {
  const base: LiveFixture = { id: 1, teamH: 1, teamA: 2, kickoff: '2026-10-11T13:00:00Z', started: false, finishedProvisional: false, finished: false, minutes: 0, scoreH: null, scoreA: null, bps: [], bonus: [] };
  const at = (iso: string) => Date.parse(iso);
  it('polls from 10 minutes before kick-off, while in play and until bonus is confirmed', () => {
    expect(shouldPoll([base], at('2026-10-11T12:40:00Z'))).toBe(false);
    expect(shouldPoll([base], at('2026-10-11T12:52:00Z'))).toBe(true);
    expect(shouldPoll([{ ...base, started: true, minutes: 30 }], at('2026-10-11T13:30:00Z'))).toBe(true);
    expect(shouldPoll([{ ...base, started: true, finishedProvisional: true }], at('2026-10-11T15:00:00Z'))).toBe(true);
    expect(shouldPoll([{ ...base, started: true, finishedProvisional: true, finished: true }], at('2026-10-11T15:00:00Z'))).toBe(false);
  });
  it('stops asking about a match that never started (postponed)', () => {
    expect(shouldPoll([base], at('2026-10-11T17:00:00Z'))).toBe(false);
  });
});
