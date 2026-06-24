import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Fixtures', end: true },
  { to: '/preview', label: 'Match Preview' },
  { to: '/teams', label: 'Team Explorer' },
  { to: '/matches', label: 'Match Explorer' },
];

export default function AppLayout() {
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
            <ul className="flex flex-wrap gap-1 sm:gap-2 text-sm font-medium">
              {navItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      [
                        'inline-block px-3 py-1.5 rounded transition-colors',
                        isActive
                          ? 'bg-amber-500 text-ink-900'
                          : 'text-chalk-200 hover:bg-pitch-700 hover:text-chalk-100',
                      ].join(' ')
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full">
        <Outlet />
      </main>

      <footer className="border-t border-chalk-300 py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-xs text-ink-500 font-mono">
          Data sourced from football-data.co.uk &middot; England, 2014/15&ndash;2025/26
        </div>
      </footer>
    </div>
  );
}
