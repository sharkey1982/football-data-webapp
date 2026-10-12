// ============================================================================
// src/pages/fpl/GameweekHubPage.tsx
//
// /fpl/gameweek -- the weekly FPL log: every published preview (Thursday)
// and reflection (Tuesday), newest first, grouped by season. Rendered at
// build with initialData.
// ============================================================================

import { Link } from 'react-router-dom';
import { H2, LINK, PROSE } from '../../components/articles/ArticleLayout';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { GAMEWEEK_HUB_PATH, loadReportList, reportPath, seasonDisplay, type ReportListEntry } from '../../lib/fplGameweekReport';

export const GAMEWEEK_HUB_TITLE = 'FPL gameweek log: previews and reflections';
export const GAMEWEEK_HUB_DESCRIPTION =
  'A reflection every Tuesday on what the gameweek did to the numbers (goals against the model, minutes, positions, set pieces, captaincy) and a preview every Thursday.';

export default function GameweekHubPage({ initialData }: { initialData?: ReportListEntry[] }) {
  const { data, failed } = useKeyedFetch('hub', loadReportList, initialData ? { key: 'hub', data: initialData } : undefined);
  useDocumentHead({ title: GAMEWEEK_HUB_TITLE, description: GAMEWEEK_HUB_DESCRIPTION, path: GAMEWEEK_HUB_PATH });
  const bySeason = new Map<string, ReportListEntry[]>();
  for (const r of data ?? []) {
    const list = bySeason.get(r.season_label) ?? [];
    list.push(r);
    bySeason.set(r.season_label, list);
  }
  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to="/fpl/start" className="hover:underline">FPL</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Gameweek log</h1>
        <p className={`${PROSE} mt-2`}>{GAMEWEEK_HUB_DESCRIPTION}</p>
      </header>
      {failed ? <p className="text-ink-700">Couldn&rsquo;t load the log. Try again shortly.</p> : null}
      {data && data.length === 0 ? <p className="text-ink-500">The first reflection is on its way.</p> : null}
      {[...bySeason.entries()].map(([season, rows]) => (
        <section key={season} aria-labelledby={`s-${season}`} className="space-y-2">
          <h2 id={`s-${season}`} className={H2}>{seasonDisplay(season)}</h2>
          <ul className="space-y-3 max-w-prose">
            {rows.map((r) => (
              <li key={`${r.fpl_event_id}-${r.kind}`}>
                <Link to={reportPath(r.season_label, r.fpl_event_id, r.kind)} className={`${LINK} font-medium`}>
                  GW{r.fpl_event_id} {r.kind}
                </Link>
                {r.summary ? <p className="text-sm text-ink-700 mt-0.5">{r.summary}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
