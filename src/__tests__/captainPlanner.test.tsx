// Captain planner: arithmetic (src/lib/captainPartners.ts) and the panel.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { captainPlan } from '../lib/captainPartners';
import CaptainPlanner, { type PlannerPlayer } from '../components/fpl/CaptainPlanner';
import { CANDIDATES, COMBOS, GWS } from '../lib/fplArticleCaptainPairs';

const player = (id: number, name: string, xs: number[], price = 10, start = 0.95): PlannerPlayer => ({
  id, name, team: 'T', price,
  xp: new Map(xs.map((v, i) => [GWS[i], v])),
  start: new Map(xs.map((_v, i) => [GWS[i], start])),
});

describe('captainPlan', () => {
  it('matches the article: Haaland + Saka, GW6-15', () => {
    const h = player(1, 'Haaland', CANDIDATES[0].xp), s = player(2, 'Saka', CANDIDATES[1].xp);
    const plan = captainPlan([h, s], GWS);
    const combo = COMBOS.find((c) => c.key === 'hs')!;
    expect(plan.captainPoints).toBeCloseTo(combo.captainPoints, 1);
    expect(plan.gain).toBeCloseTo(combo.gain, 1);
    expect(plan.best!.id).toBe(1);
    expect(plan.armbands.get(2)).toBe(5);
    expect(plan.weeks.map((w) => w.captainId)).toEqual(combo.path.map(([n]) => (n === 'Haaland' ? 1 : 2)));
  });

  it('gain is measured against the best single option, not the first picked', () => {
    const a = player(1, 'A', [2, 2, 2, 2, 2, 2, 2, 2, 2, 2]), b = player(2, 'B', [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
    const plan = captainPlan([a, b], GWS);
    expect(plan.best!.id).toBe(2);
    expect(plan.gain).toBeCloseTo(0);
  });

  it('a blank week counts as 0 for that player', () => {
    const a = player(1, 'A', [6, 6, 6, 6, 6, 6, 6, 6, 6, 6]);
    a.xp.delete(GWS[3]);
    const b = player(2, 'B', [4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
    const plan = captainPlan([a, b], GWS);
    expect(plan.weeks[3].captainId).toBe(2);
    expect(plan.gain).toBeCloseTo(4);
  });
});

describe('CaptainPlanner', () => {
  it('shows the defaults, marks captains and adds a third player', () => {
    const players = [player(1, 'Haaland', CANDIDATES[0].xp, 15.6), player(2, 'Saka', CANDIDATES[1].xp, 9.6), player(3, 'Bruno', CANDIDATES[2].xp, 11.9)];
    render(<MemoryRouter><CaptainPlanner players={players} gws={GWS} defaults={[1, 2]} /></MemoryRouter>);
    expect(screen.getByText('Haaland (T)')).toBeInTheDocument();
    expect(screen.getByText(/Gain over Haaland every week/)).toBeInTheDocument();
    expect(screen.getByText('+3.6')).toBeInTheDocument();
    expect(screen.getByText('£25.2m')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Add a player/), { target: { value: 'Bruno (T)' } });
    expect(screen.getByText('Bruno (T)')).toBeInTheDocument();
    expect(screen.getByText('+4.0')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Add a player/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Remove Bruno'));
    expect(screen.getByText('+3.6')).toBeInTheDocument();
  });
});
void React;
