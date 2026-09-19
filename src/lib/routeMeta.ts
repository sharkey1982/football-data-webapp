// ============================================================================
// src/lib/routeMeta.ts
//
// Title, description and canonical path for every static public route.
//
// Exists because of a real regression: when the puppeteer prerenderer
// was removed, nothing replaced its coverage of the non-entity pages.
// Entity pages (players, matches, teams) kept being generated, but all
// 26 static and content pages fell back to the SPA shell -- every one
// serving the same generic shell <title>, no
// description and no canonical, while the sitemap advertised them as 26
// distinct URLs. Identical titles across a sitemap is worse than not
// listing the pages at all.
//
// One registry so the sitemap and the generator can't disagree about
// what exists, in the same spirit as journey.ts for the nav.
// ============================================================================

export type RouteMeta = {
  path: string;
  title: string;
  description: string;
  /** Breadcrumb trail, for JSON-LD. Omitted for the landing page. */
  crumbs?: { name: string; path: string }[];
};

const FOOTBALL = { name: 'Football', path: '/football' };
const FPL = { name: 'Fantasy Premier League', path: '/fpl/start' };

export const STATIC_ROUTES: RouteMeta[] = [
  {
    path: '/',
    title: 'Football results, predictions & Fantasy Premier League projections',
    description:
      'A Premier League and EFL archive with Dixon-Coles match predictions, Fantasy Premier League projections, and the model behind them.',
  },
  {
    path: '/football',
    title: 'Football — results, tables and match predictions',
    description:
      'Results and fixtures across five English divisions, league tables, team ratings and Dixon-Coles match predictions.',
  },
  {
    path: '/football/discover',
    title: 'Discover — results, tables and the archive',
    description: 'Every match by division or team, league tables, team histories and how the divisions compare.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/football/predict',
    title: 'Predict — match forecasts and team ratings',
    description: 'Dixon-Coles predictions for upcoming fixtures, team attack and defence ratings, and how they have held up.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/fixtures',
    title: 'Fixtures & results',
    description: 'Every fixture and result across the Premier League, Championship, League One, League Two and National League.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/table',
    title: 'League tables',
    description: 'Standings computed from results, including manual point adjustments, for every division and season.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/teams',
    title: 'Your Team \u2014 club form, history and head-to-head',
    description: 'Form, history and head-to-head records for every club in the archive.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/football/leagues-compared',
    title: 'League Insights \u2014 how the English divisions compare',
    description:
      'Goals, home advantage, draws and cards compared across all five English divisions, from 30,000+ matches.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/football/market-efficiency',
    title: 'How sharply is each division priced?',
    description:
      'Bookmaker margin and historical returns across the English pyramid, from closing odds on 17,800+ matches.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/results-data',
    title: 'Raw Data \u2014 the full match archive',
    description: 'The full curated match archive, filterable by division, season and team, and exportable.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/preview',
    title: 'Head to Heads \u2014 compare any two teams',
    description: 'Pick any two teams for a head-to-head comparison and a Dixon-Coles prediction.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/team-strength',
    title: 'Team strength ratings',
    description: "Every club's attack and defence rating as expected goals, with projected against actual points.",
    crumbs: [FOOTBALL],
  },
  {
    path: '/fpl/start',
    title: 'Fantasy Premier League — projections and tools',
    description:
      'Player point projections, an optimal-squad picker, set-piece duty, injuries and the model behind them.',
  },
  {
    path: '/fpl/start/discover',
    title: 'Discover — FPL results, prices and rules',
    description: 'Real gameweek returns, player prices and ownership, set-piece takers, injuries and the scoring rules.',
    crumbs: [FPL],
  },
  {
    path: '/fpl/start/predict',
    title: 'Predict — FPL projections and optimal squads',
    description: 'Projected points for every player, an optimiser under budget, and how the projections have scored.',
    crumbs: [FPL],
  },
  {
    path: '/fpl',
    title: 'Gameweek Projections \u2014 FPL projected returns',
    description: 'Projected Fantasy Premier League returns, gameweek by gameweek.',
    crumbs: [FPL],
  },
  {
    path: '/fpl/actual-matches',
    title: 'FPL gameweek results',
    description: 'Real results and Fantasy Premier League returns for gameweeks already played.',
    crumbs: [FPL],
  },
  {
    path: '/fpl/value',
    title: 'Bargain Basement \u2014 FPL points per million',
    description:
      'Which Fantasy Premier League players have returned the most points per million, with the goals, assists, clean sheets and bonus behind each figure.',
    crumbs: [FPL],
  },
  {
    path: '/fpl/market',
    title: 'Transfer Window \u2014 FPL prices and ownership',
    description: 'Price risers and fallers, ownership swings, transfers and availability news, updated daily.',
    crumbs: [FPL],
  },
  {
    path: '/fpl/set-pieces',
    title: 'Who takes the set pieces?',
    description:
      'Penalty, free-kick and corner takers for every Premier League club, ranked, with what each duty is historically worth.',
    crumbs: [FPL],
  },
  {
    path: '/fpl/injuries',
    title: 'Physio Room \u2014 FPL injuries and availability',
    description:
      'Who is injured, doubtful or suspended, with how many fixtures each absence actually costs.',
    crumbs: [FPL],
  },
  {
    path: '/fpl/team-of-the-week',
    title: 'FPL team of the week',
    description: 'The highest-scoring valid XI of the gameweek, and how it compares to what the model rated highest.',
    crumbs: [FPL],
  },
  {
    path: '/fpl/formations',
    title: "Managers' Dugout \u2014 where FPL goals come from",
    description:
      'Open-play and set-piece goals, assists and box touches by pitch position across Premier League formations.',
    crumbs: [FPL],
  },
  {
    path: '/fpl/player-points',
    title: 'FPL player points table',
    description: 'Every Fantasy Premier League player, sortable, across any gameweek range.',
    crumbs: [FPL],
  },
  {
    path: '/fpl/scoring-rules',
    title: 'FPL scoring rules',
    description: 'Exactly how every Fantasy Premier League point is earned.',
    crumbs: [FPL],
  },
  {
    path: '/fantasy',
    title: 'FPL fixture heat map',
    description: 'Which teams have the kindest run of upcoming fixtures.',
    crumbs: [FPL],
  },
];
