// ============================================================================
// src/components/tennis/TourToggle.tsx
//
// ATP | WTA switch used at the top of every tennis page. Links, not buttons,
// so each tour's view has its own URL.
// ============================================================================

import { Link } from 'react-router-dom';
import { TOURS, type Tour } from '../../lib/tennisStats';

export default function TourToggle({ tour, to }: { tour: Tour; to: (t: Tour) => string | null }) {
  return (
    <div role="group" aria-label="Tour" className="inline-flex rounded-md border border-chalk-300 overflow-hidden text-sm" data-testid="tour-toggle">
      {TOURS.map((t) => {
        const href = to(t);
        const cls = `px-3 py-1 font-medium ${t === tour ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-pitch-800 hover:bg-chalk-200'}`;
        if (t === tour || href == null) {
          return (
            <span key={t} aria-current={t === tour ? 'page' : undefined} className={`${cls} ${href == null && t !== tour ? 'opacity-40' : ''}`}>
              {t}
            </span>
          );
        }
        return (
          <Link key={t} to={href} className={cls}>
            {t}
          </Link>
        );
      })}
    </div>
  );
}
