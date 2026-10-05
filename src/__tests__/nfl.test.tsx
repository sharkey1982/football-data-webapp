import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as api from '../lib/nflApi';
import NflFixturesPage from '../pages/nfl/NflFixturesPage';
import NflTablePage from '../pages/nfl/NflTablePage';
import NflTeamPage from '../pages/nfl/NflTeamPage';
import NflSeasonPage from '../pages/nfl/NflSeasonPage';
import StagePage from '../pages/StagePage';
import { renderNflFixturesPage, renderNflGamePage, renderNflPickPage, renderNflRoadTripsPage, renderNflSeasonPage, renderNflTablePage, renderNflTeamPage } from '../entry-server';
import NflGamePage from '../pages/nfl/NflGamePage';
import NflRoadTripsPage from '../pages/nfl/NflRoadTripsPage';
import NflPickMyTeamPage from '../pages/nfl/NflPickMyTeamPage';
import NflPlayersPage from '../pages/nfl/NflPlayersPage';
import * as fantasyApi from '../lib/nflFantasyApi';
import { STADIUMS, buildPicker, buildRoadTrips, lateUk, milesBetween, pickReasons, rankTeams, type PickerTeam } from '../lib/nflPlaces';
import { favouriteCoverProb, likeliestMargins, marginBuckets, marginDistribution } from '../lib/nflMargin';
import { buildGamePreview, formOf, gameSentence, headToHead, headToHeadSentence, marginLabel, seasonSoFar } from '../lib/nflGame';
import { THEMES } from '../lib/journey';
import { LAYOUT_PAIRS } from '../lib/layoutPairs';
import { againstSpread, seasonStory, teamSeasonStory, upsetSize, winStreaks, type NflSeasonSummary } from '../lib/nflStory';
import { nflGuideItem, nflWatch } from '../lib/nflWatch';
import { buildHeatMap, consistency, playerSentence, positionRank, type NflPlayerWeek, type PointsAllowed } from '../lib/nflFantasyApi';

