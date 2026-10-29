// Sitemap slimming and Player Scout canonicals (29 Oct 2026,
// docs/seo-indexation.md). Pins which pages of each family are listed, and
// that a Player Scout page points at the FPL player page that now carries
// the same career table.
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
// @ts-expect-error plain .mjs module without types
import * as policy from '../../scripts/lib/sitemapPolicy.mjs';
// @ts-expect-error plain .mjs module without types
import { headTags } from '../../scripts/lib/indexability.mjs';
import { buildDocument, renderPlayerPage, renderStaticRouteHead } from '../entry-server';
import PlayerRecordPage from '../pages/fpl/PlayerRecordPage';
import * as scoutApi from '../lib/playerScoutApi';

vi.mock('../lib/playerScoutApi', async () => {
  const actual = await vi.importActual<typeof scoutApi>('../lib/playerScoutApi');
  return { ...actual, getPlayerBySlug: vi.fn(), getPlayerCareer: vi.fn().mockResolvedValue([]), getPlayerSeasons: vi.fn().mockResolvedValue([]), getPlayerSeasonGameweeks: vi.fn().mockResolvedValue([]) };
});

const P = policy as {
  includeClubSeason: (y: number) => boolean;
  includeLeagueSeason: (l: number, y: number) => boolean;
  includeTennisEdition: (y: number) => boolean;
  includeIntlNation: (t: { played: number; elo_rank: number | null }) => boolean;
  includeEflMatch: (k: string, today: string) => boolean;
};

