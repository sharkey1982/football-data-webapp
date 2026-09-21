// ============================================================================
// src/entry-server.tsx
//
// Server-render entry for static generation. Built separately by Vite
// (`vite build --ssr`) so the page components, their TypeScript, and the
// path aliases all resolve exactly as they do in the browser build --
// rather than hand-transpiling them and hoping the two stay in step.
//
// Renders the SAME components the browser uses, with data injected as
// props (see PlayerPage/MatchPage's initialData). No fetching happens
// here: the generator queries Supabase once in bulk and hands the data
// in, which is what makes this fast enough to do thousands of pages --
// the previous browser-based prerenderer needed ~2-4 seconds per page
// because each one had to boot a real page and wait for its own network
// requests.
//
// Head tags are returned separately rather than rendered by the
// components, because useDocumentHead does its work in useEffect, which
// renderToString never runs. The generator injects these into the HTML
// shell itself.
// ============================================================================

import { renderToString } from 'react-dom/server';
// StaticRouter, Routes and Route all from ONE package. Importing StaticRouter
// from 'react-router' and Routes from 'react-router-dom' worked in the
// production bundle (which merges them) but loaded two copies of the router
// under the test runner, so the router context did not match -- "useRoutes()
// may be used only in the context of a <Router>". That is why these
// renderers could not be tested until now.
import { Route, Routes, StaticRouter } from 'react-router-dom';
import PlayerPage, { type PlayerPageData } from './pages/fpl/PlayerPage';
import MatchPage from './pages/football/MatchPage';
import TeamPage, { type TeamPageData } from './pages/football/TeamPage';
import TeamFinancePage from './pages/football/TeamFinancePage';
import FinanceIndexPage from './pages/FinanceIndexPage';
import FinanceComparePage from './pages/FinanceComparePage';
import { buildComparison } from './lib/financeCompare';
import { latestPeriod, type ClubFinanceData, type FinanceIndexEntry } from './lib/financeApi';
import { formatMoneyShort, fyLabel, longDate, scaled, signedMoney } from './lib/financeFormat';
import { buildModelFromLambdas, type MatchPagePrediction } from './lib/matchPageApi';
import { SITE_URL, BRAND_NAME } from './lib/siteConfig';
import { STATIC_ROUTES, type RouteMeta } from './lib/routeMeta';

export type RenderedPage = {
  html: string;
  title: string;
  description: string;
  canonical: string;
  /** JSON-LD objects for this page. Only ever describes facts the page
   * actually shows -- no invented properties to pad the schema out, and
   * nothing asserted that the data doesn't support (e.g. no venue on a
   * fixture, because venue isn't stored). */
  structuredData: object[];
};