vi.mock('../lib/nflApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/nflApi');
  return { ...actual, loadNflWeek: vi.fn(), loadNflStandings: vi.fn(), loadNflTeam: vi.fn(), loadLatestNflSeason: vi.fn(), loadNflSeason: vi.fn() };
});
vi.mock('../lib/nflFantasyApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/nflFantasyApi')>('../lib/nflFantasyApi');
  return { ...actual, loadTeamFantasyLeaders: vi.fn().mockResolvedValue([]), loadPlayerScout: vi.fn() };
});
vi.mock('../lib/nflProjections', async () => {
  const actual = await vi.importActual<typeof import('../lib/nflProjections')>('../lib/nflProjections');
  return { ...actual, loadGameProjections: vi.fn().mockResolvedValue([]), loadProjections: vi.fn().mockResolvedValue([]) };
});
vi.mock('../lib/commercialLinks', async () => {
  const actual = await vi.importActual<typeof import('../lib/commercialLinks')>('../lib/commercialLinks');
  return { ...actual, getActivePartners: vi.fn().mockResolvedValue([]) };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const DIVS: [api.NflTeam['conference'], api.NflTeam['division']][] = [
  ['AFC', 'East'], ['AFC', 'North'], ['AFC', 'South'], ['AFC', 'West'],
  ['NFC', 'East'], ['NFC', 'North'], ['NFC', 'South'], ['NFC', 'West'],
];
const teams: api.NflTeam[] = DIVS.flatMap(([conference, division], d) =>
  [0, 1, 2, 3].map((i) => ({
    franchise: `T${d}${i}`,
    slug: `team-${d}-${i}`,
    name: `Team ${d}-${i}`,
    short_name: `T${d}${i}`,
    conference,
    division,
  }))
);
// Two real franchises for the cases that matter.
teams[0] = { franchise: 'MIA', slug: 'miami-dolphins', name: 'Miami Dolphins', short_name: 'Dolphins', conference: 'AFC', division: 'East' };
teams[1] = { franchise: 'NE', slug: 'new-england-patriots', name: 'New England Patriots', short_name: 'Patriots', conference: 'AFC', division: 'East' };

const game = (over: Partial<api.NflGame>): api.NflGame => ({
  game_id: 'g', season: 2026, game_type: 'REG', week: 4, gameday: '2026-10-04', kickoff_at: '2026-10-04T17:00:00Z',
  home_franchise: 'NE', home_slug: 'new-england-patriots', home_name: 'New England Patriots', home_short: 'Patriots',
  away_franchise: 'MIA', away_slug: 'miami-dolphins', away_name: 'Miami Dolphins', away_short: 'Dolphins',
  home_score: null, away_score: null, overtime: null, neutral_site: false, div_game: true,
  spread_line: 3.5, total_line: 44.5, stadium: 'Gillette Stadium', ...over,
});

const standing = (t: api.NflTeam, over: Partial<api.NflStanding>): api.NflStanding => ({
  season: 2008, franchise: t.franchise, slug: t.slug, team_name: t.name, short_name: t.short_name,
  conference: t.conference, division: t.division, played: 16, won: 8, lost: 8, tied: 0, win_pct: 0.5,
  points_for: 300, points_against: 300, point_diff: 0, home_won: 4, home_lost: 4, away_won: 4, away_lost: 4,
  div_won: 3, div_lost: 3, div_tied: 0, conf_won: 6, conf_lost: 6, playoff_result: null, playoff_round: 0,
  season_complete: true, division_rank: 2, won_division: false, ...over,
});

// 2008 AFC East: Miami and New England both 11-5; Miami won the division.
const rows2008: api.NflStanding[] = teams.map((t, i) => {
  if (t.franchise === 'MIA') return standing(t, { won: 11, lost: 5, win_pct: 0.688, division_rank: 1, won_division: true, playoff_result: 'Lost wild card round', playoff_round: 1 });
  if (t.franchise === 'NE') return standing(t, { won: 11, lost: 5, win_pct: 0.688, division_rank: 2, point_diff: 99 });
  if (i === 4) return standing(t, { won: 12, lost: 4, win_pct: 0.75, division_rank: 1, won_division: true, playoff_result: 'Won Super Bowl', playoff_round: 4 });
  if (i === 16) return standing(t, { division_rank: 1, won_division: true, playoff_result: 'Lost Super Bowl', playoff_round: 4 });
  return standing(t, { division_rank: (i % 4) + 1, won_division: i % 4 === 0 });
});
const standingsData: api.NflStandingsData = { season: 2008, seasons: api.seasonRange(2026), rows: rows2008 };

const weekGames = [
  game({ game_id: 'a', home_score: 24, away_score: 27, overtime: true, kickoff_at: '2026-10-02T00:15:00Z', gameday: '2026-10-01' }),
  game({
    game_id: 'b', home_franchise: 'T10', home_slug: 'team-1-0', home_name: 'Team 1-0', home_short: 'T10',
    away_franchise: 'T11', away_slug: 'team-1-1', away_name: 'Team 1-1', away_short: 'T11',
    neutral_site: true, stadium: 'Tottenham Hotspur Stadium', kickoff_at: '2026-10-04T13:30:00Z', spread_line: -2.5,
  }),
];
const seasonGames = [...weekGames, game({ game_id: 'c', week: 5, gameday: '2026-10-11', kickoff_at: '2026-10-11T17:00:00Z' }), game({ game_id: 'z', week: 3, home_score: 10, away_score: 13 })];
const weekData = api.buildWeek(2026, api.seasonRange(2026), seasonGames, null, teams, [
  { game_id: 'b', predicted_at: '2026-10-03T06:20:00Z', p_home: 0.36, predicted_margin: -2.3, market_p_home: 0.41 },
])!;

// 2008-shaped season: Team 1-0 (T10) beat Team 4-0 (T40) in the Super Bowl.
const g08 = (over: Partial<api.NflGame>) => game({ season: 2008, kickoff_at: '2008-10-05T17:00:00Z', gameday: '2008-10-05', div_game: false, ...over });
const t = (fr: string) => {
  const tm = teams.find((x) => x.franchise === fr)!;
  return { slug: tm.slug, name: tm.name, short: tm.short_name };
};
const vs = (week: number, away: string, home: string, as: number, hs: number, over: Partial<api.NflGame> = {}) =>
  g08({
    game_id: `08_${week}_${away}_${home}`, week, away_franchise: away, home_franchise: home,
    away_slug: t(away).slug, away_name: t(away).name, away_short: t(away).short,
    home_slug: t(home).slug, home_name: t(home).name, home_short: t(home).short,
    away_score: as, home_score: hs, ...over,
  });
const games08: api.NflGame[] = [
  vs(1, 'MIA', 'NE', 13, 34, { spread_line: 6 }),
  vs(2, 'MIA', 'NE', 38, 13, { spread_line: 12.5 }), // 12.5-point underdogs win
  vs(3, 'NE', 'MIA', 3, 41, { spread_line: -3 }),
  vs(1, 'T10', 'T11', 24, 10, { spread_line: -3 }),
  vs(2, 'T10', 'T12', 20, 17, { spread_line: -4 }),
  vs(3, 'T10', 'T13', 31, 7, { spread_line: -7 }),
  vs(20, 'T40', 'T10', 20, 27, { game_type: 'CON', neutral_site: false }),
  vs(22, 'T40', 'T10', 23, 27, { game_type: 'SB', neutral_site: true, stadium: 'Raymond James Stadium', spread_line: 7 }),
];
const summary = (season: number, ppg: number): NflSeasonSummary => ({
  season, reg_games: 256, reg_played: 256, points_per_game: ppg, home_win_share: 0.57, one_score_share: 0.48,
  overtime_games: 15, ties: 0, favourite_win_share: 0.66, neutral_games: 1,
});
const summaries = [summary(2006, 41.3), summary(2007, 43.4), summary(2008, 44.1), summary(2009, 42.7), summary(2010, 44.0), summary(2011, 44.4)];
const seasonData: api.NflSeasonData = { season: 2008, seasons: api.seasonRange(2026), rows: rows2008, games: games08, summaries };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('nflApi builders', () => {
  it('puts the hub on the first week with an unplayed game', () => {
    expect(weekData.week).toBe(4);
    expect(weekData.currentWeek).toBe(4);
    expect(weekData.games.map((g) => g.game_id)).toEqual(['a', 'b']);
    expect(weekData.weeks.map((w) => w.label)).toEqual(['Week 3', 'Week 4', 'Week 5']);
  });

  it('formats the line favourite-first from nflverse sign convention (+ = home favoured)', () => {
    expect(api.lineLabel(game({ spread_line: 3.5 }))).toBe('NE −3.5');
    expect(api.lineLabel(game({ spread_line: -2.5 }))).toBe('MIA −2.5');
    expect(api.lineLabel(game({ spread_line: 0 }))).toBe("Pick'em");
    expect(api.lineLabel(game({ spread_line: null }))).toBeNull();
  });

  it('shows kick-off in UK time across the clock change', () => {
    expect(api.ukKickoff({ kickoff_at: '2026-10-04T13:30:00Z', gameday: '2026-10-04' })).toBe('Sun 4 Oct, 14:30');
    expect(api.ukKickoff({ kickoff_at: '2026-11-08T14:30:00Z', gameday: '2026-11-08' })).toBe('Sun 8 Nov, 14:30');
  });

  it('labels results from the team side, with OT', () => {
    expect(api.teamResult(weekGames[0], 'MIA')).toMatchObject({ letter: 'W', score: '27-24 (OT)', home: false, opponent: 'New England Patriots' });
    expect(api.teamResult(weekGames[0], 'NE')).toMatchObject({ letter: 'L', score: '24-27 (OT)', home: true });
  });

  it('describes a one-game week (the Super Bowl) as a sentence, not "all 1 games"', () => {
    const sb = game({ game_id: 'sb', game_type: 'SB', week: 22, home_score: 13, away_score: 29, neutral_site: true, stadium: "Levi's Stadium", home_franchise: 'NE', away_franchise: 'SEA', away_name: 'Seattle Seahawks', away_short: 'Seahawks' });
    const d = api.buildWeek(2025, [2025], [sb], 22, teams)!;
    expect(api.weekSentence(d)).toBe("Super Bowl of the 2025 NFL season: the Seattle Seahawks beat the New England Patriots 29-13. Neutral-site game: Seahawks v Patriots at Levi's Stadium.");
  });

  it('finds bye weeks from the regular-season weeks played', () => {
    const g = (week: number, game_type: api.NflGameType = 'REG') => game({ game_id: `w${week}`, week, game_type });
    expect(api.byeWeeks([g(1), g(2), g(4), g(5), g(19, 'WC')])).toEqual([3]);
    expect(api.byeWeeks([])).toEqual([]);
  });

  it('names the champion and runner-up of a complete season', () => {
    expect(api.standingsSentence(standingsData)).toBe(
      'The Team 1-0 won the Super Bowl after the 2008 season, beating the Team 4-0. Best regular-season record: the Team 1-0, 12-4.'
    );
  });

  it('counts division titles from won_division, not division_rank', () => {
    const mia = teams[0];
    const history = [
      standing(mia, { season: 2008, won_division: true, division_rank: 1, playoff_round: 1 }),
      standing(mia, { season: 2009, won_division: false, division_rank: 1 }), // rank 1 but not the champion: never claimed
      standing(mia, { season: 2026, season_complete: false, won_division: null, won: 3, lost: 1, played: 4, division_rank: 1 }),
    ];
    const d = api.buildTeam(mia, history, seasonGames, 2026);
    expect(api.teamSentence(d)).toBe(
      'Since 2002 the Miami Dolphins have reached the play-offs in 1 of 2 completed seasons, won their division 1 time and have no Super Bowl wins. In 2026 they are 3-1, 1st in the AFC East.'
    );
  });
});

describe('NFL pages', () => {
  it('Fixtures & Results shows the week with UK times, the neutral venue, the line and where to watch', async () => {
    mocked.loadNflWeek.mockResolvedValue(weekData);
    render(
      <MemoryRouter initialEntries={['/nfl/fixtures']}>
        <Routes><Route path="/nfl/fixtures" element={<NflFixturesPage />} /></Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('nfl-week-story')).toBeTruthy());
    expect(mocked.loadNflWeek).toHaveBeenCalledWith(null, null);
    expect(screen.getByTestId('nfl-week-story').textContent).toContain('Neutral-site game: T11 v T10 at Tottenham Hotspur Stadium');
    expect(screen.getAllByTestId('nfl-game')).toHaveLength(2);
    expect(screen.getByText('Final (OT)')).toBeTruthy();
    expect(screen.getByText('Sun 4 Oct, 14:30')).toBeTruthy();
    expect(screen.getByText('Closing line: NE −3.5, O/U 44.5')).toBeTruthy();
    // The unplayed London game: 5 free first, then Sky and DAZN.
    expect(screen.getByTestId('nfl-watch-line').textContent).toBe('Watch: 5 (free), DAZN NFL Game Pass, Sky Sports NFL');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Fixtures & Results');
    // The model beside the market, favoured side first (p_home 0.36 -> away side 64%).
    expect(screen.getByTestId('nfl-model-line').textContent).toBe('Model: T11 64% · market T11 59%');
  });

  it('Fixtures & Results has the football calendar: tap a day to list just that day', async () => {
    mocked.loadNflWeek.mockResolvedValue(weekData);
    render(
      <MemoryRouter initialEntries={['/nfl/fixtures']}>
        <Routes><Route path="/nfl/fixtures" element={<NflFixturesPage />} /></Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('nfl-calendar-help')).toBeTruthy());
    expect(screen.getAllByTestId('nfl-game')).toHaveLength(2); // week 4
    const oct11 = screen.getAllByRole('button', { name: '11' }).find((b) => !(b as HTMLButtonElement).disabled)!;
    fireEvent.click(oct11); // week 5's game, UK date 11 Oct
    expect(screen.getAllByTestId('nfl-game')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: '2026: selected day' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Week 4' }));
    expect(screen.getAllByTestId('nfl-game')).toHaveLength(2);
  });

  it('Fixtures & Results reads season and week from the URL', async () => {
    mocked.loadNflWeek.mockResolvedValue(weekData);
    render(
      <MemoryRouter initialEntries={['/nfl/fixtures?season=2025&week=19']}>
        <Routes><Route path="/nfl/fixtures" element={<NflFixturesPage />} /></Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(mocked.loadNflWeek).toHaveBeenCalledWith(2025, 19));
  });

  it('Fixtures & Results: search a team to see its season of results', async () => {
    mocked.loadNflWeek.mockResolvedValue(weekData);
    render(
      <MemoryRouter initialEntries={['/nfl/fixtures']}>
        <Routes><Route path="/nfl/fixtures" element={<NflFixturesPage />} /></Routes>
      </MemoryRouter>
    );
    fireEvent.change(await screen.findByTestId('nfl-team-search'), { target: { value: 'miami dolphins' } });
    const season = await screen.findByTestId('nfl-team-season');
    expect(screen.getByTestId('nfl-team-season-summary').textContent).toBe('Regular season 2-0 · points 40-34 (+6) · against the spread 2-0');
    const cells = [...season.querySelectorAll('tbody tr')].map((r) => r.textContent ?? '');
    expect(cells.filter((c) => c.includes('Bye'))).toHaveLength(2);
    expect(cells.some((c) => c.includes('W 27-24 (OT)'))).toBe(true);
    expect(screen.queryByTestId('nfl-week-story')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All teams' }));
    expect(await screen.findByTestId('nfl-week-story')).toBeInTheDocument();
  });

  it('League Table lists the bracket division winner first and toggles to a sortable league table', async () => {
    mocked.loadNflStandings.mockResolvedValue(standingsData);
    render(
      <MemoryRouter initialEntries={['/nfl/table?season=2008']}>
        <Routes><Route path="/nfl/table" element={<NflTablePage />} /></Routes>
      </MemoryRouter>
    );
    expect(mocked.loadNflStandings).toHaveBeenCalledWith(2008);
    await waitFor(() => expect(screen.getByTestId('nfl-standings-story')).toBeTruthy());
    const afcEast = screen.getByText('AFC East').closest('table')!;
    const names = [...afcEast.querySelectorAll('tbody th')].map((th) => th.textContent);
    expect(names[0]).toContain('Miami Dolphins');
    expect(names[1]).toContain('New England Patriots');
    fireEvent.click(screen.getByRole('button', { name: 'Whole league' }));
    const rows = [...document.querySelectorAll('tbody tr th')].map((th) => th.textContent);
    expect(rows).toHaveLength(32);
    expect(rows[0]).toBe('Team 1-0'); // 12-4, best Pct
  });

  it('League Table falls back to last season before the first game of a new one', async () => {
    mocked.loadLatestNflSeason.mockResolvedValue(2027);
    mocked.loadNflStandings.mockImplementation(async (s: number) => (s === 2027 ? null : { ...standingsData, season: s }));
    render(
      <MemoryRouter initialEntries={['/nfl/table']}>
        <Routes><Route path="/nfl/table" element={<NflTablePage />} /></Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('nfl-standings-story')).toBeTruthy());
    expect(mocked.loadNflStandings).toHaveBeenCalledWith(2026);
  });

  it('a season page tells the story, lists the play-offs and 404s a bad segment', async () => {
    mocked.loadNflSeason.mockResolvedValue(seasonData);
    render(
      <MemoryRouter initialEntries={['/nfl/seasons/2008']}>
        <Routes><Route path="/nfl/seasons/:season" element={<NflSeasonPage />} /></Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('nfl-season-story')).toBeTruthy());
    expect(screen.getByTestId('nfl-season-story').textContent).toContain('won the Super Bowl after the 2008 season');
    expect(screen.getByRole('heading', { name: 'Play-offs' })).toBeTruthy();
    expect(screen.getByText('Season in numbers')).toBeTruthy();
    mocked.loadNflSeason.mockClear();
    render(
      <MemoryRouter initialEntries={['/nfl/seasons/abc']}>
        <Routes><Route path="/nfl/seasons/:season" element={<NflSeasonPage />} /></Routes>
      </MemoryRouter>
    );
    expect(mocked.loadNflSeason).not.toHaveBeenCalled();
  });

  it('the NFL stage pages render from the journey config with Football\u2019s page names', () => {
    render(
      <MemoryRouter initialEntries={['/nfl/discover']}>
        <Routes><Route path="/nfl/:stage" element={<StagePage themeKey="nfl" />} /></Routes>
      </MemoryRouter>
    );
    for (const label of ['Fixtures & Results', 'TV Guide', 'League Table', 'Your Team', 'Past seasons']) expect(screen.getByText(label)).toBeTruthy();
  });

  it('team page shows the season games and every season, era names included', async () => {
    const raiders: api.NflTeam = { franchise: 'LV', slug: 'las-vegas-raiders', name: 'Las Vegas Raiders', short_name: 'Raiders', conference: 'AFC', division: 'West' };
    const data = api.buildTeam(raiders, [standing(raiders, { season: 2002, team_name: 'Oakland Raiders', won: 11, lost: 5, won_division: true, division_rank: 1, playoff_result: 'Lost Super Bowl', playoff_round: 4 })], [], 2026);
    mocked.loadNflTeam.mockResolvedValue(data);
    render(
      <MemoryRouter initialEntries={['/nfl/teams/las-vegas-raiders']}>
        <Routes><Route path="/nfl/teams/:slug" element={<NflTeamPage />} /></Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('nfl-team-story')).toBeTruthy());
    expect(screen.getByText('Oakland Raiders')).toBeTruthy();
    expect(screen.getByText('Lost Super Bowl')).toBeTruthy();
    expect(screen.getByText('Won')).toBeTruthy();
  });
});

