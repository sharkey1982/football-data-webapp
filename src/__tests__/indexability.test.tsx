// Indexability regression tests (7 Oct 2026 SEO audit, docs/seo-indexation.md).
// The rules live in scripts/lib/indexability.mjs; the build applies them to
// every sitemap URL (scripts/check-indexability.mjs) and site-health.yml to
// the live site. These tests pin the rules and the policy decisions so a new
// feature can't quietly block, duplicate or orphan a page family.
import React from 'react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
// @ts-expect-error plain .mjs module without types
import * as rules from '../../scripts/lib/indexability.mjs';
import { STATIC_ROUTES } from '../lib/routeMeta';
import { tennisH2HCanonicalPath } from '../lib/tennisApi';
import { teamFplPlayers } from '../lib/teamPageApi';
import TeamPage, { type TeamPageData } from '../pages/football/TeamPage';
import { renderPlayerPage, renderTeamPage, renderTennisEditionPage } from '../entry-server';

vi.mock('../lib/financeApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/financeApi')>('../lib/financeApi');
  return { ...actual, teamHasFinance: vi.fn().mockResolvedValue(false) };
});
vi.mock('../components/TeamHistoryPanel', () => ({ default: () => null }));

const R = rules as {
  SITE: string;
  urlShapeProblems: (u: string) => string[];
  googlebotDisallows: (t: string) => string[];
  isBlocked: (p: string, d: string[]) => boolean;
  pageProblems: (loc: string, html: string | null) => string[];
  duplicateTitles: (p: { loc: string; title: string | null }[]) => Map<string, string[]>;
  headTags: (html: string) => { canonical: string | null; robots: string | null; title: string | null };
  PRIVATE_PATHS: string[];
};
const robots = readFileSync(join(process.cwd(), 'public', 'robots.txt'), 'utf8');
const disallows = R.googlebotDisallows(robots);

// One representative URL per family the policy marks A (index + sitemap).
const INDEXABLE = [
  '/', '/football', '/fixtures', '/tv-guide', '/finance', '/finance/compare',
  '/football/matches/arsenal-v-chelsea-2026-10-18', '/football/teams/arsenal', '/football/teams/hull/2024-25',
  '/football/teams/arsenal/finances', '/football/leagues/premier-league', '/football/leagues/premier-league/1992-93',
  '/football/records/premier-league', '/football/history/trends/premier-league',
  '/fpl', '/fpl/players/bukayo-saka', '/fpl/player-scout/bukayo-saka', '/fpl/team-of-the-week/gw5',
  '/nfl', '/nfl/seasons/2025', '/nfl/teams/buffalo-bills', '/nfl/games/2026_02_sea_ari',
  '/tennis/players/atp/sinner-j', '/tennis/seasons/wta/2024', '/tennis/tournaments/atp/wimbledon',
  '/tennis/tournaments/wta/wimbledon/2025', '/tennis/head-to-head/atp/alcaraz-c/sinner-j',
  '/international/teams/england', '/international/tournaments/world-cup/2022', '/international/women/teams/england',
];

describe('URL shape', () => {
  it('accepts the canonical form and names every variant', () => {
    expect(R.urlShapeProblems('https://fixtureshark.com/football/teams/arsenal')).toEqual([]);
    expect(R.urlShapeProblems('https://fixtureshark.com/')).toEqual([]);
    expect(R.urlShapeProblems('http://fixtureshark.com/fixtures')).toContain('not https');
    expect(R.urlShapeProblems('https://www.fixtureshark.com/fixtures')).toContain('host is www.fixtureshark.com');
    expect(R.urlShapeProblems('https://fixtureshark.com/football/teams/tottenham/finances/')).toContain('trailing slash');
    expect(R.urlShapeProblems('https://fixtureshark.com/Football')).toContain('upper-case path');
    expect(R.urlShapeProblems('https://fixtureshark.com/table?league=1')).toContain('has a query string');
    expect(R.urlShapeProblems('https://fixtureshark.com/fixtures.html')).toContain('ends .html');
  });

  it('every static route registered for the sitemap has a clean canonical shape', () => {
    for (const r of STATIC_ROUTES) expect(R.urlShapeProblems(R.SITE + r.path), r.path).toEqual([]);
  });
});

