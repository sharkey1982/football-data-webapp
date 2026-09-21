// ============================================================================
// src/pages/football/TeamFinancePage.tsx
//
// A club's published statutory accounts, for a football supporter rather than
// an accountant. Reusable for any club with rows in finance_published_periods;
// Southend is simply the first.
//
// Accepts initialData for static generation, exactly as TeamPage does, so
// the pre-rendered HTML carries the real figures before hydration.
//
// Data-quality rules, shown to the reader as well as enforced:
//   * Not disclosed (null) is never shown as zero.
//   * Zero is shown as £0.
//   * Negative values are labelled in words: Operating loss, Net liabilities.
//   * Non-comparable periods are flagged, never smoothed over.
//   * Statutory figures and FixtureShark-derived figures are labelled apart.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import FinanceBarChart, { type ChartPoint } from '../../components/finance/FinanceBarChart';
import {
  getClubFinanceBySlug,
  latestPeriod,
  type ClubFinanceData,
  type FinanceMetricKey,
  type FinancePeriod,
} from '../../lib/financeApi';
import {
  NOT_DISCLOSED,
  formatCount,
  formatMoneyFull,
  formatMoneyShort,
  formatRatio,
  fyLabel,
  isSignedMetric,
  longDate,
  neutralLabel,
  scaled,
  seasonLabel,
  signedMoney,
} from '../../lib/financeFormat';

type Props = { initialData?: ClubFinanceData | null };

/** Display order for the full table; the dictionary supplies names. */
const TABLE_ORDER: FinanceMetricKey[] = [
  'revenue_total', 'revenue_matchday', 'revenue_broadcast', 'revenue_commercial', 'revenue_other',
  'staff_costs', 'operating_profit', 'profit_before_tax', 'profit_after_tax',
  'player_amortisation', 'player_impairment', 'profit_on_player_disposals',
  'cash', 'borrowings', 'total_assets', 'total_liabilities', 'net_assets', 'average_employees',
];

const SUMMARY: FinanceMetricKey[] = [
  'revenue_total', 'operating_profit', 'profit_before_tax', 'cash', 'borrowings', 'net_assets', 'average_employees',
];

const TRENDS: FinanceMetricKey[] = ['revenue_total', 'profit_before_tax', 'cash', 'net_assets', 'average_employees', 'staff_costs'];

const isCount = (k: string) => k === 'average_employees';

function metricValue(p: FinancePeriod, k: FinanceMetricKey): number | null {
  return isCount(k) ? p[k] : scaled(p[k], p.unit_scale);
}

