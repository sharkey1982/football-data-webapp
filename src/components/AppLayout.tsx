import { THEMES, stagePath } from '../lib/journey';
import { trackPageView } from '../lib/analytics';
import { CookieConsent } from './CookieConsent';
import { useAuthOptional } from '../lib/auth';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, type To } from 'react-router-dom';

type NavItem = { to: To; label: string; matchPrefix: string | string[]; exact?: boolean; excludePrefix?: string | string[] };
/** A group's items may be split into the four journey stages
 * (Discover / Predict / Validate / Configure) so the menu mirrors the
 * site's own structure. `sections` is optional -- groups that aren't
 * part of that journey (Admin) stay flat, because forcing
 * them into stage headings would invent a structure they don't have. */
type NavSection = { label: string; to?: string; items: NavItem[] };
type NavGroup = { label: string; items?: NavItem[]; sections?: NavSection[] };

/** Every item in a group, whether it's flat or sectioned -- used for
 * group-level highlighting so both shapes behave identically. */
function groupItems(group: NavGroup): NavItem[] {
  // Concatenate, don't choose. An earlier version used `??`, which
  // silently ignored `sections` on any group that also had `items` --
  // so once Overview became a plain item alongside the stage sections,
  // group highlighting and the back-to-hub link only saw Overview and
  // stopped recognising every other page in the theme.
  return [...(group.items ?? []), ...(group.sections ?? []).flatMap((sec) => sec.items)];
}

const navLinkClasses = (isActive: boolean) =>
  [
    'block px-3 py-1.5 rounded transition-colors whitespace-nowrap',
    isActive ? 'bg-amber-500 text-ink-900' : 'text-chalk-200 hover:bg-pitch-700 hover:text-chalk-100',
  ].join(' ');

/**
 * A single matcher used for both an item's own highlight and its group's
 * highlight, so the two can never disagree. Handles one case NavLink's
 * built-in `end` prop can't express on its own: "/fpl" (FPL Projections)
 * is a prefix of both "/fpl/optimal-squad" and "/fpl/player-points"
 * (sibling features, not sub-pages of it) -- excludePrefix (one or more)
 * stops those routes from also lighting up FPL Projections.
 */
function isItemActive(pathname: string, item: NavItem): boolean {
  const prefixes = Array.isArray(item.matchPrefix) ? item.matchPrefix : [item.matchPrefix];
  if (item.exact) return prefixes.includes(pathname);
  const excludes = item.excludePrefix === undefined ? [] : Array.isArray(item.excludePrefix) ? item.excludePrefix : [item.excludePrefix];
  if (excludes.some((p) => pathname.startsWith(p))) return false;
  return prefixes.some((p) => pathname.startsWith(p));
}