describe('NFL server renders', () => {
  it('render the content into the HTML with page-specific heads', () => {
    const fx = renderNflFixturesPage(weekData);
    expect(fx.html).toContain('Tottenham Hotspur Stadium');
    expect(fx.canonical).toBe('https://fixtureshark.com/nfl/fixtures');
    const table = renderNflTablePage(standingsData);
    expect(table.html).toContain('Miami Dolphins');
    expect(table.title).toBe('2008 NFL league table and standings | FixtureShark');
    const st = renderNflSeasonPage(seasonData);
    expect(st.canonical).toBe('https://fixtureshark.com/nfl/seasons/2008');
    expect(st.description).toContain('won the Super Bowl after the 2008 season');
    expect(st.html).toContain('Season in numbers');
    const team = renderNflTeamPage(api.buildTeam(teams[0], rows2008.filter((r) => r.franchise === 'MIA'), seasonGames, 2026));
    expect(team.canonical).toBe('https://fixtureshark.com/nfl/teams/miami-dolphins');
    expect(team.html).toContain('W 27-24 (OT)');
    expect(team.structuredData[0]).toMatchObject({ '@type': 'SportsTeam', name: 'Miami Dolphins' });
  });
});

describe('NFL stories', () => {
  it('tells a completed season: champion and route, best record, upset, scoring rank', () => {
    const st = seasonStory(2008, games08, rows2008, summaries);
    expect(st.headline).toBe('The Team 1-0 won the Super Bowl after the 2008 season, beating the Team 4-0 27-23 at Raymond James Stadium.');
    const text = st.paragraphs.join(' ');
    expect(text).toContain('They went 12-4 in the regular season and won the AFC North.');
    expect(text).toContain('The biggest upset: the Miami Dolphins, 12.5-point underdogs, beat the New England Patriots 38-13 in week 2');
    expect(text).toContain('The longest winning run: the Team 1-0, 3 in a row (weeks 1-3).');
    expect(text).toContain('At 44.1 points a game it ranks second-highest-scoring since 2006.');
  });

  it('tells an in-progress season with unbeaten and winless teams', () => {
    const rows = rows2008.map((r) => ({ ...r, season_complete: false, won_division: null, playoff_result: null, playoff_round: 0, played: 3, won: r.franchise === 'T10' ? 3 : r.franchise === 'T11' ? 0 : 1, lost: r.franchise === 'T10' ? 0 : r.franchise === 'T11' ? 3 : 2, win_pct: r.franchise === 'T10' ? 1 : r.franchise === 'T11' ? 0 : 0.333 }));
    const st = seasonStory(2008, games08.filter((g) => g.game_type === 'REG'), rows, summaries);
    expect(st.headline).toBe('After week 3 of the 2008 season, the Team 1-0 have the best record at 3-0.');
    expect(st.paragraphs[0]).toContain('Still unbeaten: the Team 1-0 (3-0).');
    expect(st.paragraphs[0]).toContain('Still looking for a first win: the Team 1-1 (0-3).');
  });

  it('scores upsets and the spread from nflverse sign convention', () => {
    expect(upsetSize(games08[1])).toBe(12.5);
    expect(upsetSize(games08[0])).toBe(0);
    // MIA -3 at home won by 38: covered; NE did not.
    expect(againstSpread(games08[2], 'MIA')).toBe('cover');
    expect(againstSpread(games08[2], 'NE')).toBe('miss');
    expect(againstSpread(vs(4, 'MIA', 'NE', 10, 13, { spread_line: 3 }), 'NE')).toBe('push');
    expect(winStreaks(games08)[0]).toMatchObject({ franchise: 'T10', length: 3 });
  });

  it('tells one team\u2019s season with its record against the spread', () => {
    const mia = rows2008.find((r) => r.franchise === 'MIA')!;
    const st = teamSeasonStory('MIA', games08, mia);
    expect(st.sentences[0]).toBe('Won the AFC East at 11-5, then lost in the wild card round.');
    expect(st.sentences).toContain('Biggest win: 41-3 against the New England Patriots in week 3.');
    expect(st.ats).toEqual({ cover: 2, miss: 1, push: 0 });
  });
});