export default function TeamFinancePage({ initialData }: Props = {}) {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<ClubFinanceData | null | undefined>(initialData === undefined ? undefined : initialData);
  const [error, setError] = useState(false);
  const [openSources, setOpenSources] = useState(false);
  const [sourceMetric, setSourceMetric] = useState<FinanceMetricKey>('revenue_total');

  useEffect(() => {
    if (initialData !== undefined || !slug) return;
    let cancelled = false;
    getClubFinanceBySlug(slug)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [slug, initialData]);

  const team = data?.team;
  const periods = data?.periods ?? [];
  const latest = latestPeriod(periods);
  const names = useMemo(() => new Map((data?.dictionary ?? []).map((d) => [d.metric_key, d])), [data]);
  const nameOf = (k: string) => names.get(k)?.display_name ?? k.replace(/_/g, ' ');

  useDocumentHead({
    title: team ? `${team.display_name} finances \u2014 revenue, profit and loss, cash` : 'Club finances',
    description: team && latest
      ? `${team.display_name}'s statutory accounts, ${fyLabel(periods[0].period_end)}\u2013${fyLabel(latest.period_end)}, from Companies House: revenue, profit and loss, cash, borrowings and net assets.`
      : 'Club finances from statutory accounts filed at Companies House.',
    path: `/football/teams/${slug ?? ''}/finances`,
  });

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Club finances</h1>
        <p className="text-ink-700">The finance data could not be loaded just now. Please try again shortly.</p>
      </div>
    );
  }
  if (data === undefined) return <p className="text-ink-500">Loading accounts&hellip;</p>;
  if (data === null) {
    return (
      <div className="space-y-3">
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Team not found</h1>
        <p><Link to="/teams" className="text-pitch-800 underline underline-offset-2">Browse all teams</Link></p>
      </div>
    );
  }
  if (!latest) {
    return (
      <div className="space-y-3">
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">{data.team.display_name} finances</h1>
        <p className="text-ink-700">
          FixtureShark has not yet published accounts for {data.team.display_name}. Figures appear here only once a
          filing has been checked, so nothing is shown rather than anything estimated.
        </p>
        <p className="space-x-4">
          <Link to={`/football/teams/${data.team.slug}`} className="text-pitch-800 underline underline-offset-2">{data.team.display_name}</Link>
          <Link to="/finance" className="text-pitch-800 underline underline-offset-2">Clubs with published accounts</Link>
        </p>
      </div>
    );
  }

  const prev = periods.length > 1 ? periods[periods.length - 2] : null;
  const derivedByPeriod = new Map((data.derived ?? []).filter((d) => d.metric_key === 'staff_cost_ratio').map((d) => [d.period_end, d]));
  const nonComparable = periods.filter((p) => !p.is_comparable);
  const shownRows = TABLE_ORDER.filter((k) => periods.some((p) => p[k] != null));
  const neverDisclosed = TABLE_ORDER.filter((k) => !periods.some((p) => p[k] != null));

  const moneyText = (k: FinanceMetricKey, v: number | null, full = false) =>
    isCount(k) ? formatCount(v) : isSignedMetric(k) ? (() => { const s = signedMoney(k, v, nameOf(k), !full); return v == null ? s.amount : `${s.label} ${s.amount}`; })()
      : full ? formatMoneyFull(v) : formatMoneyShort(v);

  // The story in brief: only compares with the previous year when BOTH are
  // comparable -- a change across a non-comparable period would mislead.
  const rev = metricValue(latest, 'revenue_total');
  const revPrev = prev ? metricValue(prev, 'revenue_total') : null;
  const canCompare = !!prev && prev.is_comparable && latest.is_comparable && rev != null && revPrev != null;
  const op = metricValue(latest, 'operating_profit');
  const na = metricValue(latest, 'net_assets');

  return (
    <div className="space-y-8">
      {/* 1. HEADER */}
      <header className="space-y-2">
        <p className="font-mono text-xs text-amber-600 uppercase tracking-widest">Club finances &middot; statutory accounts</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900">{data.team.display_name} finances</h1>
        <dl className="text-sm text-ink-700 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="text-ink-500">Reporting entity</dt><dd>{latest.reporting_entity ?? NOT_DISCLOSED}</dd>
          <dt className="text-ink-500">Latest period</dt>
          <dd>Year to {longDate(latest.period_end)} ({fyLabel(latest.period_end)} &middot; the {seasonLabel(latest.period_end)} season)</dd>
          <dt className="text-ink-500">Company number</dt><dd className="font-mono">{latest.company_number ?? NOT_DISCLOSED}</dd>
          <dt className="text-ink-500">Accounts</dt>
          <dd>{latest.is_consolidated == null ? NOT_DISCLOSED : latest.is_consolidated ? 'Consolidated (whole group)' : 'Company only (not the wider group)'}</dd>
          {latest.filing_date && (<><dt className="text-ink-500">Filed</dt><dd>{longDate(latest.filing_date)}</dd></>)}
        </dl>
        <p className="text-sm text-ink-700 max-w-prose">
          These figures come from the accounts the club files by law at Companies House. Anything a filing does not
          disclose is shown as <em>Not disclosed</em> &mdash; FixtureShark never estimates it.
          {latest.source_url && (<> <a href={latest.source_url} className="text-pitch-800 underline underline-offset-2" rel="noopener">Read the original {fyLabel(latest.period_end)} filing</a>.</>)}
        </p>
        <p className="text-sm">
          <Link to={`/football/teams/${data.team.slug}`} className="text-pitch-800 underline underline-offset-2">&larr; {data.team.display_name}</Link>
        </p>
      </header>

      {/* The story in brief, in plain English */}
      <section aria-labelledby="brief" className="rounded-lg bg-pitch-950 text-chalk-100 p-4 space-y-1">
        <h2 id="brief" className="font-display uppercase tracking-wide text-lg text-amber-400">In brief</h2>
        <p className="text-sm">
          In the year to {longDate(latest.period_end)}, {data.team.display_name} brought in {rev == null ? 'revenue that was not disclosed' : `revenue of ${formatMoneyShort(rev)}`}
          {canCompare ? `, ${rev! >= revPrev! ? 'up' : 'down'} from ${formatMoneyShort(revPrev)} the year before` : ''}.
          {op != null && ` The club made an ${op < 0 ? 'operating loss' : 'operating profit'} of ${formatMoneyShort(Math.abs(op))}`}
          {op != null && na != null && ` and ended the year with ${na < 0 ? 'net liabilities' : 'net assets'} of ${formatMoneyShort(Math.abs(na))}`}
          {op != null ? '.' : ''}
          {prev && !prev.is_comparable && ` ${fyLabel(prev.period_end)} is not directly comparable, so no year-on-year change is given.`}
        </p>
        <p className="text-xs text-chalk-300">
          More revenue is not the same as financial health: read it alongside profit or loss, cash and net assets.
        </p>
      </section>

      {/* 2. LATEST-PERIOD SUMMARY */}
      <section aria-labelledby="summary">
        <h2 id="summary" className="font-display uppercase tracking-wide text-lg text-ink-900 mb-2">{fyLabel(latest.period_end)} at a glance</h2>
        <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SUMMARY.map((k) => {
            const v = metricValue(latest, k);
            const label = isSignedMetric(k) ? signedMoney(k, v, nameOf(k)).label : nameOf(k);
            const amount = isCount(k) ? formatCount(v) : isSignedMetric(k) ? signedMoney(k, v, nameOf(k)).amount : formatMoneyShort(v);
            const full = isCount(k) ? '' : isSignedMetric(k) ? signedMoney(k, v, nameOf(k), false).amount : formatMoneyFull(v);
            return (
              <li key={k} className="rounded-lg border border-ink-500/20 bg-white/60 p-3" data-metric={k}>
                <p className="text-xs text-ink-500">{label}</p>
                <p className={`font-display text-2xl ${v == null ? 'text-ink-500 text-base py-1' : v < 0 && isSignedMetric(k) ? 'text-loss-600' : 'text-ink-900'}`}>{amount}</p>
                {v != null && !isCount(k) && <p className="text-[11px] font-mono text-ink-500">{full}</p>}
                <button type="button" className="text-[11px] text-pitch-800 underline underline-offset-2 mt-1"
                  onClick={() => { setSourceMetric(k); setOpenSources(true); document.getElementById('sources')?.scrollIntoView({ behavior: 'smooth' }); }}>
                  Source
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 3. TRENDS */}
      <section aria-labelledby="trends" className="space-y-2">
        <h2 id="trends" className="font-display uppercase tracking-wide text-lg text-ink-900">Over time</h2>
        {nonComparable.length > 0 && (
          <p className="text-sm text-amber-600" role="note">
            {'\u2020'} {nonComparable.map((p) => fyLabel(p.period_end)).join(', ')} {nonComparable.length === 1 ? 'is' : 'are'} not directly comparable:
            later accounts restated {nonComparable.length === 1 ? 'that year' : 'those years'}, so {nonComparable.length === 1 ? 'it is' : 'they are'} shown
            hatched and no trend is drawn through {nonComparable.length === 1 ? 'it' : 'them'}.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {TRENDS.map((k) => {
            const points: ChartPoint[] = periods.map((p) => ({ label: fyLabel(p.period_end), value: metricValue(p, k), comparable: p.is_comparable }));
            const title = isSignedMetric(k) ? neutralLabel(k, nameOf(k)) : nameOf(k);
            return (
              <FinanceBarChart key={k} id={k} title={title} points={points}
                format={(v) => (isCount(k) ? formatCount(v) : formatMoneyShort(v))}
                describe={(v) => moneyText(k, v)}
                note={k === 'revenue_total' ? 'Bigger is not automatically healthier.' : k === 'staff_costs' && periods.some((p) => p.staff_costs == null) ? 'Missing bars were not disclosed in that year\u2019s filing.' : undefined} />
            );
          })}
        </div>
      </section>

      {/* 4. FULL ANNUAL TABLE */}
      <section aria-labelledby="annual" className="space-y-2">
        <h2 id="annual" className="font-display uppercase tracking-wide text-lg text-ink-900">Every year</h2>
        <div className="overflow-x-auto rounded-lg border border-ink-500/20" tabIndex={0} role="region" aria-labelledby="annual">
          <table className="min-w-full text-sm">
            <caption className="sr-only">{data.team.display_name} published figures by financial year</caption>
            <thead className="bg-chalk-200">
              <tr>
                <th scope="col" className="sticky left-0 bg-chalk-200 text-left px-3 py-2 font-mono text-xs text-ink-500 font-normal">Figure</th>
                {periods.map((p) => (
                  <th key={p.period_end} scope="col" className={`px-3 py-2 text-right font-mono text-xs font-normal whitespace-nowrap ${p.is_comparable ? 'text-ink-700' : 'text-amber-600'}`}>
                    {fyLabel(p.period_end)}{p.is_comparable ? '' : ' \u2020'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownRows.map((k) => (
                <tr key={k} className="border-t border-ink-500/10" data-metric={k}>
                  <th scope="row" className="sticky left-0 bg-chalk-100 text-left px-3 py-1.5 font-normal whitespace-nowrap">
                    {isSignedMetric(k) ? neutralLabel(k, nameOf(k)) : nameOf(k)}
                  </th>
                  {periods.map((p) => {
                    const v = metricValue(p, k);
                    return (
                      <td key={p.period_end} className={`px-3 py-1.5 text-right font-mono whitespace-nowrap ${v == null ? 'text-ink-500' : v < 0 ? 'text-loss-600' : ''}`}
                        title={v == null ? NOT_DISCLOSED : isCount(k) ? formatCount(v) : moneyText(k, v, true)}>
                        {v == null ? <span aria-label={NOT_DISCLOSED}>&mdash;</span> : isCount(k) ? formatCount(v) : formatMoneyShort(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {derivedByPeriod.size > 0 && (
                <tr className="border-t-2 border-amber-500/40" data-metric="staff_cost_ratio">
                  <th scope="row" className="sticky left-0 bg-chalk-100 text-left px-3 py-1.5 font-normal whitespace-nowrap">
                    Staff costs as a share of revenue <span className="ml-1 rounded bg-amber-400/30 px-1 text-[10px] font-mono">FixtureShark-derived</span>
                  </th>
                  {periods.map((p) => {
                    const d = derivedByPeriod.get(p.period_end);
                    return (
                      <td key={p.period_end} className={`px-3 py-1.5 text-right font-mono ${d?.value == null ? 'text-ink-500' : ''}`}>
                        {d?.value == null ? <span aria-label={NOT_DISCLOSED}>&mdash;</span> : formatRatio(d.value)}
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ul className="text-xs text-ink-500 space-y-0.5">
          <li><span className="font-mono">&mdash;</span> Not disclosed in that year&rsquo;s filing. A disclosed zero is shown as &pound;0.</li>
          <li>Negative figures, in red, are losses or net liabilities.</li>
          {nonComparable.length > 0 && <li className="text-amber-600">{'\u2020'} Not directly comparable with the years either side.</li>}
          <li>Rows marked <span className="font-mono">FixtureShark-derived</span> are calculated by FixtureShark from the filed figures; everything else is as filed.</li>
          {neverDisclosed.length > 0 && <li>Not disclosed in any period: {neverDisclosed.map(nameOf).join(', ')}.</li>}
        </ul>
      </section>

      {/* 5. SOURCES AND DEFINITIONS */}
      <section id="sources" aria-labelledby="sources-h" className="space-y-2">
        <h2 id="sources-h" className="font-display uppercase tracking-wide text-lg text-ink-900">Sources and definitions</h2>
        <details open={openSources} onToggle={(e) => setOpenSources((e.target as HTMLDetailsElement).open)} className="rounded-lg border border-ink-500/20 bg-white/60 p-3">
          <summary className="cursor-pointer text-sm text-pitch-800 underline underline-offset-2">Where each figure comes from</summary>
          <div className="mt-3 space-y-3">
            <label className="text-sm text-ink-700">
              Figure{' '}
              <select className="ml-1 border border-ink-500/30 rounded px-2 py-1 text-sm" value={sourceMetric} onChange={(e) => setSourceMetric(e.target.value as FinanceMetricKey)}>
                {shownRows.map((k) => <option key={k} value={k}>{nameOf(k)}</option>)}
              </select>
            </label>
            {names.get(sourceMetric)?.definition && <p className="text-sm text-ink-700">{names.get(sourceMetric)!.definition}</p>}
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <caption className="sr-only">Sources for {nameOf(sourceMetric)}</caption>
                <thead>
                  <tr className="text-ink-500 font-mono">
                    <th scope="col" className="text-left font-normal pr-3">Year</th>
                    <th scope="col" className="text-right font-normal pr-3">Published</th>
                    <th scope="col" className="text-left font-normal pr-3">XBRL concept</th>
                    <th scope="col" className="text-right font-normal pr-3">As filed</th>
                    <th scope="col" className="text-left font-normal pr-3">Filing</th>
                    <th scope="col" className="text-right font-normal pr-3">Mapping</th>
                    <th scope="col" className="text-left font-normal">Document</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => {
                    const pv = (data.provenance ?? []).find((r) => r.period_end === p.period_end && r.metric_key === sourceMetric);
                    const v = metricValue(p, sourceMetric);
                    return (
                      <tr key={p.period_end} className="border-t border-ink-500/10 align-top">
                        <th scope="row" className="text-left font-normal pr-3 py-1">{fyLabel(p.period_end)}{p.is_comparable ? '' : ' \u2020'}</th>
                        <td className="text-right font-mono pr-3 py-1">{v == null ? NOT_DISCLOSED : isCount(sourceMetric) ? formatCount(v) : formatMoneyFull(v)}</td>
                        <td className="font-mono pr-3 py-1 break-all">{pv?.original_xbrl_concept ?? '\u2014'}</td>
                        <td className="text-right font-mono pr-3 py-1">{pv?.original_value != null ? `${pv.original_value}${pv.original_unit ? ` ${pv.original_unit}` : ''}` : '\u2014'}</td>
                        <td className="pr-3 py-1">{pv?.filing_reference ?? '\u2014'}</td>
                        <td className="text-right font-mono pr-3 py-1">{pv?.mapping_version != null ? `v${pv.mapping_version}` : '\u2014'}</td>
                        <td className="py-1">
                          {pv?.source_url ?? p.source_url
                            ? <a href={(pv?.source_url ?? p.source_url)!} className="text-pitch-800 underline underline-offset-2" rel="noopener">Filing</a>
                            : '\u2014'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-ink-500">
              &ldquo;As filed&rdquo; is the value exactly as it appears in the filing&rsquo;s machine-readable (iXBRL) data. A dash means the filing did not
              disclose this figure. The mapping version records which rule turned the filed concept into this figure.
            </p>
          </div>
        </details>
        <details className="rounded-lg border border-ink-500/20 bg-white/60 p-3">
          <summary className="cursor-pointer text-sm text-pitch-800 underline underline-offset-2">What each figure means</summary>
          <dl className="mt-3 space-y-2 text-sm">
            {shownRows.map((k) => (
              <div key={k}>
                <dt className="font-semibold text-ink-900">{isSignedMetric(k) ? neutralLabel(k, nameOf(k)) : nameOf(k)}</dt>
                <dd className="text-ink-700">{names.get(k)?.definition ?? 'As filed in the statutory accounts.'}</dd>
              </div>
            ))}
            {derivedByPeriod.size > 0 && (
              <div>
                <dt className="font-semibold text-ink-900">Staff costs as a share of revenue <span className="font-mono text-[10px]">(FixtureShark-derived)</span></dt>
                <dd className="text-ink-700">{[...derivedByPeriod.values()][0]?.definition ?? 'Staff costs divided by revenue.'}</dd>
              </div>
            )}
          </dl>
        </details>
      </section>

      <p className="text-sm">
        <Link to="/finance" className="text-pitch-800 underline underline-offset-2">All clubs with published accounts</Link>
      </p>
    </div>
  );
}