function NavDropdown({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const location = useLocation();
  const isGroupActive = groupItems(group).some((item) => isItemActive(location.pathname, item));

  // Close on navigation and on any click outside the dropdown -- a menu
  // that stays open after picking an item, or after tapping elsewhere on
  // a touch screen, reads as broken rather than tidy.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <li ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={[
          'flex items-center gap-1 px-3 py-1.5 rounded transition-colors text-sm font-medium',
          isGroupActive ? 'bg-amber-500 text-ink-900' : 'text-chalk-200 hover:bg-pitch-700 hover:text-chalk-100',
        ].join(' ')}
      >
        {group.label}
        <span className={`text-xs transition-transform ${open ? 'rotate-180' : ''}`}>&#9662;</span>
      </button>
      {open && (
        <ul className="absolute left-0 top-full mt-1 min-w-[13rem] bg-pitch-900 border border-pitch-700 rounded shadow-lg py-1 z-20 text-sm font-medium max-h-[75vh] overflow-y-auto">
          {group.items?.map((item) => (
            <li key={item.label}>
              <NavLink to={item.to} className={() => navLinkClasses(isItemActive(location.pathname, item))}>
                {item.label}
              </NavLink>
            </li>
          ))}
          {group.sections?.map((section, i) => (
            <li key={section.label}>
              {/* Stage heading, now a link -- each stage has its own
                  landing page, so a heading that looks clickable is
                  clickable. */}
              {section.to ? (
                <NavLink
                  to={section.to}
                  className={[
                    'block px-3 pt-2 pb-1 font-mono text-[0.65rem] uppercase tracking-widest text-amber-400 hover:text-amber-300',
                    i > 0 ? 'border-t border-pitch-700 mt-1' : '',
                  ].join(' ')}
                >
                  {section.label}
                </NavLink>
              ) : (
                <p
                  className={[
                    'px-3 pt-2 pb-1 font-mono text-[0.65rem] uppercase tracking-widest text-amber-400',
                    i > 0 ? 'border-t border-pitch-700 mt-1' : '',
                  ].join(' ')}
                >
                  {section.label}
                </p>
              )}
              <ul>
                {section.items.map((item) => (
                  <li key={item.label}>
                    <NavLink to={item.to} className={() => navLinkClasses(isItemActive(location.pathname, item))}>
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function AppLayout() {
  const location = useLocation();

  // AppLayout wraps every page and never unmounts on route changes (only
  // the <Outlet /> content swaps), so it's the right place to remember the
  // fixtures search string across navigation. Mutating a ref directly
  // during render is safe here -- it's a derived cache of the current
  // location, not new state, and doesn't need its own re-render.
  // Single owner of pageview tracking. AppLayout wraps every route via
  // <Outlet/> and never unmounts on navigation, so this fires exactly
  // once per route change -- including the very first render, which
  // covers the prerendered entry pages too. GA4's own automatic SPA
  // tracking is disabled (send_page_view: false) precisely so these
  // don't double-count.
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

  const lastFixturesSearch = useRef('');
  const onFixturesRoute = location.pathname === '/fixtures';
  if (onFixturesRoute) {
    lastFixturesSearch.current = location.search;
  }

  const fixturesTo: To = { pathname: '/fixtures', search: lastFixturesSearch.current };

  // Three top-level headings -- Football, Fantasy, Admin -- each a
  // dropdown, no separate flat top-level items alongside them.
  // Mirrors the site's own structure: two themes, each following the
  // same Discover -> Predict -> Validate -> Configure journey. Theme
  // first rather than stage first, because that's the order the landing
  // page and hubs present it in, and because it keeps the theme
  // grouping the back-to-hub link derives from.
  //
  // A page can legitimately appear under more than one stage: Team
  // Strength is where you SEE the ratings (Predict), where you compare
  // them to actuals (Validate) and where you change them (Configure).
  // Listing it three times reflects what it actually does rather than
  // forcing a single arbitrary home.
  // Derived from the journey config rather than hand-listed. That
  // config is what the hub pages and stage pages already render from,
  // so the nav can no longer disagree with them about what exists --
  // which it previously did (the nav said "Browse" after the hubs had
  // moved to "Discover"). Adding a destination is now one config edit
  // that updates the nav, the hub and the stage page together.
  const themeGroups: NavGroup[] = (['football', 'fpl'] as const).map((key) => {
    const theme = THEMES[key];
    return {
      label: key === 'football' ? 'Football' : 'Fantasy',
      // Overview sits above the stage headings as a plain item, not an
      // empty section -- a heading with nothing under it reads as a
      // rendering bug.
      items: [{ to: theme.hubPath, label: 'Overview', exact: true, matchPrefix: theme.hubPath }],
      sections: [
        ...theme.stages.map((stage) => ({
          label: stage.title,
          to: stagePath(theme, stage),
          items: stage.links.map((link) => ({
            // Fixtures keeps its remembered search string, so returning
            // to it from elsewhere preserves the division/season you had
            // selected rather than resetting.
            to: link.to === '/fixtures' ? fixturesTo : link.to,
            label: link.label,
            matchPrefix: link.matchPrefix ?? link.to,
            exact: link.exact,
            excludePrefix: link.excludePrefix,
          })),
        })),
      ],
    };
  });

  // The Admin menu is hidden entirely unless a signed-in admin is
  // looking. Every page behind it is admin-gated anyway, so showing the
  // menu to a visitor advertised doors they can't open -- and put
  // operational tooling in front of an audience it isn't for.
  const isAdmin = useAuthOptional()?.isAdmin ?? false;

  const navGroups: NavGroup[] = [
    ...themeGroups,
    {
      // The Boardroom: club finances from statutory accounts -- the third
      // pillar alongside Football and Fantasy. A dropdown like the others,
      // though it holds one destination today; each club's own page lives
      // at /football/teams/:slug/finances and is reached from here and
      // from its team page.
      label: 'The Boardroom',
      items: [
        { to: '/finance', label: 'Club finances', matchPrefix: '/finance' },
        { to: '/finance/compare', label: 'Compare clubs', matchPrefix: '/finance/compare' },
      ],
    },
    {
      // Renamed from "Data" and re-scoped. Results Data moved into
      // Football > Discover, where it belongs -- it's the curated match
      // archive, filterable and exportable, which is exploration rather
      // than infrastructure. What's left here is genuinely operational:
      // the raw provider files exactly as ingested, and pipeline health.
      // Flat, not sectioned: neither is part of the
      // Discover-to-Configure journey.
      // Configure lives here rather than as a public stage: every page in
      // it is admin-gated, so showing it to visitors offered a door they
      // couldn't open. Alongside the operational views it belongs with.
      label: 'Admin',
      items: [
        // Optimiser removed from Admin: it's a Fantasy feature, not an
        // operational one, and listing it twice implied two pages.
        { to: '/admin/team-ratings', label: 'Team Strength Admin', matchPrefix: '/admin/team-ratings' },
        { to: '/admin/model', label: 'Model Versions & Changes', matchPrefix: '/admin/model' },
        { to: '/data-health', label: 'Data Health', matchPrefix: '/data-health' },
        { to: '/data-flow', label: 'Data Flow', matchPrefix: '/data-flow' },
        { to: '/fpl/tactical-roles', label: 'Tactical Roles', matchPrefix: '/fpl/tactical-roles' },
        { to: '/source-data', label: 'Source Data', matchPrefix: '/source-data' },
      ],
    },
  ].filter((g) => g.label !== 'Admin' || isAdmin);
  const footballGroup = navGroups.find((g) => g.label === 'Football')!;
  const fantasyGroup = navGroups.find((g) => g.label === 'Fantasy')!;
  // A link back up to whichever theme hub the current page belongs to --
  // requested directly (the sketched flow shows an explicit loop back
  // from a destination page to its hub, which wasn't actually there
  // yet; reaching the hub meant digging into the nav dropdown's
  // "Overview" item instead). Driven by the same navGroups data already
  // used for nav highlighting, rather than adding a link to every
  // individual destination page -- one place to maintain, and it can
  // never drift out of sync with which pages actually belong to which
  // theme. Suppressed on the hub pages themselves and on Landing/Data
  // pages, where there's nothing to loop back to.
  // groupItems() rather than .items -- these groups are now split into
  // stage sections, so .items is undefined for them. TypeScript caught
  // this the moment the shape changed, which is the whole reason the
  // sectioned groups share one accessor: without it this would have
  // silently evaluated to "no theme matched" and quietly removed the
  // back link from every page, with nothing failing loudly.
  const onFootballPage = location.pathname !== '/football' && groupItems(footballGroup).some((item) => isItemActive(location.pathname, item));
  const onFantasyPage = location.pathname !== '/fpl/start' && groupItems(fantasyGroup).some((item) => isItemActive(location.pathname, item));
  const backToHub = onFootballPage ? { to: '/football', label: 'Football' } : onFantasyPage ? { to: '/fpl/start', label: 'Fantasy Premier League' } : null;

  return (
    <div className="min-h-screen bg-chalk-100 text-ink-900 flex flex-col">
      <header className="bg-pitch-900 text-chalk-100 border-b-4 border-amber-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <NavLink to="/" className="flex items-baseline gap-2 hover:opacity-90 transition-opacity">
              <span className="font-display uppercase tracking-wide text-xl sm:text-2xl font-semibold">
                FixtureShark
              </span>
              <span className="font-mono text-xs text-amber-400 tracking-widest uppercase">
                Results &amp; Predictions
              </span>
            </NavLink>
          </div>
          <nav aria-label="Main navigation">
            <ul className="flex flex-wrap items-center gap-1 sm:gap-2 text-sm font-medium">
              {navGroups.map((group) => (
                <NavDropdown key={group.label} group={group} />
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full">
        {backToHub && (
          <NavLink to={backToHub.to} className="inline-block text-sm font-mono text-ink-500 hover:text-ink-900 mb-4">
            &larr; Back to {backToHub.label}
          </NavLink>
        )}
        <Outlet />
      </main>

      <CookieConsent />

      <footer className="border-t border-chalk-300 py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-xs text-ink-500 font-mono flex flex-wrap items-center justify-between gap-2">
          <span>Data sourced from football-data.co.uk &middot; England, 2014/15&ndash;2025/26</span>
          {/* Hiding the Admin menu from visitors removed the ONLY route
              to /login -- the sign-in link lived in the gate notice on
              admin pages, which are no longer reachable from the nav.
              A discreet footer link keeps the door without advertising
              the section, and disappears once signed in. */}
          {!isAdmin && (
            <NavLink to="/login" className="text-ink-500 hover:text-ink-900 underline underline-offset-2">
              Sign in
            </NavLink>
          )}</div>
      </footer>
    </div>
  );
}