describe('sitemap families', () => {
  it('club seasons from 2023/24 only', () => {
    expect(P.includeClubSeason(2023)).toBe(true);
    expect(P.includeClubSeason(2026)).toBe(true);
    expect(P.includeClubSeason(2022)).toBe(false);
    expect(P.includeClubSeason(1992)).toBe(false);
  });

  it('English tiers 1-5 keep every season; other leagues from 2020/21', () => {
    expect(P.includeLeagueSeason(2, 1993)).toBe(true); // Championship 1993-94
    expect(P.includeLeagueSeason(5, 2001)).toBe(true);
    expect(P.includeLeagueSeason(13, 2019)).toBe(false); // La Liga 2019-20
    expect(P.includeLeagueSeason(13, 2020)).toBe(true);
    expect(P.includeLeagueSeason(30, 2022)).toBe(true);
  });

  it('tennis big editions from 2015', () => {
    expect(P.includeTennisEdition(2003)).toBe(false);
    expect(P.includeTennisEdition(2015)).toBe(true);
  });

  it('nations with 50+ games and an Elo ranking', () => {
    expect(P.includeIntlNation({ played: 1102, elo_rank: 3 })).toBe(true);
    expect(P.includeIntlNation({ played: 135, elo_rank: null })).toBe(false); // Alderney: not FIFA-ranked
    expect(P.includeIntlNation({ played: 40, elo_rank: 150 })).toBe(false);
  });

  it('EFL match pages within 30 days of the build', () => {
    expect(P.includeEflMatch('2026-11-24', '2026-10-29')).toBe(true);
    expect(P.includeEflMatch('2026-09-29', '2026-10-29')).toBe(true);
    expect(P.includeEflMatch('2026-09-28', '2026-10-29')).toBe(false);
    expect(P.includeEflMatch('2027-01-01', '2026-10-29')).toBe(false);
  });

  it('the sitemap no longer lists Player Scout pages', () => {
    const src = readFileSync(join(process.cwd(), 'scripts', 'generate-sitemap.mjs'), 'utf8');
    expect(src).not.toMatch(/urlEntry\(`\/fpl\/player-scout\//);
  });
});

describe('Player Scout pages', () => {
  const shell = '<html><head><title>FixtureShark</title><meta name="description" content="x" /></head><body><div id="root"></div></body></html>';
  const head = (scout: string, playerSlug: string | null | undefined) =>
    renderStaticRouteHead({ path: `/fpl/player-scout/${scout}`, title: `${scout} — FPL career record`, description: 'd', crumbs: [], __scoutPlayerSlug: playerSlug });

  it("a current player's scout page is canonical to the FPL player page", () => {
    const html = buildDocument(shell, head('lewis-dunk', 'lewis-dunk'));
    const t = headTags(html);
    expect(t.canonical).toBe('https://fixtureshark.com/fpl/players/lewis-dunk');
    expect(t.robots).toBeNull();
    expect(html).toContain('property="og:url" content="https://fixtureshark.com/fpl/players/lewis-dunk"');
  });

  it("a former player's scout page is noindex,follow", () => {
    const t = headTags(buildDocument(shell, head('thomas-meunier', null)));
    expect(t.robots).toBe('noindex,follow');
    expect(t.canonical).toBe('https://fixtureshark.com/fpl/player-scout/thomas-meunier');
  });

  it('stays self-canonical when the current-player list did not load (fail safe)', () => {
    const t = headTags(buildDocument(shell, head('lewis-dunk', undefined)));
    expect(t.canonical).toBe('https://fixtureshark.com/fpl/player-scout/lewis-dunk');
    expect(t.robots).toBeNull();
  });

  describe('in the browser', () => {
    beforeEach(() => {
      document.head.querySelectorAll('link[rel="canonical"], meta[name="robots"]').forEach((n) => n.remove());
    });
    const mount = () =>
      render(
        <MemoryRouter initialEntries={['/fpl/player-scout/lewis-dunk']}>
          <Routes><Route path="/fpl/player-scout/:slug" element={<PlayerRecordPage />} /></Routes>
        </MemoryRouter>
      );
    const identity = (current_slug: string | null) => ({ fpl_code: 1, slug: 'lewis-dunk', canonical_name: 'Lewis Dunk', current_slug, element_type: 2, seasons_played: 9, career_points: 900, career_minutes: 30000 });

    it('names the FPL player page as canonical for a current player', async () => {
      (scoutApi.getPlayerBySlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(identity('lewis-dunk'));
      mount();
      await waitFor(() => expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://fixtureshark.com/fpl/players/lewis-dunk'));
      expect(document.querySelector('meta[name="robots"]')).toBeNull();
    });

    it('adds noindex for a former player', async () => {
      (scoutApi.getPlayerBySlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(identity(null));
      mount();
      await waitFor(() => expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex'));
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://fixtureshark.com/fpl/player-scout/lewis-dunk');
    });
  });
});

describe('FPL player page carries the career table in server HTML', () => {
  const seasons = [
    { season_id: 11, slug: '2024-25', start_year: 2024 },
    { season_id: 12, slug: '2025-26', start_year: 2025 },
    { season_id: 13, slug: '2026-27', start_year: 2026 },
  ];
  const row = (season_id: number, total_points: number, start_cost: number) => ({
    season_id, fpl_code: 9, web_name: 'Dunk', team_name: 'Brighton', element_type: 2, start_cost, end_cost: start_cost,
    total_points, minutes: 3000, goals_scored: 2, assists: 1, clean_sheets: 10, bonus: 8,
  });

  it('careerFromTotals matches get_player_career: newest first, points per start £m', () => {
    const c = scoutApi.careerFromTotals([row(11, 120, 45), row(12, 150, 50), row(99, 1, 1)], seasons);
    expect(c.map((s) => s.season_slug)).toEqual(['2025-26', '2024-25']);
    expect(c[0].points_per_start_million).toBe(30);
    expect(c[1].points_per_start_million).toBe(26.67);
  });

  it('renders the seasons into the static page', () => {
    const html = renderPlayerPage('lewis-dunk', {
      profile: { fpl_player_id: 1, fpl_code: 9, slug: 'lewis-dunk', web_name: 'Dunk', full_name: 'Lewis Dunk', canonical_team_id: 1, team_name: 'Brighton', team_slug: 'brighton', position_label: 'Defender', price: 4.5 },
      season: [],
      __careerTotals: { rows: [row(11, 120, 45), row(12, 150, 50)], seasons },
    } as unknown as Parameters<typeof renderPlayerPage>[1]).html;
    expect(html).toContain('Every season so far');
    expect(html).toContain('2025/26');
    expect(html).toContain('2024/25');
  });
});
