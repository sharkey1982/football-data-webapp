// ============================================================================
// src/lib/myHomeApi.ts
//
// Data for "My FixtureShark" (the personal home page and its preferences).
// Clubs: public.get_my_club_options / get_my_club_cards (migration
// 20261025270000) -- one round trip for every club card. International, NFL
// and tennis reuse the sections' own loaders and views. Nothing here invents
// a field: what the site doesn't have (a tennis player's next match) is left
// out, not guessed.
// ============================================================================

import { supabase } from './supabase';
import { loadIntlTeamGames, loadIntlTeams } from './intlApi';
import { loadNflTeams, loadNflUpcoming, type NflGame } from './nflApi';
import { PLAYER_COLUMNS, MATCH_COLUMNS, tennisView } from './tennisApi';
import type { TennisMatch, TennisPlayer } from './tennisStats';
import type { MyTennis } from './myPrefs';

// ---- Clubs --------------------------------------------------------------------

export type ClubOption = { teamId: number; name: string; slug: string; leagueId: number; league: string };

export async function getMyClubOptions(): Promise<ClubOption[]> {
  const { data, error } = await supabase.rpc('get_my_club_options');
  if (error) throw error;
  return ((data ?? []) as { team_id: number; name: string; slug: string; league_id: number; league_name: string }[])
    .map((r) => ({ teamId: r.team_id, name: r.name, slug: r.slug, leagueId: r.league_id, league: r.league_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type Probs = { home: number; draw: number; away: number };
export type ClubCardGame = {
  fixtureId: number;
  slug: string | null;
  date: string;
  time?: string | null;
  league?: string;
  home: string;
  away: string;
  isHome: boolean;
  model: Probs | null;
  market: Probs | null;
  xg?: [number, number] | null;
  tv?: string | null;
  hg?: number;
  ag?: number;
};
export type ClubTableRow = { position: number; teamId: number; name: string; slug: string; played: number; gd: number; points: number };
export type ClubCard = {
  team: { teamId: number; name: string; slug: string };
  league: { leagueId: number; name: string; slug: string } | null;
  next: ClubCardGame | null;
  recent: ClubCardGame[];
  table: ClubTableRow[];
};

type RawGame = {
  fixture_id: number; slug: string | null; date: string; time?: string | null; league?: string; home: string; away: string; is_home: boolean;
  model: Probs | null; market: Probs | null; xg?: [number, number] | null; tv?: string | null; hg?: number; ag?: number;
};
type RawCard = {
  team: { team_id: number; display_name: string; slug: string };
  league: { league_id: number; name: string; slug: string } | null;
  next: RawGame | null;
  recent: RawGame[];
  table: { position: number; team_id: number; name: string; slug: string; played: number; gd: number; points: number }[];
};

const num = (v: unknown) => (v == null ? null : Number(v));
const probs = (p: Probs | null | undefined): Probs | null =>
  p ? { home: num(p.home) ?? 0, draw: num(p.draw) ?? 0, away: num(p.away) ?? 0 } : null;

function game(g: RawGame): ClubCardGame {
  return {
    fixtureId: g.fixture_id, slug: g.slug, date: g.date, time: g.time ?? null, league: g.league, home: g.home, away: g.away,
    isHome: g.is_home, model: probs(g.model), market: probs(g.market), xg: g.xg ?? null, tv: g.tv ?? null,
    hg: g.hg == null ? undefined : Number(g.hg), ag: g.ag == null ? undefined : Number(g.ag),
  };
}

export function parseClubCards(raw: unknown): ClubCard[] {
  return ((raw ?? []) as RawCard[]).map((c) => ({
    team: { teamId: c.team.team_id, name: c.team.display_name, slug: c.team.slug },
    league: c.league ? { leagueId: c.league.league_id, name: c.league.name, slug: c.league.slug } : null,
    next: c.next ? game(c.next) : null,
    recent: (c.recent ?? []).map(game),
    table: (c.table ?? []).map((r) => ({ position: r.position, teamId: r.team_id, name: r.name, slug: r.slug, played: r.played, gd: r.gd, points: r.points })),
  }));
}

export async function getMyClubCards(teamIds: number[]): Promise<ClubCard[]> {
  if (teamIds.length === 0) return [];
  const { data, error } = await supabase.rpc('get_my_club_cards', { p_team_ids: teamIds.slice(0, 4) });
  if (error) throw error;
  return parseClubCards(data);
}

/** W, D or L for the club in a played game. */
export function resultFor(g: ClubCardGame): 'W' | 'D' | 'L' | null {
  if (g.hg == null || g.ag == null) return null;
  const us = g.isHome ? g.hg : g.ag;
  const them = g.isHome ? g.ag : g.hg;
  return us > them ? 'W' : us < them ? 'L' : 'D';
}

/** The chance a forecast gave the outcome that happened. */
export function chanceOfResult(p: Probs | null, g: ClubCardGame): number | null {
  if (!p || g.hg == null || g.ag == null) return null;
  return g.hg > g.ag ? p.home : g.hg < g.ag ? p.away : p.draw;
}

// ---- International ----------------------------------------------------------------

export async function getIntlTeamOptions(): Promise<{ slug: string; name: string }[]> {
  return (await loadIntlTeams()).map((t) => ({ slug: t.slug, name: t.team }));
}

export type IntlNext = { kickoff: string; home: string; away: string; homeSlug: string; awaySlug: string; pHome: number | null; pDraw: number | null; pAway: number | null };
export type IntlCardData = { name: string; slug: string; next: IntlNext | null; last: { date: string; home: string; away: string; hs: number; as: number } | null };

export async function getIntlCard(slug: string, now = new Date()): Promise<IntlCardData | null> {
  const d = await loadIntlTeamGames(slug);
  if (!d) return null;
  const f = d.fixtures.find((x) => x.home_score == null && new Date(x.kickoff_utc).getTime() > now.getTime() - 3 * 3600 * 1000);
  const m = d.matches[0];
  return {
    name: d.team.team,
    slug,
    next: f ? { kickoff: f.kickoff_utc, home: f.home_team, away: f.away_team, homeSlug: f.home_slug, awaySlug: f.away_slug, pHome: f.p_home ?? null, pDraw: f.p_draw ?? null, pAway: f.p_away ?? null } : null,
    last: m ? { date: m.match_date, home: m.home_team, away: m.away_team, hs: m.home_score, as: m.away_score } : null,
  };
}

// ---- NFL --------------------------------------------------------------------------

export async function getNflTeamOptions(): Promise<{ slug: string; name: string }[]> {
  return (await loadNflTeams()).map((t) => ({ slug: t.slug, name: t.name })).sort((a, b) => a.name.localeCompare(b.name));
}

export type NflCardData = { game: NflGame; pTeam: number | null; isHome: boolean } | null;

export async function getNflCard(slug: string): Promise<NflCardData> {
  const up = await loadNflUpcoming();
  if (!up) return null;
  const g = up.games.find((x) => x.home_slug === slug || x.away_slug === slug);
  if (!g) return null;
  const isHome = g.home_slug === slug;
  const m = up.model[g.game_id];
  return { game: g, isHome, pTeam: m ? (isHome ? m.p_home : 1 - m.p_home) : null };
}

// ---- Tennis --------------------------------------------------------------------------

type ExtraQuery = { ilike(column: string, pattern: string): ExtraQuery; not(column: string, op: string, value: unknown): ExtraQuery } & ReturnType<typeof tennisView>;

/** Players by name, ranked first (for the preferences picker). */
export async function searchTennisPlayers(q: string): Promise<TennisPlayer[]> {
  const term = q.trim().replace(/[%_,()]/g, ' ');
  if (term.length < 2) return [];
  const query = tennisView('tennis_players', PLAYER_COLUMNS) as unknown as ExtraQuery;
  const { data, error } = await query.ilike('name', `%${term}%`).order('last_year', { ascending: false }).limit(12);
  if (error) throw error;
  return (data ?? []) as TennisPlayer[];
}

/** Countries with a currently ranked player (top 300), for the picker. */
export async function getTennisCountries(): Promise<string[]> {
  const { data, error } = await tennisView('tennis_players', 'country,latest_rank').lte('latest_rank', 300).limit(2000);
  if (error) throw error;
  return [...new Set(((data ?? []) as { country: string | null }[]).map((r) => r.country).filter((c): c is string => !!c && /^[A-Z]{2}$/.test(c)))].sort();
}

export type TennisCardRow = { player: TennisPlayer; last: TennisMatch | null };

export async function getTennisCard(pref: MyTennis): Promise<TennisCardRow[]> {
  let players: TennisPlayer[];
  if (pref.mode === 'country') {
    const { data, error } = await tennisView('tennis_players', PLAYER_COLUMNS).eq('country', pref.country).lte('latest_rank', 500).order('latest_rank').limit(5);
    if (error) throw error;
    players = (data ?? []) as TennisPlayer[];
  } else {
    const found = await Promise.all(
      pref.players.map(async (p) => {
        const { data, error } = await tennisView('tennis_players', PLAYER_COLUMNS).eq('tour', p.tour).eq('slug', p.slug).limit(1);
        if (error) throw error;
        return ((data ?? []) as TennisPlayer[])[0] ?? null;
      }),
    );
    players = found.filter((p): p is TennisPlayer => !!p);
  }
  return Promise.all(
    players.map(async (player) => {
      const { data, error } = await tennisView('tennis_matches', MATCH_COLUMNS)
        .eq('tour', player.tour)
        .or(`winner_slug.eq.${player.slug},loser_slug.eq.${player.slug}`)
        .order('match_date', { ascending: false })
        .limit(1);
      if (error) throw error;
      return { player, last: ((data ?? []) as TennisMatch[])[0] ?? null };
    }),
  );
}

/** "United Kingdom" for GB, falling back to the code. */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en-GB'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
