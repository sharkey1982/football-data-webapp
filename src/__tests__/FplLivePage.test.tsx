import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FplLivePage from '../pages/fpl/FplLivePage';
import { parseFplLive, shouldPoll } from '../lib/fplLiveApi';
import type { LiveFixture } from '../lib/fplLiveScore';

const rpc = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

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
  try { localStorage.clear(); } catch { /* ignore */ }
});

describe('FplLivePage', () => {
  it('shows the live score, captain, subs and bench for a team', async () => {
    rpc.mockResolvedValue({ data: rawResponse(), error: null });
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
