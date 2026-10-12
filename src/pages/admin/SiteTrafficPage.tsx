// ============================================================================
// src/pages/admin/SiteTrafficPage.tsx   (/admin/traffic)
//
// Search Console and Google Analytics in one place, because the GA site
// itself wasn't useful to Chris (12 Oct 2026). Answers: how many people came,
// from where (Google, Reddit, direct), what they read, and what they searched
// for to find it -- for the last 7/28/90 days against the period before.
//
// GA only counts visitors who accepted the cookie banner (and never an admin's
// device), so its numbers undercount; Search Console counts every search.
// Data: public.get_site_traffic (admin only), loaded daily by
// scripts/gsc_import.py and scripts/ga_import.py.
// ============================================================================

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useAuthOptional } from '../../lib/auth';
import SortableTable, { type Column } from '../../components/SortableTable';
import { countryName, getSiteTraffic, pctChange, sitePath, type SiteTraffic, type TrafficDay } from '../../lib/siteTrafficApi';

const RANGES = [7, 28, 90] as const;
const fmt = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('en-GB'));
const pct = (n: number | null | undefined, dp = 1) => (n == null ? '—' : `${n.toFixed(dp)}%`);
const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const fmtWhen = (t: string | null) =>
  t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never';
const minutes = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);

function Change({ cur, prev, invert = false }: { cur: number; prev: number | undefined; invert?: boolean }) {
  const c = prev == null ? null : pctChange(cur, prev);
  if (c == null) return <span className="text-xs text-ink-500">no previous data</span>;
  const good = invert ? c < 0 : c > 0;
  const cls = Math.abs(c) < 0.5 ? 'text-ink-500' : good ? 'text-pitch-700' : 'text-loss-700';
  return <span className={`text-xs ${cls}`}>{c > 0 ? '+' : ''}{c.toFixed(0)}% vs previous</span>;
}

function Tile({ label, value, cur, prev, note, invert }: { label: string; value: string; cur: number; prev?: number; note?: string; invert?: boolean }) {
  return (
    <div className="border border-chalk-300 rounded-lg bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="text-2xl font-semibold text-ink-900 tabular-nums">{value}</div>
      <Change cur={cur} prev={prev} invert={invert} />
      {note && <div className="text-[11px] text-ink-500 mt-0.5">{note}</div>}
    </div>
  );
}

/** Daily bars for one metric; provisional days are drawn lighter. */
function DailyBars({ days, metric, label, barClass }: { days: TrafficDay[]; metric: keyof TrafficDay; label: string; barClass: string }) {
  const values = days.map((d) => Number(d[metric]) || 0);
  const max = Math.max(1, ...values);
  const W = 640;
  const H = 120;
  const bw = W / Math.max(1, days.length);
  return (
    <figure className="space-y-1">
      <figcaption className="text-xs text-ink-700">{label}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full h-auto" role="img" aria-label={`${label} per day`}>
        {days.map((d, i) => {
          const h = (values[i] / max) * H;
          return (
            <rect key={d.date} x={i * bw + 1} y={H - h} width={Math.max(1, bw - 2)} height={h}
              className={`${barClass} ${d.final ? '' : 'opacity-50'}`}>
              <title>{`${fmtDate(d.date)}: ${fmt(values[i])}${d.final ? '' : ' (provisional)'}`}</title>
            </rect>
          );
        })}
        <line x1={0} x2={W} y1={H} y2={H} className="stroke-chalk-300" />
        {days.length > 0 && (
          <>
            <text x={0} y={H + 13} className="fill-ink-500 text-[10px]">{fmtDate(days[0].date)}</text>
            <text x={W} y={H + 13} textAnchor="end" className="fill-ink-500 text-[10px]">{fmtDate(days[days.length - 1].date)}</text>
          </>
        )}
        <text x={2} y={10} className="fill-ink-500 text-[10px]">max {fmt(max)}</text>
      </svg>
    </figure>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">{title}</h2>
      {note && <p className="text-xs text-ink-500">{note}</p>}
      {children}
    </section>
  );
}

