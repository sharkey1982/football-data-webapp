// ============================================================================
// src/pages/FinanceComparePage.tsx
//
// /finance/compare -- every club's latest filed accounts, side by side.
// One chart per question, each with a one-line takeaway written from the
// data; a sortable table of everything, linking to each club's page.
// Bars are HTML, not SVG, so names and values stay real text (readable by
// screen readers, crisp when zoomed). Not disclosed is shown as "n/d",
// never as zero. Accepts initialData for static generation.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../hooks/useDocumentHead';
import BarRace from '../components/finance/BarRace';
import { getAllClubFinance } from '../lib/financeApi';
import { fyLabel, formatMoneyShort } from '../lib/financeFormat';
import {
  buildComparison, otherCurrencyClubs, financialYears, forYear, growthTakeaway, money, smallClubIds, wageRatio, wageTakeaway,
  type ComparisonClub,
} from '../lib/financeCompare';
import { divisionOptions, inDivision } from '../lib/financeApi';
import DivisionFilter from '../components/finance/DivisionFilter';
import { mixClubs, mixTakeaway, tradingClubs, tradingTakeaway } from '../lib/financeMix';
import { useDivisionParam } from '../hooks/useDivisionParam';

const nd = <span className="text-ink-500">n/d</span>;
const m = (v: number | null) => (v == null ? nd : formatMoneyShort(v));
const pct = (v: number | null) => (v == null ? nd : `${Math.round(v * 100)}%`);

