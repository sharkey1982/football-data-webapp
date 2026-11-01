// Server HTML for the pages that served crawlers an empty app shell (audit
// 1 Nov 2026: GPTBot, ClaudeBot, PerplexityBot don't run JavaScript). Each
// renderer gets small fixture rows shaped like the static build's REST reads
// and must put a dated opening sentence, the numbers and the links into the
// HTML, with the right head.
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildDocument,
  fplLiveSheet,
  intlFixturesWindow,
  lineupsSheet,
  matchProjectionsSheet,
  playerScoutSheet,
  previewSheet,
  renderInjuriesPage,
  renderIntlEditionPage,
  renderIntlFixturesPage,
  renderIntlTeamPage,
  renderIntlTeamsPage,
  renderIntlTournamentsPage,
  renderSummaryPage,
  renderTeamOfTheWeekPage,
  renderTvGuidePage,
  setIntlGender,
  teamStrengthSheet,
  toGameweekScorer,
  toTotwComparison,
  toTotwPlayer,
} from '../entry-server';
import type { EditionSummary, IntlMatch, TeamSummary } from '../lib/intlStats';
import type { IntlEditionData, IntlTeamData } from '../lib/intlApi';

const TODAY = '2026-11-01';
const SHELL = '<html><head><title>x</title><meta name="description" content="x" /></head><body><div id="root"></div></body></html>';
const ld = (page: { structuredData: object[] }, type: string) => page.structuredData.find((o) => (o as { '@type': string })['@type'] === type) as Record<string, unknown> | undefined;

const teams = new Map([
  [1, { team_id: 1, display_name: 'Arsenal', slug: 'arsenal' }],
  [2, { team_id: 2, display_name: 'Chelsea', slug: 'chelsea' }],
  [3, { team_id: 3, display_name: 'Spurs', slug: 'spurs' }],
  [4, { team_id: 4, display_name: 'Everton', slug: 'everton' }],
]);
const fixtures = [
  { fixture_id: 10, slug: 'arsenal-v-chelsea-2026-10-25', kickoff_date: '2026-10-25', status: 'played', matchweek: 8, home_team_id: 1, away_team_id: 2, predicted_home_goals: 1.8, predicted_away_goals: 1.1 },
  { fixture_id: 11, slug: 'spurs-v-everton-2026-10-25', kickoff_date: '2026-10-25', status: 'played', matchweek: 8, home_team_id: 3, away_team_id: 4, predicted_home_goals: 1.5, predicted_away_goals: 1.0 },
  { fixture_id: 12, slug: 'chelsea-v-spurs-2026-11-07', kickoff_date: '2026-11-07', status: 'scheduled', matchweek: 9, home_team_id: 2, away_team_id: 3, predicted_home_goals: '1.62', predicted_away_goals: '1.20' },
  { fixture_id: 13, slug: 'everton-v-arsenal-2026-11-08', kickoff_date: '2026-11-08', status: 'scheduled', matchweek: 9, home_team_id: 4, away_team_id: 1, predicted_home_goals: 0.9, predicted_away_goals: 1.9 },
];
const player = (id: number, team: number, type: number, name: string) => ({ fpl_player_id: id, slug: name.toLowerCase(), web_name: name, first_name: name, second_name: 'X', element_type: type, now_cost: 60 + id, canonical_team_id: team });
const players = [
  player(1, 1, 1, 'Raya'), player(2, 1, 2, 'Saliba'), player(3, 1, 3, 'Saka'), player(4, 1, 4, 'Gyokeres'), player(5, 1, 1, 'Kepa'),
  player(6, 4, 1, 'Pickford'), player(7, 4, 3, 'Ndiaye'),
];
const proj = (fixture: number, id: number, pts: number, start: number) => ({ fixture_id: fixture, fpl_player_id: id, expected_fpl_points: pts, expected_minutes: 80 * start, start_probability: start });
const projections = [proj(13, 1, 4.1, 0.98), proj(13, 2, 4.4, 0.95), proj(13, 3, 7.2, 0.9), proj(13, 4, 5.5, 0.85), proj(13, 5, 0.1, 0.02), proj(13, 6, 3.0, 0.99), proj(13, 7, 3.9, 0.7), proj(10, 3, 6.0, 0.9)];
const week = { today: TODAY, gw: 9, fixtures, teams, players, projections };

