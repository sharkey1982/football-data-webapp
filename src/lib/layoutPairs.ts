// ============================================================================
// src/lib/layoutPairs.ts
//
// Page layouts kept consistent across sports (Chris, 4 Oct 2026). Every NFL
// page that does the same job as a Football or Fantasy page is paired with
// it here, with the shared components BOTH must render. The rule:
//
//   * 'shared'   -- the page body is one shared component; each page only
//                   loads its data and passes the words. They cannot drift.
//   * 'partial'  -- some pieces are shared (listed); the rest is per sport.
//   * 'separate' -- not shared yet. These are the to-do list.
//   * 'nfl-only' -- no Football counterpart yet (footballFile null); the
//                   note says what would pair with it.
//
// src/__tests__/layoutPairs.test.ts fails if a listed shared component stops
// being used by either page, or if an NFL menu page is missing from this
// list -- so a new page can't be added without deciding how it matches.
// ============================================================================

export type LayoutStatus = 'shared' | 'partial' | 'separate' | 'nfl-only';

export type LayoutPair = {
  /** The page name both menus use. */
  label: string;
  /** NFL route (as in journey.ts). */
  nflPath: string;
  /** Source files, from the repo root. */
  footballFile: string | null;
  nflFile: string;
  /** Components both files must import. */
  shared: string[];
  status: LayoutStatus;
  note: string;
};

export const LAYOUT_PAIRS: LayoutPair[] = [
  {
    label: 'Hub',
    nflPath: '/nfl',
    footballFile: 'src/pages/FootballHub.tsx',
    nflFile: 'src/pages/nfl/NflHub.tsx',
    shared: ['ThemeHub'],
    status: 'shared',
    note: 'Both render ThemeHub from the journey config.',
  },
  {
    label: 'TV Guide',
    nflPath: '/nfl/tv-guide',
    footballFile: 'src/pages/football/TvGuidePage.tsx',
    nflFile: 'src/pages/nfl/NflTvGuidePage.tsx',
    shared: ['WatchGuideView'],
    status: 'shared',
    note: 'One layout: quick filters, service/competition/team pickers, calendar, day groups, WatchOptions.',
  },
  {
    label: 'Fixtures & Results',
    nflPath: '/nfl/fixtures',
    footballFile: 'src/pages/GameweekBrowser.tsx',
    nflFile: 'src/pages/nfl/NflFixturesPage.tsx',
    shared: ['FixtureCalendarHeatmap'],
    status: 'partial',
    note: 'Calendar shared. The football page is a 1,200-line browser with division/team modes; the NFL page is one week of games.',
  },
  {
    label: 'Match page',
    nflPath: '/nfl/games/:gameId',
    footballFile: 'src/pages/football/MatchPage.tsx',
    nflFile: 'src/pages/nfl/NflGamePage.tsx',
    shared: ['WatchOptions'],
    status: 'partial',
    note: 'Same order: header, where to watch (shared WatchOptions), result, prediction table (model v betting market).',
  },
  {
    label: 'Head to Heads (form and head-to-head)',
    nflPath: '/nfl/games/:gameId',
    footballFile: 'src/pages/MatchPreview.tsx',
    nflFile: 'src/pages/nfl/NflGamePage.tsx',
    shared: ['ComparisonCard'],
    status: 'partial',
    note: 'The game page carries the preview overview: the shared form/prediction card, then head-to-head record and last meetings in the same cards. NFL head-to-head is per franchise since 2002.',
  },
  {
    label: 'League Table',
    nflPath: '/nfl/table',
    footballFile: 'src/pages/LeagueTable.tsx',
    nflFile: 'src/pages/nfl/NflTablePage.tsx',
    shared: [],
    status: 'separate',
    note: 'Different shapes: one football table (P W D L GD Pts) v eight NFL division tables (W L T Pct).',
  },
  {
    label: 'Your Team',
    nflPath: '/nfl/teams',
    footballFile: 'src/pages/TeamExplorer.tsx',
    nflFile: 'src/pages/nfl/NflTeamsPage.tsx',
    shared: [],
    status: 'separate',
    note: 'Football picks a team inside one page; NFL lists the 32 and links to team pages.',
  },
  {
    label: 'Past seasons',
    nflPath: '/nfl/seasons',
    footballFile: 'src/pages/football/LeaguesPage.tsx',
    nflFile: 'src/pages/nfl/NflSeasonsPage.tsx',
    shared: [],
    status: 'separate',
    note: 'Season pages follow the football league-season page section by section (story, table, season in numbers) but are separate code.',
  },
  {
    label: 'Player Scout',
    nflPath: '/nfl/players',
    footballFile: 'src/pages/fpl/PlayerScoutPage.tsx',
    nflFile: 'src/pages/nfl/NflPlayersPage.tsx',
    shared: [],
    status: 'separate',
    note: 'Different stats per sport.',
  },
  {
    label: 'Fixture Heat Map',
    nflPath: '/nfl/fixture-heat-map',
    footballFile: 'src/pages/FantasyFixtures.tsx',
    nflFile: 'src/pages/nfl/NflHeatMapPage.tsx',
    shared: [],
    status: 'separate',
    note: 'Candidate to share: both are team x upcoming-week grids coloured by difficulty.',
  },
  {
    label: 'Scoring Rules',
    nflPath: '/nfl/scoring-rules',
    footballFile: 'src/pages/fpl/ScoringRulesPage.tsx',
    nflFile: 'src/pages/nfl/NflScoringRulesPage.tsx',
    shared: [],
    status: 'separate',
    note: 'Static rule tables.',
  },
  {
    label: 'Road Trips',
    nflPath: '/nfl/road-trips',
    footballFile: null,
    nflFile: 'src/pages/nfl/NflRoadTripsPage.tsx',
    shared: [],
    status: 'nfl-only',
    note: 'Pairs with a Football away-travel or Your Local Clubs map once club ground locations exist.',
  },
  {
    label: 'Pick My Team',
    nflPath: '/nfl/pick-my-team',
    footballFile: null,
    nflFile: 'src/pages/nfl/NflPickMyTeamPage.tsx',
    shared: [],
    status: 'nfl-only',
    note: 'Football gets a postcode finder (Your Local Clubs) instead: you support your local club.',
  },
];