describe('NFL TV rules', () => {
  const at = (iso: string, over: Partial<api.NflGame> = {}) => nflWatch({ game_type: 'REG', kickoff_at: iso, neutral_site: false, stadium: null, ...over });
  const names = (w: ReturnType<typeof nflWatch>) => w.offers.map((o) => o.channel ?? o.serviceProduct);

  it('every game is on DAZN NFL Game Pass', () => {
    expect(names(at('2026-10-04T17:00:00Z'))).toContain('DAZN NFL Game Pass');
  });
  it('prime time (after 23:00 UK) is on Sky Sports NFL', () => {
    expect(names(at('2026-10-05T00:20:00Z'))).toEqual(['DAZN NFL Game Pass', 'Sky Sports NFL']); // Sun night, 01:20 BST
    expect(at('2026-10-05T00:20:00Z').pickedWeekly).toBeNull();
  });
  it('a Jaguars "home" game in London is still a London game', () => {
    const jax = nflWatch(game({ neutral_site: false, stadium: 'Tottenham Hotspur Stadium', kickoff_at: '2026-10-11T13:30:00Z' }));
    expect(jax.offers.map((o) => o.broadcaster)).toEqual(['DAZN', 'Sky Sports', '5']);
  });

  it('London games are on Sky and free on 5', () => {
    const w = at('2026-10-04T13:30:00Z', { neutral_site: true, stadium: 'Tottenham Hotspur Stadium' });
    expect(names(w)).toEqual(['DAZN NFL Game Pass', 'Sky Sports NFL', '5']);
    expect(w.offers.find((o) => o.channel === '5')!.accessType).toBe('free');
  });
  it('Sunday evening games say they are picked weekly rather than guessing', () => {
    const w = at('2026-10-04T17:00:00Z');
    expect(names(w)).toEqual(['DAZN NFL Game Pass']);
    expect(w.pickedWeekly).toContain('pick their Sunday games each week');
  });
  it('the Super Bowl is on Sky and free on 5', () => {
    expect(names(at('2027-02-14T23:30:00Z', { game_type: 'SB', neutral_site: true }))).toEqual(['DAZN NFL Game Pass', 'Sky Sports NFL', '5']);
  });
});

