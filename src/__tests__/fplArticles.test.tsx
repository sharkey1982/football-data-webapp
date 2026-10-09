// FPL articles: hub and articles render, figures are internally consistent,
// and every article is registered for the sitemap, the static build and the menu.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ArticlesPage from '../pages/fpl/ArticlesPage';
import CaptainTopPickArticle from '../pages/fpl/articles/CaptainTopPickArticle';
import HaalandCaptainArticle, { haalandSummary } from '../pages/fpl/articles/HaalandCaptainArticle';
import {
  ARTICLES,
  ARTICLES_PATH,
  CAPTAIN_BY_SEASON,
  CAPTAIN_GAP_BINS,
  CAPTAIN_STRATEGIES,
  HAALAND_BY_CITY_GOALS,
  HAALAND_CAPTAINCY,
  HAALAND_SEASONS,
  HAALAND_VENUE,
} from '../lib/fplArticles';
import { STATIC_ROUTES } from '../lib/routeMeta';
import { THEMES } from '../lib/journey';
import { renderFplArticlePages } from '../entry-server';

describe('FPL article figures', () => {
  it('season rows add up to the stated totals', () => {
    expect(CAPTAIN_BY_SEASON.reduce((a, s) => a + s.gameweeks, 0)).toBe(CAPTAIN_STRATEGIES.gameweeks);
    expect(CAPTAIN_GAP_BINS.reduce((a, b) => a + b.gameweeks, 0)).toBe(CAPTAIN_STRATEGIES.gameweeks);
    const top = CAPTAIN_BY_SEASON.reduce((a, s) => a + s.top, 0);
    expect(top / CAPTAIN_STRATEGIES.gameweeks).toBeCloseTo(CAPTAIN_STRATEGIES.topRanked, 1);
    // The captaincy article and the Haaland article use the same top-ranked series.
    expect(HAALAND_CAPTAINCY.map((s) => s.topRanked)).toEqual(CAPTAIN_BY_SEASON.map((s) => s.top));
  });

  it('Haaland breakdowns agree with each other', () => {
    const s = haalandSummary();
    const venueStarts = HAALAND_VENUE.reduce((a, v) => a + v.starts, 0);
    expect(s.starts).toBe(venueStarts);
    expect(HAALAND_BY_CITY_GOALS.reduce((a, b) => a + b.starts, 0)).toBe(venueStarts);
    expect(s.cost).toBe(129);
    expect(s.bigAwayBlanks).toBe(11);
    expect(s.bigAwayGames).toBe(22);
    expect(s.arsenal.map((g) => g.points)).toEqual([6, 2, 6, 9]);
    expect(HAALAND_SEASONS.map((x) => x.points)).toEqual([272, 217, 181, 239]);
  });
});

