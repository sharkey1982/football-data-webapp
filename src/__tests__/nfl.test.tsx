import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as api from '../lib/nflApi';
import NflHubPage from '../pages/nfl/NflHubPage';
import NflStandingsPage from '../pages/nfl/NflStandingsPage';
import NflTeamPage from '../pages/nfl/NflTeamPage';
import { renderNflHubPage, renderNflStandingsPage, renderNflTeamPage } from '../entry-server';

vi.mock('../lib/nflApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/nflApi');
  return { ...actual, loadNflWeek: vi.fn(), loadNflStandings: vi.fn(), loadNflTeam: vi.fn(), loadLatestNflSeason: vi.fn() };
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
const weekData = api.buildWeek(2026, api.seasonRange(2026), seasonGames, null, teams)!;

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
  it('hub shows the week with UK times, the neutral venue and the line', async () => {
    mocked.loadNflWeek.mockResolvedValue(weekData);
    render(
      <MemoryRouter initialEntries={['/nfl']}>
        <Routes><Route path="/nfl" element={<NflHubPage />} /></Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('nfl-week-story')).toBeTruthy());
    expect(mocked.loadNflWeek).toHaveBeenCalledWith(null, null);
    expect(screen.getByTestId('nfl-week-story').textContent).toContain('Neutral-site game: T11 v T10 at Tottenham Hotspur Stadium');
    expect(screen.getAllByTestId('nfl-game')).toHaveLength(2);
    expect(screen.getByText('Final (OT)')).toBeTruthy();
    expect(screen.getByText('Sun 4 Oct, 14:30')).toBeTruthy();
    expect(screen.getByText('Closing line: NE −3.5, O/U 44.5')).toBeTruthy();
  });

  it('hub reads season and week from the URL', async () => {
    mocked.loadNflWeek.mockResolvedValue(weekData);
    render(
      <MemoryRouter initialEntries={['/nfl?season=2025&week=19']}>
        <Routes><Route path="/nfl" element={<NflHubPage />} /></Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(mocked.loadNflWeek).toHaveBeenCalledWith(2025, 19));
  });

  it('standings list the bracket division winner first and toggle to a sortable league table', async () => {
    mocked.loadNflStandings.mockResolvedValue(standingsData);
    render(
      <MemoryRouter initialEntries={['/nfl/standings/2008']}>
        <Routes><Route path="/nfl/standings/:season" element={<NflStandingsPage />} /></Routes>
      </MemoryRouter>
    );
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

  it('standings 404 for a non-season segment', () => {
    render(
      <MemoryRouter initialEntries={['/nfl/standings/abc']}>
        <Routes><Route path="/nfl/standings/:season" element={<NflStandingsPage />} /></Routes>
      </MemoryRouter>
    );
    expect(mocked.loadNflStandings).not.toHaveBeenCalled();
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
    const hub = renderNflHubPage(weekData);
    expect(hub.html).toContain('Tottenham Hotspur Stadium');
    expect(hub.canonical).toBe('https://fixtureshark.com/nfl');
    const st = renderNflStandingsPage(standingsData);
    expect(st.html).toContain('Miami Dolphins');
    expect(st.title).toBe('2008 NFL standings | FixtureShark');
    expect(st.description).toContain('won the Super Bowl after the 2008 season');
    const team = renderNflTeamPage(api.buildTeam(teams[0], rows2008.filter((r) => r.franchise === 'MIA'), seasonGames, 2026));
    expect(team.canonical).toBe('https://fixtureshark.com/nfl/teams/miami-dolphins');
    expect(team.html).toContain('W 27-24 (OT)');
    expect(team.structuredData[0]).toMatchObject({ '@type': 'SportsTeam', name: 'Miami Dolphins' });
  });
});
