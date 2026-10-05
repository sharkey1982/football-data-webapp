// ============================================================================
// src/components/PreviewTabs.tsx
//
// The tab strip of a match preview: Prediction / Head to Head / Home Team /
// Away Team. Shared by Football's Head to Heads (/preview) and the NFL game
// page (/nfl/games/:gameId) so the two stay one layout (Chris, 5 Oct 2026);
// src/lib/layoutPairs.ts checks both keep using it.
// ============================================================================

import { PREVIEW_TABS, type PreviewTabId } from '../lib/previewTabs';

export default function PreviewTabs({ active, onChange, labels }: { active: PreviewTabId; onChange: (t: PreviewTabId) => void; labels?: Partial<Record<PreviewTabId, string>> }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-chalk-300">
      {PREVIEW_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          aria-pressed={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={[
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            active === tab.id ? 'border-amber-500 text-pitch-800' : 'border-transparent text-ink-500 hover:text-ink-700',
          ].join(' ')}
        >
          {labels?.[tab.id] ?? tab.label}
        </button>
      ))}
    </div>
  );
}