describe('FPL article pages', () => {
  it('hub lists every article with its short answer', () => {
    render(<MemoryRouter><ArticlesPage /></MemoryRouter>);
    for (const a of ARTICLES) {
      expect(screen.getByRole('link', { name: new RegExp(a.title.replace(/[?,]/g, '.')) })).toHaveAttribute('href', a.path);
    }
  });

  it('captaincy article states the verdict and the season table', () => {
    render(<MemoryRouter><CaptainTopPickArticle /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Should you always captain the top-projected player?');
    expect(screen.getByRole('table', { name: 'Captain points by season' })).toHaveTextContent('1023');
    expect(screen.getByText(/could even be nothing/)).toBeInTheDocument();
  });

  it('Haaland article shows the cost and the Arsenal record', () => {
    render(<MemoryRouter><HaalandCaptainArticle /></MemoryRouter>);
    expect(screen.getByRole('table', { name: /always Haaland against always the top-ranked/ })).toHaveTextContent('−129');
    expect(screen.getByText(/At Arsenal he scored 6, 2, 6, 9/)).toBeInTheDocument();
  });
});

describe('FPL article plumbing', () => {
  it('every article and the hub are in the route registry (sitemap) and the menu', () => {
    const paths = STATIC_ROUTES.map((r) => r.path);
    expect(paths).toContain(ARTICLES_PATH);
    for (const a of ARTICLES) expect(paths).toContain(a.path);
    const discover = THEMES.fpl.stages.find((s) => s.key === 'discover');
    expect(discover?.links.some((l) => l.to === ARTICLES_PATH)).toBe(true);
  });

  it('the static build renders a body, Article and FAQ data for each article', () => {
    const pages = renderFplArticlePages();
    expect(pages.map((p) => new URL(p.canonical).pathname)).toEqual([ARTICLES_PATH, ...ARTICLES.map((a) => a.path)]);
    for (const p of pages.slice(1)) {
      expect(p.html).toContain('Short answer');
      const types = p.structuredData.map((d) => (d as { '@type': string })['@type']);
      expect(types).toEqual(['Article', 'FAQPage', 'BreadcrumbList']);
    }
  });
});

// ---- One captain or two? ----------------------------------------------------
import CaptainPairsArticle from '../pages/fpl/articles/CaptainPairsArticle';
import { BUDGET_CURVE, CANDIDATES, COMBOS, GWS, PARTNERS, SQUADS } from '../lib/fplArticleCaptainPairs';
import { CAPTAIN_PAIRS_ARTICLE } from '../lib/fplArticles';

describe('One captain or two: figures', () => {
  const xp = (n: string) => CANDIDATES.find((c) => c.name === n)!.xp;
  it('rotation gain = sum of weekly maxima minus Haaland alone, and paths pick the higher projection', () => {
    const h = xp('Haaland'), s = xp('Saka'), b = xp('Bruno'), p = xp('Palmer');
    const gain = (others: number[][]) => GWS.reduce((t, _g, i) => t + Math.max(h[i], ...others.map((o) => o[i])) - h[i], 0);
    expect(gain([s])).toBeCloseTo(COMBOS.find((c) => c.key === 'hs')!.gain, 1);
    expect(gain([b])).toBeCloseTo(COMBOS.find((c) => c.key === 'hb')!.gain, 1);
    expect(gain([p])).toBeCloseTo(COMBOS.find((c) => c.key === 'hp')!.gain, 1);
    expect(gain([s, b])).toBeCloseTo(COMBOS.find((c) => c.key === 'hsb')!.gain, 1);
    for (const c of COMBOS) {
      expect(c.path).toHaveLength(GWS.length);
      expect(c.path.reduce((t, [, v]) => t + v, 0)).toBeCloseTo(c.captainPoints, 1);
      expect(c.captainPoints - COMBOS[0].captainPoints).toBeCloseTo(c.gain, 1);
    }
    expect(PARTNERS[0]).toMatchObject({ name: 'Saka', weeks: 5 });
  });

  it('candidate totals and squad totals are consistent', () => {
    for (const c of CANDIDATES) expect(c.xp.reduce((t, v) => t + v, 0)).toBeCloseTo(c.xp10, 1);
    for (const s of SQUADS) expect(s.cost).toBeLessThanOrEqual(100);
    // The optimiser's own squad is best of all squads at £100m, and matches the budget curve.
    expect(Math.max(...SQUADS.map((s) => s.total))).toBe(SQUADS[0].total);
    expect(BUDGET_CURVE.find((b) => b.budget === 100)!.total).toBe(SQUADS[0].total);
    // Budget curve rises with budget.
    for (let i = 1; i < BUDGET_CURVE.length; i++) expect(BUDGET_CURVE[i].total).toBeGreaterThan(BUDGET_CURVE[i - 1].total);
  });
});

describe('One captain or two: page', () => {
  it('renders the formula, both parts, the charts and the squad table', () => {
    render(<MemoryRouter><CaptainPairsArticle /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(CAPTAIN_PAIRS_ARTICLE.title);
    expect(screen.getByText(/rotation gain = /)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Part one/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Part two/ })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /captain each week/ })).toHaveTextContent('GW15');
    expect(screen.getByRole('table', { name: /Exact squad solves/ })).toHaveTextContent('633.8');
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/data to 8 Oct 2026/)).toBeInTheDocument();
  });
});

describe('One captain or two: transfers update', () => {
  it('transfers never lower a squad, and the order of squads holds', async () => {
    const { TRANSFERS } = await import('../lib/fplArticleCaptainPairs');
    for (const r of TRANSFERS.rows) expect(r.transfers).toBeGreaterThanOrEqual(r.fixed);
    const order = (k: 'fixed' | 'transfers') => [...TRANSFERS.rows].sort((a, b) => b[k] - a[k]).map((r) => r.key);
    expect(order('transfers')).toEqual(order('fixed'));
  });
});

