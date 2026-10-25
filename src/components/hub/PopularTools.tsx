// ============================================================================
// src/components/hub/PopularTools.tsx
//
// The "Most useful tools" row (config: src/lib/popularTools.ts). Compact
// cards, two across on a phone, more on wider screens. A click sends the
// GA event `popular_tool_click` with the tool and the page it was on.
// ============================================================================

import { Link } from 'react-router-dom';
import { toolsFor, type PopularTool } from '../../lib/popularTools';
import { trackEvent } from '../../lib/analytics';

export function PopularTools({ from, section, tone = 'light' }: { from: string; section?: PopularTool['section']; tone?: 'light' | 'dark' }) {
  const tools = toolsFor(section);
  const dark = tone === 'dark';
  return (
    <section aria-labelledby={`popular-tools-${from}`} data-testid="popular-tools" className="space-y-3">
      <h2 id={`popular-tools-${from}`} className={`font-display uppercase tracking-wide text-xl ${dark ? 'text-chalk-100' : 'text-ink-900'}`}>
        Most useful tools
      </h2>
      <ul className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
        {tools.map((t) => (
          <li key={t.id}>
            <Link
              to={t.to}
              onClick={() => trackEvent('popular_tool_click', { tool: t.id, from })}
              className={`block h-full rounded-lg border px-3 py-2.5 min-h-11 transition-colors ${
                dark
                  ? 'border-pitch-700 bg-pitch-900 hover:bg-pitch-800 text-chalk-100'
                  : 'border-chalk-300 bg-white hover:border-pitch-600 hover:bg-chalk-100 text-ink-900'
              }`}
            >
              <span className="block font-medium text-sm">{t.label}</span>
              <span className={`block text-xs mt-0.5 leading-snug ${dark ? 'text-chalk-300' : 'text-ink-500'}`}>{t.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