describe('tool pages: server summaries', () => {
  it('/team-strength: the ratings table, ranked by projected finish, with a dated lead', () => {
    const result = teamStrengthSheet({
      today: TODAY,
      leagueName: 'Premier League',
      fittedAt: '2026-10-30T06:00:00Z',
      teams,
      inLeague: new Set([1, 2, 3, 4]),
      ratings: [
        { team_id: 1, attack_strength: 0.5, defence_strength: 0.4 },
        { team_id: 2, attack_strength: 0.2, defence_strength: 0.1 },
        { team_id: 3, attack_strength: 0.1, defence_strength: 0.0 },
        { team_id: 4, attack_strength: -0.2, defence_strength: 0.0 },
        { team_id: 99, attack_strength: 0.9, defence_strength: 0.9 },
      ],
      overrides: [{ team_id: 2, attack_adjustment: 0.1, defence_adjustment: 0 }],
      standings: [{ team_id: 2, position: 1, points: 20, played: 9 }, { team_id: 1, position: 2, points: 19, played: 9 }],
      positions: [
        { team_id: 1, method: 'dixon_coles', projected_position_mean: 1.4, projected_points_mean: 82.4 },
        { team_id: 2, method: 'dixon_coles', projected_position_mean: 2.2, projected_points_mean: 74 },
        { team_id: 3, method: 'dixon_coles', projected_position_mean: 3.1, projected_points_mean: 60 },
        { team_id: 4, method: 'dixon_coles', projected_position_mean: 3.9, projected_points_mean: 45 },
      ],
    })!;
    expect(result.sheet.lead).toBe(
      'As of 1 November 2026, the model’s ratings (fitted 30 October 2026) give Arsenal the strongest attack in the Premier League, 1.65 expected goals a game against an average side, and Arsenal the tightest defence, 0.67 conceded. The season simulation has Arsenal finishing highest, on 82 points on average (average position 1.4).'
    );
    const page = renderSummaryPage('/team-strength', result);
    expect(page.title).toBe('Team strength ratings | FixtureShark');
    expect(page.canonical).toBe('https://fixtureshark.com/team-strength');
    expect(page.html).toContain('<h1');
    expect(page.html).toContain('As of 1 November 2026');
    expect(page.html).toContain('href="/football/teams/chelsea"');
    // Chelsea's override applies: exp(0.2 + 0.1).
    expect(page.html).toContain('1.35');
    // A rated club not in this season's fixtures is left out.
    expect(result.items.map((i) => i.name)).toEqual(['Arsenal', 'Chelsea', 'Spurs', 'Everton']);
    expect(ld(page, 'ItemList')).toBeTruthy();
    expect(ld(page, 'BreadcrumbList')).toBeTruthy();
    expect(buildDocument(SHELL, page)).toContain('<div id="root"><');
  });

  it('/fpl: the gameweek fixtures with expected goals and the top projected players', () => {
    const result = matchProjectionsSheet(week)!;
    expect(result.sheet.lead).toBe(
      'As of 1 November 2026, gameweek 9 has 2 Premier League fixtures, from Sat 7 Nov to Sun 8 Nov; Saka X (Arsenal) has the highest projected Fantasy Premier League score, 7.2 points in Everton v Arsenal.'
    );
    const page = renderSummaryPage('/fpl', result);
    expect(page.html).toContain('href="/football/matches/chelsea-v-spurs-2026-11-07"');
    expect(page.html).toContain('1.6–1.2');
    expect(page.html).toContain('href="/fpl/players/saka"');
    // Gameweek 8's projection is not counted in gameweek 9.
    expect(page.html).not.toContain('13.2');
    expect((ld(page, 'ItemList')!.itemListElement as unknown[]).length).toBe(2);
  });

  it('/fpl/line-ups: one keeper and the likeliest outfield starters per club', () => {
    const result = lineupsSheet(week)!;
    expect(result.sheet.lead).toContain('As of 1 November 2026, these are the eleven players the model rates likeliest to start for each of the 2 Premier League clubs in gameweek 9');
    expect(result.sheet.lead).toContain('4 of the 6 have a start chance of 90% or more');
    const arsenal = result.sheet.sections.find((s) => s.heading.startsWith('Arsenal'))!;
    expect(arsenal.heading).toBe('Arsenal at Everton, Sun 8 Nov');
    // Raya, not Kepa (2%), is the keeper.
    expect(arsenal.table!.rows.map((r) => (r[0] as { text: string }).text)).toEqual(['Raya', 'Saliba', 'Saka', 'Gyokeres']);
    const page = renderSummaryPage('/fpl/line-ups', result);
    expect(page.html).toContain('98%');
  });

  it('/fpl/live: what the gameweek is doing, and why there is no score without an ID', () => {
    const page = renderSummaryPage('/fpl/live', fplLiveSheet(week)!);
    expect(page.html).toContain('As of 1 November 2026, gameweek 9 has not started: its 2 Premier League matches are from Sat 7 Nov to Sun 8 Nov.');
    expect(page.html).toContain('href="/football/matches/everton-v-arsenal-2026-11-08"');
    const live = fplLiveSheet({ ...week, gw: 8 })!;
    expect(live.sheet.lead).toContain('all 2 Premier League matches of gameweek 8');
  });

  it('/preview: the next gameweek and every club', () => {
    const page = renderSummaryPage('/preview', previewSheet({ today: TODAY, fixtures, teams })!);
    expect(page.html).toContain('As of 1 November 2026, the next Premier League fixtures are gameweek 9’s 2 matches, starting with Chelsea v Spurs on Sat 7 Nov');
    expect(page.html).toContain('href="/football/teams/everton"');
    expect(page.title).toContain('Head to Heads');
  });

  it('/fpl/player-scout: the career leaders over the seasons on file', () => {
    const result = playerScoutSheet({
      today: TODAY,
      identities: [{ slug: 'salah', canonical_name: 'Mohamed Salah', fpl_code: 118748 }, { slug: 'kane', canonical_name: 'Harry Kane', fpl_code: 78830 }, { slug: null, canonical_name: 'Nobody', fpl_code: 1 }],
      totals: [
        { season_id: 11, fpl_code: 118748, total_points: 211, goals_scored: 19, assists: 12 },
        { season_id: 13, fpl_code: 118748, total_points: 60, goals_scored: 5, assists: 3 },
        { season_id: 11, fpl_code: '78830', total_points: 263, goals_scored: 30, assists: 3 },
        { season_id: 13, fpl_code: 1, total_points: 999 },
      ],
      seasons: [{ season_id: 11, start_year: 2022 }, { season_id: 13, start_year: 2026 }],
      currentSeasonId: 13,
    })!;
    expect(result.sheet.lead).toBe('As of 1 November 2026, Player Scout holds the season-by-season Fantasy Premier League record of 2 players over 2 seasons (2022/23 to 2026/27); Mohamed Salah has scored the most points in that time, 271.');
    const page = renderSummaryPage('/fpl/player-scout', result);
    expect(page.html).toContain('href="/fpl/player-scout/kane"');
    expect(page.html).toContain('Most points, 2026/27');
  });
});

