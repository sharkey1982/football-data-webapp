// ============================================================================
// src/lib/journey.ts
//
// Single source of truth for the site's structure: two themes, each
// following Discover -> Predict -> Validate -> Configure.
//
// Everything that needs to know "what is this page, and where does it
// sit" reads from here -- the hub pages, the stage landing pages, and
// the back-links between them. Previously that knowledge was spread
// across the nav config, each hub's own STAGES array and the page
// components themselves, which is how they drifted (the nav said
// "Browse" while the hub said something else, and the back-to-hub link
// derived the theme from nav labels).
//
// Adding a page means adding one entry here.
// ============================================================================

export type StageKey = 'discover' | 'predict';
export type ThemeKey = 'football' | 'fpl';

export type JourneyLink = {
  label: string;
  to: string;
  /** One line on the stage page -- why you'd open this, not what it is. */
  blurb?: string;
  /** Route-matching hints, used for nav highlighting. They live here
   * rather than in the nav because they describe where the page sits in
   * the route tree, which is exactly what this file is for -- and
   * keeping them here is what stops the nav needing its own parallel
   * list that can drift. */
  exact?: boolean;
  matchPrefix?: string | string[];
  excludePrefix?: string | string[];
};

export type JourneyStage = {
  key: StageKey;
  title: string;
  /** Deliberately short: this is all the hub box shows. The fuller
   * explanation belongs on the stage page. */
  tagline: string;
  intro: string;
  links: JourneyLink[];
  /** Set when the stage has no dedicated page of its own yet -- shown
   * plainly rather than pretending an interim link is the real thing. */
  note?: string;
};

export type JourneyTheme = {
  key: ThemeKey;
  title: string;
  eyebrow: string;
  hubPath: string;
  intro: string;
  stages: JourneyStage[];
};

export const THEMES: Record<ThemeKey, JourneyTheme> = {
  football: {
    key: 'football',
    title: 'Football',
    eyebrow: 'Full-Time \u00b7 Football',
    hubPath: '/football',
    intro: 'What actually happened, and what the model expects next.',
    stages: [
      {
        key: 'discover',
        title: 'Discover',
        tagline: 'Results, tables, teams, the archive.',
        intro:
          "Everything that has actually happened. Every match by division or by team, the full archive, and how the divisions compare. No model involved \u2014 just the record.",
        links: [
          { label: 'Fixtures & Results', to: '/fixtures', blurb: 'Every match, filterable by division, season and team.', exact: true },
          { label: 'League Table', to: '/table', blurb: 'Standings computed from results, including point deductions.' },
          { label: 'Team Explorer', to: '/teams', blurb: 'One club at a time \u2014 form, history and head-to-head.', matchPrefix: ['/teams', '/football/teams'] },
          { label: 'Leagues Compared', to: '/football/leagues-compared', blurb: 'All five English divisions on one axis \u2014 goals, home advantage, cards.' },
          { label: 'Market Efficiency', to: '/football/market-efficiency', blurb: 'Where the betting market is priced sharply \u2014 and where it isn\u2019t.' },
          { label: 'Results Data', to: '/results-data', blurb: 'The full match archive, filterable and exportable.' },
        ],
      },
      {
        key: 'predict',
        title: 'Predict',
        tagline: 'Scorelines, ratings, and how well they hold up.',
        intro:
          "Forecasts from a Dixon-Coles model fitted on real results \u2014 and an honest account of how accurate they've been. A prediction is only worth reading next to its track record.",
        links: [
          { label: 'Match Preview', to: '/preview', blurb: 'Pick any two teams for a full head-to-head and prediction.' },
          { label: 'Team Strength', to: '/team-strength', blurb: 'Every club\u2019s attack and defence rating, with projected against actual.' },
        ],
      },
    ],
  },
  fpl: {
    key: 'fpl',
    title: 'Fantasy Premier League',
    eyebrow: 'Full-Time \u00b7 Fantasy Premier League',
    hubPath: '/fpl/start',
    intro: 'What has happened in the game, and who the model expects to score next.',
    stages: [
      {
        key: 'discover',
        title: 'Discover',
        tagline: 'Results, prices, ownership, rules.',
        intro:
          'What has actually happened: real gameweek returns, what players cost, who owns them, and exactly how points are earned. No projections here.',
        links: [
          { label: 'Gameweek Results', to: '/fpl/actual-matches', blurb: 'Real results and FPL returns for gameweeks already played.' },
          { label: 'Points Per Million', to: '/fpl/value', blurb: 'Who has actually returned the most for what they cost.' },
          { label: 'The FPL Market', to: '/fpl/market', blurb: 'Price risers and fallers, ownership swings and availability news.' },
          { label: 'Set-Piece Takers', to: '/fpl/set-pieces', blurb: 'Penalty, free-kick and corner duty for every club, ranked.' },
          { label: 'Injuries & Availability', to: '/fpl/injuries', blurb: 'Who\u2019s out, and how many fixtures each absence actually costs.' },
          { label: 'Scoring Rules', to: '/fpl/scoring-rules', blurb: 'Exactly how every point is earned.' },
        ],
      },
      {
        key: 'predict',
        title: 'Predict',
        tagline: 'Projections, squads, and how they scored.',
        intro:
          "Projected points for every player \u2014 form, fixtures and set-piece duty \u2014 an optimiser that picks the best XV under budget, and what the projections actually returned.",
        links: [
          { label: 'Match Projections', to: '/fpl', blurb: 'Projected returns, gameweek by gameweek.', exact: true },
          { label: 'Player Points Table', to: '/fpl/player-points', blurb: 'Every player, sortable, across a gameweek range.' },
          { label: 'Optimal Squad', to: '/fpl/optimal-squad', blurb: 'The best squad the model can build under budget.', excludePrefix: '/fpl/optimal-squad-so-far' },
          { label: 'Fixture Heat Map', to: '/fantasy', blurb: 'Which teams have the kindest run of fixtures.' },
          { label: 'Optimal Squad So Far', to: '/fpl/optimal-squad-so-far', blurb: 'The best possible squad with hindsight \u2014 how close the model got.' },
        ],
      },
    ],
  },
};

/** Path for a stage page, derived rather than written out, so the hub
 * boxes and the routes can never point at different places. */
export function stagePath(theme: JourneyTheme, stage: JourneyStage): string {
  return `${theme.hubPath}/${stage.key}`;
}
