// Shark Fantasy pages (Phase 3c): the team editor's rules and the page itself,
// with the data layer mocked from a real generated season.
import React from 'react';
void React;
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { createSeason } from '../sharkfantasy/runner';
import type { SeasonData, SfMyTeam, SfPlayer, SfSeason } from '../lib/sharkFantasyApi';
import { addPlayer, emptyDraft, fromSaved, removePlayer, setCaptain, setVice, suggest, summarise, swap, toSave, type Draft } from '../lib/sharkFantasyDraft';
import type { PlayerInfo } from '../sharkfantasy/fantasy/squad';

// ---- a real season's public data, built by the runner's create step -------
const season: SfSeason = { season_id: 1, universe_id: 'ui', universe: 'UI test', number: 1, state: 'live', shield_winner: null, current_round: 1, open_round: 1 };
let data: SeasonData;
let players: SfPlayer[];
let info: (id: string) => PlayerInfo;
let priceOf: (id: string) => number;

beforeAll(async () => {
  let payload: Record<string, unknown> = {};
  await createSeason({ rpc: async (_fn, args) => { payload = args.p as Record<string, unknown>; return 1; }, hash: () => 'h' },
    { universe: 'ui', name: 'UI test', seed: 'ui-1', firstDeadline: new Date(Date.now() + 86400_000), spacingMinutes: 10080, kickoffAfterMinutes: 180 });
  const ps = payload.players as { id: string; clubId: string; name: string; nationality: string; age: number; position: SfPlayer['position'] }[];
  const prices = new Map((payload.prices as { player_id: string; price: number }[]).map((x) => [x.player_id, x.price]));
  const scout = new Map((payload.scouting as { player_id: string; attack: number; creativity: number; defence: number; keeping: number; discipline: number }[]).map((x) => [x.player_id, x]));
  const proj = new Map((payload.projections as { round: number; player_id: string; x_points: number }[]).filter((x) => x.round === 1).map((x) => [x.player_id, x.x_points]));
  const clubs = payload.clubs as { id: string; name: string; short: string }[];
  players = ps.map((p) => ({ player_id: p.id, name: p.name, club_id: p.clubId, club: clubs.find((c) => c.id === p.clubId)!.short, position: p.position, age: p.age, nationality: p.nationality,
    price: prices.get(p.id)!, start_price: prices.get(p.id)!, ...scout.get(p.id)!, available_from: 0, total_points: 0, next_x_points: proj.get(p.id) ?? 0 }));
  const rounds = (payload.rounds as { number: number; kind: 'league' | 'finals'; deadline_at: string; kickoff_at: string }[]).map((r) => ({ season_id: 1, ...r, state: (r.number === 1 ? 'open' : 'upcoming') as 'open' | 'upcoming' }));
  const fixtures = (payload.fixtures as { round: number; home_id: string; away_id: string; kind: 'league' }[]).map((f, i) => ({
    fixture_id: i + 1, round: f.round, kind: f.kind, home_id: f.home_id, away_id: f.away_id, home: f.home_id, away: f.away_id, kickoff_at: rounds[f.round - 1].kickoff_at,
    status: 'scheduled' as const, home_goals: 0, away_goals: 0, shootout: null }));
  data = { rounds, clubs: clubs.map((c) => ({ club_id: c.id, name: c.name, short: c.short, manager: 'M' })), players, fixtures, table: [],
    leaderboard: [{ entry_id: 9, team_name: 'Bot Rovers', display_name: 'Bot', is_bot: true, bot_kind: 'optimiser', joined_round: 1, total: 0, hits: 0, last_round: null }] };
  const byId = new Map(players.map((p) => [p.player_id, p]));
  info = (id) => ({ id, clubId: byId.get(id)!.club_id, position: byId.get(id)!.position });
  priceOf = (id) => byId.get(id)!.price;
});

