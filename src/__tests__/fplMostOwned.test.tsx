import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildMostOwned, budgetText, pickTemplateSquad, pickXi, SQUAD_QUOTA, MAX_PER_CLUB, type MostOwnedInput, type MostOwnedPlayerRow } from '../lib/fplMostOwned';
import { renderMostOwnedPage } from '../entry-server';
import { STATIC_ROUTES } from '../lib/routeMeta';
import { THEMES, HUB_GROUPS } from '../lib/journey';

// 20 clubs. Club 1 ("Arsenal") has the four most-owned defenders, so the
// 3-per-club rule must skip the fourth.
const teamNames: Record<number, string> = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, i === 0 ? 'Arsenal' : i === 1 ? 'Man City' : `Club ${i + 1}`]));

let nextId = 1;
function player(elementType: number, club: number, own: number, over: Partial<MostOwnedPlayerRow> = {}): MostOwnedPlayerRow {
  const id = nextId++;
  return {
    fpl_player_id: id, web_name: `P${id}`, slug: `p${id}`, element_type: elementType, now_cost: 50, selected_by_percent: own,
    status: 'a', chance_of_playing_next_round: null, news: null, canonical_team_id: club, team_name: teamNames[club], ...over,
  };
}

function input(): MostOwnedInput {
  nextId = 1;
  const players: MostOwnedPlayerRow[] = [
    player(4, 2, 78.9, { web_name: 'Haaland', now_cost: 158 }),
    player(1, 1, 46.3, { web_name: 'Raya', now_cost: 62 }),
    player(1, 3, 22.6),
    player(1, 4, 10),
    // Four Arsenal defenders, most owned first.
    player(2, 1, 47.9, { web_name: 'Calafiori', status: 'd', chance_of_playing_next_round: 75, news: 'Hip injury - 75% chance of playing' }),
    player(2, 1, 40),
    player(2, 1, 35),
    player(2, 1, 34, { web_name: 'FourthArsenal' }),
    player(2, 5, 30), player(2, 6, 25), player(2, 7, 20), player(2, 8, 5),
    player(3, 9, 51.5, { web_name: 'Rogers', now_cost: 81 }), player(3, 10, 46.7), player(3, 11, 36.7), player(3, 12, 27.6), player(3, 13, 26.1), player(3, 14, 3),
    player(4, 15, 43.8, { web_name: 'Pedro', status: 'i', news: 'Thigh injury - Unknown return date' }),
    player(4, 16, 24),
    player(4, 17, 2),
    player(5, 18, 90), // a manager: never in the squad
  ];
  // GW10 fixtures: club k v club k+10; club 20 blanks... (pairs 1-11, 2-12, ..., 9-19, 10-20 -> everyone plays)
  const fixtures = [] as MostOwnedInput['fixtures'];
  let fid = 100;
  for (let gw = 10; gw <= 14; gw++) for (let k = 1; k <= 10; k++) fixtures.push({ fixture_id: fid++, matchweek: gw, kickoff_date: `2026-11-${String(gw).padStart(2, '0')}`, home_team_id: k, away_team_id: k + 10 });
  // Club 16's GW10 game is postponed: blank.
  const blank = fixtures.findIndex((f) => f.matchweek === 10 && (f.home_team_id === 16 || f.away_team_id === 16));
  fixtures.splice(blank, 1);
  const fixtureFor = (club: number, gw: number) => fixtures.find((f) => f.matchweek === gw && (f.home_team_id === club || f.away_team_id === club));
  const projections = players.flatMap((p) =>
    [10, 11, 12, 13, 14].flatMap((gw) => {
      const f = fixtureFor(p.canonical_team_id!, gw);
      // Projection grows with ownership; the injured forward gets 0.
      return f ? [{ fpl_player_id: p.fpl_player_id, fixture_id: f.fixture_id, expected_fpl_points: p.status === 'i' ? 0 : Number(p.selected_by_percent) / 10 }] : [];
    })
  );
  // At the GW9 deadline: Rogers 50.9%; a defender (club 8) was then more owned than club 7's.
  const deadline = players.map((p) => ({
    fpl_player_id: p.fpl_player_id, fpl_event_id: 9, deadline_time: '2026-10-31T11:00:00Z',
    selected_by_percent: p.web_name === 'Rogers' ? 50.9 : p.fpl_player_id === 12 ? 21 : p.selected_by_percent,
  }));
  return { players, fixtures, projections, deadline, teamNames, nextGw: 10, asOf: '2026-11-01' };
}