describe('pages rendered with their real component', () => {
  it('/tv-guide: this week’s confirmed UK broadcasts', () => {
    const row = (id: number, fixture: number, over: Record<string, unknown>) => ({
      broadcast_id: id, status: 'confirmed_broadcast', broadcaster: 'Sky Sports', channel: 'Main Event', streaming_service: null, service_product: null, access_type: 'subscription',
      delivery_methods: [], platform_device: null, is_fast: false, is_free_to_air: false, is_subscription: true, is_ppv: false, watch_url: null, confidence: null, availability_notes: null,
      source: 'x', source_url: null, verified_at: '2026-10-30', fixture_id: fixture, slug: `f-${fixture}`, kickoff_date: '2026-11-02', kickoff_time: '16:30:00', league_code: 'E0',
      league_name: 'Premier League', country_name: 'England', competition_type: 'league', league_tier: 1, home_team_name: 'Arsenal', away_team_name: 'Chelsea', home_team_country: 'England',
      away_team_country: 'England', predicted_home_goals: 1.8, predicted_away_goals: 1.1, ...over,
    });
    const rows = [
      row(1, 50, {}),
      row(2, 51, { broadcaster: 'BBC', access_type: 'free', is_free_to_air: true, is_subscription: false, league_name: 'FA Cup', home_team_name: 'Barnet', away_team_name: 'Luton' }),
      row(3, 52, { status: 'confirmed_not_televised', broadcaster: null, home_team_name: 'Bury', away_team_name: 'Bolton' }),
    ];
    const page = renderTvGuidePage(rows, TODAY, '2026-11-08');
    expect(page.html).toContain('As of 1 November 2026, 2 football matches from 2 competitions up to 8 November 2026 are confirmed for live UK TV or streaming, 1 of them free to watch.');
    expect(page.html).toContain('Arsenal v Chelsea');
    expect(page.html).toContain('href="/football/matches/f-50"');
    expect(page.html).toContain('Sky Sports');
    expect(page.canonical).toBe('https://fixtureshark.com/tv-guide');
    expect((ld(page, 'ItemList')!.itemListElement as unknown[]).length).toBe(2);
  });

  it('/fpl/injuries: the Physio Room table, with a count by status', () => {
    const row = (id: number, name: string, status: string, ownership: number | null, news: string | null) => ({
      fpl_player_id: id, web_name: name, slug: name.toLowerCase(), team_id: 1, team_name: 'Arsenal', position_label: 'MID', price: '8.5', ownership, total_points: '40',
      status, chance_next_round: status === 'd' ? 50 : 0, news, return_date: null, fixtures_missed: null, next_fixture_date: null,
    });
    const page = renderInjuriesPage([row(1, 'Saka', 'd', 45.2, '50% chance'), row(2, 'Odegaard', 'i', 12, 'Knee'), row(3, 'White', 's', 3, 'Suspended'), row(4, 'Fit', 'a', 50, null)], TODAY);
    expect(page.html).toContain('As of 1 November 2026, 3 Premier League players are injured, doubtful or suspended in Fantasy Premier League: 2 out, 1 doubtful. The most owned is Saka (Arsenal, 45.2% owned), doubtful.');
    expect(page.html).toContain('Physio Room');
    expect(page.html).toContain('href="/fpl/players/odegaard"');
    expect(page.html).not.toContain('Loading');
    expect(page.canonical).toBe('https://fixtureshark.com/fpl/injuries');
  });

  it('/fpl/team-of-the-week/gwN and the latest at /fpl/team-of-the-week', () => {
    const xi = [toTotwPlayer({ fpl_event_id: 1, fpl_player_id: 3, web_name: 'Saka', slug: 'saka', team_name: 'Arsenal', position_label: 'MID', points: '15', minutes: '90', is_mandatory: false, goals: 2, assists: 1, clean_sheets: 0, bonus: 3 })];
    const data = {
      gw: 1,
      xi,
      cmp: toTotwComparison({ fpl_event_id: 1, actual_xi_points: 15, model_xi_actual_points: 60, overlap_count: 1, model_xi_projected: 58, overlap_names: ['Saka'] }),
      weeks: [2, 1],
      scorers: [toGameweekScorer({ fpl_player_id: 3, total_points: 15, minutes: 90, goals_scored: 2, assists: 1, clean_sheets: 0, bonus: 3, fpl_players: { web_name: 'Saka', slug: 'saka', element_type: 3 } })],
      dates: ['2026-08-15', '2026-08-17'],
    };
    const page = renderTeamOfTheWeekPage(data);
    expect(page.html).toContain('In gameweek 1 (Sat 15 Aug to Mon 17 Aug 2026), the best legal Fantasy Premier League XI scored 15 points, and the top scorer was Saka with 15.');
    expect(page.html).toContain('Everyone who scored');
    expect(page.html).toContain('href="/fpl/team-of-the-week/gw2"');
    expect(page.canonical).toBe('https://fixtureshark.com/fpl/team-of-the-week/gw1');
    expect(page.title).toBe('FPL team of the week — gameweek 1 | FixtureShark');
    const latest = renderTeamOfTheWeekPage(data, true);
    expect(latest.canonical).toBe('https://fixtureshark.com/fpl/team-of-the-week');
    expect(latest.html).toContain('Team of the week');
  });
});

