// ============================================================================
// src/lib/staticSummaries.ts
//
// Server HTML for pages whose body is otherwise loaded in the browser (audit
// 1 Nov 2026: AI crawlers -- GPTBot, ClaudeBot, PerplexityBot -- don't run
// JavaScript, and these sitemap pages served them an empty app shell).
//
// Two kinds of output, both pure functions of the static build's bulk reads
// (scripts/generate-static.mjs), so they are tested with fixture rows:
//   - *Sheet(): a whole StaticFactSheet for a page whose real body is an
//     interactive tool (Team Strength, Match Projections, Starting Lineups,
//     Head to Heads, Player Scout, FPL Live).
//   - *Lead(): the dated opening sentence for a page rendered with its real
//     component and injected data (Physio Room, TV Guide, Team of the Week,
//     the International lists).
// Every number in them comes from the rows passed in; nothing is estimated.
// ============================================================================

import type { FactCell, FactSheet } from '../components/StaticFactSheet';
import { longDate } from './financeFormat';
import { formatMatchDate, formatMatchDateWithYear } from './formatDate';
import { hasKickedOff } from './fixtureStatus';
import { fixtureWatchState } from './watchGuide';
import type { WatchGuideFixture } from './broadcastsApi';
import type { InjuryRow } from './injuryApi';
import type { GameweekScorer, TotwPlayer } from './teamOfWeekApi';
import { editionLabel, shortDate, type EditionSummary, type IntlFixture, type IntlMatch, type TeamSummary, type Tournament } from './intlStats';

// ---- Shared ---------------------------------------------------------------

export type SummaryTeam = { team_id: number; display_name: string; slug: string | null };
export type SummaryFixture = {
  fixture_id: number;
  slug: string | null;
  kickoff_date: string;
  status: string | null;
  matchweek: number | null;
  home_team_id: number;
  away_team_id: number;
  predicted_home_goals: number | string | null;
  predicted_away_goals: number | string | null;
};
export type SummaryPlayer = {
  fpl_player_id: number;
  slug: string | null;
  web_name: string;
  first_name?: string | null;
  second_name?: string | null;
  element_type: number | null;
  now_cost: number | null;
  canonical_team_id: number | null;
};
export type SummaryProjection = {
  fixture_id: number;
  fpl_player_id: number;
  expected_fpl_points: number | string | null;
  expected_minutes: number | string | null;
  start_probability?: number | string | null;
};

const POS_SHORT: Record<number, string> = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
const n = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const plural = (k: number, one: string, many = `${one}s`) => `${k.toLocaleString('en-GB')} ${k === 1 ? one : many}`;
const asOf = (today: string) => `As of ${longDate(today)}`;
const matchPath = (slug: string) => `/football/matches/${slug}`;
const teamPath = (slug: string) => `/football/teams/${slug}`;
const playerPath = (slug: string) => `/fpl/players/${slug}`;

function teamName(teams: Map<number, SummaryTeam>, id: number): string {
  return teams.get(id)?.display_name ?? 'Unknown';
}

function fixtureName(teams: Map<number, SummaryTeam>, f: SummaryFixture): string {
  return `${teamName(teams, f.home_team_id)} v ${teamName(teams, f.away_team_id)}`;
}

function xgText(f: SummaryFixture): string | null {
  const h = n(f.predicted_home_goals);
  const a = n(f.predicted_away_goals);
  return h == null || a == null ? null : `${h.toFixed(1)}–${a.toFixed(1)}`;
}

function fixtureCell(teams: Map<number, SummaryTeam>, f: SummaryFixture): FactCell {
  return { text: fixtureName(teams, f), to: f.slug ? matchPath(f.slug) : undefined };
}

function gameweekFixtures(fixtures: SummaryFixture[], gw: number): SummaryFixture[] {
  return fixtures
    .filter((f) => f.matchweek === gw)
    .sort((a, b) => a.kickoff_date.localeCompare(b.kickoff_date) || (a.slug ?? '').localeCompare(b.slug ?? ''));
}

function dateSpan(dates: string[]): string {
  const sorted = [...dates].sort();
  if (sorted.length === 0) return '';
  const first = formatMatchDate(sorted[0]);
  const last = formatMatchDate(sorted[sorted.length - 1]);
  return first === last ? `on ${first}` : `from ${first} to ${last}`;
}

