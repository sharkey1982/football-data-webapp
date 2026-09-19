import { describe, it, expect, vi, beforeEach } from 'vitest';

// The top-FPL-pick trivia fact silently never rendered for the whole of
// this feature's life: it embedded fpl_players inside a select on
// fpl_player_projections, but that table has NO foreign keys, so
// PostgREST could not resolve the embed. getLandingTrivia wraps every
// fact in safely(), so the failure was swallowed and the card just never
// appeared.
//
// These tests pin the shape that replaced it: three plain queries joined
// in JS, and NO embedded select on a table without an FK.
const calls: { table: string; select: string }[] = [];

const makeBuilder = (rows: unknown[]) => {
  const b: Record<string, unknown> = {};
  for (const m of ['eq', 'in', 'order', 'limit']) {
    b[m] = vi.fn(() => b);
  }
  b.select = vi.fn((sel: string) => {
    calls[calls.length - 1].select = sel;
    return b;
  });
  b.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null });
  return b;
};

const responses: Record<string, unknown[]> = {
  fixtures: [{ fixture_id: 1, matchweek: 5 }],
  fpl_player_projections: [{ fpl_player_id: 411, expected_fpl_points: 7.34 }],
  fpl_players: [{ fpl_player_id: 411, web_name: 'Haaland', canonical_team_id: 43 }],
  teams: [{ team_id: 43, display_name: 'Manchester City' }],
};

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      calls.push({ table, select: '' });
      return makeBuilder(responses[table] ?? []);
    },
    rpc: vi.fn(),
  },
}));

describe('landing top FPL picks', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('resolves player and team names without embedding across a table that has no FK', async () => {
    const { getLandingTopFplPick } = await import('../lib/landingApi');
    const pick = await getLandingTopFplPick();

    expect(pick).not.toBeNull();
    expect(pick!.web_name).toBe('Haaland');
    expect(pick!.team_name).toBe('Manchester City');
    expect(pick!.matchweek).toBe(5);
  });

  it('never asks PostgREST to embed fpl_players inside fpl_player_projections', async () => {
    const { getLandingTopFplPick } = await import('../lib/landingApi');
    await getLandingTopFplPick();

    const projectionSelect = calls.find((c) => c.table === 'fpl_player_projections')?.select ?? '';
    // An embed reads as `fpl_players(...)` inside the select string. There
    // is no foreign key for PostgREST to resolve it against, so it can
    // never work here -- however tempting it looks.
    expect(projectionSelect).not.toMatch(/fpl_players\s*\(/);
  });
});