describe('NFL fantasy maths', () => {
  const wk = (week: number, ppr: number, recs = 5): NflPlayerWeek => ({
    player_id: 'p', position: 'WR', season: 2026, week, season_type: 'REG', game_id: `g${week}`, team: 'MIA', opponent: 'NE', opponent_slug: 'new-england-patriots', opponent_short: 'Patriots', at_home: true, gameday: '2026-09-13', team_score: 20, opponent_score: 17,
    completions: 0, attempts: 0, passing_yards: 0, passing_tds: 0, interceptions: 0, carries: 0, rushing_yards: 0, rushing_tds: 0, receptions: recs, targets: 8, receiving_yards: 60, receiving_tds: 0, fumbles_lost: 0, target_share: 0.2, fg_made: 0, fg_att: 0, pat_made: 0,
    pts_std: ppr - recs, pts_half: ppr - recs / 2, pts_ppr: ppr,
  });

  it('consistency: floor, median, ceiling and startable weeks', () => {
    const c = consistency([wk(1, 4), wk(2, 10), wk(3, 14), wk(4, 30)], 'ppr', 'WR')!;
    expect(c.floor).toBeCloseTo(8.5);
    expect(c.median).toBeCloseTo(12);
    expect(c.ceiling).toBeCloseTo(18);
    expect(c.startable).toBe(2); // 14 and 30 reach the WR line of 12
  });

  it('heat map uses last season until every defence has 4 games, and ranks by the chosen format', () => {
    const allowed = (season: number, defence: string, ppr: number, games: number): PointsAllowed => ({
      season, defence, defence_slug: defence, defence_name: defence, defence_short: defence, position: 'WR', games, std_per_game: ppr - 10, half_per_game: ppr - 5, ppr_per_game: ppr, ppr_rank: 0,
    });
    const up = [game({ game_id: 'u1', week: 5, home_score: null, away_score: null }), game({ game_id: 'u2', week: 6, home_franchise: 'MIA', away_franchise: 'T10', home_score: null, away_score: null })];
    const hm = buildHeatMap({
      season: 2026, teams: teams.slice(0, 2), upcoming: up, position: 'WR', format: 'ppr',
      allowedCurrent: [allowed(2026, 'NE', 40, 3), allowed(2026, 'MIA', 20, 3)],
      allowedPrevious: [allowed(2025, 'NE', 30, 17), allowed(2025, 'MIA', 36, 17), allowed(2025, 'T10', 25, 17)],
    });
    expect(hm.basisSeason).toBe(2025);
    const mia = hm.rows.find((r) => r.team.franchise === 'MIA')!;
    expect(mia.cells.map((c) => [c.opponent, c.perGame, c.rank])).toEqual([['NE', 30, 2], ['T10', 25, 3]]);
    const ne = hm.rows.find((r) => r.team.franchise === 'NE')!;
    expect(ne.cells[1].bye).toBe(true);
  });

  it('player sentence names the rank at the position in the chosen format', () => {
    const season = { player_id: 'p', player_slug: 'x', player_name: 'X', position: 'WR', season: 2026, team: 'MIA', team_slug: 'miami-dolphins', team_short: 'Dolphins', games: 4, completions: 0, attempts: 0, passing_yards: 0, passing_tds: 0, interceptions: 0, carries: 0, rushing_yards: 0, rushing_tds: 0, receptions: 20, targets: 30, receiving_yards: 300, receiving_tds: 2, fumbles_lost: 0, target_share: 0.25, fg_made: 0, fg_att: 0, pat_made: 0, pts_std: 42, pts_half: 52, pts_ppr: 62, ppg_std: 10.5, ppg_half: 13, ppg_ppr: 15.5, last3_ppg_std: 12, last3_ppg_half: 15, last3_ppg_ppr: 19, sd_ppr: 4, best_ppr: 22, last_week: 4 };
    const d = {
      player: { player_id: 'p', slug: 'x', name: 'Joe Example', position: 'WR', team: 'MIA', team_slug: 'miami-dolphins', team_name: 'Miami Dolphins', birth_date: null, height_in: null, weight_lb: null, college: null, rookie_season: null, draft_year: null, draft_round: null, draft_pick: null, jersey_number: null, status: 'ACT', years_exp: null },
      seasons: [season], weeks: [], weeksSeason: 2026, upcoming: [], allowedSeason: null,
      peers: [{ player_id: 'a', pts_std: 50, pts_half: 55, pts_ppr: 60 }, { player_id: 'p', pts_std: 42, pts_half: 52, pts_ppr: 62 }],
    };
    expect(positionRank(d, 'p', 'ppr')).toBe(1);
    expect(positionRank(d, 'p', 'std')).toBe(2);
    expect(playerSentence(d, 'ppr')).toBe('Joe Example has scored 62.0 PPR points in 4 games in 2026 (15.5 a game), the most among WRs. Over his last three games he averaged 19.0, up on his season average.');
  });
});

