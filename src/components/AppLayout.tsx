import { THEMES, stagePath, type JourneyLink } from '../lib/journey';
import { trackPageView } from '../lib/analytics';
import { CookieConsent } from './CookieConsent';
import { FOOTER_COVERAGE } from '../lib/dataCoverage';
import { useAuthOptional } from '../lib/auth';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, type To } from 'react-router-dom';
import { BEAT_THE_SHARK } from './GameCard';

type NavItem = { to: To; label: string; matchPrefix: string | string[]; exact?: boolean; excludePrefix?: string | string[]; external?: boolean };
/** A group's items may be split into the four journey stages
 * (Discover / Predict / Validate / Configure) so the menu mirrors the
 * site's own structure. `sections` is optional -- groups that aren't
 * part of that journey (Admin) stay flat, because forcing
 * them into stage headings would invent a structure they don't have. */
type NavSection = { label: string; to?: string; items: NavItem[] };
type NavGroup = { label: string; items?: NavItem[]; sections?: NavSection[]; alignRight?: boolean };

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
        <ul className={`absolute left-0 ${group.alignRight ? 'sm:left-auto sm:right-0' : ''} top-full mt-1 min-w-[13rem] bg-pitch-900 border border-pitch-700 rounded shadow-lg py-1 z-20 text-sm font-medium max-h-[75vh] overflow-y-auto`}>
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
        { to: '/admin/fanteam', label: 'FanTeam', matchPrefix: '/admin/fanteam' },
        { to: '/admin/last-man-standing', label: 'Last Man Standing', matchPrefix: '/admin/last-man-standing' },
        { to: '/admin/ai-lab', label: 'AI Lab', matchPrefix: '/admin/ai-lab' },
        { to: '/admin/model', label: 'Model Versions & Changes', matchPrefix: '/admin/model' },
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
    ? { to: '/football', label: 'Football' }
    : onFantasyPage
      ? { to: '/fpl/start', label: 'Fantasy Premier League' }
      : onNflPage
        ? { to: '/nfl', label: 'NFL' }
        : onTennisPage
          ? { to: '/tennis', label: 'Tennis' }
          : onIntlPage
            ? { to: '/international', label: 'International' }
            : null;

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
          <span>{FOOTER_COVERAGE}</span>
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