/** An ItemList of pages, for the JSON-LD (only pages the body links to). */
export function itemList(items: { name: string; path: string }[], siteUrl: string): object | null {
  if (items.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, url: `${siteUrl}${it.path}` })),
  };
}

export type SheetResult = { sheet: FactSheet; items: { name: string; path: string }[] };

// ---- Team Strength (/team-strength) -----------------------------------------

export type TeamStrengthInput = {
  today: string;
  leagueName: string;
  fittedAt: string | null;
  teams: Map<number, SummaryTeam>;
  /** This season's clubs (from the fixture list): rated teams outside it are left out, as on the page. */
  inLeague: Set<number>;
  ratings: { team_id: number; attack_strength: number | string; defence_strength: number | string; is_estimated?: boolean | null }[];
  overrides: { team_id: number; attack_adjustment: number | string | null; defence_adjustment: number | string | null }[];
  standings: { team_id: number | null; position: number | string; points: number | string; played: number | string }[];
  positions: { team_id: number; method: string; projected_position_mean: number | string; projected_points_mean: number | string }[];
};

export function teamStrengthSheet(input: TeamStrengthInput): SheetResult | null {
  const ov = new Map(input.overrides.map((o) => [o.team_id, o]));
  const standing = new Map(input.standings.filter((s) => s.team_id != null && Number(s.played) > 0).map((s) => [s.team_id as number, s]));
  const byMethod = (m: string) => new Map(input.positions.filter((p) => p.method === m).map((p) => [p.team_id, p]));
  const market = byMethod('market');
  const model = byMethod('dixon_coles');
  const rated = input.ratings.filter((r) => input.inLeague.size === 0 || input.inLeague.has(r.team_id));
  if (rated.length === 0) return null;
  // As the page: market-rated projection only when every club has one.
  const proj = rated.every((r) => market.has(r.team_id)) ? market : model;
  const rows = rated.map((r) => {
    const o = ov.get(r.team_id);
    const gf = Math.exp(Number(r.attack_strength) + Number(o?.attack_adjustment ?? 0));
    const ga = Math.exp(-(Number(r.defence_strength) + Number(o?.defence_adjustment ?? 0)));
    const s = standing.get(r.team_id);
    const p = proj.get(r.team_id);
    return {
      id: r.team_id,
      name: teamName(input.teams, r.team_id),
      slug: input.teams.get(r.team_id)?.slug ?? null,
      gf,
      ga,
      position: s ? Number(s.position) : null,
      points: s ? Number(s.points) : null,
      played: s ? Number(s.played) : null,
      projPos: p ? Number(p.projected_position_mean) : null,
      projPts: p ? Number(p.projected_points_mean) : null,
    };
  });
  rows.sort((a, b) =>
    a.projPos != null && b.projPos != null ? a.projPos - b.projPos
      : a.position != null && b.position != null ? a.position - b.position
        : (b.gf - b.ga) - (a.gf - a.ga));
  const bestAttack = [...rows].sort((a, b) => b.gf - a.gf)[0];
  const bestDefence = [...rows].sort((a, b) => a.ga - b.ga)[0];
  const top = rows[0].projPos != null ? rows[0] : null;
  const fitted = input.fittedAt ? ` (fitted ${longDate(input.fittedAt)})` : '';
  const lead =
    `${asOf(input.today)}, the model’s ratings${fitted} give ${bestAttack.name} the strongest attack in the ${input.leagueName}, ` +
    `${bestAttack.gf.toFixed(2)} expected goals a game against an average side, and ${bestDefence.name} the tightest defence, ${bestDefence.ga.toFixed(2)} conceded.` +
    (top ? ` The season simulation has ${top.name} finishing highest, on ${Math.round(top.projPts ?? 0)} points on average (average position ${top.projPos!.toFixed(1)}).` : '');
  const hasProj = rows.some((r) => r.projPos != null);
  const columns = ['Club', 'Position now', 'Points', 'Scores a game', 'Concedes a game', ...(hasProj ? ['Projected finish', 'Projected points'] : [])];
  const align: ('left' | 'right')[] = ['left', 'right', 'right', 'right', 'right', 'right', 'right'];
  return {
    sheet: {
      title: 'Team Strength',
      lead,
      intro: `Each club’s attack and defence rating as the goals it would score and concede in a game against an average ${input.leagueName} side, with the table now and the projected finish. Other leagues are on the page itself.`,
      sections: [
        {
          heading: `${input.leagueName} ratings`,
          table: {
            caption: `${input.leagueName} team strength`,
            columns,
            align,
            rows: rows.map((r) => [
              r.slug ? { text: r.name, to: teamPath(r.slug) } : r.name,
              r.position ?? '–',
              r.points ?? '–',
              r.gf.toFixed(2),
              r.ga.toFixed(2),
              ...(hasProj ? [r.projPos != null ? r.projPos.toFixed(1) : '–', r.projPts != null ? Math.round(r.projPts) : '–'] : []),
            ]),
          },
        },
      ],
      related: [{ to: '/table', label: 'League table' }, { to: '/fixtures', label: 'Fixtures' }, { to: '/football/model-accuracy', label: 'Model accuracy' }],
    },
    items: rows.filter((r) => r.slug).map((r) => ({ name: r.name, path: teamPath(r.slug!) })),
  };
}

