// EFL and National League match pages, the noindex match shell and the hub
// link lists (29 Oct 2026, docs/seo-indexation.md). Before this, every
// non-Premier League match URL was the bare app shell: generic title, no
// canonical, no robots tag, an empty body.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without types
import { prerenderEflMatch } from '../../scripts/lib/sitemapPolicy.mjs';
// @ts-expect-error plain .mjs module without types
import { headTags, noindexShell } from '../../scripts/lib/indexability.mjs';
import { buildDocument, renderMatchPage, renderStaticRouteHead } from '../entry-server';
import { STATIC_ROUTES } from '../lib/routeMeta';

const fixture = (over: Record<string, unknown> = {}) => ({
  predicted_home_goals: 1.6, predicted_away_goals: 0.9, prediction_fit_run_id: 7, status: 'scheduled', ...over,
});

describe('which EFL matches are pre-rendered', () => {
  it('a fixture with a frozen prediction', () => {
    expect(prerenderEflMatch(fixture())).toBe(true);
  });
  it('a played or kicked-off fixture, even without a prediction', () => {
    expect(prerenderEflMatch(fixture({ predicted_home_goals: null, status: 'played' }))).toBe(true);
    expect(prerenderEflMatch(fixture({ prediction_fit_run_id: null, status: 'awaiting_result' }))).toBe(true);
  });
  it('not a scheduled fixture with nothing to show yet', () => {
    expect(prerenderEflMatch(fixture({ predicted_home_goals: null }))).toBe(false);
    expect(prerenderEflMatch(fixture({ prediction_fit_run_id: null }))).toBe(false);
  });
});

describe('an EFL match page', () => {
  const page = renderMatchPage('wolves-v-derby-2026-11-24', {
    fixture_id: 11, slug: 'wolves-v-derby-2026-11-24', home_team_name: 'Wolves', away_team_name: 'Derby', home_team_slug: 'wolves', away_team_slug: 'derby',
    kickoff_date: '2026-11-24', status: 'scheduled', matchweek: 17, league_name: 'Championship',
    predicted_home_goals: 1.6, predicted_away_goals: 0.9, predicted_at: '2026-10-28T09:00:00Z', fit_run_id: 7, model: null,
    actual_home_goals: null, actual_away_goals: null,
    market: { home: 0.45, draw: 0.28, away: 0.27, captured_at: '2026-10-28T10:00:00Z' },
    marketRecord: { matches: 400, from_date: '2024-08-01', model_log_loss: 1.02, market_log_loss: 1.0 },
    __rho: -0.06,
  });

  it('has its own title, canonical and content in the server HTML', () => {
    expect(page.title).toBe('Wolves v Derby — prediction | FixtureShark');
    expect(page.canonical).toBe('https://fixtureshark.com/football/matches/wolves-v-derby-2026-11-24');
    expect(page.html).toContain('Championship');
    expect(page.html).toContain('Betting market');
    expect(page.html).toContain('Championship matches since');
    expect(page.html).toContain('href="/football/teams/wolves"');
    const t = headTags(buildDocument('<html><head><title>x</title><meta name="description" content="x" /></head><body><div id="root"></div></body></html>', page));
    expect(t.robots).toBeNull();
    expect(t.canonical).toBe(page.canonical);
  });
});

describe('match URLs with no generated page', () => {
  const shell = '<html><head><title>FixtureShark</title></head><body><div id="root"></div></body></html>';

  it('get the app shell with noindex,follow', () => {
    expect(headTags(noindexShell(shell)).robots).toBe('noindex,follow');
    expect(headTags(noindexShell(noindexShell(shell))).robots).toBe('noindex,follow');
  });

  it('netlify.toml serves the match shell, unforced, above the SPA fallback', () => {
    const toml = readFileSync(join(process.cwd(), 'netlify.toml'), 'utf8');
    const rules = toml.split('[[redirects]]').slice(1).map((r) => r.split(/\n\s*\n|\n#/)[0]);
    const match = rules.findIndex((r) => r.includes('from = "/football/matches/*"'));
    const fallback = rules.findIndex((r) => r.includes('from = "/*"') && r.includes('/app-shell.html'));
    expect(match).toBeGreaterThan(-1);
    expect(rules[match]).toContain('to = "/match-shell.html"');
    expect(rules[match]).toContain('status = 200');
    // Unforced: a generated page (a pre-rendered match) always wins over the rule.
    expect(rules[match]).not.toMatch(/force\s*=\s*true/);
    expect(match).toBeLessThan(fallback);
  });

  it('the build writes the match shell', () => {
    expect(readFileSync(join(process.cwd(), 'scripts', 'write-app-shell.mjs'), 'utf8')).toContain("'match-shell.html'");
  });
});

describe('hub link lists in server HTML', () => {
  it('/fixtures and /fpl/player-points render every link they are given', () => {
    for (const path of ['/fixtures', '/fpl/player-points']) {
      const meta = STATIC_ROUTES.find((r) => r.path === path)!;
      const page = renderStaticRouteHead({
        ...meta,
        __directory: { intro: 'i', groups: [{ heading: 'Championship', links: [{ to: '/football/matches/wolves-v-derby-2026-11-24', label: 'Wolves v Derby', note: 'Tue 24 Nov 2026' }, { to: '/fpl/players/lewis-dunk', label: 'Lewis Dunk' }] }] },
      });
      expect(page.canonical).toBe(`https://fixtureshark.com${path}`);
      expect(page.html).toContain('href="/football/matches/wolves-v-derby-2026-11-24"');
      expect(page.html).toContain('href="/fpl/players/lewis-dunk"');
    }
  });

  it('without a list the page stays head-only', () => {
    expect(renderStaticRouteHead(STATIC_ROUTES.find((r) => r.path === '/fixtures')!).html).toBe('');
  });
});
