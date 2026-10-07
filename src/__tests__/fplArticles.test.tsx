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