// ---- FPL gameweek pages: Match Projections, Starting Lineups, FPL Live ---------

export type GameweekInput = {
  today: string;
  gw: number;
  fixtures: SummaryFixture[];
  teams: Map<number, SummaryTeam>;
  players: SummaryPlayer[];
  projections: SummaryProjection[];
};

type PlayerWeek = { p: SummaryPlayer; points: number; minutes: number; start: number | null; fixtures: number };

function playerWeeks(input: GameweekInput, gwFixtures: SummaryFixture[]): PlayerWeek[] {
  const ids = new Set(gwFixtures.map((f) => f.fixture_id));
  const byId = new Map(input.players.map((p) => [p.fpl_player_id, p]));
  const out = new Map<number, PlayerWeek>();
  for (const pr of input.projections) {
    if (!ids.has(pr.fixture_id)) continue;
    const p = byId.get(pr.fpl_player_id);
    const pts = n(pr.expected_fpl_points);
    if (!p || pts == null) continue;
    const cur = out.get(p.fpl_player_id) ?? { p, points: 0, minutes: 0, start: null, fixtures: 0 };
    cur.points += pts;
    cur.minutes += n(pr.expected_minutes) ?? 0;
    const s = n(pr.start_probability);
    // A double gameweek keeps the likelier start, as the line-ups page does.
    if (s != null) cur.start = Math.max(cur.start ?? 0, s);
    cur.fixtures++;
    out.set(p.fpl_player_id, cur);
  }
  return [...out.values()];
}

const fullName = (p: SummaryPlayer) => [p.first_name, p.second_name].filter(Boolean).join(' ').trim() || p.web_name;
const playerCell = (p: SummaryPlayer): FactCell => (p.slug ? { text: p.web_name, to: playerPath(p.slug) } : p.web_name);

