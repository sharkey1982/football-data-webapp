import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import InThePapersPage from '../pages/fpl/InThePapersPage';
import { formatShortDay as shortDay } from '../lib/formatDate';
import * as api from '../lib/digestApi';
import * as market from '../lib/fplMarketApi';

vi.mock('../lib/digestApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/digestApi');
  return { ...actual, getDigestGameweeks: vi.fn(), getGameweekDigest: vi.fn() };
});
vi.mock('../lib/fplMarketApi', async () => {
  const actual = await vi.importActual<typeof market>('../lib/fplMarketApi');
  return { ...actual, getFplMarketMovers: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockedMarket = market as unknown as Record<string, ReturnType<typeof vi.fn>>;

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const e = (over: Partial<api.GameweekDigestEntry>): api.GameweekDigestEntry => ({
  change_type: 'price_rise', fpl_player_id: 1, web_name: 'Popular', slug: 'popular',
  team_name: 'Arsenal', position_label: 'MID', ownership: 40,
  old_value: '\u00a36.0m', new_value: '\u00a36.1m', detail: null,
  from_date: '2026-09-19', to_date: '2026-09-19', gameweek: 5, event_date: '2026-09-19', ...over,
});
const GWS = [
  { gameweek: 5, first_date: '2026-09-19', last_date: '2026-09-21', days: 3 },
  { gameweek: 4, first_date: '2026-09-14', last_date: '2026-09-18', days: 5 },
];
const mover = { fpl_player_id: 9, web_name: 'Riser', slug: 'riser', team_name: 'Chelsea', position_label: 'FWD', price_now: 8.1,
  price_change: 0.2, ownership_now: 20, ownership_change: 1.2, transfers_in_event: 0, transfers_out_event: 0, news: null,
  from_date: '2026-09-14', to_date: '2026-09-21' };

function setup(entriesByGw: Record<number, api.GameweekDigestEntry[]>) {
  mocked.getDigestGameweeks.mockResolvedValue(GWS);
  mocked.getGameweekDigest.mockImplementation(async (_s: number, gw: number) => entriesByGw[gw] ?? []);
  mockedMarket.getFplMarketMovers.mockResolvedValue([mover]);
  return render(<MemoryRouter><InThePapersPage /></MemoryRouter>);
}

describe('In the papers', () => {
  it('keeps the WHOLE gameweek\u2019s news, dated -- not just the latest day', async () => {
    setup({ 5: [
      e({ event_date: '2026-09-21', web_name: 'Monday', fpl_player_id: 1 }),
      e({ event_date: '2026-09-19', web_name: 'Saturday', fpl_player_id: 2 }),
    ] });
    await waitFor(() => expect(screen.getByText('Monday')).toBeInTheDocument());
    expect(screen.getByText('Saturday')).toBeInTheDocument();
    expect(screen.getByText('Sat 19 Sep')).toBeInTheDocument();
    expect(screen.getByText('Mon 21 Sep')).toBeInTheDocument();
    expect(mocked.getGameweekDigest).toHaveBeenCalledWith(13, 5);
  });

  it('names the gameweek and its dates explicitly, and says when it is still going', async () => {
    setup({ 5: [e({})] });
    await waitFor(() => expect(screen.getByText('Popular')).toBeInTheDocument());
    const para = screen.getByText(/Gameweek 5/).closest('p')!;
    expect(para.textContent).toMatch(/Gameweek 5 news, Sat 19 Sep to Mon 21 Sep \(so far/);
  });

  it('filters by gameweek', async () => {
    setup({ 5: [e({ web_name: 'ThisWeek' })], 4: [e({ web_name: 'LastWeek', gameweek: 4, event_date: '2026-09-15' })] });
    await waitFor(() => expect(screen.getByText('ThisWeek')).toBeInTheDocument());
    await userEvent.setup().click(screen.getByRole('button', { name: 'GW4' }));
    await waitFor(() => expect(screen.getByText('LastWeek')).toBeInTheDocument());
    expect(screen.queryByText('ThisWeek')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'GW4' })).toHaveAttribute('aria-pressed', 'true');
    // a past gameweek is not described as still going
    expect(screen.getByText('Gameweek 4').closest('p')!.textContent).not.toMatch(/so far/);
  });

  it('keeps availability changes regardless of ownership, but filters small-fry price moves', async () => {
    setup({ 5: [
      e({}),
      e({ fpl_player_id: 2, web_name: 'NewInjury', slug: 'newinj', change_type: 'availability', ownership: 0.3, old_value: 'a', new_value: 'i', detail: 'Hamstring' }),
      e({ fpl_player_id: 3, web_name: 'Fringe', slug: 'fringe', change_type: 'price_fall', ownership: 0.4 }),
    ] });
    await waitFor(() => expect(screen.getByText('NewInjury')).toBeInTheDocument());
    expect(screen.queryByText('Fringe')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /Everything/ }));
    expect(screen.getByText('Fringe')).toBeInTheDocument();
  });

  it('shows the seven-day transfer window underneath the headlines', async () => {
    setup({ 5: [e({})] });
    const market = await screen.findByRole('region', { name: 'The transfer window' });
    await waitFor(() => expect(within(market).getByText('Riser')).toBeInTheDocument());
    const headlines = screen.getByRole('heading', { name: 'The headlines' });
    // headlines come first in the document
    expect(headlines.compareDocumentPosition(market) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('formats dates the same in every engine, without timezone drift', () => {
    expect(shortDay('2026-09-19')).toBe('Sat 19 Sep');
    expect(shortDay('2026-12-31')).toBe('Thu 31 Dec');
    expect(shortDay('2027-01-01')).toBe('Fri 1 Jan');
  });
});
