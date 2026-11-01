import BetaChip from './BetaChip';
import { THEMES, stagePath, type JourneyLink } from '../lib/journey';
import { trackPageView } from '../lib/analytics';
import { CookieConsent } from './CookieConsent';
import { FOOTER_COVERAGE } from '../lib/dataCoverage';
import { SISTER_SITES } from '../lib/siteIdentity';
import { useAuthOptional } from '../lib/auth';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, type To } from 'react-router-dom';
import { BEAT_THE_SHARK } from './GameCard';
import { PageErrorBoundary } from './PageErrorBoundary';
import EmailSignup from './EmailSignup';
import { STATIC_ROUTES, type RouteMeta } from '../lib/routeMeta';
import { activeDocumentHeads, applyFallbackHead } from '../hooks/useDocumentHead';

const ROUTE_META = new Map<string, RouteMeta>(STATIC_ROUTES.map((m) => [m.path, m]));

type NavItem = { to: To; label: string; matchPrefix: string | string[]; exact?: boolean; excludePrefix?: string | string[]; external?: boolean };
/** A group's items may be split into the four journey stages
 * (Discover / Predict / Validate / Configure) so the menu mirrors the
 * site's own structure. `sections` is optional -- groups that aren't
 * part of that journey (Admin) stay flat, because forcing
 * them into stage headings would invent a structure they don't have. */
type NavSection = { label: string; to?: string; items: NavItem[] };
type NavGroup = { label: string; items?: NavItem[]; sections?: NavSection[]; alignRight?: boolean; beta?: boolean };

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

/** Length of the longest of an item's prefixes the path starts with, so the
 *  breadcrumb picks the most specific menu page a path sits under. */
function longestPrefix(item: NavItem, pathname: string): number {
  const prefixes = Array.isArray(item.matchPrefix) ? item.matchPrefix : [item.matchPrefix];
  return Math.max(0, ...prefixes.filter((p) => pathname.startsWith(p)).map((p) => p.length));
}