export function matchProjectionsSheet(input: GameweekInput): SheetResult | null {
  const gwf = gameweekFixtures(input.fixtures, input.gw);
  if (gwf.length === 0) return null;
  const weeks = playerWeeks(input, gwf).sort((a, b) => b.points - a.points || a.p.web_name.localeCompare(b.p.web_name));
  const ids = new Set(gwf.map((f) => f.fixture_id));
  const byFixture = new Map<number, { name: string; pts: number }[]>();
  const byId = new Map(input.players.map((p) => [p.fpl_player_id, p]));
  for (const pr of input.projections) {
    const p = byId.get(pr.fpl_player_id);
    const pts = n(pr.expected_fpl_points);
    if (!ids.has(pr.fixture_id) || !p || pts == null) continue;
    byFixture.set(pr.fixture_id, [...(byFixture.get(pr.fixture_id) ?? []), { name: p.web_name, pts }]);
  }
  const best = weeks[0];
  const bestFixture = best ? gwf.find((f) => f.home_team_id === best.p.canonical_team_id || f.away_team_id === best.p.canonical_team_id) : undefined;
  const lead =
    `${asOf(input.today)}, gameweek ${input.gw} has ${plural(gwf.length, 'Premier League fixture')}, ${dateSpan(gwf.map((f) => f.kickoff_date))}` +
    (best
      ? `; ${fullName(best.p)} (${teamName(input.teams, best.p.canonical_team_id ?? -1)}) has the highest projected Fantasy Premier League score, ${best.points.toFixed(1)} points${bestFixture && best.fixtures === 1 ? ` in ${fixtureName(input.teams, bestFixture)}` : ''}.`
      : '.');
  return {
    sheet: {
      title: 'Match Projections',
      lead,
      intro: 'Player-level Fantasy Premier League projections built from each team’s expected goals, predicted formations and tactical roles. Open a fixture for the full breakdown.',
      sections: [
        {
          heading: `Gameweek ${input.gw} fixtures`,
          table: {
            caption: `Gameweek ${input.gw} fixtures`,
            columns: ['Fixture', 'Date', 'Model expected goals', 'Top projected players'],
            rows: gwf.map((f) => [
              fixtureCell(input.teams, f),
              formatMatchDate(f.kickoff_date),
              xgText(f) ?? '–',
              (byFixture.get(f.fixture_id) ?? []).sort((a, b) => b.pts - a.pts).slice(0, 3).map((x) => `${x.name} ${x.pts.toFixed(1)}`).join(', ') || '–',
            ]),
          },
        },
        ...(weeks.length
          ? [{
              heading: `Top projected players, gameweek ${input.gw}`,
              table: {
                caption: `Top projected players, gameweek ${input.gw}`,
                columns: ['Player', 'Club', 'Position', 'Price', 'Projected points', 'Expected minutes'],
                align: ['left', 'left', 'left', 'right', 'right', 'right'] as ('left' | 'right')[],
                rows: weeks.slice(0, 25).map((w) => [
                  playerCell(w.p),
                  teamName(input.teams, w.p.canonical_team_id ?? -1),
                  POS_SHORT[w.p.element_type ?? 0] ?? '–',
                  w.p.now_cost != null ? `£${(w.p.now_cost / 10).toFixed(1)}m` : '–',
                  w.points.toFixed(1),
                  Math.round(w.minutes),
                ]),
              },
            }]
          : []),
      ],
      related: [{ to: '/fpl/player-points', label: 'Every player’s projections' }, { to: '/fpl/line-ups', label: 'Starting lineups' }, { to: '/fpl/injuries', label: 'Physio Room' }],
    },
    items: gwf.filter((f) => f.slug).map((f) => ({ name: fixtureName(input.teams, f), path: matchPath(f.slug!) })),
  };
}

export function lineupsSheet(input: GameweekInput): SheetResult | null {
  const gwf = gameweekFixtures(input.fixtures, input.gw);
  if (gwf.length === 0) return null;
  const weeks = playerWeeks(input, gwf).filter((w) => w.start != null);
  if (weeks.length === 0) return null;
  const clubs = new Map<number, SummaryFixture>();
  for (const f of gwf) for (const id of [f.home_team_id, f.away_team_id]) if (!clubs.has(id)) clubs.set(id, f);
  const sections = [...clubs.entries()]
    .sort(([a], [b]) => teamName(input.teams, a).localeCompare(teamName(input.teams, b)))
    .map(([id, f]) => {
      const squad = weeks.filter((w) => w.p.canonical_team_id === id).sort((a, b) => (b.start ?? 0) - (a.start ?? 0) || b.points - a.points);
      const keeper = squad.find((w) => w.p.element_type === 1);
      const outfield = squad.filter((w) => w.p.element_type !== 1).slice(0, 10);
      const xi = [...(keeper ? [keeper] : []), ...outfield].sort((a, b) => (a.p.element_type ?? 9) - (b.p.element_type ?? 9) || (b.start ?? 0) - (a.start ?? 0));
      const home = f.home_team_id === id;
      const opp = teamName(input.teams, home ? f.away_team_id : f.home_team_id);
      return { id, xi, heading: `${teamName(input.teams, id)} ${home ? 'v' : 'at'} ${opp}, ${formatMatchDate(f.kickoff_date)}` };
    })
    .filter((s) => s.xi.length > 0);
  const all = sections.flatMap((s) => s.xi);
  const sure = all.filter((w) => (w.start ?? 0) >= 0.9).length;
  const lead =
    `${asOf(input.today)}, these are the eleven players the model rates likeliest to start for each of the ${plural(sections.length, 'Premier League club')} in gameweek ${input.gw}, ` +
    `${dateSpan(gwf.map((x) => x.kickoff_date))}; ${sure.toLocaleString('en-GB')} of the ${all.length.toLocaleString('en-GB')} have a start chance of 90% or more.`;
  return {
    sheet: {
      title: 'Starting Lineups',
      lead,
      intro: 'One goalkeeper and the ten outfield players with the highest start probability in the model’s projections, which allow for injuries, suspensions and rotation. The page itself shows each club’s formation, tactical roles and depth.',
      sections: sections.map((s) => ({
        heading: s.heading,
        table: {
          caption: s.heading,
          columns: ['Player', 'Position', 'Start chance'],
          align: ['left', 'left', 'right'] as ('left' | 'right')[],
          rows: s.xi.map((w) => [playerCell(w.p), POS_SHORT[w.p.element_type ?? 0] ?? '–', `${Math.round((w.start ?? 0) * 100)}%`]),
        },
      })),
      related: [{ to: '/fpl/minutes', label: 'Minutes outlook' }, { to: '/fpl/injuries', label: 'Physio Room' }, { to: '/fpl', label: 'Match projections' }],
    },
    items: [],
  };
}