/** The cheapest legal squad: by price, at most 2 a club. */
function cheapSquad(): string[] {
  const need: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 }, club: Record<string, number> = {};
  const out: string[] = [];
  for (const p of players.slice().sort((a, b) => a.price - b.price || a.player_id.localeCompare(b.player_id)))
    if (need[p.position] > 0 && (club[p.club_id] ?? 0) < 2) { out.push(p.player_id); need[p.position]--; club[p.club_id] = (club[p.club_id] ?? 0) + 1; }
  return out;
}
function fullDraft(): Draft {
  let d = emptyDraft();
  for (const id of cheapSquad()) d = addPlayer(d, id, info);
  return setVice(setCaptain(d, d.xi[10]), d.xi[9]);
}

describe('the team editor', () => {
  it('fills a squad: 11 start (one keeper), the reserve keeper first on the bench, slots 1–15', () => {
    const d = fullDraft();
    expect(d.squad).toHaveLength(15);
    expect(d.xi).toHaveLength(11);
    expect(d.xi.filter((id) => info(id).position === 'GK')).toHaveLength(1);
    expect(info(d.bench[0]).position).toBe('GK');
    const s = summarise(d, null, priceOf, info, true);
    expect(s.problems).toEqual([]);
    expect(s.free).toBe(true);
    expect(s.left).toBe(1000 - d.squad.reduce((a, id) => a + priceOf(id), 0));
    const saved = toSave(d, info);
    expect(saved.picks.map((p) => p.slot)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(info(saved.picks[0].player_id).position).toBe('GK');
    expect(info(saved.picks[11].player_id).position).toBe('GK');
  });
  it('refuses a sixteenth player or a third keeper', () => {
    const d = fullDraft();
    const gk = players.find((p) => p.position === 'GK' && !d.squad.includes(p.player_id))!;
    expect(addPlayer(d, gk.player_id, info)).toBe(d);
    const short = removePlayer(d, d.xi[5]);
    expect(addPlayer(short, gk.player_id, info)).toBe(short);
  });
  it('a swap keeps 11 starters and drops the captaincy of a player benched', () => {
    const d0 = fullDraft();
    const sub = d0.bench[1];
    const starter = d0.xi.find((id) => info(id).position === info(sub).position)!;
    const d = setCaptain(d0, starter);
    const s = swap(d, starter, sub, info);
    expect(s.xi).toContain(sub);
    expect(s.xi).toHaveLength(11);
    expect(s.captain).toBeNull();
    expect(summarise(s, null, priceOf, info, true).problems.join()).toMatch(/captain/);
  });
  it('after a deadline: owned players at their selling price, transfers counted, a hit beyond the free ones, none on a wildcard', () => {
    const d = fullDraft();
    const saved = { bank: 50, free_transfers: 1, wildcards_left: 1, transfers_this_round: 0, wildcard_this_round: false,
      picks: toSave(d, info).picks.map((p) => ({ ...p, is_captain: p.player_id === d.captain, is_vice: p.player_id === d.vice, selling_price: priceOf(p.player_id) - 1 })) };
    const loaded = fromSaved(saved.picks);
    const s0 = summarise(loaded, saved, priceOf, info, false);
    expect(s0.changed).toBe(false);
    expect(s0.left).toBe(50);
    // two midfielders out, two in
    const outs = loaded.squad.filter((id) => info(id).position === 'MID').slice(0, 2);
    let t = loaded;
    for (const o of outs) t = removePlayer(t, o);
    const ins = players.filter((p) => p.position === 'MID' && !loaded.squad.includes(p.player_id) && t.squad.filter((x) => info(x).clubId === p.club_id).length < 2).slice(0, 2);
    for (const p of ins) t = addPlayer(t, p.player_id, info);
    t = suggest(t, (id) => players.find((p) => p.player_id === id)!.next_x_points ?? 0, info);
    const s1 = summarise(t, saved, priceOf, info, false);
    expect(s1.transfers).toBe(2);
    expect(s1.hits).toBe(4);
    expect(s1.left).toBe(50 + outs.reduce((a, id) => a + priceOf(id) - 1, 0) - ins.reduce((a, p) => a + p.price, 0));
    expect(summarise({ ...t, wildcard: true }, saved, priceOf, info, false).hits).toBe(0);
  });
});

// ---- the page --------------------------------------------------------------
let admin = true;
let mine: SfMyTeam | null = null;
vi.mock('../lib/auth', () => ({
  useAuthOptional: () => ({ isAdmin: admin, session: admin ? { user: { email: 'chris@example.com' } } : null, loading: false }),
}));
const saveTeam = vi.fn(async () => ({ round: 1, bank: 0, transfers: 0, free_transfers: 1, wildcard: false, hits_if_deadline_now: 0 }));
const joinSeason = vi.fn(async () => 5);
vi.mock('../lib/sharkFantasyApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/sharkFantasyApi')>('../lib/sharkFantasyApi');
  return {
    ...actual,
    loadSeasons: vi.fn(async () => [season]),
    loadSeasonData: vi.fn(async () => data),
    loadMyTeam: vi.fn(async () => mine),
    loadEntryRounds: vi.fn(async () => []),
    loadEvents: vi.fn(async () => []),
    loadPlayerRounds: vi.fn(async () => []),
    saveTeam: (...a: unknown[]) => (saveTeam as unknown as (...x: unknown[]) => unknown)(...a),
    joinSeason: (...a: unknown[]) => (joinSeason as unknown as (...x: unknown[]) => unknown)(...a),
  };
});
const { default: SharkFantasyPage } = await import('../pages/sharkfantasy/SharkFantasyPage');
const renderAt = (url: string) => render(<MemoryRouter initialEntries={[url]}><SharkFantasyPage /></MemoryRouter>);