function Section({ title, takeaway, children }: { title: string; takeaway: string | null; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-ink-500/20 bg-white/60 p-4 space-y-3">
      <div>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">{title}</h2>
        {takeaway && <p className="text-sm text-ink-700">{takeaway}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ name, slug, children, value }: { name: string; slug: string; children: React.ReactNode; value: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2 text-sm">
      <Link to={`/football/teams/${slug}/finances`} className="truncate text-ink-900 hover:text-pitch-800">{name}</Link>
      <div className="relative h-5">{children}</div>
      <span className="font-mono text-xs text-ink-700 text-right whitespace-nowrap">{value}</span>
    </li>
  );
}

export default function FinanceComparePage({ initialData, otherCurrency: initialOther }: { initialData?: ComparisonClub[]; otherCurrency?: string[] } = {}) {
  const [all, setAll] = useState<ComparisonClub[] | undefined>(initialData);
  const [otherCurrency, setOtherCurrency] = useState<string[]>(initialOther ?? []);
  const [error, setError] = useState(false);
  const [includeSmall, setIncludeSmall] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'revenue', dir: -1 });
  const [year, setYear] = useState('latest');

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    getAllClubFinance()
      .then((d) => { if (!cancelled) { setAll(buildComparison(d)); setOtherCurrency(otherCurrencyClubs(d)); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [initialData]);

  useDocumentHead({
    title: 'Compare Club Finances',
    description: 'Football clubs\u2019 latest accounts side by side: revenue, wages, profit and loss, borrowings and cash, from their statutory accounts.',
    path: '/finance/compare',
  });

  // Each club's period for the chosen year ("latest" = its most recent).
  const { view: yearView, missing } = useMemo(() => forYear(all ?? [], year), [all, year]);
  // The division filter uses the division each club played in during the
  // season those accounts cover -- not today's division, which is wrong for
  // most past years (promotion and relegation).
  const asOfSeason = (c: ComparisonClub) => ({ ...c.team, division: c.latest.division ?? null });
  const options = useMemo(() => divisionOptions(yearView.map(asOfSeason)), [yearView]);
  const [division, setDivision] = useDivisionParam(options);
  const inDiv = useMemo(() => yearView.filter((c) => inDivision(asOfSeason(c), division)), [yearView, division]);
  // "Smaller clubs" is judged within the chosen division, so a Championship
  // view is not emptied by Premier League revenue.
  const small = useMemo(() => smallClubIds(inDiv), [inDiv]);
  // clubs: the periods in view -- every chart, takeaway and the table follow
  // it; base: the same clubs across all their years, for the timelapse.
  const clubs = useMemo(() => inDiv.filter((c) => includeSmall || !small.has(c.team.team_id)), [inDiv, includeSmall, small]);
  const base = useMemo(() => {
    const ids = new Set(clubs.map((c) => c.team.team_id));
    return (all ?? []).filter((c) => ids.has(c.team.team_id));
  }, [all, clubs]);

  if (error) return <p className="text-ink-700">The accounts could not be loaded just now. Please try again shortly.</p>;
  if (!all) return <p className="text-ink-500">Loading accounts&hellip;</p>;
  if (!all.length) return <p className="text-ink-700">No club accounts have been published yet.</p>;

  const maxRev = Math.max(...clubs.map((c) => money(c.latest, 'revenue_total') ?? 0), 1);
  const byWage = [...clubs].sort((a, b) => (wageRatio(b.latest) ?? -1) - (wageRatio(a.latest) ?? -1));

  const cols: { key: string; label: string; get: (c: ComparisonClub) => number | null; fmt: (v: number | null) => React.ReactNode }[] = [
    { key: 'revenue', label: 'Revenue', get: (c) => money(c.latest, 'revenue_total'), fmt: m },
    { key: 'wages', label: 'Wages', get: (c) => wageRatio(c.latest), fmt: pct },
    { key: 'op', label: 'Operating', get: (c) => money(c.latest, 'operating_profit'), fmt: m },
    { key: 'pbt', label: 'Pre-tax', get: (c) => money(c.latest, 'profit_before_tax'), fmt: m },
    { key: 'na', label: 'Net assets', get: (c) => money(c.latest, 'net_assets'), fmt: m },
    { key: 'cash', label: 'Cash', get: (c) => money(c.latest, 'cash'), fmt: m },
    { key: 'debt', label: 'Borrowings', get: (c) => money(c.latest, 'borrowings'), fmt: m },
  ];
  const sortCol = cols.find((c) => c.key === sort.key) ?? cols[0];
  const tableRows = [...clubs].sort((a, b) => {
    const va = sortCol.get(a), vb = sortCol.get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; // not disclosed always last
    if (vb == null) return -1;
    return (va - vb) * sort.dir;
  });

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900">Compare Club Finances</h1>
        <DivisionFilter options={options} value={division} onChange={setDivision} total={yearView.length} />
        {options.length > 1 && <p className="text-xs text-ink-500">Division in the season the accounts cover.</p>}
        <label className="flex items-center gap-2 text-sm text-ink-700">
          Year
          <select value={year} onChange={(e) => setYear(e.target.value)} className="border border-ink-500/30 rounded px-2 py-1 text-sm">
            <option value="latest">Latest</option>
            {financialYears(all).map((y) => <option key={y} value={y}>FY{y}</option>)}
          </select>
        </label>
        {missing.length > 0 && <p className="text-xs text-ink-500">No FY{year} accounts on file: {missing.join(', ')}.</p>}
        {small.size > 0 && (
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={includeSmall} onChange={(e) => setIncludeSmall(e.target.checked)} />
            Include smaller clubs ({inDiv.filter((c) => small.has(c.team.team_id)).map((c) => c.team.display_name).join(', ')})
          </label>
        )}
      </header>

      <Section title="Year by year" takeaway={growthTakeaway(base)}>
        <BarRace clubs={base} />
      </Section>

      <Section title="The money league" takeaway="Revenue, with the part spent on wages shaded.">
        <ul className="space-y-1.5" aria-label="Revenue and wages by club">
          {clubs.map((c) => {
            const r = money(c.latest, 'revenue_total'), w = money(c.latest, 'staff_costs');
            return (
              <Row key={c.team.team_id} name={c.team.display_name} slug={c.team.slug} value={<>{m(r)} <span className="text-ink-500">· wages {pct(wageRatio(c.latest))}</span></>}>
                {r != null && <div className="absolute inset-y-0 left-0 rounded bg-pitch-700/25" style={{ width: `${(r / maxRev) * 100}%` }} />}
                {w != null && <div className="absolute inset-y-0 left-0 rounded bg-pitch-700" style={{ width: `${(w / maxRev) * 100}%` }} />}
              </Row>
            );
          })}
        </ul>
      </Section>

      <Section title="Wages as a share of revenue" takeaway={wageTakeaway(clubs)}>
        <ul className="space-y-1.5" aria-label="Wages as a share of revenue">
          {byWage.map((c) => {
            const r = wageRatio(c.latest);
            return (
              <Row key={c.team.team_id} name={c.team.display_name} slug={c.team.slug} value={pct(r)}>
                <div className="absolute inset-y-0 left-[70%] w-px bg-loss-600/60" aria-hidden="true" />
                {r != null && <div className={`absolute inset-y-1 left-0 rounded ${r >= 0.7 ? 'bg-amber-500' : 'bg-pitch-700'}`} style={{ width: `${Math.min(1, r) * 100}%` }} />}
              </Row>
            );
          })}
        </ul>
        <p className="text-xs text-ink-500">Line: 70%, a widely used warning level.</p>
      </Section>

      {(() => {
        const { shown, unsplit } = mixClubs(clubs);
        if (!shown.length) return null;
        const seg = [
          { k: 'matchday', label: 'Matchday', cls: 'bg-pitch-800' },
          { k: 'broadcast', label: 'Broadcast & league', cls: 'bg-pitch-600' },
          { k: 'commercial', label: 'Commercial', cls: 'bg-amber-500' },
          { k: 'other', label: 'Other', cls: 'bg-ink-500/40' },
        ] as const;
        return (
          <Section title="Where the money comes from" takeaway={mixTakeaway(shown)}>
            <ul className="flex flex-wrap gap-3 text-xs text-ink-700" aria-label="Key">
              {seg.map((s) => <li key={s.k} className="flex items-center gap-1"><span className={`inline-block h-3 w-3 rounded-sm ${s.cls}`} aria-hidden="true" />{s.label}</li>)}
            </ul>
            <ul className="space-y-1.5" aria-label="Revenue by source" data-testid="revenue-mix">
              {shown.map(({ club: c, mix }) => (
                <Row key={c.team.team_id} name={c.team.display_name} slug={c.team.slug}
                  value={<>{pct(mix.matchday)} · {pct(mix.broadcast)} · {pct(mix.commercial)}{mix.other > 0.005 ? <> · {pct(mix.other)}</> : null}</>}>
                  <div className="absolute inset-y-0 left-0 right-0 flex overflow-hidden rounded" role="img"
                    aria-label={`Matchday ${pct(mix.matchday)}, broadcast and league ${pct(mix.broadcast)}, commercial ${pct(mix.commercial)}, other ${pct(mix.other)}`}>
                    {seg.map((s) => <div key={s.k} className={s.cls} style={{ width: `${mix[s.k] * 100}%` }} />)}
                  </div>
                </Row>
              ))}
            </ul>
            <p className="text-xs text-ink-500">
              Shares of revenue, matchday · broadcast &amp; league · commercial (· other). Clubs label income differently, so treat small gaps with care.
              {unsplit.length > 0 && <> Not shown because their accounts don&rsquo;t split revenue this way: {unsplit.join(', ')}.</>}
            </p>
          </Section>
        );
      })()}

      {(() => {
        const { shown, undisclosed } = tradingClubs(clubs);
        if (!shown.length) return null;
        const max = Math.max(1, ...shown.map((t) => Math.max(Math.abs(t.sales), t.amortisation ?? 0)));
        return (
          <Section title="Player trading" takeaway={tradingTakeaway(shown)}>
            <ul className="space-y-1.5" aria-label="Profit on player sales and amortisation" data-testid="player-trading">
              {shown.map((t) => (
                <Row key={t.club.team.team_id} name={t.club.team.display_name} slug={t.club.team.slug}
                  value={<>{t.sales < 0 ? `loss ${m(-t.sales)}` : m(t.sales)} <span className="text-ink-500">· amortisation {m(t.amortisation)}</span></>}>
                  <div className={`absolute top-0 h-2.5 left-0 rounded ${t.sales < 0 ? 'bg-loss-600' : 'bg-pitch-700'}`} style={{ width: `${(Math.abs(t.sales) / max) * 100}%` }} />
                  {t.amortisation != null && <div className="absolute bottom-0 h-2 left-0 rounded bg-ink-500/40" style={{ width: `${(t.amortisation / max) * 100}%` }} />}
                </Row>
              ))}
            </ul>
            <p className="text-xs text-ink-500">
              Top bar: profit on selling players. Lower bar: amortisation, the cost of players bought, spread over their contracts.
              {undisclosed.length > 0 && <> Not shown because player-sale profit isn&rsquo;t disclosed: {undisclosed.join(', ')}.</>}
            </p>
          </Section>
        );
      })()}

      <section aria-labelledby="all-h" className="space-y-2">
        <h2 id="all-h" className="font-display uppercase tracking-wide text-lg text-ink-900">Every figure</h2>
        <div className="overflow-x-auto rounded-lg border border-ink-500/20" tabIndex={0} role="region" aria-labelledby="all-h">
          <table className="min-w-full text-sm">
            <caption className="sr-only">Latest filed figures by club; select a column heading to sort</caption>
            <thead className="bg-chalk-200">
              <tr>
                <th scope="col" className="sticky left-0 bg-chalk-200 text-left px-3 py-2 font-mono text-xs font-normal text-ink-500">Club</th>
                {cols.map((col) => (
                  <th key={col.key} scope="col" aria-sort={sort.key === col.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className="px-3 py-2 text-right">
                    <button type="button" className="font-mono text-xs text-ink-700 hover:text-pitch-800"
                      onClick={() => setSort((s) => ({ key: col.key, dir: s.key === col.key ? ((-s.dir) as 1 | -1) : -1 }))}>
                      {col.label}{sort.key === col.key ? (sort.dir === -1 ? ' ▼' : ' ▲') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((c) => (
                <tr key={c.team.team_id} className="border-t border-ink-500/10">
                  <th scope="row" className="sticky left-0 bg-chalk-100 text-left px-3 py-1.5 font-normal whitespace-nowrap">
                    <Link to={`/football/teams/${c.team.slug}/finances`} className="text-pitch-800 underline underline-offset-2">{c.team.display_name}</Link>
                    <span className="text-ink-500 text-xs"> {fyLabel(c.latest.period_end)}{c.latest.is_consolidated === false ? ' ‡' : ''}{c.latest.period_months != null && Math.round(c.latest.period_months) !== 12 ? ` (${Math.round(c.latest.period_months)} months)` : ''}</span>
                  </th>
                  {cols.map((col) => {
                    const v = col.get(c);
                    return <td key={col.key} className={`px-3 py-1.5 text-right font-mono whitespace-nowrap ${v != null && v < 0 ? 'text-loss-600' : ''}`}>{col.fmt(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-500">n/d not disclosed · ‡ company accounts only (others are group accounts) · from clubs&rsquo; statutory accounts, in pounds</p>
        {otherCurrency.length > 0 && (
          <p className="text-xs text-ink-500" data-testid="other-currency-note">
            Not compared here because they file in another currency and FixtureShark never converts figures: {otherCurrency.join(', ')}. Their own finance pages show the accounts as filed.
          </p>
        )}
      </section>
    </div>
  );
}