function breadcrumb(items: { name: string; path: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderPlayerPage(slug: string, data: PlayerPageData): RenderedPage {
  const path = `/fpl/players/${slug}`;
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/fpl/players/:slug" element={<PlayerPage initialData={data} />} />
      </Routes>
    </StaticRouter>
  );

  const upcoming = data.season.filter((g) => g.projected_points != null && g.status !== 'played');
  const total = upcoming.reduce((sum, g) => sum + (g.projected_points ?? 0), 0);

  return {
    html,
    title: `${data.profile.full_name} \u2014 FPL projections | ${BRAND_NAME}`,
    description:
      upcoming.length > 0
        ? `${data.profile.full_name} (${data.profile.team_name}) is projected ${total.toFixed(1)} Fantasy Premier League points across the next ${upcoming.length} gameweek${upcoming.length === 1 ? '' : 's'}. Per-gameweek projected points, expected minutes and results.`
        : `Fantasy Premier League projections, expected minutes and results for ${data.profile.full_name} (${data.profile.team_name}).`,
    canonical: `${SITE_URL}${path}`,
    structuredData: [
      breadcrumb([
        { name: 'Fantasy Premier League', path: '/fpl/start' },
        { name: 'Players', path: '/fpl/player-points' },
        { name: data.profile.full_name, path },
      ]),
    ],
  };
}

/** rho is passed separately because it lives on the fixture's frozen fit
 * run, not on the fixture row -- the generator fetches fit runs in bulk
 * and supplies it here, so the model is rebuilt with exactly the same
 * helper the browser uses. */
export function renderMatchPage(slug: string, input: MatchPagePrediction & { __rho?: number | null }): RenderedPage {
  const { __rho, ...rest } = input;
  const data: MatchPagePrediction =
    rest.model == null && rest.predicted_home_goals != null && rest.predicted_away_goals != null && __rho != null
      ? { ...rest, model: buildModelFromLambdas(rest.predicted_home_goals, rest.predicted_away_goals, __rho) }
      : rest;

  const path = `/football/matches/${slug}`;
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/football/matches/:slug" element={<MatchPage initialData={data} />} />
      </Routes>
    </StaticRouter>
  );

  const fixture = `${data.home_team_name} v ${data.away_team_name}`;
  const description = data.model
    ? `Model prediction for ${fixture}: ${data.home_team_name} ${data.model.homeWinPct.toFixed(1)}%, draw ${data.model.drawPct.toFixed(1)}%, ${data.away_team_name} ${data.model.awayWinPct.toFixed(1)}%. Expected goals and most likely scoreline.`
    : `Fixture details for ${fixture}.`;

  // SportsEvent describes the fixture itself -- the one genuinely
  // schema-shaped fact on the page. The model's probabilities have no
  // standard schema.org representation, so they're deliberately NOT
  // forced into one; they're in the page's own semantic HTML instead,
  // which is what actually gets read.
  const sportsEvent: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: fixture,
    startDate: data.kickoff_date,
    // schema.org has no "completed" event status -- its EventStatusType
    // values cover scheduled/postponed/cancelled/rescheduled/moved.
    // A played fixture did happen as scheduled, so this is correct for
    // both cases rather than something to branch on.
    eventStatus: 'https://schema.org/EventScheduled',
    sport: 'Football',
    url: `${SITE_URL}${path}`,
    homeTeam: { '@type': 'SportsTeam', name: data.home_team_name },
    awayTeam: { '@type': 'SportsTeam', name: data.away_team_name },
  };

  return {
    html,
    title: `${fixture} \u2014 prediction | ${BRAND_NAME}`,
    description,
    canonical: `${SITE_URL}${path}`,
    structuredData: [
      sportsEvent,
      breadcrumb([
        { name: 'Football', path: '/football' },
        { name: 'Matches', path: '/fixtures' },
        { name: fixture, path },
      ]),
    ],
  };
}

export function renderTeamPage(slug: string, data: TeamPageData): RenderedPage {
  const path = `/football/teams/${slug}`;
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/football/teams/:slug" element={<TeamPage initialData={data} />} />
      </Routes>
    </StaticRouter>
  );

  const p = data.profile;
  const rated =
    p.goals_for_per_game != null && p.goals_against_per_game != null
      ? ` The model expects ${p.goals_for_per_game.toFixed(2)} goals scored and ${p.goals_against_per_game.toFixed(2)} conceded per game against an average opponent.`
      : '';

  return {
    html,
    title: `${p.display_name} \u2014 ratings & fixtures | ${BRAND_NAME}`,
    description: `Model ratings, results and predicted fixtures for ${p.display_name}.${rated}`,
    canonical: `${SITE_URL}${path}`,
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'SportsTeam',
        name: p.display_name,
        sport: 'Football',
        url: `${SITE_URL}${path}`,
        ...(p.league_name ? { memberOf: { '@type': 'SportsOrganization', name: p.league_name } } : {}),
      },
      breadcrumb([
        { name: 'Football', path: '/football' },
        { name: 'Teams', path: '/teams' },
        { name: p.display_name, path },
      ]),
    ],
  };
}

/** Head tags and breadcrumbs for a static route.
 *
 * Content stays client-rendered for these -- they're interactive pages
 * whose data is fetched on mount, and giving each one an injected-data
 * path would be a large refactor. But the HEAD can be correct now, and
 * that's the part that was actively harmful: 26 sitemap URLs all
 * serving the same title and no description reads as duplicate content,
 * which is worse than not listing them.
 *
 * Google renders JavaScript, so the body still indexes; what it can't
 * do is guess which page is which before rendering. */
export function renderStaticRouteHead(meta: RouteMeta): RenderedPage {
  const crumbs = meta.crumbs
    ? [...meta.crumbs, { name: meta.title.split(' — ')[0], path: meta.path }]
    : [];
  return {
    html: '',
    title: `${meta.title} | ${BRAND_NAME}`,
    description: meta.description,
    canonical: `${SITE_URL}${meta.path}`,
    structuredData: crumbs.length > 1 ? [breadcrumb(crumbs)] : [],
  };
}

export { STATIC_ROUTES };

