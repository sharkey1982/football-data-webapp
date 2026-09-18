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

export type StageKey = 'discover' | 'predict' | 'validate' | 'configure';
export type ThemeKey = 'football' | 'fpl';

export type JourneyLink = {
  label: string;
  to: string;
  /** One line on the stage page -- why you'd open this, not what it is. */
  blurb?: string;
};

export type JourneyStage = {
  key: StageKey;
  number: string;
  title: string;
  /** Deliberately short: this is all the hub box shows, and four boxes
   * have to fit one phone screen. The fuller explanation belongs on the
   * stage page. */
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
    intro: "Browse what's real, see what's predicted, check how it held up, then adjust the model yourself.",
    stages: [
      {
        key: 'discover',
        number: '01',
        title: 'Discover',
        tagline: 'Results, tables, teams.',
        intro:
          "Every match by division or by team, with what's already happened and what's coming up next. No model involved \u2014 just the record.",
        links: [
          { label: 'Fixtures & Results', to: '/fixtures', blurb: 'Every match, filterable by division, season and team.' },
          { label: 'League Table', to: '/table', blurb: 'Standings computed from results, including point deductions.' },
          { label: 'Team Explorer', to: '/teams', blurb: 'One club at a time \u2014 form, history and head-to-head.' },
        ],
      },
      {
        key: 'predict',
        number: '02',
        title: 'Predict',
        tagline: 'Scorelines and ratings.',
        intro:
          "Forecasts from a Dixon-Coles model fitted on real results: a predicted scoreline for every upcoming fixture, built from each team's own attack and defence ratings.",
        links: [
          { label: 'Match Preview', to: '/preview', blurb: 'Pick any two teams for a full head-to-head and prediction.' },
          { label: 'Team Strength', to: '/team-strength', blurb: 'Every club\u2019s attack and defence rating, as expected goals.' },
        ],
      },
      {
        key: 'validate',
        number: '03',
        title: 'Validate',
        tagline: 'How good were we?',
        intro:
          'Comparing forecasts to what actually happened, to see how reliable the model has been and flag where it missed.',
        note: 'A dedicated page for this is planned. For now, Team Strength\u2019s own projected-vs-actual columns are the closest thing.',
        links: [{ label: 'Projected vs Actual', to: '/team-strength', blurb: 'Per-team projected and actual points side by side.' }],
      },
      {
        key: 'configure',
        number: '04',
        title: 'Configure',
        tagline: 'Change the inputs.',
        intro:
          "Amend a team's rating when the model doesn't reflect something you know \u2014 an injury, a new signing \u2014 and every future fixture prediction regenerates from it.",
        links: [{ label: 'Adjust Ratings', to: '/team-strength', blurb: 'Override attack and defence, or reset back to the model.' }],
      },
    ],
  },
  fpl: {
    key: 'fpl',
    title: 'Fantasy Premier League',
    eyebrow: 'Full-Time \u00b7 Fantasy Premier League',
    hubPath: '/fpl/start',
    intro: "Browse the schedule and rules, see who's projected to score, check how that held up, then adjust the model.",
    stages: [
      {
        key: 'discover',
        number: '01',
        title: 'Discover',
        tagline: 'Fixtures and rules.',
        intro:
          'Every fixture by gameweek, plus the full Fantasy Premier League scoring rulebook. No projections yet \u2014 the schedule and the rules.',
        links: [
          { label: 'Match Projections', to: '/fpl', blurb: 'Browse gameweek by gameweek.' },
          { label: 'Scoring Rules', to: '/fpl/scoring-rules', blurb: 'Exactly how every point is earned.' },
        ],
      },
      {
        key: 'predict',
        number: '02',
        title: 'Predict',
        tagline: 'Points and squads.',
        intro:
          "Every player's projected points \u2014 factoring in form, fixtures and set-piece duty \u2014 plus an optimiser that picks the best XV under budget.",
        links: [
          { label: 'Player Points Table', to: '/fpl/player-points', blurb: 'Every player, sortable, across a gameweek range.' },
          { label: 'Optimal Squad', to: '/fpl/optimal-squad', blurb: 'The best squad the model can build under budget.' },
          { label: 'Fixture Heat Map', to: '/fantasy', blurb: 'Which teams have the kindest run of fixtures.' },
        ],
      },
      {
        key: 'validate',
        number: '03',
        title: 'Validate',
        tagline: 'Projected vs scored.',
        intro:
          'Comparing projections to what players actually scored \u2014 and, in hindsight, what the truly optimal squad would have been.',
        links: [
          { label: 'Actual Matches', to: '/fpl/actual-matches', blurb: 'Real returns next to what was projected.' },
          { label: 'Optimal Squad So Far', to: '/fpl/optimal-squad-so-far', blurb: 'The best possible squad with hindsight.' },
        ],
      },
      {
        key: 'configure',
        number: '04',
        title: 'Configure',
        tagline: 'Roles and set pieces.',
        intro:
          "Amend a team's set-piece takers or a player's role when the model doesn't reflect something you know, and every future projection regenerates from it.",
        links: [{ label: 'Tactical Roles', to: '/fpl/tactical-roles', blurb: 'Roles, depth and set-piece hierarchies by club.' }],
      },
    ],
  },
};

/** Path for a stage page, derived rather than written out, so the hub
 * boxes and the routes can never point at different places. */
export function stagePath(theme: JourneyTheme, stage: JourneyStage): string {
  return `${theme.hubPath}/${stage.key}`;
}
