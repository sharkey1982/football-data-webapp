import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, type To } from 'react-router-dom';

type NavItem = { to: string; label: string; end?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const primaryNavItems: NavItem[] = [
  { to: '/table', label: 'League Table' },
  { to: '/teams', label: 'Team Explorer' },
];

const navGroups: NavGroup[] = [
  {
    label: 'Predictions',
    items: [
      { to: '/preview', label: 'Match Preview' },
      { to: '/fantasy', label: 'Fantasy Fixtures' },
      { to: '/fpl', label: 'FPL Projections' },
    ],
  },
  {
    label: 'Data',
    items: [
      { to: '/results-data', label: 'Results Data' },
      { to: '/source-data', label: 'Source Data' },
    ],
  },
];

const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  [
    'block px-3 py-1.5 rounded transition-colors whitespace-nowrap',
    isActive ? 'bg-amber-500 text-ink-900' : 'text-chalk-200 hover:bg-pitch-700 hover:text-chalk-100',
  ].join(' ');

function NavDropdown({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const location = useLocation();
  const isGroupActive = group.items.some((item) => location.pathname.startsWith(item.to));

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
        <ul className="absolute left-0 top-full mt-1 min-w-[10rem] bg-pitch-900 border border-pitch-700 rounded shadow-lg py-1 z-20 text-sm font-medium">
          {group.items.map((item) => (
            <li key={item.label}>
              <NavLink to={item.to} className={navLinkClasses}>
                {item.label}
              </NavLink>
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
  const lastFixturesSearch = useRef('');
  const onFixturesRoute = location.pathname === '/' || location.pathname === '/fixtures';
  if (onFixturesRoute) {
    lastFixturesSearch.current = location.search;
  }

  const fixturesTo: To = { pathname: '/', search: lastFixturesSearch.current };

  return (
    <div className="min-h-screen bg-chalk-100 text-ink-900 flex flex-col">
      <header className="bg-pitch-900 text-chalk-100 border-b-4 border-amber-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-display uppercase tracking-wide text-xl sm:text-2xl font-semibold">
              Full-Time
            </span>
            <span className="font-mono text-xs text-amber-400 tracking-widest uppercase">
              Results Archive
            </span>
          </div>
          <nav aria-label="Main navigation">
            <ul className="flex flex-wrap items-center gap-1 sm:gap-2 text-sm font-medium">
              <li>
                <NavLink to={fixturesTo} end className={navLinkClasses}>
                  Fixtures
                </NavLink>
              </li>
              {primaryNavItems.map((item) => (
                <li key={item.label}>
                  <NavLink to={item.to} className={navLinkClasses}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
              {navGroups.map((group) => (
                <NavDropdown key={group.label} group={group} />
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full">
        <Outlet />
      </main>

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
