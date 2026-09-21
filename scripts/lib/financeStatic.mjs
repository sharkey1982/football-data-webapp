// ============================================================================
// scripts/lib/financeStatic.mjs
//
// Build-time club finance data, shared by generate-static.mjs (pages) and
// generate-sitemap.mjs (URLs). Separate from both so the bulk-fetch rule can
// be tested directly:
//
//   ONE query per public finance view for EVERY club, plus one for the teams
//   those rows reference -- five requests in total, however many clubs have
//   data. Never one request per club.
//
// A finance page is generated for any team appearing in
// finance_published_periods -- not only Premier League teams (Southend, the
// first club with data, is not in the Premier League).
// ============================================================================

/**
 * @param {(path: string) => Promise<any[] | null>} queryAll  paginated
 *        PostgREST fetch returning null on failure
 * @returns {Promise<null | {periods:any[],provenance:any[],derived:any[],dictionary:any[],teams:any[]}>}
 */
export async function fetchFinanceBulk(queryAll) {
  const [periods, provenance, derived, dictionary] = await Promise.all([
    queryAll('finance_published_periods?select=*&order=team_id.asc,period_end.asc'),
    queryAll('finance_published_provenance?select=*&order=team_id.asc,period_end.asc'),
    queryAll('finance_derived_metrics?select=*&order=team_id.asc,period_end.asc'),
    queryAll('finance_metric_dictionary?select=*&order=metric_key.asc'),
  ]);
  // Periods are the one view that must load: without them there is nothing
  // to publish. The others degrade (a page without provenance still renders
  // its figures, and says where sources are missing).
  if (!periods) return null;
  const ids = [...new Set(periods.map((r) => Number(r.team_id)))];
  const teams = ids.length ? await queryAll(`teams?select=team_id,slug,display_name&team_id=in.(${ids.join(',')})`) : [];
  return { periods, provenance: provenance ?? [], derived: derived ?? [], dictionary: dictionary ?? [], teams: teams ?? [] };
}

/**
 * Group the bulk rows into per-club page data using the SAME functions the
 * browser uses (exported from the SSR entry), so a figure cannot be
 * normalised one way at build time and another at runtime.
 * @param {ReturnType<typeof fetchFinanceBulk> extends Promise<infer T> ? NonNullable<T> : never} bulk
 * @param {any} entry  the built SSR entry module
 */
export function buildFinanceSite(bulk, entry) {
  const teams = bulk.teams
    .filter((t) => t && t.slug)
    .map((t) => ({ team_id: Number(t.team_id), slug: t.slug, display_name: t.display_name }));
  const grouped = entry.groupFinanceByTeam(
    teams,
    bulk.periods.map(entry.normalisePeriod),
    bulk.provenance.map(entry.normaliseProvenance),
    bulk.derived.map(entry.normaliseDerived),
    bulk.dictionary
  );
  const clubs = [...grouped.values()];
  return {
    clubs,
    index: entry.buildFinanceIndex(clubs),
    teamIds: new Set(grouped.keys()),
    // lastmod is the latest filing date: the page changes when accounts do.
    sitemap: clubs.map((d) => ({ path: `/football/teams/${d.team.slug}/finances`, lastmod: entry.latestFilingDate(d.periods) })),
  };
}
