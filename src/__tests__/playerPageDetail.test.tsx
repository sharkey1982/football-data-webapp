import React from 'react';
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../lib/fplPlayerPageApi';

vi.mock('../lib/fplPlayerPageApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/fplPlayerPageApi');
  return { ...actual, getPlayerContext: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
import PlayerPointsBreakdown from '../components/fpl/PlayerPointsBreakdown';
import PlayerSummaryPanel from '../components/fpl/PlayerSummaryPanel';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const bd = (o: Partial<api.ProjectionBreakdown>): api.ProjectionBreakdown =>
  Object.fromEntries(api.BREAKDOWN_PARTS.map((p) => [p.key, o[p.key] ?? 0])) as api.ProjectionBreakdown;
const gw = (mw: number, over: Partial<api.PlayerPageGameweek>): api.PlayerPageGameweek => ({
  matchweek: mw, kickoff_date: '2026-09-26', opponent_name: 'Arsenal', is_home: true, status: 'scheduled',
  projected_points: 5, expected_minutes: 80, actual_points: null, generated_at: null, model_version: null, ...over,
});
const profile: api.PlayerPageProfile = { fpl_player_id: 7, fpl_code: 1, slug: 'b-fernandes', web_name: 'B.Fernandes', full_name: 'Bruno Fernandes',
  canonical_team_id: 12, team_name: 'Manchester United', team_slug: 'man-utd', position_label: 'MID', price: 9.0 };

describe('the projection breakdown mapping', () => {
  it('the browser query selects every shared detail column (the literal cannot drift)', () => {
    const src = readFileSync('src/lib/fplPlayerPageApi.ts', 'utf8');
    const literal = src.match(/\.select\('fixture_id, expected_fpl_points[^']*'\)/)![0];
    for (const col of api.PROJECTION_DETAIL_COLUMNS.split(',')) expect(literal).toContain(col);
  });

  it('maps a projection row to its breakdown, and a missing projection to nulls', () => {
    const d = api.projectionDetail({ expected_fpl_points: '3.1', xpts_appearance: '1.9', xpts_goals: '1.2', start_probability: '0.9', tactical_role: 'AM' });
    expect(d.breakdown!.xpts_appearance).toBe(1.9);
    expect(d.breakdown!.xpts_saves).toBe(0);
    expect(d.start_probability).toBe(0.9);
    expect(api.projectionDetail(null)).toEqual({ breakdown: null, start_probability: null, tactical_role: null });
  });
});

describe('Where the points come from', () => {
  const season = [
    gw(5, { status: 'played', breakdown: bd({ xpts_goals: 9 }), actual_points: 12 }), // played: not in the breakdown
    gw(6, { projected_points: 5.0, breakdown: bd({ xpts_appearance: 2, xpts_goals: 2.2, xpts_assists: 1.0, xpts_cards_own_goals: -0.2 }) }),
    gw(7, { projected_points: 4.0, is_home: false, opponent_name: 'Chelsea', breakdown: bd({ xpts_appearance: 2, xpts_goals: 1.4, xpts_assists: 0.8, xpts_cards_own_goals: -0.2 }) }),
  ];

  it('shows upcoming gameweeks only, by source, with totals -- and leaves out all-zero sources', () => {
    render(<PlayerPointsBreakdown season={season} />);
    const table = screen.getByRole('table', { name: /by source/ });
    const cols = within(table).getAllByRole('columnheader').map((c) => c.textContent);
    expect(cols).toEqual(['Gameweek', 'Appearance', 'Goals', 'Assists', 'Cards & own goals', 'Total']);
    expect(within(table).queryByText(/GW5/)).toBeNull();
    expect(within(table).getByText(/GW7/).textContent).toMatch(/@ Chelsea/);
    const foot = table.querySelector('tfoot')!;
    expect(foot.textContent).toContain('9.00'); // 5.0 + 4.0
    expect(foot.textContent).toContain('3.60'); // goals 2.2 + 1.4
  });

  it('names the biggest source in plain words', () => {
    render(<PlayerPointsBreakdown season={season} />);
    // appearance 4.0 and goals 3.6 of 9.0: appearance is 44%
    expect(screen.getByText(/biggest share/).textContent).toMatch(/\(44%\) from appearance/);
  });

  it('renders nothing when there is nothing upcoming to break down', () => {
    const { container } = render(<PlayerPointsBreakdown season={[season[0]]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Player summary panel', () => {
  const season = [gw(6, { start_probability: 0.9, expected_minutes: 84, tactical_role: 'AM', breakdown: bd({}) })];

  it('shows what the page already knows straight away: position, price, next gameweek', () => {
    mocked.getPlayerContext.mockReturnValue(new Promise(() => {})); // never resolves
    render(<MemoryRouter><PlayerSummaryPanel profile={profile} season={season} /></MemoryRouter>);
    expect(screen.getByText(/MID · Manchester United/)).toBeInTheDocument();
    expect(screen.getByText(/£9\.0m/)).toBeInTheDocument();
    expect(screen.getByText(/90% to start/)).toBeInTheDocument();
    expect(screen.getByText(/Expected role: Attacking midfielder/)).toBeInTheDocument();
  });

  it('fills in price pressure, ownership, set pieces and fitness, each linking to its page', async () => {
    mocked.getPlayerContext.mockResolvedValue({
      priceRisk: { direction: 'rise', pressure: 40, net_transfers: 52000 },
      market: { ownership_now: 31.2, ownership_change: 1.4, price_change: 0.1, from_date: '2026-09-14' },
      setPieces: [{ type: 'penalty', rank: 1 }, { type: 'direct_free_kick', rank: 2 }, { type: 'corner_left', rank: 1 }],
      fitness: { status: 'd', chance_next_round: 75, news: 'Knock - 75% chance of playing', return_date: null },
    });
    render(<MemoryRouter><PlayerSummaryPanel profile={profile} season={season} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Under pressure to rise')).toBeInTheDocument());
    expect(screen.getByText('+52,000 net transfers')).toBeInTheDocument();
    expect(screen.getByText(/31\.2%/).textContent).toMatch(/▲ 1\.4 in 7 days/);
    expect(screen.getByText(/Penalties:/).textContent).toBe('Penalties: 1st choice');
    expect(screen.getByText(/Direct free kicks:/).textContent).toBe('Direct free kicks: 2nd choice');
    expect(screen.getByText(/Corners \(left\):/).textContent).toBe('Corners (left): 1st choice');
    expect(screen.getByText(/Doubtful/).textContent).toBe('Doubtful (75% chance)');
    const links = screen.getAllByRole('link', { name: /More/ }).map((a) => a.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining(['/fpl/price-risk', '/fpl/in-the-papers', '/fpl/set-pieces', '/fpl/injuries']));
  });

  it('a player with no duties says so, rather than showing nothing', async () => {
    mocked.getPlayerContext.mockResolvedValue({ priceRisk: null, market: null, setPieces: [], fitness: null });
    render(<MemoryRouter><PlayerSummaryPanel profile={profile} season={season} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('No set-piece duties')).toBeInTheDocument());
  });
});
