// ============================================================================
// src/components/articles/ArticleLayout.tsx
//
// Shared frame for the FPL articles: breadcrumb eyebrow, title, the
// question, a one-line verdict box, the body, then "How this was worked
// out" and links on. Static; renders on the server.
// ============================================================================

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { ARTICLES_DATA_AS_OF, ARTICLES_PATH, type ArticleMeta } from '../../lib/fplArticles';

export const H2 = 'font-display uppercase tracking-wide text-lg text-ink-900';
export const PROSE = 'text-ink-700 max-w-prose space-y-3';
export const LINK = 'text-pitch-800 underline underline-offset-2';

type Props = {
  meta: ArticleMeta;
  method: ReactNode;
  next: { label: string; to: string }[];
  children: ReactNode;
};

export default function ArticleLayout({ meta, method, next, children }: Props) {
  useDocumentHead({ title: meta.title, description: meta.description, path: meta.path });
  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to="/fpl/start" className="hover:underline">FPL</Link> &middot; <Link to={ARTICLES_PATH} className="hover:underline">Articles</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">{meta.title}</h1>
        <p className="font-mono text-xs text-ink-500 mt-2">
          Published {new Date(`${meta.published}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} &middot; data to {meta.dataAsOf ?? ARTICLES_DATA_AS_OF}
        </p>
      </header>

      <section aria-label="Short answer" className="rounded-lg border-l-4 border-pitch-700 bg-chalk-100 px-4 py-3 max-w-prose">
        <p className="text-xs font-mono uppercase tracking-widest text-ink-500">Short answer</p>
        <p className="text-ink-900 mt-1">{meta.verdict}</p>
      </section>

      {children}

      <section aria-labelledby="method-heading" className="rounded-lg border border-chalk-300 bg-white p-4 max-w-prose">
        <h2 id="method-heading" className={H2}>How this was worked out</h2>
        <div className="text-sm text-ink-700 space-y-2 mt-2">{method}</div>
      </section>

      <nav aria-label="Where next" className="text-sm">
        <p className="text-ink-500">Where next:</p>
        <ul className="mt-1 space-y-1">
          {next.map((n) => (
            <li key={n.to}><Link to={n.to} className={LINK}>{n.label}</Link></li>
          ))}
        </ul>
      </nav>
    </article>
  );
}

/** A small stat callout row: big number, short label. */
export function StatRow({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-2xl">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border border-chalk-300 bg-white px-3 py-2">
          <dt className="sr-only">{s.label}</dt>
          <dd className="font-mono text-2xl text-pitch-800 tabular-nums">{s.value}</dd>
          <dd className="text-xs text-ink-500 leading-snug">{s.label}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Simple data table in the site's table style. */
export function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-sm border border-chalk-300 rounded-lg overflow-hidden">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-chalk-200 text-ink-500">
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={`${i === 0 ? 'text-left' : 'text-right'} font-medium text-xs px-3 py-2`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="text-left px-3 py-1.5 font-normal whitespace-nowrap">{c}</th>
                ) : (
                  <td key={j} className="px-3 py-1.5 text-right font-mono text-xs tabular-nums whitespace-nowrap">{c}</td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