describe('NFL TV Guide rows (shared football layout)', () => {
  it('maps a game into the football guide shape, UK date and time, model and weekly-pick note', () => {
    const item = nflGuideItem(weekData.games[1], { game_id: 'b', predicted_at: '', p_home: 0.36, predicted_margin: -2, market_p_home: null });
    expect(item).toMatchObject({ kickoffDate: '2026-10-04', kickoffTime: '14:30', leagueName: 'NFL', competitionType: 'league', homeTeamName: 'Team 1-0', awayTeamName: 'Team 1-1', href: '/nfl/games/b' });
    expect(item.subtitle).toBe('Week 4 · Tottenham Hotspur Stadium · Model T11 64%');
    expect(item.offers.map((o) => o.channel ?? o.serviceProduct)).toEqual(['DAZN NFL Game Pass', 'Sky Sports NFL', '5']);
    const sunday = nflGuideItem(game({ kickoff_at: '2026-10-11T17:00:00Z', gameday: '2026-10-11' }));
    expect(sunday.note?.text).toContain('pick their Sunday games each week');
    expect(nflGuideItem(game({ game_type: 'DIV' })).competitionType).toBe('cup');
  });
});

describe('NFL model display', () => {
  it('labels the favoured side from a home-win probability', () => {
    expect(api.favourLabel({ home_franchise: 'KC', away_franchise: 'LV' }, 0.64)).toBe('KC 64%');
    expect(api.favourLabel({ home_franchise: 'KC', away_franchise: 'LV' }, 0.3)).toBe('LV 70%');
  });
});

describe('NFL journey', () => {
  it('uses the same page names as Football for the same jobs', () => {
    const football = THEMES.football.stages[0].links.map((l) => l.label);
    // Pages with no football counterpart are declared 'nfl-only' in layoutPairs.
    const nflOnly = new Set(LAYOUT_PAIRS.filter((p) => p.status === 'nfl-only').map((p) => p.label));
    const nfl = THEMES.nfl.stages[0].links.map((l) => l.label).filter((l) => !nflOnly.has(l));
    for (const label of nfl) expect(football).toContain(label);
    const fpl = THEMES.fpl.stages.flatMap((st) => st.links.map((l) => l.label));
    for (const label of THEMES.nfl.stages[1].links.map((l) => l.label)) expect(fpl).toContain(label);
  });
});