// ---- International ----------------------------------------------------------

const nation = (team: string, slug: string, elo: number, rank: number | null, over: Partial<TeamSummary> = {}): TeamSummary => ({
  team, slug, confederation: 'UEFA', played: 400, won: 200, drawn: 100, lost: 100, goals_for: 700, goals_against: 400, first_match: '1872-11-30', last_match: '2026-10-14',
  elo, elo_rank: rank, elo_peak: elo + 50, elo_peak_date: '2010-07-11', wc_titles: 0, euro_titles: 0, unl_titles: 0, titles: null, ...over,
});
const edition = (competition: string, slug: string, label: string, winner: string | null, over: Partial<EditionSummary> = {}): EditionSummary => ({
  edition_key: `${slug}-${label}`, competition, competition_slug: slug, label, season_start: Number(label.slice(0, 4)), teams: 32, matches: 64, goals: 170, hosts: ['Qatar'],
  winner, winner_slug: winner ? winner.toLowerCase() : null, runner_up: winner ? 'France' : null, runner_up_slug: winner ? 'france' : null, final_key: null,
  first_match: `${label.slice(0, 4)}-06-01`, last_match: `${label.slice(0, 4)}-07-01`, ...over,
});

describe('international list pages', () => {
  afterEach(() => setIntlGender('men'));
  const men = [nation('Spain', 'spain', 2150.4, 1), nation('Argentina', 'argentina', 2140, 2), nation('France', 'france', 2090, 3), nation('Yugoslavia', 'yugoslavia', 1700, null)];
  const editions = [
    edition('FIFA World Cup', 'fifa-world-cup', '2018', 'France'),
    edition('FIFA World Cup', 'fifa-world-cup', '2022', 'Argentina', { last_match: '2022-12-18' }),
    edition('FIFA World Cup', 'fifa-world-cup', '2026', null),
    edition('Confederations Cup', 'confederations-cup', '2017', 'Germany'),
  ];

  it('/international/teams: the ranked nations', () => {
    const page = renderIntlTeamsPage(men, TODAY);
    expect(page.html).toContain('As of 1 November 2026, Spain top FixtureShark’s men’s international Elo ratings on 2,150, ahead of Argentina (2,140) and France (2,090); 3 current nations are ranked, from 4 teams on file.');
    expect(page.html).toContain('href="/international/teams/argentina"');
    expect(page.canonical).toBe('https://fixtureshark.com/international/teams');
  });

  it('/international/tournaments and one tournament (Confederations Cup)', () => {
    const all = renderIntlTournamentsPage(editions, TODAY, null)!;
    expect(all.html).toContain('As of 1 November 2026, FixtureShark covers 4 editions of 8 major men’s international tournaments');
    expect(all.html).toContain('the most recent to finish was the FIFA World Cup 2022, won by Argentina.');
    const wc = renderIntlTournamentsPage(editions, TODAY, 'world-cup')!;
    expect(wc.html).toContain('there have been 2 men’s FIFA World Cups since 2018, won by 2 nations');
    expect(wc.html).toContain('The next is 2026.');
    expect(wc.canonical).toBe('https://fixtureshark.com/international/tournaments/world-cup');
    const confed = renderIntlTournamentsPage(editions, TODAY, 'confederations-cup')!;
    expect(confed.html).toContain('there have been 1 men’s Confederations Cup since 2017, won by 1 nation; Germany has the most titles (1), and Germany won the latest, 2017.');
    expect(confed.html).toContain('Every edition');
    expect(renderIntlTournamentsPage(editions, TODAY, 'nope')).toBeNull();
  });

  it('women’s pages move to /international/women/...', () => {
    setIntlGender('women');
    const women = [nation('Spain', 'spain', 2100, 1), nation('England', 'england', 2080, 2)];
    const teamsPage = renderIntlTeamsPage(women, TODAY);
    expect(teamsPage.canonical).toBe('https://fixtureshark.com/international/women/teams');
    expect(teamsPage.html).toContain('women’s international Elo ratings');
    expect(teamsPage.html).toContain('href="/international/women/teams/england"');
    const wwc = renderIntlTournamentsPage([edition('FIFA World Cup', 'fifa-world-cup', '2023', 'Spain', { hosts: ['Australia', 'New Zealand'] })], TODAY, 'world-cup')!;
    expect(wwc.canonical).toBe('https://fixtureshark.com/international/women/tournaments/world-cup');
    expect(wwc.html).toContain('Spain won the latest, 2023');
    expect(renderIntlTournamentsPage([], TODAY, 'olympics')).not.toBeNull();
    expect(renderIntlTournamentsPage([], TODAY, 'confederations-cup')).toBeNull();
  });

  it('Fixtures & Results opens on the window the browser opens on', () => {
    const win = intlFixturesWindow(TODAY);
    expect(win).toEqual({ key: '2026-9', from: '2026-10-01', to: '2026-11-30' });
    setIntlGender('women');
    const m = { match_key: 'k1', match_date: '2026-10-14', home_team: 'England', home_slug: 'england', home_name: 'England', away_team: 'Spain', away_slug: 'spain', away_name: 'Spain', home_score: 2, away_score: 1,
      home_score_90: 2, away_score_90: 1, went_extra_time: false, shootout_winner: null, competition: 'Friendly', competition_slug: 'friendly', competition_kind: 'friendly', edition_key: null,
      stage_code: null, stage_name: null, stage_type: null, group_label: null, matchday: null, city: 'London', country: 'England', neutral: false, elo_home_pre: 2080, elo_away_pre: 2100, elo_change: 12 } as unknown as IntlMatch;
    const page = renderIntlFixturesPage({ key: win.key, data: { from: win.from, to: win.to, matches: [m], fixtures: [], latestResult: '2026-10-14' }, teams: [nation('England', 'england', 2080, 2)] }, TODAY);
    expect(page.canonical).toBe('https://fixtureshark.com/international/women/fixtures');
    expect(page.html).toContain('As of 1 November 2026, the latest women’s international result on file is from 14 Oct 2026; the calendar below covers 1 Oct 2026 to 30 Nov 2026, with 1 result.');
    expect(page.html).toContain('England');
    expect(page.html).not.toContain('Loading');
  });

  it('a women’s nation and edition page match their own route', () => {
    setIntlGender('women');
    const team = nation('England', 'england', 2080, 2);
    const data: IntlTeamData = { team, matches: [], fixtures: [], totals: [], pairs: [], editions: [], teams: [{ team: 'England', slug: 'england', confederation: 'UEFA' }], goals: [], squad: null, squadPlayers: [], groupOdds: [], squadVersions: [], snapshotPlayers: [] };
    const page = renderIntlTeamPage(data);
    expect(page.canonical).toBe('https://fixtureshark.com/international/women/teams/england');
    expect(page.html).toContain('England');
    expect(page.html).toContain('<h1');
    const ed: IntlEditionData = { edition: edition('FIFA World Cup', 'fifa-world-cup', '2023', 'Spain'), matches: [], stages: [], groups: [], goals: [], fixtures: [], editions: [], groupOdds: [] };
    const edPage = renderIntlEditionPage(ed)!;
    expect(edPage.canonical).toBe('https://fixtureshark.com/international/women/tournaments/world-cup/2023');
    expect(edPage.html).toContain('<h1');
  });
});
