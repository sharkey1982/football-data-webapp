import { describe, it, expect } from 'vitest';
import { scoreLabel, scorelineSentence, sharePct, summariseScorelines, type ScorelineRow } from '../lib/scorelinesApi';
import { renderScorelinesPage } from '../entry-server';

const rows: ScorelineRow[] = [
  { goals_a: 1, goals_b: 1, outcome: 'D', matches: 150 },
  { goals_a: 1, goals_b: 0, outcome: 'W', matches: 130 },
  { goals_a: 0, goals_b: 0, outcome: 'D', matches: 80 },
  { goals_a: 0, goals_b: 1, outcome: 'L', matches: 90 },
  // 6-5 and 5-5 both cap to 5+ v 5+: one cell, two outcomes
  { goals_a: 5, goals_b: 5, outcome: 'W', matches: 1 },
  { goals_a: 5, goals_b: 5, outcome: 'D', matches: 1 },
];

describe('Scoreline Explorer', () => {
  const s = summariseScorelines(rows);
  it('fills the grid and counts outcomes from the full score', () => {
    expect(s.total).toBe(452);
    expect(s.grid[5][5]).toBe(2);
    expect([s.aWins, s.draws, s.bWins]).toEqual([131, 231, 90]);
    expect(s.top[0]).toEqual({ goals_a: 1, goals_b: 1, matches: 150 });
  });

  it('labels capped scores and small shares', () => {
    expect(scoreLabel(5, 2)).toBe('5+–2');
    expect(sharePct(1, 452)).toBe('0.2%');
    expect(sharePct(150, 452)).toBe('33%');
  });

  it('writes the sentence from the home side or a club', () => {
    expect(scorelineSentence(s, 'Premier League', null)).toBe(
      'The most common scoreline in 452 Premier League matches is 1–1 (home side’s goals first): 33%, then 1–0 (29%). Home sides won 29%, 51% were drawn and away sides won 20%; 18% finished 0–0.'
    );
    expect(scorelineSentence(s, 'National League Southend', 'Southend')).toContain('Southend won 29%, drew 51% and lost 20%');
  });

  it('server-renders the grid and sentence at one canonical URL', () => {
    const page = renderScorelinesPage({ league: { league_id: 1, code: 'E0', name: 'Premier League', slug: 'premier-league', country: 'England' }, rows });
    expect(page.html).toContain('The most common scoreline in 452 Premier League matches');
    expect(page.canonical).toMatch(/\/football\/history\/scorelines$/);
  });
});
