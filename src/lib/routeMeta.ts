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

import { COVERAGE } from './dataCoverage';

export type RouteMeta = {
  path: string;
  title: string;
  description: string;
  /** Breadcrumb trail, for JSON-LD. Omitted for the landing page. */
  crumbs?: { name: string; path: string }[];
};

const FOOTBALL = { name: 'Football', path: '/football' };
const FPL = { name: 'Fantasy Premier League', path: '/fpl/start' };
const NFL = { name: 'NFL', path: '/nfl' };
const TENNIS = { name: 'Tennis', path: '/tennis' };
const INTERNATIONAL = { name: 'International', path: '/international' };
const WOMEN_INTL = { name: 'Women', path: '/international/women' };

export const STATIC_ROUTES: RouteMeta[] = [
  {
    path: '/',
    // Kept under ~55 chars so the brand suffix still fits inside
    // Google's ~70-char display limit rather than being cut off.
    title: 'Football, FPL, NFL and tennis: results and predictions',
    description:
      'Football results, tables and model predictions, international football since 1872, Fantasy Premier League projections, club finances, the NFL and tennis.',
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
    path: '/football/countries-compared',
    title: 'Country Insights \u2014 top flights compared',
    description: 'Goals, home advantage, draws and cards compared across the top division of every country on the site.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/fixtures/changes',
    title: 'Fixture changes: kick-off moves in the last 30 days',
    description: 'Every fixture whose kick-off date or time has changed in the last 30 days: TV picks, postponements and rearrangements, from where it was to where it is now.',
    crumbs: [FOOTBALL, { name: 'Fixtures', path: '/fixtures' }],
  },
  {
    path: '/football/leagues',
    title: 'Leagues: every season, final table and champion',
    description: 'Final tables, champions and season statistics for the English leagues since 1992/93 and 18 European top flights.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/football/records',
    title: 'Football records: most points, longest runs, biggest wins',
    description: 'Record books for the English leagues since 1992/93 and 18 European top flights: points, goals, title margins, biggest wins and the longest winning, unbeaten and losing runs.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/football/history',
    title: 'Position Tracking: when does the league table become real?',
    description:
      'How far clubs still move after every match of the season, from every complete season since 1992: the Premier League, Championship, League One, League Two and National League.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/football/history/what-happened-next',
    title: 'What happened next? Where teams in any position finished',
    description:
      'Pick a position or points total after any number of matches and see where every team in that spot went on to finish: champions, top four, relegated.',
    crumbs: [FOOTBALL, { name: 'Position Tracking', path: '/football/history' }],
  },
  {
    path: '/football/history/trends',
    title: 'Historic Trends: how the Premier League has changed',
    description: 'Goals per game, home advantage, draws, title and relegation thresholds and competitive balance, season by season since 1992/93, for every league on file.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/football/history/scorelines',
    title: 'Score Explore: how often every score happens',
    description: 'How often each scoreline happens in every league on file, for any span of seasons or from one club\u2019s side, home or away.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/football/history/pace',
    title: 'Historic pace \u2014 this season against every champion',
    description:
      'Each club\u2019s points after every match this season against where every champion and relegated side stood at the same stage.',
    crumbs: [FOOTBALL, { name: 'Position Tracking', path: '/football/history' }],
  },
  {
    path: '/football/leagues-compared',
    title: 'League Insights \u2014 the English divisions compared',
    description:
      `Goals, home advantage, draws and cards compared across all five English divisions, every season since ${COVERAGE.englandLeagueFrom}.`,
    crumbs: [FOOTBALL],
  },
  {
    path: '/football/model-returns',
    title: 'Model returns',
    description:
      "What FixtureShark's predictions would have returned as bets, against real bookmaker prices, at whatever edge you choose.",
    crumbs: [FOOTBALL],
  },
  {
    path: '/football/model-scorecard',
    title: 'Model scorecard',
    description:
      "How FixtureShark's match forecasts compare with the betting market's closing prices, by division, season and type of team.",
    crumbs: [FOOTBALL],
  },
  {
    path: '/football/model-accuracy',
    title: 'How accurate is the model?',
    description:
      'An honest record of how the Dixon-Coles predictions have performed against real results: calibration, hit rate, and the baselines worth beating.',
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
    path: '/football/projections',
    title: 'Results Projections',
    description:
      'Predicted scorelines for upcoming fixtures across the English divisions, from a Dixon-Coles model fitted on real results.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/tv-guide',
    title: 'TV Guide',
    description: 'Upcoming football fixtures confirmed for UK TV or streaming, with the model\u2019s expected goals for each.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/affiliate-disclosure',
    title: 'Affiliate Disclosure',
    description: 'How FixtureShark uses affiliate links, and what that does and does not affect.',
    crumbs: [],
  },
  {
    path: '/preview',
    title: 'Head to Heads \u2014 compare any two teams',
    description: 'Pick any two teams for a head-to-head comparison and a Dixon-Coles prediction.',
    crumbs: [FOOTBALL],
  },
  {
    path: '/fpl/minutes',
    title: 'Minutes Outlook \u2014 who plays over the next 10 gameweeks',
    description:
      'Each club\u2019s players gameweek by gameweek: projected start chance and minutes, with injuries, return dates and doubts, so you can see who loses their place when a first-choice player returns.',
    crumbs: [FPL],
  },
  {
    path: '/fpl/line-ups',
    title: 'Starting lineups \u2014 predicted XI by club',
    description:
      'The XI the model expects each club to start, by tactical role and depth, with injuries and suspensions accounted for.',
    crumbs: [FPL],
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
    title: 'Match Projections \u2014 FPL projected returns',
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
    path: '/fpl/price-risk',
    title: 'Bullpit \u2014 FPL price change risk',
    description:
      'Which Fantasy Premier League players are under the most transfer pressure to rise or fall in price.',
    crumbs: [FPL],
  },
  {
    path: '/fpl/player-scout',
    title: 'Player Scout \u2014 every FPL player\u2019s history',
    description:
      'Search any Fantasy Premier League player and see their season-by-season points, price, returns and form.',
    crumbs: [FPL],
  },
  {
    path: '/fpl/season-xi',
    title: 'The perfect FPL XI of 2025/26',
    description:
      'The highest-scoring Fantasy Premier League XI you could have picked before a ball was kicked in 2025/26 and never changed, at start-of-season prices.',
    crumbs: [FPL],
  },
  {
    path: '/fpl/in-the-papers',
    title: 'In the papers \u2014 this gameweek\u2019s FPL news',
    description:
      'Fantasy Premier League price rises and falls, availability news and ownership swings, kept for the whole gameweek, plus the seven-day transfer window.',
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
    path: '/fpl/model-xi',
    title: 'Model XI accuracy',
    description:
      "How the eleven the model rated highest each gameweek actually scored, against its own forecast and the week's best possible XI.",
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
    title: 'Player Projections \u2014 every FPL player, sortable',
    description: 'Every Fantasy Premier League player, sortable, across any gameweek range.',
    crumbs: [FPL],
  },
  {
    path: '/fpl/optimal-squad',
    title: 'FPL Optimiser \u2014 the best squad under budget',
    description:
      'Builds the highest-projected Fantasy Premier League squad within budget and squad rules, from the model\u2019s own player projections.',
    crumbs: [FPL],
  },
  {
    path: '/fpl/rate-my-team',
    title: 'FPL Rate My Team (RMT) \u2014 your squad against the model',
    description:
      'Rate my team: enter your FPL ID for your squad\u2019s projected points over the next 10 gameweeks, the model\u2019s best squad at your budget, and a transfer plan.',
    crumbs: [FPL],
  },
  {
    path: '/fpl/optimal-squad-so-far',
    title: 'Squad of the Season \u2014 the best XV with hindsight',
    description:
      'The highest-scoring Fantasy Premier League squad it was possible to build this season, and how close the model came to it.',
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
  {
    path: '/nfl',
    title: 'NFL \u2014 results, standings, UK TV and fantasy stats',
    description: 'Every NFL result since 2002, how to watch every game in the UK, the standings and the story of each season, and player stats for fantasy.',
  },
  {
    path: '/nfl/discover',
    title: 'Discover \u2014 NFL',
    description: 'Everything that has actually happened in the NFL since 2002: every game, how to watch in the UK, the standings, each team and the story of every season.',
    crumbs: [NFL],
  },
  {
    path: '/nfl/predict',
    title: 'Predict \u2014 NFL',
    description: 'Projected fantasy points for every NFL player\u2019s next game, how well the projections test, and which defences give up the most to each position.',
    crumbs: [NFL],
  },
  {
    path: '/nfl/tv-guide',
    title: 'NFL TV guide: how to watch every game in the UK',
    description: 'Every NFL game in the next two weeks in UK time, with where to watch it live in the UK: Sky Sports, 5 (free) and DAZN NFL Game Pass.',
    crumbs: [NFL],
  },
  {
    path: '/nfl/snap-outlook',
    title: 'NFL Snap Outlook: who plays, and how much',
    description: 'Every NFL team\u2019s quarterbacks, running backs, receivers and tight ends: share of snaps each game, who is gaining or losing playing time, the depth chart and the injury report.',
    crumbs: [NFL],
  },
  {
    path: '/nfl/match-projections',
    title: 'NFL Match Projections: this week\u2019s fantasy match-ups',
    description: 'Every NFL game this week as a fantasy match-up: expected points, each team\u2019s projected fantasy line-up, and whether it scores through its running backs or its receivers.',
    crumbs: [NFL],
  },
  {
    path: '/nfl/player-projections',
    title: 'NFL Player Projections: projected fantasy points this week',
    description: 'Projected fantasy points for every NFL quarterback, running back, receiver, tight end and kicker in their next game, in PPR, half-PPR and standard scoring, with the range, matchup and injury status.',
    crumbs: [NFL],
  },
  {
    path: '/nfl/players',
    title: 'NFL Player Scout: fantasy points and stats for every player',
    description: 'Every NFL quarterback, running back, receiver, tight end and kicker: fantasy points in PPR, half-PPR and standard scoring, per game, recent form and usage.',
    crumbs: [NFL],
  },
  {
    path: '/nfl/fixture-heat-map',
    title: 'NFL fantasy fixture heat map: kindest and toughest matchups',
    description: 'Every NFL team\u2019s next six games coloured by how many fantasy points each opponent gives up to each position.',
    crumbs: [NFL],
  },
  {
    path: '/tennis',
    title: 'Tennis \u2014 ATP and WTA results, players and seasons',
    description: 'Every ATP result since 2000 and every WTA result since 2007: day by day, player by player and season by season.',
  },
  {
    path: '/tennis/discover',
    title: 'Discover \u2014 Tennis',
    description: 'Every tour-level result with rankings and the pre-match favourite, each player\u2019s record and titles, and the story of every season.',
    crumbs: [TENNIS],
  },
  {
    path: '/international',
    title: 'International football \u2014 every result since 1872, nations and tournaments',
    description: 'Every men\u2019s international since 1872 and every women\u2019s since 1956: results and fixtures, every nation\u2019s record and rating, and every World Cup, Euro and Nations League.',
  },
  {
    path: '/international/discover',
    title: 'Discover \u2014 International football',
    description: 'Every international since 1872 with the favourite on the day, each nation\u2019s record, rating and tournament history, and every World Cup, Euro and Nations League.',
    crumbs: [INTERNATIONAL],
  },
  {
    path: '/international/fixtures',
    title: 'International results and fixtures, day by day',
    description: 'Every men\u2019s international since 1872, day by day: results with the favourite and the upsets, and the coming Nations League fixtures.',
    crumbs: [INTERNATIONAL],
  },
  {
    path: '/international/tv-guide',
    title: 'Internationals on TV \u2014 UK Watch Guide',
    description: 'Coming internationals in UK time, with how to watch them live in the UK: ITV for England, the BBC for Scotland, Wales and Northern Ireland, Prime Video for the rest.',
    crumbs: [INTERNATIONAL],
  },
  {
    path: '/international/women/tv-guide',
    title: 'Women\u2019s internationals on TV \u2014 UK Watch Guide',
    description: 'Coming women\u2019s internationals in UK time, with how to watch them live in the UK: ITV for the Lionesses, the BBC for Scotland, Wales and Northern Ireland.',
    crumbs: [INTERNATIONAL, WOMEN_INTL],
  },
  {
    path: '/international/teams',
    title: 'International teams: every nation\u2019s rating, record and titles',
    description: 'Every national team\u2019s World Football Elo rating, all-time record and major titles, since 1872.',
    crumbs: [INTERNATIONAL],
  },
  {
    path: '/international/tournaments',
    title: 'International tournaments: World Cup, Euro, Copa Am\u00e9rica, AFCON and more',
    description: 'Every World Cup, Euro, Copa Am\u00e9rica, Africa Cup of Nations, Asian Cup, Gold Cup, Nations League and Confederations Cup: winners, hosts, groups, knockouts and scorers.',
    crumbs: [INTERNATIONAL],
  },
  {
    path: '/international/clubs',
    title: 'Where the internationals play: club call-ups for every national squad',
    description: 'Which clubs and leagues supply the most players to national teams, how many of each squad play abroad, and how strong their clubs are.',
    crumbs: [INTERNATIONAL],
  },
  {
    path: '/international/history',
    title: 'International football through time: the Elo race since 1872',
    description: 'The world\u2019s top ten national teams year by year since 1872, every world number one, and the biggest upsets at the major tournaments.',
    crumbs: [INTERNATIONAL],
  },
  // Women's side (Oct 2026): the same pages under /international/women. Titles
  // match the pages' (sideTitle in src/lib/intlStats.ts adds the suffix).
  {
    path: '/international/women',
    title: 'Women\u2019s international football \u2014 results since 1956, nations and tournaments',
    description: 'Every women\u2019s international since 1956: results and fixtures with the favourite on the day, every nation\u2019s record and rating, and every Women\u2019s World Cup, Olympic tournament, Euro, Copa Am\u00e9rica, WAFCON, Asian Cup and Nations League.',
    crumbs: [INTERNATIONAL],
  },
  {
    path: '/international/women/fixtures',
    title: 'International results and fixtures, day by day \u2014 women\u2019s football',
    description: 'Every women\u2019s international since 1956, day by day: results with the favourite on the day and the upsets.',
    crumbs: [INTERNATIONAL, WOMEN_INTL],
  },
  {
    path: '/international/women/teams',
    title: 'International teams: every nation\u2019s rating, record and titles \u2014 women\u2019s football',
    description: 'Every women\u2019s national team\u2019s Elo rating, all-time record and major titles \u2014 World Cups, Olympics, continental championships and Nations Leagues \u2014 since 1956.',
    crumbs: [INTERNATIONAL, WOMEN_INTL],
  },
  {
    path: '/international/women/tournaments',
    title: 'International tournaments: World Cup, Olympics, Euro and more \u2014 women\u2019s football',
    description: 'Every Women\u2019s World Cup, Olympics, Euro, Copa Am\u00e9rica, WAFCON, Asian Cup, CONCACAF W Championship and Nations League: winners, hosts, groups and knockouts.',
    crumbs: [INTERNATIONAL, WOMEN_INTL],
  },
  {
    path: '/international/women/clubs',
    title: 'Where the internationals play: club call-ups for every national squad \u2014 women\u2019s football',
    description: 'Which clubs and leagues supply the most players to women\u2019s national teams, and how many of each squad play abroad.',
    crumbs: [INTERNATIONAL, WOMEN_INTL],
  },
  {
    path: '/international/women/history',
    title: 'International football through time: the Elo race since 1956, world number ones and the biggest upsets \u2014 women\u2019s football',
    description: 'The world\u2019s top ten women\u2019s national teams year by year since 1956, every world number one, and the biggest upsets at the major tournaments.',
    crumbs: [INTERNATIONAL, WOMEN_INTL],
  },
];
