// ============================================================================
// src/pages/fpl/PriceRiskPage.tsx
//
// Bullpit: FPL price changes, from FPL's own predictor (26 Oct 2026; was a
// net-transfers / ownership "pressure" ranking that got 4% of its top-3
// risers right). Expected tonight, could go tonight, closest to the line,
// what changed last night, and how often FPL's predictor has been right.
// These are FPL's figures, said so on the page.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import {
  fmtProgress,
  getPriceChangeRisk,
  getPriceRecord,
  getRecentPriceChanges,
  type PriceChange,
  type PriceRecord,
  type PriceRisk,
} from '../../lib/priceRiskApi';

type Dir = 'both' | 'rise' | 'fall';

function PlayerName({ slug, name, pos }: { slug: string | null; name: string; pos?: string }) {
  return (
    <>
      {slug ? (
        <Link to={`/fpl/players/${slug}`} className="text-pitch-800 underline underline-offset-2">
          {name}
        </Link>
      ) : (
        name
      )}
      {pos && <span className="text-ink-500"> {pos}</span>}
    </>
  );
}

function ProgressBar({ value }: { value: number }) {
  const up = value >= 0;
  const w = Math.min(Math.abs(value), 100);
  return (
    <span className="inline-flex items-center gap-2 justify-end w-full">
      <span aria-hidden="true" className="hidden sm:inline-block w-20 h-2 rounded bg-chalk-200 overflow-hidden">
        <span className={`block h-full ${up ? 'bg-pitch-700' : 'bg-loss-700'}`} style={{ width: `${w}%` }} />
      </span>
      <span className={`font-medium ${up ? 'text-pitch-800' : 'text-loss-700'}`}>{fmtProgress(value)}</span>
    </span>
  );
}