describe('pickTemplateSquad', () => {
  it('takes the highest ownership subject to 2-5-5-3 and three per club', () => {
    const data = buildMostOwned(input())!;
    const squad = data.squad;
    expect(squad).toHaveLength(15);
    for (const [pos, n] of Object.entries(SQUAD_QUOTA)) expect(squad.filter((p) => p.elementType === Number(pos))).toHaveLength(n);
    const perClub = new Map<number, number>();
    for (const p of squad) perClub.set(p.teamId!, (perClub.get(p.teamId!) ?? 0) + 1);
    expect(Math.max(...perClub.values())).toBeLessThanOrEqual(MAX_PER_CLUB);
    const names = squad.map((p) => p.name);
    expect(names).not.toContain('FourthArsenal'); // Raya + 3 Arsenal defenders already
    expect(names).toContain('Calafiori');
  });

  it('skips a 4th player from one club even when more owned', () => {
    const picked = pickTemplateSquad([
      { id: 1, elementType: 3, teamId: 1, ownership: 50 },
      { id: 2, elementType: 3, teamId: 1, ownership: 40 },
      { id: 3, elementType: 3, teamId: 1, ownership: 30 },
      { id: 4, elementType: 3, teamId: 1, ownership: 20 },
      { id: 5, elementType: 3, teamId: 2, ownership: 10 },
    ]);
    expect(picked.map((p) => p.id)).toEqual([1, 2, 3, 5]);
  });
});

describe('pickXi', () => {
  it('picks a legal formation with the most projected points', () => {
    const data = buildMostOwned(input())!;
    const xi = data.xiIds.map((id) => data.squad.find((p) => p.id === id)!);
    expect(xi).toHaveLength(11);
    const count = (t: number) => xi.filter((p) => p.elementType === t).length;
    expect(count(1)).toBe(1);
    expect(count(2)).toBeGreaterThanOrEqual(3);
    expect(count(3)).toBeGreaterThanOrEqual(2);
    expect(count(4)).toBeGreaterThanOrEqual(1);
    expect(data.formation).toBe(`${count(2)}-${count(3)}-${count(4)}`);
    // The injured forward (0 points) is benched.
    expect(data.xiIds).not.toContain(data.squad.find((p) => p.name === 'Pedro')!.id);
    // Bench: reserve keeper first.
    expect(data.squad.find((p) => p.id === data.benchIds[0])!.elementType).toBe(1);
  });

  it('beats every other legal XI from the same squad', () => {
    const squad = Array.from({ length: 15 }, (_, i) => ({ id: i, elementType: [1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4][i], projNext: [5, 1, 2, 2, 2, 1, 1, 9, 8, 7, 1, 1, 9, 8, 7][i], ownership: 1 }));
    const { formation, xi } = pickXi(squad);
    expect(formation).toBe('3-4-3');
    expect(xi.reduce((s, p) => s + p.projNext, 0)).toBe(5 + 6 + 25 + 24);
  });
});