// ---- Three decisions, three horizons ------------------------------------------
import DecisionHorizonsArticle from '../pages/fpl/articles/DecisionHorizonsArticle';
import { DECISIONS_ARTICLE } from '../lib/fplArticles';
import * as Dec from '../lib/fplArticleDecisions';

describe('Three decisions: figures', () => {
  it('the optimal squad re-scores to the solver total and is legal', () => {
    const r = Dec.weeklyXI(Dec.OPTIMAL_SQUAD);
    expect(r.total).toBeCloseTo(Dec.OPTIMAL_TOTAL, 0);
    expect(Dec.sum(Dec.OPTIMAL_SQUAD.map((p) => p.price))).toBeLessThanOrEqual(100);
    const byClub = new Map<string, number>();
    for (const p of Dec.OPTIMAL_SQUAD) byClub.set(p.team, (byClub.get(p.team) ?? 0) + 1);
    expect(Math.max(...byClub.values())).toBeLessThanOrEqual(3);
    expect([1, 2, 3, 4].map((pos) => Dec.OPTIMAL_SQUAD.filter((p) => p.pos === pos).length)).toEqual([2, 5, 5, 3]);
    expect(r.starts.get('Forster')).toBe(0);
  });

  it('opening and transfer examples', () => {
    expect(Dec.ISIDOR.xp[0]).toBeGreaterThan(Dec.CALVERT_LEWIN.xp[0]);
    expect(Dec.sum(Dec.ISIDOR.xp)).toBeCloseTo(14.7, 1);
    expect(Dec.sum(Dec.CALVERT_LEWIN.xp)).toBeCloseTo(49.0, 1);
    const g = Dec.cumulativeGain(Dec.WISSA.xp, Dec.CALVERT_LEWIN.xp);
    expect(g[0]).toBeLessThan(0);
    expect(g.findIndex((x) => x > 0)).toBe(2); // GW8
    expect(g.findIndex((x) => x > Dec.HIT)).toBe(6); // GW12
    expect(g[9]).toBeCloseTo(8.2, 1);
  });

  it('value claims: Haaland lowest points per £m of any regular starter, and lowest marginal value among attackers', () => {
    const r = Dec.weeklyXI(Dec.OPTIMAL_SQUAD);
    const regular = Dec.OPTIMAL_SQUAD.filter((p) => (r.starts.get(p.name) ?? 0) >= 5);
    const ppm = (p: Dec.SquadPlayer) => Dec.sum(p.xp) / p.price;
    expect([...regular].sort((a, b) => ppm(a) - ppm(b))[0].name).toBe('Haaland');
    const attackers = Dec.OPTIMAL_SQUAD.filter((p) => p.pos >= 3 && p.price - Dec.REPLACEMENT[p.pos].price >= 0.5);
    const mv = (p: Dec.SquadPlayer) => (Dec.sum(p.xp) - Dec.REPLACEMENT[p.pos].xp10) / (p.price - Dec.REPLACEMENT[p.pos].price);
    expect([...attackers].sort((a, b) => mv(a) - mv(b))[0].name).toBe('Haaland');
    // GW6: the top projection is not the most-owned player.
    const [top] = [...Dec.GW6_CAPTAINS].sort((a, b) => b.xp - a.xp);
    const owned = [...Dec.GW6_CAPTAINS].sort((a, b) => b.own - a.own)[0];
    expect(top.name).toBe('Saka');
    expect(owned.name).toBe('Haaland');
  });

  it('"due" test: no effect within two standard errors', () => {
    for (const r of Dec.DUE_TEST) expect(Math.abs(r.diff)).toBeLessThan(2 * r.se + 0.05);
  });
});

describe('Three decisions: page', () => {
  it('renders the worked examples', () => {
    render(<MemoryRouter><DecisionHorizonsArticle /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(DECISIONS_ARTICLE.title);
    expect(screen.getByRole('table', { name: 'The three FPL decisions' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /same swaps judged over different horizons/ })).toHaveTextContent('+8.2');
    expect(screen.getByText(/Clears a 4-point hit only by gameweek 12/)).toBeInTheDocument();
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(4);
  });
});

describe('Three decisions: partner claim', () => {
  it('captaincy is a small part of what the second premium adds', () => {
    const p = Dec.PARTNER_SQUADS;
    const cap = p.captainPoints - p.captainPointsNoPartner, all = p.withPartner - p.noPartner;
    expect(cap).toBeGreaterThan(0);
    expect(cap / all).toBeLessThan(0.2);
  });
});
