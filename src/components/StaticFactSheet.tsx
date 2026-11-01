// ============================================================================
// src/components/StaticFactSheet.tsx
//
// A server-only summary body for a page whose real body is an interactive
// tool that loads its data in the browser (Team Strength, Match Projections,
// Starting Lineups, Head to Heads, Player Scout, FPL Live). The static build
// renders it into the page's HTML so crawlers that don't run JavaScript (AI
// retrieval, link previews) get the key facts, numbers and links (audit 1 Nov
// 2026). Built by src/lib/staticSummaries.ts from the build's bulk reads.
//
// The app replaces it when it starts (createRoot, not hydration), so there is
// no hydration to mismatch; visitors only see it before the script loads.
// ============================================================================

import { Link } from 'react-router-dom';

export type FactCell = string | number | { text: string; to?: string };

export type FactTable = {
  columns: string[];
  /** Per column; left when omitted. */
  align?: ('left' | 'right')[];
  rows: FactCell[][];
  caption?: string;
};

export type FactSection = {
  heading: string;
  text?: string;
  table?: FactTable;
  links?: { to: string; label: string; note?: string }[];
};

export type FactSheet = {
  title: string;
  /** The opening sentence: plain, dated and built from the data. */
  lead: string;
  intro?: string;
  sections: FactSection[];
  related?: { to: string; label: string }[];
};

function Cell({ cell }: { cell: FactCell }) {
  if (typeof cell === 'object') {
    return cell.to ? <Link to={cell.to} className="text-pitch-800 underline underline-offset-2">{cell.text}</Link> : <>{cell.text}</>;
  }
  return <>{cell}</>;
}

export default function StaticFactSheet({ sheet }: { sheet: FactSheet }) {
  return (
    <article className="space-y-6" data-static-summary="">
      <header>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900">{sheet.title}</h1>
        <p className="text-ink-900 mt-2 max-w-prose">{sheet.lead}</p>
        {sheet.intro && <p className="text-ink-700 mt-1 max-w-prose text-sm">{sheet.intro}</p>}
      </header>
      {sheet.sections.map((s) => (
        <section key={s.heading}>
          <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">{s.heading}</h2>
          {s.text && <p className="text-ink-700 text-sm mt-1 max-w-prose">{s.text}</p>}
          {s.table && (
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm border border-chalk-300">
                {s.table.caption && s.table.caption !== s.heading && <caption className="sr-only">{s.table.caption}</caption>}
                <thead className="bg-chalk-200 text-ink-500">
                  <tr>
                    {s.table.columns.map((c, i) => (
                      <th key={c} scope="col" className={`px-2 py-1.5 text-xs font-medium ${s.table!.align?.[i] === 'right' ? 'text-right' : 'text-left'}`}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.table.rows.map((r, ri) => (
                    <tr key={ri} className={ri % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                      {r.map((cell, ci) => (
                        <td key={ci} className={`px-2 py-1 text-xs ${s.table!.align?.[ci] === 'right' ? 'text-right font-mono tabular-nums' : 'text-left'}`}>
                          <Cell cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {s.links && s.links.length > 0 && (
            <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 text-sm">
              {s.links.map((l) => (
                <li key={`${l.to}|${l.label}`}>
                  <Link to={l.to} className="text-pitch-800 underline underline-offset-2">{l.label}</Link>
                  {l.note && <span className="text-ink-500 text-xs"> &middot; {l.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {sheet.related && sheet.related.length > 0 && (
        <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {sheet.related.map((l) => (
            <Link key={l.to} to={l.to} className="text-pitch-800 underline underline-offset-2">{l.label}</Link>
          ))}
        </nav>
      )}
    </article>
  );
}