export default function SiteTrafficPage() {
  useDocumentHead({ title: 'Site traffic', description: 'Admin: Search Console and Google Analytics for FixtureShark.' });
  const isAdmin = useAuthOptional()?.isAdmin ?? false;
  const [days, setDays] = useState<number>(28);
  const [data, setData] = useState<SiteTraffic | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setError(null);
    getSiteTraffic(days)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? String(e)); });
    return () => { cancelled = true; };
  }, [isAdmin, days]);

  const sourceRows = useMemo(() => data?.sources ?? [], [data]);

  if (!isAdmin) {
    return (
      <div className="space-y-2">
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Site traffic</h1>
        <p className="text-sm text-ink-700">This page is for admins.</p>
      </div>
    );
  }

  const cur = data?.periods?.current;
  const prev = data?.periods?.previous;

  const queryCols: Column<SiteTraffic['search_queries'][number]>[] = [
    { key: 'q', label: 'Search', render: (r) => r.query, sortValue: (r) => r.query },
    { key: 'i', label: 'Impressions', align: 'right', render: (r) => fmt(r.impressions), sortValue: (r) => r.impressions, descFirst: true },
    { key: 'c', label: 'Clicks', align: 'right', render: (r) => fmt(r.clicks), sortValue: (r) => r.clicks, descFirst: true },
    { key: 'ctr', label: 'CTR', align: 'right', className: 'hidden sm:table-cell', render: (r) => pct(r.impressions ? (100 * r.clicks) / r.impressions : null), sortValue: (r) => (r.impressions ? r.clicks / r.impressions : null), descFirst: true },
    { key: 'p', label: 'Position', align: 'right', render: (r) => (r.position == null ? '—' : r.position.toFixed(1)), sortValue: (r) => r.position },
  ];
  const searchPageCols: Column<SiteTraffic['search_pages'][number]>[] = [
    { key: 'pg', label: 'Page', render: (r) => <a className="underline" href={r.page}>{sitePath(r.page)}</a>, sortValue: (r) => r.page },
    { key: 'i', label: 'Impressions', align: 'right', render: (r) => fmt(r.impressions), sortValue: (r) => r.impressions, descFirst: true },
    { key: 'c', label: 'Clicks', align: 'right', render: (r) => fmt(r.clicks), sortValue: (r) => r.clicks, descFirst: true },
    { key: 'p', label: 'Position', align: 'right', render: (r) => (r.position == null ? '—' : r.position.toFixed(1)), sortValue: (r) => r.position },
  ];
  const sourceCols: Column<SiteTraffic['sources'][number]>[] = [
    { key: 'ch', label: 'Channel', render: (r) => r.channel_group, sortValue: (r) => r.channel_group },
    { key: 'src', label: 'Source', render: (r) => `${r.source} / ${r.medium}`, sortValue: (r) => r.source },
    { key: 's', label: 'Sessions', align: 'right', render: (r) => fmt(r.sessions), sortValue: (r) => r.sessions, descFirst: true },
    { key: 'e', label: 'Engaged', align: 'right', className: 'hidden sm:table-cell', render: (r) => pct(r.sessions ? (100 * r.engaged) / r.sessions : null, 0), sortValue: (r) => (r.sessions ? r.engaged / r.sessions : null), descFirst: true },
    { key: 'v', label: 'Page views', align: 'right', render: (r) => fmt(r.views), sortValue: (r) => r.views, descFirst: true },
  ];
  const sectionCols: Column<SiteTraffic['sections'][number]>[] = [
    { key: 'sec', label: 'Section', render: (r) => (r.section === '(home)' ? 'Home page' : `/${r.section}`), sortValue: (r) => r.section },
    { key: 'v', label: 'Page views', align: 'right', render: (r) => fmt(r.views), sortValue: (r) => r.views, descFirst: true },
    { key: 't', label: 'Time per view', align: 'right', render: (r) => (r.views ? minutes(r.eng_s / r.views) : '—'), sortValue: (r) => (r.views ? r.eng_s / r.views : null), descFirst: true },
  ];
  const pageCols: Column<SiteTraffic['pages'][number]>[] = [
    { key: 'pg', label: 'Page', render: (r) => <a className="underline" href={r.page}>{r.page}</a>, sortValue: (r) => r.page },
    { key: 'v', label: 'Page views', align: 'right', render: (r) => fmt(r.views), sortValue: (r) => r.views, descFirst: true },
    { key: 't', label: 'Time per view', align: 'right', className: 'hidden sm:table-cell', render: (r) => (r.views ? minutes(r.eng_s / r.views) : '—'), sortValue: (r) => (r.views ? r.eng_s / r.views : null), descFirst: true },
  ];
  const landingCols: Column<SiteTraffic['landing'][number]>[] = [
    { key: 'pg', label: 'First page of the visit', render: (r) => <a className="underline" href={r.page}>{r.page}</a>, sortValue: (r) => r.page },
    { key: 's', label: 'Sessions', align: 'right', render: (r) => fmt(r.sessions), sortValue: (r) => r.sessions, descFirst: true },
    { key: 'e', label: 'Engaged', align: 'right', render: (r) => pct(r.sessions ? (100 * r.engaged) / r.sessions : null, 0), sortValue: (r) => (r.sessions ? r.engaged / r.sessions : null), descFirst: true },
  ];
  const deviceCols: Column<SiteTraffic['devices'][number]>[] = [
    { key: 'd', label: 'Device', render: (r) => r.device, sortValue: (r) => r.device },
    { key: 's', label: 'Sessions', align: 'right', render: (r) => fmt(r.sessions), sortValue: (r) => r.sessions, descFirst: true },
  ];
  const countryCols: Column<SiteTraffic['countries'][number]>[] = [
    { key: 'c', label: 'Country (Analytics)', render: (r) => r.country, sortValue: (r) => r.country },
    { key: 's', label: 'Sessions', align: 'right', render: (r) => fmt(r.sessions), sortValue: (r) => r.sessions, descFirst: true },
  ];
  const searchCountryCols: Column<SiteTraffic['search_countries'][number]>[] = [
    { key: 'c', label: 'Country (Search)', render: (r) => countryName(r.country), sortValue: (r) => countryName(r.country) },
    { key: 'i', label: 'Impressions', align: 'right', render: (r) => fmt(r.impressions), sortValue: (r) => r.impressions, descFirst: true },
    { key: 'k', label: 'Clicks', align: 'right', render: (r) => fmt(r.clicks), sortValue: (r) => r.clicks, descFirst: true },
  ];

  return (
    <div className="space-y-6" data-testid="site-traffic">
      <div className="space-y-1">
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Site traffic</h1>
        <p className="text-sm text-ink-700">
          Google Search Console and Google Analytics for fixtureshark.com, compared with the period before.
        </p>
        <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Period">
          {RANGES.map((r) => (
            <button key={r} type="button" onClick={() => setDays(r)} aria-pressed={days === r}
              className={`px-3 py-1 rounded-full text-sm border ${days === r ? 'bg-ink-900 text-white border-ink-900' : 'bg-white text-ink-700 border-chalk-300'}`}>
              Last {r} days
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-loss-700">Could not load traffic: {error}</p>}
      {!data && !error && <p className="text-sm text-ink-500">Loading…</p>}

      {data && (
        <>
          <p className="text-xs text-ink-500">
            {fmtDate(data.start)} to {fmtDate(data.end)}. Search Console data to {data.loaded.gsc_last_date ? fmtDate(data.loaded.gsc_last_date) : '—'} (updated {fmtWhen(data.loaded.gsc_last_run)}); Analytics to{' '}
            {data.loaded.ga_last_date ? fmtDate(data.loaded.ga_last_date) : '—'} (updated {fmtWhen(data.loaded.ga_last_run)}).
            Search Console runs 2–3 days behind. Lighter bars are days Google may still revise.
          </p>

          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Tile label="Search impressions" value={fmt(cur?.impressions)} cur={cur?.impressions ?? 0} prev={prev?.impressions} />
            <Tile label="Search clicks" value={fmt(cur?.clicks)} cur={cur?.clicks ?? 0} prev={prev?.clicks}
              note={cur?.impressions ? `CTR ${pct((100 * cur.clicks) / cur.impressions)} · avg position ${cur.position?.toFixed(1) ?? '—'}` : undefined} />
            <Tile label="Visits (Analytics)" value={fmt(cur?.sessions)} cur={cur?.sessions ?? 0} prev={prev?.sessions}
              note={cur?.sessions ? `${pct((100 * cur.engaged) / cur.sessions, 0)} engaged · avg ${fmt(cur.user_days / data.days)} users a day` : undefined} />
            <Tile label="Page views (Analytics)" value={fmt(cur?.views)} cur={cur?.views ?? 0} prev={prev?.views}
              note={cur?.views ? `${minutes(cur.eng_s / cur.views)} per view` : undefined} />
          </div>
          <p className="text-xs text-ink-500">
            Analytics only counts visitors who accepted the cookie banner, and never your own signed-in browser, so its
            figures are lower than real traffic. Search Console counts every Google search.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <DailyBars days={data.daily} metric="impressions" label="Search impressions per day" barClass="fill-cup-600" />
            <DailyBars days={data.daily} metric="sessions" label="Visits per day (Analytics)" barClass="fill-pitch-700" />
          </div>

          <Section title="Where visitors came from" note="Analytics sessions by channel and source. Reddit shows as reddit.com (or a Reddit app source).">
            <SortableTable columns={sourceCols} rows={sourceRows} rowKey={(r) => `${r.channel_group}|${r.source}|${r.medium}`}
              initialSort={{ key: 's', dir: 'desc' }} limit={25} testId="traffic-sources" empty="No Analytics sessions in this period." />
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Sections read" note="Page views by the first part of the address.">
              <SortableTable columns={sectionCols} rows={data.sections} rowKey={(r) => r.section}
                initialSort={{ key: 'v', dir: 'desc' }} testId="traffic-sections" empty="No page views in this period." />
            </Section>
            <Section title="Where visits start" note="The first page of each visit (landing page).">
              <SortableTable columns={landingCols} rows={data.landing} rowKey={(r) => r.page}
                initialSort={{ key: 's', dir: 'desc' }} limit={25} testId="traffic-landing" empty="No visits in this period." />
            </Section>
          </div>

          <Section title="Pages read">
            <SortableTable columns={pageCols} rows={data.pages} rowKey={(r) => r.page}
              initialSort={{ key: 'v', dir: 'desc' }} limit={50} testId="traffic-pages" empty="No page views in this period." />
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Google searches" note="What people searched for when FixtureShark appeared. Google hides rare searches, so these add up to less than the totals.">
              <SortableTable columns={queryCols} rows={data.search_queries} rowKey={(r) => r.query}
                initialSort={{ key: 'i', dir: 'desc' }} limit={50} testId="traffic-queries" empty="No searches recorded in this period." />
            </Section>
            <Section title="Pages in Google" note="Pages shown in Google results, with their clicks.">
              <SortableTable columns={searchPageCols} rows={data.search_pages} rowKey={(r) => r.page}
                initialSort={{ key: 'i', dir: 'desc' }} limit={50} testId="traffic-search-pages" empty="No pages in Google results in this period." />
            </Section>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <Section title="Devices">
              <SortableTable columns={deviceCols} rows={data.devices} rowKey={(r) => r.device} initialSort={{ key: 's', dir: 'desc' }} empty="No data." />
            </Section>
            <Section title="Visitors' countries">
              <SortableTable columns={countryCols} rows={data.countries} rowKey={(r) => r.country} initialSort={{ key: 's', dir: 'desc' }} limit={15} empty="No data." />
            </Section>
            <Section title="Searchers' countries">
              <SortableTable columns={searchCountryCols} rows={data.search_countries} rowKey={(r) => r.country} initialSort={{ key: 'i', dir: 'desc' }} limit={15} empty="No data." />
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