function NavDropdown({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = `menu-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
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
    // Escape closes the menu and puts focus back on its button (audit
    // 22 Oct 2026, S-12).
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <li
      ref={ref}
      className="relative"
      // Tabbing out of an open menu closes it.
      onBlur={(e) => {
        if (open && ref.current && e.relatedTarget instanceof Node && !ref.current.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={menuId}
        className={[
          'flex items-center gap-1 px-3 py-1.5 rounded transition-colors text-sm font-medium',
          isGroupActive ? 'bg-amber-500 text-ink-900' : 'text-chalk-200 hover:bg-pitch-700 hover:text-chalk-100',
        ].join(' ')}
      >
        {group.label}
        {group.beta && <BetaChip className="hidden sm:inline" />}
        <span aria-hidden="true" className={`text-xs transition-transform ${open ? 'rotate-180' : ''}`}>&#9662;</span>
      </button>
      {/* Always in the DOM, hidden until opened (audit 22 Oct 2026, S-04):
          the prerendered HTML and crawlers get every menu link, so the
          internal link graph doesn't depend on running the app. */}
      {(
        <ul id={menuId} hidden={!open} className={`absolute left-0 ${group.alignRight ? 'sm:left-auto sm:right-0' : ''} top-full mt-1 min-w-[13rem] bg-pitch-900 border border-pitch-700 rounded shadow-lg py-1 z-20 text-sm font-medium max-h-[75vh] overflow-y-auto`}>
          {group.items?.map((item) => (
            <li key={item.label}>
              {/* The games are their own site behind a proxy: a plain <a>,
                  never a router Link (which would look for the route in
                  this app and show "not found"). See GameCard.tsx. */}
              {item.external ? (
                <a href={String(item.to)} className={navLinkClasses(false)}>
                  {item.label}
                </a>
              ) : (
                <Link to={item.to} className={navLinkClasses(isItemActive(location.pathname, item))} aria-current={isItemActive(location.pathname, item) ? 'page' : undefined}>
                  {item.label}
                </Link>
              )}
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
                    {item.external ? (
                      <a href={String(item.to)} className={navLinkClasses(false)}>
                        {item.label}
                      </a>
                    ) : (
                      <Link to={item.to} className={navLinkClasses(isItemActive(location.pathname, item))} aria-current={isItemActive(location.pathname, item) ? 'page' : undefined}>
                        {item.label}
                      </Link>
                    )}
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


// Top-menu headings (Chris, 5 Oct 2026: "Football > Club, Fantasy > FPL",
// International as "Intnl"). Short so the header fits one line on a phone.
// Only the headings: URLs, hub titles and breadcrumbs keep their full names.
const MENU_LABEL = { football: 'Club', fpl: 'FPL', nfl: 'NFL', tennis: 'Tennis', international: 'Intnl' } as const;

export default function AppLayout() {
  const location = useLocation();

  // Head fallback (audit 22 Oct 2026, S-10). Runs after the page's own
  // effects (parents run after children), so a page that calls
  // useDocumentHead keeps its head; for one that doesn't, the head comes
  // from routeMeta, or the site defaults, instead of the previous page's.
  // Not on the first render: the served HTML already has that URL's head
  // (prerendered, or the shell's defaults).
  const firstRoute = useRef(true);
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    if (activeDocumentHeads() > 0) return;
    const path = location.pathname.length > 1 ? location.pathname.replace(/\/+$/, '') : location.pathname;
    applyFallbackHead(ROUTE_META.get(path) ?? null);
  }, [location.pathname]);

  // AppLayout wraps every page and never unmounts on route changes (only
  // the <Outlet /> content swaps), so it's the right place to remember the
  // fixtures search string across navigation.
  // Single owner of pageview tracking. AppLayout wraps every route via
  // <Outlet/> and never unmounts on navigation, so this fires exactly
  // once per route change -- including the very first render, which
  // covers the prerendered entry pages too. GA4's own automatic SPA
  // tracking is disabled (send_page_view: false) precisely so these
  // don't double-count.
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

  // Remembered in state (React's "adjust state while rendering" pattern):
  // a ref written during render is unsafe under concurrent rendering.
  const [lastFixturesSearch, setLastFixturesSearch] = useState('');
  const onFixturesRoute = location.pathname === '/fixtures';
  if (onFixturesRoute && lastFixturesSearch !== location.search) {
    setLastFixturesSearch(location.search);
  }

  const fixturesTo: To = { pathname: '/fixtures', search: onFixturesRoute ? location.search : lastFixturesSearch };

  // International: on the women's side (/international/women/...) the menu
  // links go to the women's pages, so the menu follows the Men | Women switch.
  const womenSide = location.pathname.startsWith('/international/women');
  const sideLink = (key: string) => (link: JourneyLink): JourneyLink => {
    if (key !== 'international' || !womenSide) return link;
    const w = (p: string) => p.replace(/^\/international(?=\/|$)/, '/international/women');
    return { ...link, to: w(link.to), matchPrefix: link.matchPrefix ? [link.matchPrefix].flat().map(w) : undefined };
  };

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
  const themeGroups: NavGroup[] = (['football', 'fpl', 'nfl', 'tennis', 'international'] as const).map((key) => {
    const theme = THEMES[key];
    return {
      label: MENU_LABEL[key],
      beta: theme.beta,
      // Overview sits above the stage headings as a plain item, not an
      // empty section -- a heading with nothing under it reads as a
      // rendering bug.
      items: [(() => {
        const hub = key === 'international' && womenSide ? '/international/women' : theme.hubPath;
        return { to: hub, label: 'Overview', exact: true, matchPrefix: hub };
      })()],
      sections: [
        ...theme.stages.map((stage) => ({
          label: stage.title,
          to: key === 'international' && womenSide ? '/international/women' : stagePath(theme, stage),
          items: stage.links.map(sideLink(key)).map((link) => ({
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

  // Play (Chris, 7 Oct 2026): the Beat the Shark games, one per sport,
  // after the sports and before Admin.
  const playGroup: NavGroup = {
    label: 'Play',
    // At the right-hand end on a wide screen: open leftwards so the menu
    // stays on the page (on a phone it wraps to the left and opens right).
    alignRight: true,
    // Two headed groups, as on the games' own picker (Chris, 7 Oct 2026).
    sections: [
      {
        label: 'Sports',
        items: [
          { to: BEAT_THE_SHARK.football.href, label: 'Football', matchPrefix: BEAT_THE_SHARK.football.href, external: true },
          { to: BEAT_THE_SHARK.nfl.href, label: 'NFL', matchPrefix: BEAT_THE_SHARK.nfl.href, external: true },
          { to: BEAT_THE_SHARK.worldCup.href, label: 'World Cup', matchPrefix: BEAT_THE_SHARK.worldCup.href, external: true },
          { to: BEAT_THE_SHARK.nationsCup.href, label: 'Tennis: Nations Cup', matchPrefix: BEAT_THE_SHARK.nationsCup.href, external: true },
        ],
      },
      // Shark Fantasy: admins only while the prototype runs (Phase 3).
      ...(isAdmin ? [{
        label: 'Fantasy',
        items: [{ to: '/shark-fantasy', label: 'Shark Fantasy', matchPrefix: '/shark-fantasy' }],
      }] : []),
      {
        label: 'Casino & probability',
        items: [
          { to: BEAT_THE_SHARK.blackjack.href, label: 'Blackjack: all the games', matchPrefix: BEAT_THE_SHARK.blackjack.href, external: true },
          { to: BEAT_THE_SHARK.poker.href, label: 'Poker: all the trainers', matchPrefix: BEAT_THE_SHARK.poker.href, external: true },
          { to: `${BEAT_THE_SHARK.poker.href}?mode=match`, label: 'Poker: heads-up v the Shark', matchPrefix: `${BEAT_THE_SHARK.poker.href}?mode=match`, external: true },
        ],
      },
    ],
  };

  const navGroups: NavGroup[] = [
    ...themeGroups,
    playGroup,
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
      alignRight: true,
      items: [
        // Optimiser removed from Admin: it's a Fantasy feature, not an
        // operational one, and listing it twice implied two pages.
        // Editing tools first (Chris), then the operational views.
        { to: '/admin/team-ratings', label: 'Team Strength Admin', matchPrefix: '/admin/team-ratings' },
        { to: '/fpl/tactical-roles', label: 'Tactical Roles', matchPrefix: '/fpl/tactical-roles' },
        { to: '/admin/lineup-compare', label: 'Line-ups v FFS', matchPrefix: '/admin/lineup-compare' },
        { to: '/admin/team-sheets', label: 'Team Sheets v Model', matchPrefix: '/admin/team-sheets' },
        { to: '/admin/fanteam', label: 'FanTeam', matchPrefix: '/admin/fanteam' },
        { to: '/admin/last-man-standing', label: 'Last Man Standing', matchPrefix: '/admin/last-man-standing' },
        { to: '/admin/ask', label: 'Ask FixtureShark (trial)', matchPrefix: '/admin/ask' },
        { to: '/admin/ai-lab', label: 'AI Lab', matchPrefix: '/admin/ai-lab' },
        { to: '/admin/model', label: 'Model Versions & Changes', matchPrefix: '/admin/model' },
        { to: '/admin/traffic', label: 'Site Traffic', matchPrefix: '/admin/traffic' },
        { to: '/admin/email', label: 'FPL Weekly Email', matchPrefix: '/admin/email' },
        { to: '/admin/social', label: 'Social Publishing', matchPrefix: '/admin/social' },
        { to: '/admin/gameweek', label: 'Gameweek Posts', matchPrefix: '/admin/gameweek' },
        { to: '/data-health', label: 'Data Health', matchPrefix: '/data-health' },
        { to: '/data-flow', label: 'Data Flow', matchPrefix: '/data-flow' },
        { to: '/source-data', label: 'Source Data', matchPrefix: '/source-data' },
      ],
    },
  ].filter((g) => g.label !== 'Admin' || isAdmin);
  const footballGroup = navGroups.find((g) => g.label === MENU_LABEL.football)!;
  const fantasyGroup = navGroups.find((g) => g.label === MENU_LABEL.fpl)!;
  const nflGroup = navGroups.find((g) => g.label === MENU_LABEL.nfl)!;
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
  const onNflPage = location.pathname !== '/nfl' && (location.pathname.startsWith('/nfl/') || groupItems(nflGroup).some((item) => isItemActive(location.pathname, item)));
  const onTennisPage = location.pathname !== '/tennis' && location.pathname.startsWith('/tennis/');
  const onIntlPage = location.pathname !== '/international' && location.pathname.startsWith('/international/');
  const backToHub = onFootballPage
    ? { to: '/football', label: 'Football', group: footballGroup }
    : onFantasyPage
      ? { to: '/fpl/start', label: 'Fantasy Premier League', group: fantasyGroup }
      : onNflPage
        ? { to: '/nfl', label: 'NFL', group: nflGroup }
        : onTennisPage
          ? { to: '/tennis', label: 'Tennis', group: navGroups.find((g) => g.label === MENU_LABEL.tennis) }
          : onIntlPage
            ? { to: '/international', label: 'International', group: navGroups.find((g) => g.label === MENU_LABEL.international) }
            : null;

  // Breadcrumb (layout review, 21 Oct 2026): the section, then the menu page
  // this one sits under. On that page itself the last crumb is plain text; on
  // a page beneath it (a team, a match, a season) it links back up.
  const menuParent = backToHub?.group
    ? groupItems(backToHub.group)
        .filter((item) => !item.exact || item.matchPrefix !== backToHub.to)
        .filter((item) => isItemActive(location.pathname, item))
        // The most specific match wins: /football/history/trends is under
        // Historic Trends, not Position Tracking.
        .sort((a, b) => longestPrefix(b, location.pathname) - longestPrefix(a, location.pathname))[0]
    : undefined;
  const menuParentPath = menuParent ? (typeof menuParent.to === 'string' ? menuParent.to : menuParent.to.pathname ?? '') : '';
  const onMenuParentItself = menuParentPath === location.pathname;

  return (
    <div className="min-h-screen bg-chalk-100 text-ink-900 flex flex-col">
      {/* Skip link (audit 22 Oct 2026, S-12): first in the tab order,
          visible only when focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-chalk-100 focus:px-3 focus:py-2 focus:text-ink-900 focus:underline"
      >
        Skip to content
      </a>
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
              {/* Today first (Chris approved the Today page mockup, 1 Nov 2026). */}
              <li>
                <NavLink
                  to="/today"
                  className={({ isActive }) => `flex items-center px-3 py-1.5 rounded transition-colors text-sm font-semibold ${isActive ? 'bg-amber-500 text-ink-900' : 'text-amber-400 hover:bg-pitch-700 hover:text-chalk-100'}`}
                >
                  Today
                </NavLink>
              </li>
              {navGroups.map((group) => (
                <NavDropdown key={group.label} group={group} />
              ))}
              <li>
                <NavLink
                  to="/my"
                  className={({ isActive }) => `flex items-center px-3 py-1.5 rounded transition-colors text-sm font-medium ${isActive ? 'bg-amber-500 text-ink-900' : 'text-chalk-200 hover:bg-pitch-700 hover:text-chalk-100'}`}
                >
                  My preferences
                </NavLink>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      {/* min-h-screen (18 Oct 2026): the footer starts below the fold. With
          flex-1 alone it sat in the first screen while a page's data loaded and
          jumped down when it arrived -- 0.14 of layout shift on 22 of 38 pages
          in the smoke test (CLS budget 0.1). */}
      <main id="main-content" tabIndex={-1} className="flex-1 min-h-screen focus:outline-none max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full">
        {backToHub && (
          <nav aria-label="Breadcrumb" className="text-sm font-mono text-ink-500 mb-4">
            <ol className="flex flex-wrap items-center gap-x-1.5">
              <li>
                <NavLink to={backToHub.to} className="hover:text-ink-900 underline-offset-2 hover:underline">
                  {backToHub.label}
                </NavLink>
              </li>
              {menuParent && (
                <li className="flex items-center gap-x-1.5">
                  <span aria-hidden="true">&rsaquo;</span>
                  {onMenuParentItself ? (
                    <span aria-current="page" className="text-ink-700">{menuParent.label}</span>
                  ) : (
                    <Link to={menuParent.to} className="hover:text-ink-900 underline-offset-2 hover:underline">
                      {menuParent.label}
                    </Link>
                  )}
                </li>
              )}
            </ol>
          </nav>
        )}
        <PageErrorBoundary key={location.pathname}>
          <Outlet />
        </PageErrorBoundary>
      </main>

      <CookieConsent />

      <footer className="border-t border-chalk-300 py-6">
        {/* The five section hubs (audit 22 Oct 2026, S-04): plain links on
            every page, prerendered ones included. */}
        <nav aria-label="Sections" className="max-w-6xl mx-auto px-4 sm:px-6 mb-3">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {(['football', 'fpl', 'nfl', 'tennis', 'international'] as const).map((key) => (
              <li key={key}>
                <Link to={THEMES[key].hubPath} className="text-pitch-800 underline underline-offset-2 hover:text-ink-900">
                  {THEMES[key].title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {/* FPL weekly email (1 Nov 2026), compact. Left out where the page
            has its own sign-up card, and on the email pages themselves. */}
        {!/^\/(fpl\/start|fpl\/gameweek|email\/)/.test(location.pathname) && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 mb-4">
            <div className="max-w-xl"><EmailSignup variant="compact" /></div>
          </div>
        )}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-xs text-ink-500 font-mono flex flex-wrap items-center justify-between gap-2">
          <span>{FOOTER_COVERAGE}</span>
          <Link to="/privacy" className="text-ink-500 hover:text-ink-900 underline underline-offset-2">Privacy</Link>
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
        {/* The other "shark" sites (AI search audit, 1 Nov 2026). */}
        <p className="max-w-6xl mx-auto px-4 sm:px-6 mt-2 text-xs text-ink-500" data-testid="shark-family">
          Also from the shark family:{' '}
          {SISTER_SITES.map((site, i) => (
            <span key={site.url}>
              {i > 0 && ' \u00b7 '}
              <a href={site.url} className="underline underline-offset-2 hover:text-ink-900">{site.name}</a>
            </span>
          ))}
        </p>
      </footer>
    </div>
  );
}