function PriceTable({ rows, empty }: { rows: PriceRisk[]; empty: string }) {
  if (rows.length === 0) return <p className="text-ink-500 text-sm">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
        <thead className="bg-chalk-200 text-ink-500">
          <tr>
            <th scope="col" className="text-left font-medium text-xs px-3 py-2">Player</th>
            <th scope="col" className="text-left font-medium text-xs px-3 py-2">Way</th>
            <th scope="col" className="text-left font-medium text-xs px-3 py-2">Team</th>
            <th scope="col" className="text-right font-medium text-xs px-3 py-2">Price</th>
            <th scope="col" className="text-right font-medium text-xs px-3 py-2">Owned</th>
            <th scope="col" className="text-right font-medium text-xs px-3 py-2">Progress</th>
            <th scope="col" className="text-right font-medium text-xs px-3 py-2">FPL&rsquo;s next update</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-chalk-200">
          {rows.map((r) => (
            <tr key={r.fpl_player_id} className="bg-white">
              <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">
                <PlayerName slug={r.slug} name={r.web_name} pos={r.position_label} />
              </th>
              <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                <span className={r.direction === 'rise' ? 'text-pitch-800 font-medium' : 'text-loss-700 font-medium'}>
                  {r.direction === 'rise' ? '↑ rise' : '↓ fall'}
                </span>
              </td>
              <td className="px-3 py-1.5 text-xs text-ink-700">{r.team_name ?? '—'}</td>
              <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">&pound;{r.price.toFixed(1)}m</td>
              <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.ownership.toFixed(1)}%</td>
              <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                <ProgressBar value={r.progress ?? r.pressure} />
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-ink-700">{fmtProgress(r.projected_next)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChangesTable({ rows }: { rows: PriceChange[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
        <thead className="bg-chalk-200 text-ink-500">
          <tr>
            <th scope="col" className="text-left font-medium text-xs px-3 py-2">Player</th>
            <th scope="col" className="text-left font-medium text-xs px-3 py-2">Team</th>
            <th scope="col" className="text-right font-medium text-xs px-3 py-2">Price</th>
            <th scope="col" className="text-right font-medium text-xs px-3 py-2">Owned</th>
            <th scope="col" className="text-right font-medium text-xs px-3 py-2">FPL the evening before</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-chalk-200">
          {rows.map((r) => {
            const up = r.price_after > r.price_before;
            return (
              <tr key={r.fpl_player_id} className="bg-white">
                <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">
                  <span className={up ? 'text-pitch-800' : 'text-loss-700'} aria-label={up ? 'Rose' : 'Fell'}>{up ? '▲' : '▼'}</span>{' '}
                  <PlayerName slug={r.slug} name={r.web_name} pos={r.position_label} />
                </th>
                <td className="px-3 py-1.5 text-xs text-ink-700">{r.team_name ?? '—'}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                  &pound;{r.price_before.toFixed(1)}m &rarr; &pound;{r.price_after.toFixed(1)}m
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.ownership == null ? '—' : `${r.ownership.toFixed(1)}%`}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{fmtProgress(r.progress)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
}

function updatedAt(rows: PriceRisk[]): string | null {
  const t = rows.map((r) => r.updated_at).filter(Boolean).sort().pop();
  if (!t) return null;
  return new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}

export default function PriceRiskPage() {
  const [rows, setRows] = useState<PriceRisk[] | null>(null);
  const [record, setRecord] = useState<PriceRecord | null>(null);
  const [changes, setChanges] = useState<PriceChange[] | null>(null);
  const [show, setShow] = useState<Dir>('both');

  useDocumentHead({
    title: 'Bullpit — FPL price changes tonight',
    description:
      'Which Fantasy Premier League players FPL’s own price predictor expects to rise or fall tonight, who is close, what changed last night, and how often the predictor is right.',
    path: '/fpl/price-risk',
  });

  useEffect(() => {
    getPriceChangeRisk().then(setRows).catch(() => setRows([]));
    getPriceRecord().then(setRecord).catch(() => setRecord(null));
    getRecentPriceChanges().then(setChanges).catch(() => setChanges([]));
  }, []);

  const groups = useMemo(() => {
    const r = (rows ?? [])
      .filter((x) => show === 'both' || x.direction === show)
      .sort((a, b) => Math.abs(b.progress ?? b.pressure) - Math.abs(a.progress ?? a.pressure));
    return {
      expected: r.filter((x) => x.outlook === 'expected'),
      possible: r.filter((x) => x.outlook === 'possible'),
      rest: r.filter((x) => x.outlook !== 'expected' && x.outlook !== 'possible').slice(0, 25),
    };
  }, [rows, show]);

  const shownChanges = (changes ?? []).filter((c) => show === 'both' || (show === 'rise') === c.price_after > c.price_before);

  if (rows === null) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (rows.length === 0) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Bullpit</h1>
        <p className="text-ink-700 mt-2">FPL&rsquo;s price predictor isn&rsquo;t available right now.</p>
      </div>
    );
  }

  const asOf = updatedAt(rows);
  const nightLabel = changes && changes.length > 0 ? longDate(changes[0].night) : null;

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Fantasy &middot; Predict</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Bullpit</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Who FPL expects to rise or fall in price tonight. FPL now publishes its own price predictor: how far each player
          is towards his next change. At 100% (or &minus;100%) FPL expects the change at its next overnight update, just
          after midnight UK time. These are FPL&rsquo;s figures, not ours.
        </p>
        {asOf && <p className="text-ink-500 text-xs mt-2">FPL figures as of {asOf}. Refreshed five times a day, the last at about 10pm.</p>}
      </header>

      {record && (
        <section className="border border-chalk-300 rounded-lg bg-white p-4" aria-labelledby="price-record">
          <h2 id="price-record" className="font-display uppercase tracking-wide text-sm text-ink-900">How often FPL&rsquo;s predictor is right</h2>
          <p className="text-ink-700 text-sm mt-1 max-w-prose">
            Over the last {record.nights} nights, from our evening reading of FPL&rsquo;s figures:{' '}
            <strong>{record.rose} of {record.expected_rises}</strong> players at 100% or more rose, and{' '}
            <strong>{record.fell} of {record.expected_falls}</strong> at &minus;100% or less fell.{' '}
            {record.rises_expected} of {record.rises} rises and {record.falls_expected} of {record.falls} falls were past the
            line the evening before.
            {record.possible > 0 && (
              <> Of players FPL projected past the line but who weren&rsquo;t there yet, {record.possible_changed} of {record.possible} changed.</>
            )}
          </p>
        </section>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Direction">
        {(
          [
            ['both', 'Both'],
            ['rise', '↑ Rising'],
            ['fall', '↓ Falling'],
          ] as [Dir, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === show}
            onClick={() => setShow(k)}
            className={[
              'text-sm rounded px-3 min-h-[44px] border transition-colors',
              k === show
                ? k === 'rise'
                  ? 'bg-pitch-800 text-chalk-100 border-pitch-800'
                  : k === 'fall'
                    ? 'bg-loss-700 text-chalk-100 border-loss-700'
                    : 'bg-ink-900 text-chalk-100 border-ink-900'
                : 'border-chalk-300 text-ink-700 hover:bg-chalk-200',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      <section aria-labelledby="price-expected">
        <h2 id="price-expected" className="font-display uppercase tracking-wide text-lg text-ink-900">Expected tonight</h2>
        <p className="text-ink-700 text-sm mt-1 max-w-prose">Past the line in FPL&rsquo;s figures.</p>
        <div className="mt-2">
          <PriceTable rows={groups.expected} empty="Nobody is past the line right now." />
        </div>
      </section>

      <section aria-labelledby="price-possible">
        <h2 id="price-possible" className="font-display uppercase tracking-wide text-lg text-ink-900">Could go tonight</h2>
        <p className="text-ink-700 text-sm mt-1 max-w-prose">
          Not there yet, but FPL&rsquo;s own projection puts them past the line by its next update.
        </p>
        <div className="mt-2">
          <PriceTable rows={groups.possible} empty="Nobody projected past the line." />
        </div>
      </section>

      <section aria-labelledby="price-close">
        <h2 id="price-close" className="font-display uppercase tracking-wide text-lg text-ink-900">Closest to the line</h2>
        <p className="text-ink-700 text-sm mt-1 max-w-prose">
          Everyone else at 50% or more either way. Players can sit at 90&ndash;99% for days, especially fallers, so this is
          a watch list rather than a call.
        </p>
        <div className="mt-2">
          <PriceTable rows={groups.rest} empty="Nobody else near a change." />
        </div>
      </section>

      {changes && changes.length > 0 && (
        <section aria-labelledby="price-last-night">
          <h2 id="price-last-night" className="font-display uppercase tracking-wide text-lg text-ink-900">
            Changed overnight{nightLabel ? ` after ${nightLabel}` : ''}
          </h2>
          <p className="text-ink-700 text-sm mt-1 max-w-prose">With FPL&rsquo;s figure from our reading that evening.</p>
          <div className="mt-2">
            {shownChanges.length > 0 ? <ChangesTable rows={shownChanges} /> : <p className="text-ink-500 text-sm">None that way.</p>}
          </div>
        </section>
      )}

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/fpl/in-the-papers" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          What managers have already done
        </Link>
        <Link to="/fpl/start/predict" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          More projections
        </Link>
      </nav>
    </article>
  );
}