export function fplLiveSheet(input: Omit<GameweekInput, 'players' | 'projections'>): SheetResult | null {
  const gwf = gameweekFixtures(input.fixtures, input.gw);
  if (gwf.length === 0) return null;
  const kicked = gwf.filter((f) => hasKickedOff(f.status)).length;
  const span = dateSpan(gwf.map((f) => f.kickoff_date));
  const lead =
    kicked === 0
      ? `${asOf(input.today)}, gameweek ${input.gw} has not started: its ${plural(gwf.length, 'Premier League match', 'Premier League matches')} are ${span}.`
      : kicked < gwf.length
        ? `${asOf(input.today)}, gameweek ${input.gw} is under way: ${kicked} of its ${plural(gwf.length, 'Premier League match', 'Premier League matches')} (${span}) have kicked off.`
        : `${asOf(input.today)}, all ${plural(gwf.length, 'Premier League match', 'Premier League matches')} of gameweek ${input.gw} (${span}) have kicked off.`;
  return {
    sheet: {
      title: 'FPL Live',
      lead,
      intro: 'Enter your Fantasy Premier League team ID for your live gameweek score: bonus points as they stand, automatic substitutions, captaincy, chips and hits, and the projected points still to come from players yet to play. Your team is only fetched in your browser, so this page has no score to show until you enter an ID.',
      sections: [
        {
          heading: `Gameweek ${input.gw} matches`,
          links: gwf.filter((f) => f.slug).map((f) => ({ to: matchPath(f.slug!), label: fixtureName(input.teams, f), note: `${formatMatchDate(f.kickoff_date)}${hasKickedOff(f.status) ? ' · kicked off' : ''}` })),
        },
      ],
      related: [{ to: '/fpl', label: 'Match projections' }, { to: '/fpl/team-of-the-week', label: 'Team of the week' }, { to: '/fpl/rate-my-team', label: 'Rate my team' }],
    },
    items: [],
  };
}

// ---- Head to Heads (/preview) ---------------------------------------------------

export function previewSheet(input: { today: string; fixtures: SummaryFixture[]; teams: Map<number, SummaryTeam> }): SheetResult | null {
  const upcoming = input.fixtures
    .filter((f) => f.kickoff_date >= input.today && !hasKickedOff(f.status) && f.status !== 'postponed')
    .sort((a, b) => a.kickoff_date.localeCompare(b.kickoff_date) || (a.slug ?? '').localeCompare(b.slug ?? ''));
  const clubIds = new Set(input.fixtures.flatMap((f) => [f.home_team_id, f.away_team_id]));
  const clubs = [...clubIds].map((id) => input.teams.get(id)).filter((t): t is SummaryTeam => !!t?.slug).sort((a, b) => a.display_name.localeCompare(b.display_name));
  if (clubs.length === 0) return null;
  const nextGw = upcoming.find((f) => f.matchweek != null)?.matchweek ?? null;
  const next = nextGw != null ? upcoming.filter((f) => f.matchweek === nextGw) : upcoming.slice(0, 10);
  const first = next[0];
  const lead = first
    ? `${asOf(input.today)}, the next Premier League fixtures are ${nextGw != null ? `gameweek ${nextGw}’s ` : ''}${plural(next.length, 'match', 'matches')}, starting with ${fixtureName(input.teams, first)} on ${formatMatchDate(first.kickoff_date)}; Head to Heads compares any two of the ${clubs.length} clubs with the model’s prediction and their record against each other.`
    : `${asOf(input.today)}, no Premier League fixtures are left this season; Head to Heads compares any two of the ${clubs.length} clubs with the model’s prediction and their record against each other.`;
  return {
    sheet: {
      title: 'Head to Heads',
      lead,
      intro: 'Pick two teams on the page for a Dixon-Coles prediction, their recent form and every previous meeting. Each fixture below has its own match page with the same prediction.',
      sections: [
        ...(next.length
          ? [{
              heading: nextGw != null ? `Gameweek ${nextGw}` : 'Next fixtures',
              links: next.filter((f) => f.slug).map((f) => ({ to: matchPath(f.slug!), label: fixtureName(input.teams, f), note: `${formatMatchDate(f.kickoff_date)}${xgText(f) ? ` · model ${xgText(f)} expected goals` : ''}` })),
            }]
          : []),
        { heading: 'Premier League clubs', links: clubs.map((t) => ({ to: teamPath(t.slug!), label: t.display_name })) },
      ],
      related: [{ to: '/fixtures', label: 'All fixtures' }, { to: '/team-strength', label: 'Team strength' }],
    },
    items: next.filter((f) => f.slug).map((f) => ({ name: fixtureName(input.teams, f), path: matchPath(f.slug!) })),
  };
}