describe('NFL game page (head-to-head, form, prediction)', () => {
  // NE host MIA in week 6 of 2026. Earlier: three meetings and other games.
  const target = game({ game_id: '2026_06_MIA_NE', week: 6, gameday: '2026-10-18', kickoff_at: '2026-10-18T17:00:00Z', spread_line: 3 });
  const pool = [
    target,
    game({ game_id: '2025_02_NE_MIA', season: 2025, week: 2, gameday: '2025-09-14', home_franchise: 'MIA', home_slug: 'miami-dolphins', home_name: 'Miami Dolphins', home_short: 'Dolphins', away_franchise: 'NE', away_slug: 'new-england-patriots', away_name: 'New England Patriots', away_short: 'Patriots', home_score: 20, away_score: 31, spread_line: 1 }),
    game({ game_id: '2025_12_MIA_NE', season: 2025, week: 12, gameday: '2025-11-30', home_score: 17, away_score: 10, spread_line: 6 }),
    game({ game_id: '2026_01_MIA_NE', week: 1, gameday: '2026-09-13', home_score: 21, away_score: 24, spread_line: 2.5 }),
    // NE's other 2026 games.
    game({ game_id: '2026_02_NE_T10', week: 2, gameday: '2026-09-20', home_franchise: 'T10', home_slug: 'team-1-0', home_name: 'Team 1-0', home_short: 'T10', away_franchise: 'NE', away_slug: 'new-england-patriots', away_name: 'New England Patriots', away_short: 'Patriots', home_score: 14, away_score: 14, spread_line: -1 }),
    game({ game_id: '2026_03_T11_NE', week: 3, gameday: '2026-09-27', away_franchise: 'T11', away_slug: 'team-1-1', away_name: 'Team 1-1', away_short: 'T11', home_score: 30, away_score: 3, spread_line: 7 }),
    // After the target: never counted.
    game({ game_id: '2026_07_T11_NE', week: 7, gameday: '2026-10-25', away_franchise: 'T11', away_slug: 'team-1-1', away_name: 'Team 1-1', away_short: 'T11', home_score: 50, away_score: 0 }),
  ];
  const model = { game_id: target.game_id, predicted_at: '2026-10-12T06:00:00Z', p_home: 0.62, predicted_margin: 3.4, market_p_home: 0.6 };
  const preview = buildGamePreview(target, pool, model);

  it('counts only games before kick-off, most recent first', () => {
    expect(preview.meetings.map((g) => g.game_id)).toEqual(['2026_01_MIA_NE', '2025_12_MIA_NE', '2025_02_NE_MIA']);
    expect(preview.homeRecent.map((g) => g.game_id)).toEqual(['2026_03_T11_NE', '2026_02_NE_T10', '2026_01_MIA_NE', '2025_12_MIA_NE', '2025_02_NE_MIA']);
    expect(preview.awayRecent).toHaveLength(3);
  });

  it('head-to-head from the home side: record, at home, run, biggest wins, spread', () => {
    const h = headToHead(preview);
    expect(h).toMatchObject({ played: 3, homeWins: 2, awayWins: 1, ties: 0, since: 2025 });
    expect(h.atHome).toEqual({ played: 2, homeWins: 1, awayWins: 1, ties: 0 });
    expect(h.run).toEqual({ franchise: 'MIA', name: 'Miami Dolphins', length: 1 });
    expect(h.biggestHomeWin?.game_id).toBe('2025_02_NE_MIA');
    expect(h.biggestAwayWin?.game_id).toBe('2026_01_MIA_NE');
    // NE: covered as 1-pt road dogs (won by 11), covered -6 (won by 7), missed -2.5 (lost).
    expect(h.homeAts).toEqual({ cover: 2, miss: 1, push: 0 });
    expect(headToHeadSentence(preview, h)).toBe('New England Patriots lead 2–1 in 3 meetings since 2025.');
  });

  it('form and season so far, ties shown as T', () => {
    expect(formOf(preview.homeRecent, 'NE', 3).map((e) => `${e.letter} ${e.score}`)).toEqual(['W 30–3', 'T 14–14', 'L 21–24']);
    expect(seasonSoFar(preview.homeRecent, 'NE', 2026)).toMatchObject({ played: 3, won: 1, lost: 1, tied: 1, pointsFor: 65, pointsAgainst: 41 });
    expect(marginLabel(target, -2.04)).toBe('MIA by 2.0');
  });

  it('renders head-to-head, form, the model against the market and where to watch', async () => {
    render(
      <MemoryRouter initialEntries={['/nfl/games/2026_06_MIA_NE']}>
        <Routes>
          <Route path="/nfl/games/:gameId" element={<NflGamePage initialData={preview} />} />
        </Routes>
      </MemoryRouter>
    );
    await act(async () => {}); // the streaming-partners lookup settles
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Miami Dolphins at New England Patriots');
    expect(screen.getByText('Where to watch (UK)')).toBeInTheDocument();
    expect(screen.getByTestId('nfl-game-prediction').textContent).toContain('New England Patriots a 62.0% chance of winning and Miami Dolphins 38.0%, with a predicted margin of NE by 3.4');
    expect(screen.getByTestId('nfl-game-prediction').textContent).toContain('NE −3');
    expect(screen.getByTestId('nfl-h2h-record').textContent).toContain('New England Patriots lead 2–1');
    expect(screen.getByTestId('nfl-h2h-meetings').querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByTestId('nfl-season-so-far').textContent).toContain('1-1-1');
    expect(screen.getAllByTitle(/^T 14–14 at Team 1-0/)).toHaveLength(1);
    // Same tabs as Football's Head to Heads; Prediction first and showing.
    expect(screen.getAllByRole('button', { name: /^(Prediction|Head to Head|Home Team|Away Team)$/ }).map((b) => b.textContent)).toEqual(['Prediction', 'Head to Head', 'Home Team', 'Away Team']);
    expect(screen.getByTestId('nfl-game-prediction').hidden).toBe(false);
    expect(screen.getByTestId('nfl-tab-h2h').hidden).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Home Team' }));
    expect(screen.getByTestId('nfl-tab-home').hidden).toBe(false);
    expect(screen.getByTestId('nfl-game-prediction').hidden).toBe(true);
    // Who they played and the scores, linking to each game.
    const recent = screen.getByTestId('nfl-tab-home');
    expect(recent.textContent).toContain('Team 1-1');
    expect(recent.textContent).toContain('30–3');
    expect(recent.querySelector('a[href="/nfl/games/2026_03_T11_NE"]')).not.toBeNull();
    // The spread of likely results.
    expect(screen.getByTestId('nfl-margin-chart').textContent).toContain('NE win by');
    expect(screen.getByTestId('nfl-likeliest-margins').textContent).toMatch(/^Most likely exact margins: NE by 3/);
    expect(screen.getByTestId('nfl-cover-chance').textContent).toMatch(/New England Patriots are \d+\.\d% to cover the line \(NE −3\)/);
  });

  it('margin distribution: sums to 1, bunches on key numbers, agrees with the expected margin', () => {
    const d = marginDistribution(3);
    const total = [...d.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(d.get(3)!).toBeGreaterThan(2 * d.get(2)!);
    expect(d.get(7)!).toBeGreaterThan(d.get(8)!);
    expect(d.get(0)!).toBeLessThan(0.01);
    const homeWin = [...d.entries()].filter(([m]) => m > 0).reduce((a, [, p]) => a + p, 0);
    expect(homeWin).toBeGreaterThan(0.55);
    expect(homeWin).toBeLessThan(0.62);
    const b = marginBuckets(d);
    expect(b.map((x) => x.key)).toEqual(['away-15', 'away-8', 'away-4', 'away-1', 'tie', 'home-1', 'home-4', 'home-8', 'home-15']);
    expect(b.reduce((a, x) => a + x.p, 0)).toBeCloseTo(1, 6);
    expect(likeliestMargins(d)[0].margin).toBe(3);
    // A pick'em is symmetric; an away favourite's cover counts margins below the line.
    expect(favouriteCoverProb(marginDistribution(-6.5), -6.5)).toBeCloseTo(favouriteCoverProb(marginDistribution(6.5), 6.5), 6);
  });

  it('a played game says what the model predicted beforehand and who covered; server render has an event', () => {
    const played = buildGamePreview({ ...target, home_score: 27, away_score: 20 }, pool, model);
    const page = renderNflGamePage(played);
    expect(page.canonical).toBe('https://fixtureshark.com/nfl/games/2026_06_MIA_NE');
    expect(page.html).toContain('What the model predicted beforehand');
    expect(page.html).toContain('New England Patriots covered.');
    expect(page.html).toContain('The model’s favourite won.');
    expect(page.structuredData[0]).toMatchObject({ '@type': 'SportsEvent', name: 'Miami Dolphins at New England Patriots' });
    expect(gameSentence(played)).toBe('Miami Dolphins at New England Patriots, Week 6 of the 2026 season: New England Patriots won 27–20.');
  });
});

describe('NFL Road Trips and Pick My Team', () => {
  const rt = [
    // NE home at Gillette, MIA home at Hard Rock; NE plays at MIA, MIA plays in London; one late game.
    game({ game_id: 'r1', season: 2026, home_franchise: 'NE', away_franchise: 'MIA', stadium: 'Gillette Stadium', kickoff_at: '2026-10-04T17:00:00Z' }),
    game({ game_id: 'r2', season: 2026, home_franchise: 'MIA', home_name: 'Miami Dolphins', away_franchise: 'NE', away_name: 'New England Patriots', stadium: 'Hard Rock Stadium', kickoff_at: '2026-10-12T00:15:00Z' }),
    game({ game_id: 'r3', season: 2026, home_franchise: 'MIA', home_name: 'Miami Dolphins', away_franchise: 'NE', away_name: 'New England Patriots', stadium: 'Hard Rock Stadium', kickoff_at: '2026-10-19T17:00:00Z' }),
    game({ game_id: 'r4', season: 2026, home_franchise: 'MIA', home_name: 'Miami Dolphins', away_franchise: 'NE', away_name: 'New England Patriots', stadium: 'Wembley Stadium', neutral_site: true, kickoff_at: '2026-10-26T14:30:00Z' }),
    game({ game_id: 'r5', season: 2026, home_franchise: 'NE', away_franchise: 'MIA', stadium: 'Somewhere New', kickoff_at: '2026-11-01T18:00:00Z' }),
  ];
  const two = [teams[0], teams[1]];

  it('road miles: round trips from the home stadium, late UK kick-offs, abroad, unplaced venues', () => {
    expect(lateUk({ kickoff_at: '2026-10-12T00:15:00Z' })).toBe(true);
    expect(lateUk({ kickoff_at: '2026-10-04T17:00:00Z' })).toBe(false);
    const d = buildRoadTrips(2026, rt, two);
    const mia = d.teams.find((t) => t.franchise === 'MIA')!;
    const ne = d.teams.find((t) => t.franchise === 'NE')!;
    expect(mia.stadium).toBe('Hard Rock Stadium');
    const leg = milesBetween(STADIUMS['Hard Rock Stadium'], STADIUMS['Gillette Stadium']);
    const london = milesBetween(STADIUMS['Hard Rock Stadium'], STADIUMS['Wembley Stadium']);
    expect(mia.miles).toBe(Math.round(2 * leg + 2 * london));
    expect(ne.abroad).toEqual(['Wembley Stadium']);
    expect(mia.late).toBe(1);
    expect(d.unplaced).toEqual(['Somewhere New']);
    expect(d.teams[0].franchise).toBe(d.teams[0].miles >= d.teams[1].miles ? d.teams[0].franchise : '');
  });

  const pick = (franchise: string, won: number, lost: number, late: number, london: number, cold: boolean): PickerTeam => ({ franchise, name: franchise, slug: franchise.toLowerCase(), won, lost, tied: 0, recordSeason: 2025, late, london, cold });
  const field = [pick('JAX', 13, 4, 3, 15, false), pick('TEN', 3, 14, 0, 2, false), pick('BUF', 12, 5, 6, 2, true), pick('NYJ', 3, 14, 0, 3, true)];

  it('picker: each answer counts, London is capped, underdogs get bad teams', () => {
    expect(rankTeams(field, { q1: 'dog', q2: 'late', q3: 'yes', q4: 'warm' })[0].team.franchise).toBe('TEN');
    expect(rankTeams(field, { q1: 'win', q2: 'late', q3: 'no', q4: 'cold' })[0].team.franchise).toBe('BUF');
    expect(rankTeams(field, { q1: 'win', q2: 'early', q3: 'yes', q4: 'warm' })[0].team.franchise).toBe('JAX');
    expect(pickReasons(field[0], { q3: 'yes' }, 2026)).toContain("15 London games since 2007, this season's included");
    const built = buildPicker(2026, rt, rows2008.slice(0, 2).map((r) => ({ ...r, season: 2025 })), [rt[3]], two);
    expect(built.teams.find((t) => t.franchise === 'MIA')).toMatchObject({ london: 1, late: 1, cold: false, recordSeason: 2025 });
  });

  it('pages render from initial data and server-render with their story in the HTML', async () => {
    const d = buildRoadTrips(2026, rt, two);
    render(<MemoryRouter><NflRoadTripsPage initialData={d} /></MemoryRouter>);
    expect(screen.getByTestId('nfl-road-trips-story').textContent).toMatch(/travel furthest in 2026/);
    expect(screen.getByText('Not yet on the map: Somewhere New.')).toBeInTheDocument();
    const page = renderNflRoadTripsPage(d);
    expect(page.canonical).toBe('https://fixtureshark.com/nfl/road-trips');
    expect(page.html).toContain('Most miles');
    const picker = { season: 2026, teams: field };
    render(<MemoryRouter><NflPickMyTeamPage initialData={picker} /></MemoryRouter>);
    for (const label of ['Winners', 'Early evening, UK time', 'Yes', 'Sunshine or a roof']) fireEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getByTestId('nfl-pick-result').textContent).toContain('JAX');
    expect(renderNflPickPage(picker).html).toContain('Pick My Team');
  });
});