describe('robots.txt', () => {
  it('blocks every private path', () => {
    for (const p of R.PRIVATE_PATHS) expect(R.isBlocked(p, disallows), p).toBe(true);
  });

  it('does not block any indexable family or any static route', () => {
    for (const p of INDEXABLE) expect(R.isBlocked(p, disallows), p).toBe(false);
    for (const r of STATIC_ROUTES) expect(R.isBlocked(r.path, disallows), r.path).toBe(false);
  });

  it('does not block pages that rely on noindex, so Google can see the tag', () => {
    // Minor tennis players and unknown slugs are noindex in the page; a robots
    // block would hide that tag and leave the URL "indexed, though blocked".
    for (const p of ['/tennis/players/atp/nobody', '/football/teams/not-a-club', '/international/teams/nowhere']) {
      expect(R.isBlocked(p, disallows), p).toBe(false);
    }
  });

  it('gives AI crawlers the same private blocks', () => {
    const gpt = robots.split('User-agent: GPTBot')[1] ?? '';
    for (const p of ['/admin/', '/login', '/data-health']) expect(gpt).toContain(`Disallow: ${p}`);
  });
});

describe('page head rules', () => {
  const page = (canonical: string, extra = '') =>
    `<html><head><title>T</title>${extra}<link rel="canonical" href="${canonical}" /></head><body></body></html>`;

  it('passes a self-canonical page and flags the failure modes', () => {
    const loc = 'https://fixtureshark.com/fixtures';
    expect(R.pageProblems(loc, page(loc))).toEqual([]);
    expect(R.pageProblems(loc, null)[0]).toMatch(/no generated file/);
    expect(R.pageProblems(loc, page(`${loc}/`))[0]).toMatch(/canonical is/);
    expect(R.pageProblems(loc, page(loc, '<meta name="robots" content="noindex" />'))[0]).toMatch(/noindex/);
    expect(R.pageProblems(loc, page(loc, '<meta property="og:url" content="https://fixtureshark.com/" />'))[0]).toMatch(/og:url/);
  });

  it('finds titles shared between sitemap pages', () => {
    const d = R.duplicateTitles([{ loc: 'a', title: 'X' }, { loc: 'b', title: 'X' }, { loc: 'c', title: 'Y' }]);
    expect([...d.keys()]).toEqual(['X']);
  });
});

describe('generated pages (server HTML)', () => {
  it('ATP and WTA editions of one Grand Slam have different titles', () => {
    const edition = (tour: 'ATP' | 'WTA') =>
      renderTennisEditionPage({
        event: { event_id: 1, tour, slug: 'wimbledon', name: 'Wimbledon', city: 'London', country: 'GB', level: 'Grand Slam', level_rank: 1, surface: 'Grass', first_year: 2000, last_year: 2026, editions: 27 },
        edition: { tournament_id: 1, year: 2025, event_id: 1, event_slug: 'wimbledon', tour, name: 'Wimbledon', city: 'London', start_date: '2025-06-30', end_date: '2025-07-13', level: 'Grand Slam', level_rank: 1, surface: 'Grass', matches: 0, winner: null, winner_slug: null, runner_up: null, runner_up_slug: null },
        matches: [],
        years: [2025],
      } as unknown as Parameters<typeof renderTennisEditionPage>[0]);
    const atp = edition('ATP');
    const wta = edition('WTA');
    expect(atp.title).not.toBe(wta.title);
    expect(atp.canonical).toBe('https://fixtureshark.com/tennis/tournaments/atp/wimbledon/2025');
  });

  it('an FPL player page links to the career record and the club in server HTML', () => {
    const html = renderPlayerPage('bukayo-saka', {
      profile: { fpl_player_id: 1, slug: 'bukayo-saka', web_name: 'Saka', full_name: 'Bukayo Saka', canonical_team_id: 1, team_name: 'Arsenal', team_slug: 'arsenal', position_label: 'Midfielder', price: 10 },
      season: [],
    } as unknown as Parameters<typeof renderPlayerPage>[1]).html;
    expect(html).toContain('href="/fpl/player-scout/bukayo-saka"');
    expect(html).toContain('href="/football/teams/arsenal"');
  });

  const club: TeamPageData = {
    profile: { team_id: 1, slug: 'arsenal', display_name: 'Arsenal', league_name: 'Premier League', league_id: 1, goals_for_per_game: null, goals_against_per_game: null, is_estimated: false, fitted_at: null },
    matches: [],
    hasFinance: false,
    fplPlayers: teamFplPlayers([
      { slug: 'bukayo-saka', first_name: 'Bukayo', second_name: 'Saka', element_type: 3 },
      { slug: 'david-raya', first_name: 'David', second_name: 'Raya', element_type: 1 },
      { slug: null, first_name: 'No', second_name: 'Slug', element_type: 2 },
    ]),
  } as TeamPageData;

  it('a club page links to each of its FPL players, goalkeepers first', () => {
    expect(club.fplPlayers!.map((p) => p.slug)).toEqual(['david-raya', 'bukayo-saka']);
    expect(renderTeamPage('arsenal', club).html).toContain('href="/fpl/players/bukayo-saka"');
    render(
      <MemoryRouter initialEntries={['/football/teams/arsenal']}>
        <Routes><Route path="/football/teams/:slug" element={<TeamPage initialData={club} />} /></Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'David Raya' })).toHaveAttribute('href', '/fpl/players/david-raya');
  });
});