// ---- Player Scout (/fpl/player-scout) ---------------------------------------------

export type ScoutInput = {
  today: string;
  identities: { slug: string | null; canonical_name: string; fpl_code: number | string | null }[];
  totals: { season_id: number; fpl_code: number | string; total_points: number | string | null; goals_scored?: number | string | null; assists?: number | string | null; minutes?: number | string | null }[];
  seasons: { season_id: number; start_year: number }[];
  currentSeasonId: number | null;
};

const seasonText = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, '0')}`;

export function playerScoutSheet(input: ScoutInput): SheetResult | null {
  const who = new Map(input.identities.filter((i) => i.slug && i.fpl_code != null).map((i) => [Number(i.fpl_code), i]));
  const startOf = new Map(input.seasons.map((s) => [s.season_id, s.start_year]));
  const agg = new Map<number, { points: number; goals: number; assists: number; seasons: Set<number> }>();
  for (const r of input.totals) {
    const code = Number(r.fpl_code);
    if (!who.has(code)) continue;
    const a = agg.get(code) ?? { points: 0, goals: 0, assists: 0, seasons: new Set<number>() };
    a.points += n(r.total_points) ?? 0;
    a.goals += n(r.goals_scored) ?? 0;
    a.assists += n(r.assists) ?? 0;
    a.seasons.add(r.season_id);
    agg.set(code, a);
  }
  if (agg.size === 0) return null;
  const years = [...new Set(input.totals.map((r) => startOf.get(r.season_id)).filter((y): y is number => y != null))].sort((a, b) => a - b);
  const leaders = [...agg.entries()].sort((a, b) => b[1].points - a[1].points || who.get(a[0])!.canonical_name.localeCompare(who.get(b[0])!.canonical_name));
  const top = leaders[0];
  const topName = who.get(top[0])!.canonical_name;
  const scoutCell = (code: number): FactCell => ({ text: who.get(code)!.canonical_name, to: `/fpl/player-scout/${who.get(code)!.slug}` });
  const current = input.currentSeasonId == null ? [] : input.totals
    .filter((r) => r.season_id === input.currentSeasonId && who.has(Number(r.fpl_code)))
    .sort((a, b) => (n(b.total_points) ?? 0) - (n(a.total_points) ?? 0))
    .slice(0, 15);
  const span = years.length ? ` over ${plural(years.length, 'season')} (${seasonText(years[0])} to ${seasonText(years[years.length - 1])})` : '';
  const lead = `${asOf(input.today)}, Player Scout holds the season-by-season Fantasy Premier League record of ${plural(agg.size, 'player')}${span}; ${topName} has scored the most points in that time, ${top[1].points.toLocaleString('en-GB')}.`;
  const currentYear = input.currentSeasonId != null ? startOf.get(input.currentSeasonId) : undefined;
  return {
    sheet: {
      title: 'Player Scout',
      lead,
      intro: 'Search any player on the page for their points, price, goals, assists and form season by season. The players below link to their own records.',
      sections: [
        {
          heading: 'Most points, all seasons on file',
          table: {
            caption: 'Most FPL points across the seasons on file',
            columns: ['Player', 'Seasons', 'Points', 'Goals', 'Assists'],
            align: ['left', 'right', 'right', 'right', 'right'],
            rows: leaders.slice(0, 25).map(([code, a]) => [scoutCell(code), a.seasons.size, a.points, a.goals, a.assists]),
          },
        },
        ...(current.length
          ? [{
              heading: `Most points, ${currentYear != null ? seasonText(currentYear) : 'this season'}`,
              table: {
                caption: 'Most FPL points this season',
                columns: ['Player', 'Points', 'Goals', 'Assists'],
                align: ['left', 'right', 'right', 'right'] as ('left' | 'right')[],
                rows: current.map((r) => [scoutCell(Number(r.fpl_code)), n(r.total_points) ?? 0, n(r.goals_scored) ?? 0, n(r.assists) ?? 0]),
              },
            }]
          : []),
      ],
      related: [{ to: '/fpl/player-points', label: 'Every current player' }, { to: '/fpl/season-xi', label: 'Season XI' }],
    },
    items: leaders.slice(0, 25).map(([code]) => ({ name: who.get(code)!.canonical_name, path: `/fpl/player-scout/${who.get(code)!.slug}` })),
  };
}

// ---- Leads for pages rendered with their real component ---------------------------

/** Physio Room: the rows the page lists (those with news), by status. */
export function injuriesLead(rows: InjuryRow[], today: string): string {
  const listed = rows.filter((r) => r.news);
  if (listed.length === 0) return `${asOf(today)}, no Premier League player is listed as injured, doubtful or suspended in Fantasy Premier League.`;
  const out = listed.filter((r) => r.status === 'i' || r.status === 's').length;
  const doubt = listed.filter((r) => r.status === 'd').length;
  const other = listed.length - out - doubt;
  const owned = [...listed].filter((r) => r.ownership != null).sort((a, b) => (b.ownership ?? 0) - (a.ownership ?? 0))[0];
  const parts = [`${out} out`, `${doubt} doubtful`, ...(other ? [`${other} otherwise unavailable`] : [])];
  const label = (s: string) => ({ i: 'injured', d: 'doubtful', s: 'suspended', u: 'unavailable', n: 'not in the squad' } as Record<string, string>)[s] ?? s;
  return (
    `${asOf(today)}, ${plural(listed.length, 'Premier League player')} ${listed.length === 1 ? 'is' : 'are'} injured, doubtful or suspended in Fantasy Premier League: ${parts.join(', ')}.` +
    (owned ? ` The most owned is ${owned.web_name} (${owned.team_name ?? 'no club'}, ${owned.ownership!.toFixed(1)}% owned), ${label(owned.status)}.` : '')
  );
}

/** TV Guide: the fixtures the static page lists (the next seven days). */
export function tvGuideLead(fixtures: WatchGuideFixture[], today: string, until: string): string {
  const watch = fixtures.filter((f) => fixtureWatchState(f.offers).kind === 'watch');
  const free = watch.filter((f) => {
    const s = fixtureWatchState(f.offers);
    return s.kind === 'watch' && s.groups.some((g) => g.tier === 'free' || g.tier === 'free_compatible_device');
  }).length;
  const comps = new Set(watch.map((f) => f.leagueName)).size;
  if (watch.length === 0) return `${asOf(today)}, no football match up to ${longDate(until)} has a confirmed live UK broadcast yet.`;
  return `${asOf(today)}, ${plural(watch.length, 'football match', 'football matches')} from ${plural(comps, 'competition')} up to ${longDate(until)} ${watch.length === 1 ? 'is' : 'are'} confirmed for live UK TV or streaming, ${free} of them free to watch.`;
}

/** Team of the Week: the gameweek's dates come from its fixtures. */
export function totwLead(gw: number, xi: TotwPlayer[], scorers: GameweekScorer[], dates: string[]): string {
  const total = xi.reduce((s, p) => s + p.points, 0);
  const top = scorers[0] ?? [...xi].sort((a, b) => b.points - a.points)[0];
  const d = [...dates].sort();
  const span = d.length === 0 ? '' : d[0] === d[d.length - 1] ? ` (${formatMatchDateWithYear(d[0])})` : ` (${formatMatchDate(d[0])} to ${formatMatchDateWithYear(d[d.length - 1])})`;
  return `In gameweek ${gw}${span}, the best legal Fantasy Premier League XI scored ${total} points` + (top ? `, and the top scorer was ${top.web_name} with ${top.points}.` : '.');
}

const sideOf = (women: boolean) => (women ? 'women’s' : 'men’s');

/** International "Your Team": the ranked nations, by Elo. */
export function intlTeamsLead(teams: TeamSummary[], today: string, women: boolean): string {
  const ranked = teams.filter((t) => t.elo_rank != null).sort((a, b) => (a.elo_rank ?? 0) - (b.elo_rank ?? 0));
  if (ranked.length === 0) return `${asOf(today)}, FixtureShark rates ${plural(teams.length, 'national team')} from every ${sideOf(women)} international result on file.`;
  const [a, b, c] = ranked;
  const others = [b, c].filter(Boolean).map((t) => `${t.team} (${Math.round(t.elo).toLocaleString('en-GB')})`);
  return `${asOf(today)}, ${a.team} top FixtureShark’s ${sideOf(women)} international Elo ratings on ${Math.round(a.elo).toLocaleString('en-GB')}${others.length ? `, ahead of ${others.join(' and ')}` : ''}; ${plural(ranked.length, 'current nation')} ${ranked.length === 1 ? 'is' : 'are'} ranked, from ${plural(teams.length, 'team')} on file.`;
}

function winnersOf(rows: EditionSummary[]): { team: string; n: number }[] {
  const m = new Map<string, number>();
  for (const e of rows) if (e.winner) m.set(e.winner, (m.get(e.winner) ?? 0) + 1);
  return [...m.entries()].map(([team, k]) => ({ team, n: k })).sort((a, b) => b.n - a.n || a.team.localeCompare(b.team));
}

/** Tournaments: the overview (only = null) or one tournament's page. */
export function intlTournamentsLead(editions: EditionSummary[], tournaments: Tournament[], today: string, women: boolean, only: Tournament | null): string {
  if (only) {
    const rows = editions.filter((e) => e.competition === only.competition).sort((a, b) => a.season_start - b.season_start);
    const done = rows.filter((e) => e.winner);
    if (done.length === 0) return `${asOf(today)}, no ${sideOf(women)} ${only.competition} has been decided in the results on file.`;
    const w = winnersOf(done);
    const latest = done[done.length - 1];
    const next = rows.find((e) => !e.winner && e.season_start >= Number(today.slice(0, 4)));
    const most = w.filter((x) => x.n === w[0].n);
    return (
      `${asOf(today)}, there have been ${plural(done.length, `${sideOf(women)} ${only.competition}`, `${sideOf(women)} ${only.competition}s`)} since ${done[0].season_start}, won by ${plural(w.length, 'nation')}; ` +
      `${most.map((x) => x.team).join(' and ')} ${most.length === 1 ? 'has' : 'have'} the most titles (${w[0].n}), and ${latest.winner} won the latest, ${editionLabel(latest.label)}.` +
      (next ? ` The next is ${editionLabel(next.label)}.` : '')
    );
  }
  const names = new Set(tournaments.map((t) => t.competition));
  const rows = editions.filter((e) => names.has(e.competition));
  const done = rows.filter((e) => e.winner);
  const w = winnersOf(done);
  const latest = [...done].sort((a, b) => (a.last_match ?? '').localeCompare(b.last_match ?? '') || a.season_start - b.season_start).pop();
  return (
    `${asOf(today)}, FixtureShark covers ${plural(rows.length, 'edition')} of ${tournaments.length} major ${sideOf(women)} international tournaments` +
    (w.length ? `; ${w[0].team} have won the most of them (${w[0].n})` : '') +
    (latest?.winner ? `, and the most recent to finish was the ${latest.competition} ${editionLabel(latest.label)}, won by ${latest.winner}.` : '.')
  );
}

/** Fixtures & Results: the two months the page opens on. */
export function intlFixturesLead(data: { from: string; to: string; matches: IntlMatch[]; fixtures: IntlFixture[]; latestResult: string | null }, today: string, women: boolean): string {
  const coming = data.fixtures.filter((f) => !f.match_key && f.home_score == null && f.kickoff_utc.slice(0, 10) >= today).length;
  const latest = data.latestResult ? `the latest ${sideOf(women)} international result on file is from ${shortDate(data.latestResult)}` : `no ${sideOf(women)} international result is on file yet`;
  return `${asOf(today)}, ${latest}; the calendar below covers ${shortDate(data.from)} to ${shortDate(data.to)}, ${data.matches.length ? `with ${plural(data.matches.length, 'result')}` : 'with no results yet'}${coming ? ` and ${plural(coming, 'fixture')} still to come` : ''}.`;
}
