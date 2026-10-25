// ============================================================================
// src/lib/popularTools.ts
//
// "Most useful tools": the hand-picked row on the home page (/) and the two
// section hubs (/football, /fpl/start). Chris, 25 Oct 2026: the site has
// some very good tools that get lost in it. One list, in order; each hub
// shows the whole row, its own section's tools first.
//
// To add a tool, add an entry here. `section` decides which hub puts it first.
// ============================================================================

export type PopularTool = {
  id: string;
  label: string;
  to: string;
  /** One line, shown under the label. */
  blurb: string;
  section: 'fpl' | 'football';
};

export const POPULAR_TOOLS: PopularTool[] = [
  { id: 'rate-my-team', label: 'Rate My Team', to: '/fpl/rate-my-team', blurb: 'Your squad’s projected points and a transfer plan.', section: 'fpl' },
  { id: 'player-points', label: 'Player Points', to: '/fpl/player-points', blurb: 'Every player’s projected points, any gameweek range.', section: 'fpl' },
  // No captaincy page of its own: each Thursday preview has the captaincy table.
  { id: 'captaincy', label: 'Captaincy', to: '/fpl/gameweek', blurb: 'Who to captain, in each gameweek preview.', section: 'fpl' },
  { id: 'price-changes', label: 'Price Changes', to: '/fpl/price-risk', blurb: 'Who is about to rise or fall tonight.', section: 'fpl' },
  { id: 'injuries', label: 'Injuries', to: '/fpl/injuries', blurb: 'Every flagged player, most-owned first.', section: 'fpl' },
  { id: 'optimal-squad', label: 'Optimal Squad', to: '/fpl/optimal-squad', blurb: 'The best 15 the model can pick for your budget.', section: 'fpl' },
  // FPL Fixtures: add once /fpl/fixtures is on main.
  // { id: 'fpl-fixtures', label: 'FPL Fixtures', to: '/fpl/fixtures', blurb: 'Every gameweek’s fixtures and difficulty.', section: 'fpl' },
  { id: 'league-table', label: 'League Table', to: '/table', blurb: 'Standings from results, deductions included.', section: 'football' },
  { id: 'match-predictions', label: 'Match Predictions', to: '/football/projections', blurb: 'Predicted scorelines for every upcoming game.', section: 'football' },
];

/** The row for a page: its own section's tools first, order kept within each. */
export function toolsFor(section?: PopularTool['section']): PopularTool[] {
  if (!section) return POPULAR_TOOLS;
  return [...POPULAR_TOOLS.filter((t) => t.section === section), ...POPULAR_TOOLS.filter((t) => t.section !== section)];
}
