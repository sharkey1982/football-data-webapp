import { describe, it, expect } from 'vitest';
import { gameweekState, liveGameState, type GwRow } from '../lib/fplGameweekState';
import { POPULAR_TOOLS, toolsFor } from '../lib/popularTools';

const GWS: GwRow[] = [
  { gw: 7, deadline: '2026-10-17T10:00:00Z', finished: true },
  { gw: 8, deadline: '2026-10-23T17:30:00Z', finished: false },
  { gw: 9, deadline: '2026-10-31T11:00:00Z', finished: false },
];
const done = { started: true, finished_provisional: true, finished: false };
const live = { started: true, finished_provisional: false, finished: false };
const toPlay = { started: false, finished_provisional: false, finished: false };
const at = (iso: string) => Date.parse(iso);

describe('gameweekState', () => {
  it('before the deadline: the next gameweek, no toggle', () => {
    const s = gameweekState(GWS, [done, done], at('2026-10-22T12:00:00Z'));
    expect(s).toMatchObject({ openGw: 7, nextGw: 8, showToggle: false, defaultView: 'next' });
  });

  it('deadline passed, games remaining: the toggle, opening on the gameweek in progress', () => {
    const s = gameweekState(GWS, [done, done, live, toPlay], at('2026-10-25T14:30:00Z'));
    expect(s).toEqual({ openGw: 8, nextGw: 9, showToggle: true, gamesRemaining: 2, defaultView: 'open' });
  });

  it('deadline passed, nothing kicked off yet: still the gameweek in progress', () => {
    const s = gameweekState(GWS, [toPlay, toPlay], at('2026-10-23T18:00:00Z'));
    expect(s).toMatchObject({ showToggle: true, gamesRemaining: 2, defaultView: 'open' });
  });

  it('all games finished (provisionally): the toggle stays, opening on the next gameweek', () => {
    const s = gameweekState(GWS, [done, { ...done, finished: true }], at('2026-10-26T23:00:00Z'));
    expect(s).toMatchObject({ openGw: 8, showToggle: true, gamesRemaining: 0, defaultView: 'next' });
  });

  it('FPL has marked the gameweek finished: no toggle', () => {
    const finished = GWS.map((g) => (g.gw === 8 ? { ...g, finished: true } : g));
    const s = gameweekState(finished, [done, done], at('2026-10-27T09:00:00Z'));
    expect(s).toMatchObject({ showToggle: false, defaultView: 'next' });
  });

  it('no live fixtures loaded, or no next gameweek: no toggle', () => {
    expect(gameweekState(GWS, [], at('2026-10-25T14:30:00Z')).showToggle).toBe(false);
    expect(gameweekState(GWS.slice(0, 2), [live], at('2026-10-25T14:30:00Z')).showToggle).toBe(false);
  });

  it('labels each game', () => {
    expect(liveGameState(toPlay)).toBe('not_started');
    expect(liveGameState(live)).toBe('live');
    expect(liveGameState(done)).toBe('done');
  });
});

describe('popular tools', () => {
  it('puts the section’s own tools first and keeps every tool', () => {
    expect(toolsFor('football')[0].id).toBe('league-table');
    expect(toolsFor('fpl')[0].id).toBe('rate-my-team');
    expect(toolsFor('fpl')).toHaveLength(POPULAR_TOOLS.length);
    expect(new Set(POPULAR_TOOLS.map((t) => t.id)).size).toBe(POPULAR_TOOLS.length);
  });
});