describe('internal links use the canonical URL', () => {
  it('head-to-head pairs link in alphabetical order whichever player is first', () => {
    expect(tennisH2HCanonicalPath('ATP', 'sinner-j', 'alcaraz-c')).toBe('/tennis/head-to-head/atp/alcaraz-c/sinner-j');
    expect(tennisH2HCanonicalPath('ATP', 'alcaraz-c', 'sinner-j')).toBe('/tennis/head-to-head/atp/alcaraz-c/sinner-j');
  });

  it('no internal link is written with a trailing slash, upper case or the www host', () => {
    // Source-level guard: Link/href literals in pages and components.
    const out = execSync(
      String.raw`grep -rnoE "(to|href)=[{]?[\"'\x60]/[a-z0-9/_:-]*[a-z0-9_-]/[\"'\x60]|https?://www\.fixtureshark\.com|http://fixtureshark\.com" src/pages src/components src/lib || true`,
      { encoding: 'utf8' }
    );
    // The Beat the Shark game is linked WITH its slash on purpose (netlify.toml).
    const bad = out.split('\n').filter((l) => l.trim() && !l.includes('/play/beat-the-shark/'));
    expect(bad).toEqual([]);
  });
});

describe('client-rendered variants redirect to the canonical path', () => {
  it('strips trailing slashes and lower-cases, leaving clean paths and the game alone', async () => {
    const { canonicalPathname } = await import('../components/CanonicalPathRedirect');
    expect(canonicalPathname('/football/teams/caen/')).toBe('/football/teams/caen');
    expect(canonicalPathname('/FOOTBALL/Teams/Caen')).toBe('/football/teams/caen');
    expect(canonicalPathname('/nfl/games/2014_11_cin_no//')).toBe('/nfl/games/2014_11_cin_no');
    expect(canonicalPathname('/football/teams/caen')).toBeNull();
    expect(canonicalPathname('/')).toBeNull();
    expect(canonicalPathname('/play/beat-the-shark/')).toBeNull();
  });

  it('every sitemap-registered static route is already in canonical form', async () => {
    const { canonicalPathname } = await import('../components/CanonicalPathRedirect');
    for (const r of STATIC_ROUTES) expect(canonicalPathname(r.path), r.path).toBeNull();
  });
});

describe('tennis player indexing', () => {
  it('indexes active regulars, champions and long careers; not one-off qualifiers', async () => {
    const { isIndexedPlayer } = await import('../lib/tennisStats');
    expect(isIndexedPlayer({ recent_matches: 0, titles: 103, won: 1250, lost: 275 })).toBe(true); // a retired champion
    expect(isIndexedPlayer({ recent_matches: 60, titles: 0, won: 40, lost: 30 })).toBe(true); // an active regular
    expect(isIndexedPlayer({ recent_matches: 0, titles: 0, won: 120, lost: 110 })).toBe(true); // a long career
    expect(isIndexedPlayer({ recent_matches: 3, titles: 0, won: 2, lost: 5 })).toBe(false);
  });
});