// ---- Club finances ---------------------------------------------------------
// The finance module, re-exported as ONE namespace so the build scripts group
// and normalise rows with exactly the code the browser uses (one bulk query
// per view for every club) -- see scripts/lib/financeStatic.mjs.
export * as finance from './lib/financeApi';
// The player page's projection breakdown, so static generation maps it with
// the same code as the browser.
export { projectionDetail, PROJECTION_DETAIL_COLUMNS } from './lib/fplPlayerPageApi';

export function renderTeamFinancePage(slug: string, data: ClubFinanceData): RenderedPage {
  const path = `/football/teams/${slug}/finances`;
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/football/teams/:slug/finances" element={<TeamFinancePage initialData={data} />} />
      </Routes>
    </StaticRouter>
  );
  const name = data.team.display_name;
  const latest = latestPeriod(data.periods);
  let description = `Statutory accounts for ${name}, from Companies House.`;
  if (latest) {
    const rev = scaled(latest.revenue_total, latest.unit_scale);
    const pbt = signedMoney('profit_before_tax', scaled(latest.profit_before_tax, latest.unit_scale), 'Profit or loss before tax');
    const first = data.periods[0];
    description =
      `${name}'s statutory accounts ${fyLabel(first.period_end)}\u2013${fyLabel(latest.period_end)}, from Companies House. ` +
      `In the year to ${longDate(latest.period_end)}: revenue ${formatMoneyShort(rev)}, ${pbt.label.toLowerCase()} ${pbt.amount}.`;
  }
  return {
    html,
    title: `${name} finances \u2014 revenue, profit and loss, cash | ${BRAND_NAME}`,
    description,
    canonical: `${SITE_URL}${path}`,
    structuredData: [
      breadcrumb([
        { name: 'Football', path: '/football' },
        { name: 'Teams', path: '/teams' },
        { name, path: `/football/teams/${slug}` },
        { name: 'Finances', path },
      ]),
    ],
  };
}

export function renderFinanceComparePage(clubs: ClubFinanceData[]): RenderedPage {
  const path = '/finance/compare';
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/finance/compare" element={<FinanceComparePage initialData={buildComparison(clubs)} />} />
      </Routes>
    </StaticRouter>
  );
  return {
    html,
    title: `Club finances compared \u2014 revenue, wages, debt | ${BRAND_NAME}`,
    description: 'Football clubs\u2019 latest accounts side by side: revenue, wages, profit and loss, borrowings and cash, from filings at Companies House.',
    canonical: `${SITE_URL}${path}`,
    structuredData: [breadcrumb([{ name: 'Club finances', path: '/finance' }, { name: 'Compare clubs', path }])],
  };
}

export function renderFinanceIndexPage(entries: FinanceIndexEntry[]): RenderedPage {
  const path = '/finance';
  const html = renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/finance" element={<FinanceIndexPage initialData={entries} />} />
      </Routes>
    </StaticRouter>
  );
  return {
    html,
    title: `Club finances \u2014 statutory accounts, explained | ${BRAND_NAME}`,
    description:
      'Football club finances from the accounts clubs file at Companies House: revenue, profit and loss, cash, borrowings and net assets, each figure traceable to its source.',
    canonical: `${SITE_URL}${path}`,
    structuredData: [breadcrumb([{ name: 'Club finances', path }])],
  };
}


/** Injects a rendered page into the built index.html shell: its markup
 * into #root, and real head tags replacing the shell's static
 * placeholders. Without the head replacement every generated page would
 * carry the same generic title and description, which is most of the
 * value of doing this at all. */
export function buildDocument(shell: string, page: RenderedPage): string {
  // Empty html means head-only generation: leave the root div alone so
  // the SPA boots normally rather than being handed an empty string.
  let out = page.html
    ? shell.replace('<div id="root"></div>', `<div id="root">${page.html}</div>`)
    : shell;
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttr(page.title)}</title>`);
  out = out.replace(
    /<meta\s+name="description"[\s\S]*?\/>/,
    `<meta name="description" content="${escapeAttr(page.description)}" />`
  );
  const ld = (page.structuredData ?? [])
    .map(
      (obj) =>
        // "</script>" inside JSON would terminate the script element
        // early; escaping the slash is the standard guard.
        `  <script type="application/ld+json">${JSON.stringify(obj).replace(/<\//g, '<\\/')}</script>`
    )
    .join('\n');
  out = out.replace(
    '</head>',
    `  <link rel="canonical" href="${escapeAttr(page.canonical)}" />\n${ld}\n  </head>`
  );
  return out;
}
