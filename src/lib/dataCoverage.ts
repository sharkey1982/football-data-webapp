// ============================================================================
// src/lib/dataCoverage.ts
//
// What the match archive covers, in one place for copy that states it (the
// footer, page descriptions). First seasons only: every league runs to the
// current season, so nothing here needs changing when a season rolls over.
// Change it when a history load extends coverage (docs/history-backfill.md).
// Pages that can compute coverage from their own data do so instead.
// ============================================================================

export const COVERAGE = {
  /** Premier League and EFL (tiers 1-4). */
  englandLeagueFrom: '1992/93',
  /** National League (tier 5). */
  nationalLeagueFrom: '2004/05',
  /** Spain, Germany, Italy, France. */
  bigFourFrom: '2011/12',
  /** The other top flights. */
  otherTopFlightsFrom: '2016/17',
  /** Top flights other than England's Premier League. */
  otherTopFlights: 18,
  sources: ['football-data.co.uk', 'engsoccerdata'],
} as const;

/** 'Results from football-data.co.uk and engsoccerdata · England from 1992/93 · 18 other top flights from 2011/12 or 2016/17' */
export const FOOTER_COVERAGE =
  `Results from ${COVERAGE.sources.join(' and ')} · England from ${COVERAGE.englandLeagueFrom} · ` +
  `${COVERAGE.otherTopFlights} other top flights from ${COVERAGE.bigFourFrom} or ${COVERAGE.otherTopFlightsFrom}`;
