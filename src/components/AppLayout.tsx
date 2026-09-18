import { trackPageView } from '../lib/analytics';
import { CookieConsent } from './CookieConsent';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, type To } from 'react-router-dom';

type NavItem = { to: To; label: string; matchPrefix: string | string[]; exact?: boolean; excludePrefix?: string | string[] };
/** A group's items may be split into the four journey stages
 * (Discover / Predict / Validate / Configure) so the menu mirrors the
 * site's own structure. `sections` is optional -- groups that aren't
 * part of that journey (Data, FPL Admin) stay flat, because forcing
 * them into stage headings would invent a structure they don't have. */
type NavSection = { label: string; items: NavItem[] };
type NavGroup = { label: string; items?: NavItem[]; sections?: NavSection[] };

/** Every item in a group, whether it's flat or sectioned -- used for
 * group-level highlighting so both shapes behave identically. */
function groupItems(group: NavGroup): NavItem[] {
  return group.items ?? (group.sections ?? []).flatMap((sec) => sec.items);
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
              {/* Stage heading. Deliberately not a link: the stage
                  itself has no page of its own yet, and a heading that
                  looks clickable but isn't is worse than a plain one. */}
              <p
                className={[
                  'px-3 pt-2 pb-1 font-mono text-[0.65rem] uppercase tracking-widest text-amber-400',
                  i > 0 ? 'border-t border-pitch-700 mt-1' : '',
                ].join(' ')}
              >
                {section.label}
              </p>
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

  // Four top-level headings -- Football, Fantasy, Data, FPL Admin -- each a
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
  const navGroups: NavGroup[] = [
    {
      label: 'Football',
      sections: [
        {
          label: 'Discover',
          items: [
            { to: '/football', label: 'Overview', exact: true, matchPrefix: '/football' },
            { to: fixturesTo, label: 'Fixtures & Results', exact: true, matchPrefix: '/fixtures' },
            { to: '/table', label: 'League Table', matchPrefix: '/table' },
            { to: '/teams', label: 'Team Explorer', matchPrefix: ['/teams', '/football/teams'] },
          ],
        },
        {
          label: 'Predict',
          items: [
            { to: '/preview', label: 'Match Preview', matchPrefix: '/preview' },
            { to: '/team-strength', label: 'Team Strength', matchPrefix: '/team-strength' },
          ],
        },
        {
          label: 'Validate',
          items: [{ to: '/team-strength', label: 'Projected vs Actual', matchPrefix: '/team-strength' }],
        },
        {
          label: 'Configure',
          items: [{ to: '/team-strength', label: 'Adjust Ratings', matchPrefix: '/team-strength' }],
        },
      ],
    },
    {
      label: 'Fantasy',
      sections: [
        {
          label: 'Discover',
          items: [
            { to: '/fpl/start', label: 'Overview', exact: true, matchPrefix: '/fpl/start' },
            { to: '/fpl', label: 'Match Projections', matchPrefix: '/fpl', exact: true },
            { to: '/fpl/scoring-rules', label: 'Scoring Rules', matchPrefix: '/fpl/scoring-rules' },
          ],
        },
        {
          label: 'Predict',
          items: [
            { to: '/fpl/player-points', label: 'Player Points Table', matchPrefix: '/fpl/player-points' },
            { to: '/fpl/optimal-squad', label: 'Optimal Squad', matchPrefix: '/fpl/optimal-squad', excludePrefix: '/fpl/optimal-squad-so-far' },
            { to: '/fantasy', label: 'Fixture Heat Map', matchPrefix: '/fantasy' },
          ],
        },
        {
          label: 'Validate',
          items: [
            { to: '/fpl/actual-matches', label: 'Actual Matches', matchPrefix: '/fpl/actual-matches' },
            { to: '/fpl/optimal-squad-so-far', label: 'Optimal Squad So Far', matchPrefix: '/fpl/optimal-squad-so-far' },
          ],
        },
        {
          label: 'Configure',
          items: [{ to: '/fpl/tactical-roles', label: 'Tactical Roles', matchPrefix: '/fpl/tactical-roles' }],
        },
      ],
    },
    {
      // Flat, not sectioned: these are raw-data and infrastructure
      // views, not part of the Discover-to-Configure journey. Giving
      // them stage headings would invent a structure they don't have.
      label: 'Data',
      items: [
        { to: '/results-data', label: 'Results Data', matchPrefix: '/results-data' },
        { to: '/source-data', label: 'Source Data', matchPrefix: '/source-data' },
      ],
    },
    {
      // Duplicate links to the three pages in the core admin workflow:
      // review team strength, then tactical roles, then run the
      // optimiser. A shortcut through that sequence, deliberately kept
      // flat since it's a workflow rather than a journey stage.
      label: 'FPL Admin',
      items: [
        { to: '/team-strength', label: 'Team Strength', matchPrefix: '/team-strength' },
        { to: '/fpl/tactical-roles', label: 'Tactical Roles', matchPrefix: '/fpl/tactical-roles' },
        { to: '/fpl/optimal-squad', label: 'Optimal Squad', matchPrefix: '/fpl/optimal-squad', excludePrefix: '/fpl/optimal-squad-so-far' },
      ],
    },
  ];
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
                Full-Time
              </span>
              <span className="font-mono text-xs text-amber-400 tracking-widest uppercase">
                Results Archive
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
          <NavLink to="/data-health" className="text-ink-500 hover:text-ink-900 underline">
            Data Health
          </NavLink>
        </div>
      </footer>
    </div>
  );
}