describe('buildMostOwned', () => {
  const data = buildMostOwned(input())!;

  it('opens with a dated answer: cost against the budget and the most-owned player', () => {
    expect(data.lead.startsWith(`As of 1 November 2026, the most-owned FPL squad costs £${data.cost.toFixed(1)}m, `)).toBe(true);
    expect(data.lead).toContain('its most-owned player is Haaland (78.9%)');
    expect(data.lead).toContain(`a ${data.formation} XI from it for gameweek 10`);
    expect(data.lead).toContain('with Haaland as captain');
    expect(data.lead).toContain('2 of the 15 are flagged');
  });

  it('captain and vice are the two highest projections; captain points count twice', () => {
    expect(data.squad.find((p) => p.id === data.captainId)!.name).toBe('Haaland');
    expect(data.squad.find((p) => p.id === data.viceId)!.name).toBe('Rogers');
    const xi = data.xiIds.map((id) => data.squad.find((p) => p.id === id)!);
    expect(data.xiProjNext).toBeCloseTo(xi.reduce((s, p) => s + p.projNext, 0) + 7.9, 1);
  });

  it('ownership change since the last deadline, and how the template changed', () => {
    expect(data.deadlineGw).toBe(9);
    const rogers = data.moves.find((m) => m.name === 'Rogers')!;
    expect(rogers.change).toBeCloseTo(0.6, 5);
    // Player 12 (club 8 defender, 5% now, 21% at the deadline) was in the deadline template only.
    expect(data.dropped.map((m) => m.id)).toEqual([12]);
    expect(data.joined.map((m) => m.id)).toEqual([11]);
  });

  it('weak spots: flagged players, blanks and the lowest projections', () => {
    expect(data.weakSpots).toContain('Calafiori (Arsenal, 47.9% owned) is doubtful: Hip injury - 75% chance of playing.');
    expect(data.weakSpots).toContain('Pedro (Club 15, 43.8% owned) is injured: Thigh injury - Unknown return date.');
    expect(data.weakSpots.some((w) => w.startsWith('P20 (Club 16) has no fixture in gameweek 10'))).toBe(true);
    expect(data.weakSpots.some((w) => w.includes('has the lowest projection in the XI'))).toBe(true);
  });

  it('no squad without 15 eligible players', () => {
    const i = input();
    expect(buildMostOwned({ ...i, players: i.players.slice(0, 10) })).toBeNull();
  });

  it('works without the deadline snapshot', () => {
    const d = buildMostOwned({ ...input(), deadline: null })!;
    expect(d.deadlineGw).toBeNull();
    expect(d.joined).toEqual([]);
    expect(d.squad[0].ownershipAtDeadline).toBeNull();
  });
});

describe('budgetText', () => {
  it('over, under and exact', () => {
    expect(budgetText(110.2)).toBe('£10.2m over the £100m budget');
    expect(budgetText(99.4)).toBe('£0.6m under the £100m budget');
    expect(budgetText(100)).toBe('exactly the £100m budget');
  });
});

describe('/fpl/most-owned static page', () => {
  const i = input();
  const page = renderMostOwnedPage({ ...i, players: i.players as unknown as Record<string, unknown>[] })!;

  it('renders the lead, the table and the weak spots in server HTML', () => {
    const lead = /<p[^>]*data-testid="answer-lead"[^>]*>([\s\S]*?)<\/p>/.exec(page.html)?.[1].replace(/<!-- -->/g, '');
    expect(lead).toContain('As of 1 November 2026, the most-owned FPL squad costs');
    expect(page.html).toContain('data-testid="most-owned-table"');
    expect(page.html).toContain('data-testid="most-owned-weak-spots"');
    expect(page.html).toContain('href="/fpl/players/p1"');
    expect(page.description.startsWith('As of 1 November 2026')).toBe(true);
  });

  it('is in the sitemap routes, the FPL menu and the hub groups', () => {
    expect(STATIC_ROUTES.some((r) => r.path === '/fpl/most-owned')).toBe(true);
    expect(THEMES.fpl.stages.flatMap((s) => s.links).some((l) => l.to === '/fpl/most-owned')).toBe(true);
    expect(HUB_GROUPS.fpl!.some((g) => g.paths.includes('/fpl/most-owned'))).toBe(true);
    const menu = JSON.parse(readFileSync(`${process.cwd()}/scripts/smoke/menu-pages.json`, 'utf8'));
    expect(menu.menu).toContain('/fpl/most-owned');
  });
});