describe('SharkFantasyPage', () => {
  it('refuses non-admins', () => {
    admin = false;
    renderAt('/shark-fantasy');
    expect(screen.getByText('This page is for admins.')).toBeInTheDocument();
    admin = true;
  });

  it('a manager who has not joined gets the join form', async () => {
    mine = null;
    renderAt('/shark-fantasy');
    const form = await screen.findByTestId('sf-join');
    expect(screen.getByTestId('sf-status').textContent).toMatch(/^Round 1 · deadline /);
    await userEvent.type(within(form).getByLabelText('Team name'), 'Shark Attack');
    await userEvent.click(within(form).getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(joinSeason).toHaveBeenCalledWith(1, 'Shark Attack', 'chris'));
  });

  it('builds a squad from the list, then saves 15 players in slots with a captain and vice', async () => {
    mine = { entry_id: 5, team_name: 'Shark Attack', bank: 0, free_transfers: 1, wildcards_left: 1, transfers_this_round: 0, wildcard_this_round: false, picks: [] };
    renderAt('/shark-fantasy');
    await screen.findByTestId('sf-editor');
    const ids = cheapSquad();
    const table = screen.getByTestId('sf-market-table');
    for (const id of ids) {
      const p = players.find((x) => x.player_id === id)!;
      await userEvent.click(within(table).getByRole('button', { name: `Add ${p.name}` }));
    }
    expect(screen.getByTestId('sf-save')).toBeDisabled();       // no captain yet
    expect(screen.getByTestId('sf-problems').textContent).toMatch(/captain/);
    await userEvent.click(screen.getByRole('button', { name: 'Best XI by projection' }));
    await waitFor(() => expect(screen.queryByTestId('sf-problems')).toBeNull());
    await userEvent.click(screen.getByTestId('sf-save'));
    await waitFor(() => expect(saveTeam).toHaveBeenCalledTimes(1));
    const [, payload] = saveTeam.mock.calls[0] as unknown as [number, { picks: { player_id: string; slot: number }[]; captain: string; vice: string }];
    expect(payload.picks).toHaveLength(15);
    expect(new Set(payload.picks.map((p) => p.player_id))).toEqual(new Set(ids));
    expect(payload.picks.find((p) => p.slot === 12) && info(payload.picks.find((p) => p.slot === 12)!.player_id).position).toBe('GK');
    expect(payload.captain).not.toBe(payload.vice);
  }, 30000);

  it('shows the fixtures and the leaderboard', async () => {
    renderAt('/shark-fantasy?tab=round');
    const fx = await screen.findByTestId('sf-fixtures');
    expect(within(fx).getAllByRole('listitem')).toHaveLength(5);
    renderAt('/shark-fantasy?tab=leaderboard');
    expect(await screen.findByText('Bot Rovers')).toBeInTheDocument();
  });
});
