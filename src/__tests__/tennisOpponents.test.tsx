// Player page (7 Oct 2026): most played opponents, and the tournament shown in
// match tables on every screen size.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { opponentRecords, opponentsSentence } from '../lib/tennisH2H';
import type { TennisMatch } from '../lib/tennisStats';
import Opponents from '../components/tennis/Opponents';
import { TournamentCell } from '../components/tennis/TennisBits';

let n = 0;
const who: Record<number, string> = { 1: 'Sinner J.', 2: 'Alcaraz C.', 3: 'Zverev A.', 4: 'Medvedev D.' };
function m(w: number, l: number, date: string, over: Partial<TennisMatch> = {}): TennisMatch {
  n++;
  return {
    source_key: `k${n}`, tour: 'ATP', year: Number(date.slice(0, 4)), match_date: date, tournament_id: n, tournament: `Open ${n}`, tournament_slug: 'x', location: 'X', surface_group: 'Hard',
    level: '500', level_rank: 5, round: 'Semifinals', round_order: 6, best_of: 3,
    winner: who[w], winner_slug: who[w].toLowerCase().replace(/\W+/g, '-').replace(/-$/, ''), winner_id: w, loser: who[l], loser_slug: who[l].toLowerCase().replace(/\W+/g, '-').replace(/-$/, ''), loser_id: l,
    w_rank: 1, l_rank: 2, w_games: [6, 6], l_games: [4, 4], result: 'Completed', played: true, avg_w: null, avg_l: null, b365_w: null, b365_l: null, ps_w: null, ps_l: null, ...over,
  } as TennisMatch;
}
const matches = [
  m(1, 2, '2024-03-01'), m(2, 1, '2024-06-01', { round: 'The Final' }), m(2, 1, '2025-06-01', { round: 'The Final', tournament: 'Wimbledon' }), m(1, 2, '2025-09-01'), m(2, 1, '2026-01-20'),
  m(1, 3, '2024-01-01'), m(1, 3, '2025-01-01'), m(1, 3, '2025-02-01'), m(1, 3, '2025-03-01'), m(1, 3, '2025-12-01', { round: 'The Final' }),
  m(4, 1, '2025-05-01'),
  m(1, 4, '2025-05-02', { played: false, result: 'Walkover' }),
];

describe('most played opponents', () => {
  it('one row per opponent: played, W–L, finals and the last five, latest first', () => {
    const rows = opponentRecords(matches, 1);
    expect(rows.map((r) => [r.name, r.played, r.won, r.lost])).toEqual([['Alcaraz C.', 5, 2, 3], ['Zverev A.', 5, 5, 0], ['Medvedev D.', 1, 0, 1]]);
    expect(rows[0].form).toEqual(['L', 'W', 'L', 'L', 'W']);
    expect([rows[0].finalsWon, rows[0].finalsLost, rows[1].finalsWon]).toEqual([0, 2, 1]);
    expect(opponentsSentence('Sinner J.', rows)).toBe('Sinner J. has played Alcaraz C. most often: 5 times, 2–3. Best record against a regular opponent: 5–0 v Zverev A.');
  });

  it('the player page table: links to the head to head, and a search', () => {
    render(<MemoryRouter><Opponents tour="ATP" playerId={1} playerSlug="sinner-j" name="Sinner J." matches={matches} /></MemoryRouter>);
    const table = screen.getByTestId('tennis-player-opponents');
    expect(within(table).getAllByRole('link', { name: 'Head to head' })[0].getAttribute('href')).toBe('/tennis/head-to-head/atp/alcaraz-c/sinner-j');
    expect(table).toHaveTextContent('Open 5 2026');
    fireEvent.change(screen.getByTestId('tennis-opponent-search'), { target: { value: 'zve' } });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
  });

  it('the tournament cell carries the round for phones', () => {
    render(<TournamentCell name="Wimbledon" level="Grand Slam" round="The Final" />);
    expect(screen.getByText('Wimbledon', { exact: false })).toHaveTextContent('Wimbledon Grand SlamFinal');
  });
});