describe('NFL Player Scout club filter', () => {
  const row = (id: string, name: string, slug: string, short: string, ppr: number) => ({
    player_id: id, player_slug: id, player_name: name, position: 'WR', season: 2025, team: short, team_slug: slug, team_short: short, games: 17,
    completions: 0, attempts: 0, passing_yards: 0, passing_tds: 0, interceptions: 0, carries: 0, rushing_yards: 0, rushing_tds: 0,
    receptions: 0, targets: 0, receiving_yards: 0, receiving_tds: 0, fumbles_lost: 0, target_share: null, fg_made: 0, fg_att: 0, pat_made: 0,
    pts_std: ppr, pts_half: ppr, pts_ppr: ppr, ppg_std: ppr / 17, ppg_half: ppr / 17, ppg_ppr: ppr / 17,
    last3_ppg_std: null, last3_ppg_half: null, last3_ppg_ppr: null, sd_ppr: null, best_ppr: null, last_week: 18,
  });
  it('filters by club from the URL and the dropdown, and the summary names the club', async () => {
    (fantasyApi as unknown as Record<string, ReturnType<typeof vi.fn>>).loadPlayerScout.mockResolvedValue({
      season: 2025, seasons: [2025],
      rows: [row('a', 'Bear One', 'chicago-bears', 'Bears', 200), row('b', 'Lion One', 'detroit-lions', 'Lions', 250), row('c', 'Bear Two', 'chicago-bears', 'Bears', 100)],
    });
    render(<MemoryRouter initialEntries={['/nfl/players?team=chicago-bears']}><Routes><Route path="/nfl/players" element={<NflPlayersPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByTestId('nfl-scout-row')).toHaveLength(2));
    expect(screen.getByTestId('nfl-scout-summary').textContent).toMatch(/^2 Bears players/);
    const select = screen.getByTestId('nfl-scout-club') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['All clubs', 'Bears', 'Lions']);
    fireEvent.change(select, { target: { value: '' } });
    await waitFor(() => expect(screen.getAllByTestId('nfl-scout-row')).toHaveLength(3));
    expect(screen.getAllByTestId('nfl-scout-row')[0].textContent).toContain('Lion One');
  });
});
