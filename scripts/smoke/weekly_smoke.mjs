#!/usr/bin/env node
// ============================================================================
// scripts/smoke/weekly_smoke.mjs
//
// Weekly smoke and performance test of the live site (18 Oct 2026), in a real
// browser. The daily site-health job checks the server HTML; this one checks
// what a visitor actually gets once the app has run:
//
//   * every key page type in every section (football, FPL, NFL, tennis,
//     international, finance), the dynamic ones picked from the sitemap so
//     the list follows the site;
//   * loaded as a phone on a throttled connection (Lighthouse's "slow 4G":
//     150 ms RTT, 1.6 Mbit/s, CPU x4), so the numbers are what a visitor on
//     mobile data sees, not a datacentre;
//   * FAILS a page on: HTTP error, a JavaScript error, a failed or 4xx/5xx
//     request to the site or Supabase, an error message on the page, an empty
//     page or table, a spinner still showing, no <h1>;
//   * WARNS on the Core Web Vitals and API budgets below.
//
// Results: smoke_runs / smoke_page_results and one pipeline_runs row
// (weekly_smoke), when SUPABASE_URL and SUPABASE_SERVICE_KEY are set; a JSON
// report in smoke-report.json either way. Exits 1 if any page failed.
//
//   node scripts/smoke/weekly_smoke.mjs                 https://fixtureshark.com
//   BASE=https://deploy-preview-12--footballdatashark.netlify.app MODE=quick node ...
// MODE=quick: no throttling and no budgets (errors only) -- for deploy previews.
// ============================================================================

import { writeFileSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const BASE = (process.env.BASE || 'https://fixtureshark.com').replace(/\/$/, '');
const SITE = 'https://fixtureshark.com';
const MODE = process.env.MODE || 'full';
const KIND = process.env.SMOKE_KIND || (BASE === SITE ? 'production' : 'preview');
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

// Budgets (warnings). Google's "good" thresholds for LCP/CLS/INP-proxy, and
// our own for the API and JavaScript.
export const BUDGETS = { lcp_ms: 2500, cls: 0.1, ttfb_ms: 800, fcp_ms: 1800, api_ms: 1500, js_kb: 350, requests: 120, api_payload_kb: 250 };

// Fixed pages, then one sitemap URL per pattern for the dynamic page types.
const FIXED = [
  ['home', '/'], ['fixtures', '/fixtures'], ['tv-guide', '/tv-guide'], ['football-hub', '/football'],
  ['leagues', '/football/leagues'], ['records', '/football/records'], ['history-pace', '/football/history/pace'],
  ['model-scorecard', '/football/model-scorecard'], ['local-clubs', '/football/local-clubs'], ['finance', '/finance'],
  ['fpl-hub', '/fpl'], ['fpl-gameweek', '/fpl/gameweek'], ['fpl-live', '/fpl/live'], ['fpl-optimal-squad', '/fpl/optimal-squad'],
  ['fpl-player-points', '/fpl/player-points'], ['fpl-line-ups', '/fpl/line-ups'], ['fpl-injuries', '/fpl/injuries'],
  ['nfl-hub', '/nfl'], ['nfl-standings', '/nfl/standings'], ['nfl-fixtures', '/nfl/fixtures'], ['nfl-player-projections', '/nfl/player-projections'],
  ['tennis-hub', '/tennis'], ['tennis-results', '/tennis/results'], ['tennis-players', '/tennis/players'], ['tennis-grand-slams', '/tennis/grand-slams'],
  ['intl-hub', '/international'], ['intl-fixtures', '/international/fixtures'], ['intl-teams', '/international/teams'],
];
const DYNAMIC = [
  ['league-table', /^\/football\/leagues\/[^/]+\/[^/]+$/],
  ['team', /^\/football\/teams\/[^/]+$/],
  ['match', /^\/football\/matches\/[^/]+$/],
  ['fpl-player', /^\/fpl\/players\/[^/]+$/],
  ['fpl-fixture', /^\/fpl\/fixture\/\d+$/],
  ['nfl-team', /^\/nfl\/teams\/[^/]+$/],
  ['nfl-game', /^\/nfl\/games\/[^/]+$/],
  ['tennis-player', /^\/tennis\/players\/atp\/[^/]+$/],
  ['tennis-edition', /^\/tennis\/tournaments\/[^/]+\/[^/]+\/\d{4}$/],
  ['intl-team', /^\/international\/teams\/[^/]+$/],
  ['intl-edition', /^\/international\/tournaments\/[^/]+\/[^/]+$/],
];

const OWN_HOSTS = (u) => { try { const h = new URL(u).host; return h.endsWith('fixtureshark.com') || h.endsWith('netlify.app') || h.endsWith('supabase.co'); } catch { return false; } };
// Third parties whose failures are not ours (ad/consent/analytics blockers in CI).
const IGNORE = /google-analytics|googletagmanager|doubleclick|clarity\.ms|fonts\.g(oogleapis|static)\.com/;

async function sitemapUrls() {
  const get = async (u) => { const r = await fetch(u, { headers: { 'User-Agent': 'FixtureShark-smoke' } }); return r.ok ? r.text() : ''; };
  const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const root = await get(`${BASE}/sitemap.xml`);
  let urls = locs(root);
  if (/<sitemapindex/i.test(root)) {
    const children = [];
    for (const u of urls) children.push(...locs(await get(u.replace(SITE, BASE))));
    urls = children;
  }
  return urls.map((u) => new URL(u).pathname);
}

function pickDynamic(paths) {
  const out = [];
  for (const [type, re] of DYNAMIC) {
    const hits = paths.filter((p) => re.test(p));
    // Middle of the list rather than the first: the first entries are often the
    // oldest or alphabetically odd ones; a stable choice keeps weeks comparable.
    if (hits.length) out.push([type, hits[Math.floor(hits.length / 2)]]);
    else out.push([type, null]);
  }
  return out;
}

const VITALS_INIT = () => {
  window.__smoke = { lcp: 0, cls: 0, fcp: 0, longTasks: 0, shifts: {}, lcpEl: null };
  const describe = (n) => {
    if (!n || n.nodeType !== 1) return n && n.nodeType === 3 ? 'text' : '?';
    const parts = [];
    for (let el = n, i = 0; el && el.nodeType === 1 && i < 3; el = el.parentElement, i++) {
      const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      parts.unshift(el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (cls ? `.${cls}` : ''));
    }
    return parts.join(' > ').slice(0, 140);
  };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__smoke.lcp = Math.max(window.__smoke.lcp, e.startTime); window.__smoke.lcpEl = describe(e.element); } })
      .observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__smoke.cls += e.value;
        // Attribute the shift to the element(s) that moved most (largest area).
        const src = [...(e.sources || [])].sort((a, b) => (b.currentRect.width * b.currentRect.height) - (a.currentRect.width * a.currentRect.height))[0];
        const key = src ? describe(src.node) : 'unknown';
        window.__smoke.shifts[key] = (window.__smoke.shifts[key] || 0) + e.value;
      }
    })
      .observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__smoke.fcp = e.startTime; })
      .observe({ type: 'paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__smoke.longTasks += Math.max(0, e.duration - 50); })
      .observe({ type: 'longtask', buffered: true });
  } catch { /* older engines */ }
};

async function testPage(browser, type, path) {
  const res = { page_type: type, url: path, ok: true, errors: [], warnings: [] };
  const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
  await ctx.addInitScript(VITALS_INIT);
  const page = await ctx.newPage();
  if (MODE !== 'quick') {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  page.on('pageerror', (e) => res.errors.push(`JS error: ${String(e.message).slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORE.test(m.text()) && !/Failed to load resource/.test(m.text())) res.errors.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on('requestfailed', (r) => {
    if (OWN_HOSTS(r.url()) && !IGNORE.test(r.url()) && r.failure()?.errorText !== 'net::ERR_ABORTED') res.errors.push(`request failed: ${r.failure()?.errorText} ${r.url().slice(0, 160)}`);
  });
  // Supabase does not send Timing-Allow-Origin, so the browser reports no
  // sizes for its responses; read the bodies here instead.
  const apiBodies = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && OWN_HOSTS(r.url()) && !IGNORE.test(r.url())) res.errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}`);
    if (r.url().includes('.supabase.co/rest/') && r.status() < 300) {
      apiBodies.push(r.body().then((b) => ({ url: r.url().replace(/^https:\/\/[^/]+/, '').slice(0, 160), kb: Math.round(b.length / 1024) })).catch(() => null));
    }
  });
  const t0 = Date.now();
  try {
    const resp = await page.goto(BASE + path, { waitUntil: 'load', timeout: 60000 });
    res.status = resp?.status() ?? 0;
    if (res.status !== 200) res.errors.push(`document HTTP ${res.status}`);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => res.warnings.push('network not idle after 30 s'));
    await page.waitForTimeout(1500);
    res.load_ms = Date.now() - t0;
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      const api = resources.filter((r) => r.name.includes('.supabase.co/'));
      const slow = api.reduce((a, r) => (r.duration > (a?.duration ?? -1) ? r : a), null);
      const js = resources.filter((r) => r.initiatorType === 'script' || /\.js(\?|$)/.test(r.name));
      const text = document.body?.innerText ?? '';
      const tables = [...document.querySelectorAll('table')];
      return {
        ttfb: nav ? nav.responseStart - nav.startTime : null,
        vitals: window.__smoke,
        requests: resources.length + 1,
        transfer_kb: Math.round((resources.reduce((s, r) => s + (r.transferSize || 0), 0) + (nav?.transferSize || 0)) / 1024),
        js_kb: Math.round(js.reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0) / 1024),
        api_calls: api.length,
        slowest_api_ms: slow ? Math.round(slow.duration) : null,
        slowest_api_url: slow ? slow.name.replace(/^https:\/\/[^/]+/, '').slice(0, 200) : null,
        text_len: text.trim().length,
        error_text: (text.match(/something went wrong|failed to load|couldn['’]t load|could not load|error loading|unexpected error/i) || [null])[0],
        spinner: /^\s*loading[.…]*\s*$/im.test(text),
        h1: document.querySelectorAll('h1').length,
        empty_tables: tables.filter((t) => t.querySelectorAll('tbody tr').length === 0 && t.querySelectorAll('tr').length <= 1).length,
        tables: tables.length,
        title: document.title,
      };
    });
    Object.assign(res, {
      ttfb_ms: m.ttfb == null ? null : Math.round(m.ttfb), fcp_ms: Math.round(m.vitals?.fcp || 0) || null,
      lcp_ms: Math.round(m.vitals?.lcp || 0) || null, cls: Math.round((m.vitals?.cls || 0) * 1000) / 1000,
      tbt_ms: Math.round(m.vitals?.longTasks || 0), requests: m.requests, transfer_kb: m.transfer_kb, js_kb: m.js_kb,
      api_calls: m.api_calls, slowest_api_ms: m.slowest_api_ms, slowest_api_url: m.slowest_api_url, title: m.title,
      lcp_element: m.vitals?.lcpEl ?? null,
      cls_sources: Object.entries(m.vitals?.shifts || {}).sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([element, value]) => ({ element, value: Math.round(value * 1000) / 1000 })),
    });
    const bodies = (await Promise.all(apiBodies)).filter(Boolean).sort((a, b) => b.kb - a.kb);
    res.api_kb = bodies.reduce((t, x) => t + x.kb, 0);
    res.largest_api = bodies.slice(0, 3);
    if (MODE !== 'quick' && bodies[0]?.kb > BUDGETS.api_payload_kb) res.warnings.push(`API payload ${bodies[0].kb} KB > ${BUDGETS.api_payload_kb}: ${bodies[0].url}`);
    if (m.text_len < 300) res.errors.push(`page nearly empty (${m.text_len} characters of text)`);
    if (m.error_text) res.errors.push(`error message on page: "${m.error_text}"`);
    if (m.spinner) res.errors.push('still showing "Loading" after the network went idle');
    if (!m.h1) res.errors.push('no <h1>');
    if (m.empty_tables) res.errors.push(`${m.empty_tables} of ${m.tables} table(s) have no rows`);
    if (MODE !== 'quick') {
      if (res.lcp_ms > BUDGETS.lcp_ms) res.warnings.push(`LCP ${res.lcp_ms} ms > ${BUDGETS.lcp_ms}`);
      if (res.cls > BUDGETS.cls) res.warnings.push(`CLS ${res.cls} > ${BUDGETS.cls}; moved: ${res.cls_sources.map((x) => `${x.element} (${x.value})`).join('; ')}`);
      if (res.lcp_ms > BUDGETS.lcp_ms && res.lcp_element) res.warnings.push(`LCP element: ${res.lcp_element}`);
      if (res.ttfb_ms > BUDGETS.ttfb_ms) res.warnings.push(`TTFB ${res.ttfb_ms} ms > ${BUDGETS.ttfb_ms}`);
      if (res.fcp_ms > BUDGETS.fcp_ms) res.warnings.push(`FCP ${res.fcp_ms} ms > ${BUDGETS.fcp_ms}`);
      if (res.slowest_api_ms > BUDGETS.api_ms) res.warnings.push(`API ${res.slowest_api_ms} ms > ${BUDGETS.api_ms}: ${res.slowest_api_url}`);
      if (res.js_kb > BUDGETS.js_kb) res.warnings.push(`JavaScript ${res.js_kb} KB > ${BUDGETS.js_kb}`);
      if (res.requests > BUDGETS.requests) res.warnings.push(`${res.requests} requests > ${BUDGETS.requests}`);
    }
  } catch (e) {
    res.errors.push(`navigation: ${String(e.message || e).slice(0, 200)}`);
  } finally {
    await ctx.close();
  }
  res.errors = [...new Set(res.errors)].slice(0, 15);
  res.ok = res.errors.length === 0;
  return res;
}

async function rest(path, body, prefer = 'return=representation') {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'POST', body: JSON.stringify(body),
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: prefer },
  });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${await r.text()}`);
  return prefer.includes('representation') ? r.json() : null;
}

async function main() {
  const started = new Date().toISOString();
  let paths = [];
  try { paths = await sitemapUrls(); } catch (e) { console.log(`::warning::sitemap unreadable: ${e.message}`); }
  const pages = [...FIXED, ...pickDynamic(paths)];
  const browser = await chromium.launch();
  const results = [];
  for (const [type, path] of pages) {
    if (!path) {
      results.push({ page_type: type, url: null, ok: true, errors: [], warnings: ['no URL of this type in the sitemap'] });
      continue;
    }
    const r = await testPage(browser, type, path);
    results.push(r);
    const mark = r.ok ? (r.warnings.length ? 'WARN' : 'ok  ') : 'FAIL';
    console.log(`[${mark}] ${type.padEnd(24)} ${path}  lcp=${r.lcp_ms ?? '-'} cls=${r.cls ?? '-'} ttfb=${r.ttfb_ms ?? '-'} js=${r.js_kb ?? '-'}KB api=${r.slowest_api_ms ?? '-'}ms`);
    for (const e of r.errors) console.log(`::error title=${type}::${path} -- ${e}`);
    for (const w of r.warnings) console.log(`::warning title=${type}::${path} -- ${w}`);
  }
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  const warned = results.filter((r) => r.ok && r.warnings.length);
  const tested = results.filter((r) => r.url);
  const med = (k) => { const v = tested.map((r) => r[k]).filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
  const summary = `${tested.length} pages (${KIND}, ${MODE}): ${failed.length} failed, ${warned.length} over budget; median LCP ${med('lcp_ms')} ms, TTFB ${med('ttfb_ms')} ms, JS ${med('js_kb')} KB` +
    (failed.length ? ` -- failed: ${failed.map((r) => r.page_type).join(', ')}` : '');
  console.log(summary);
  const report = { started, finished: new Date().toISOString(), base: BASE, kind: KIND, mode: MODE, budgets: BUDGETS, summary, results };
  writeFileSync('smoke-report.json', JSON.stringify(report, null, 2));

  if (SB_URL && SB_KEY) {
    try {
      const [run] = await rest('smoke_runs', {
        started_at: started, finished_at: report.finished, base_url: BASE, kind: KIND, mode: MODE,
        pages_tested: tested.length, pages_failed: failed.length, pages_warned: warned.length,
        median_lcp_ms: med('lcp_ms'), median_ttfb_ms: med('ttfb_ms'), median_js_kb: med('js_kb'), summary,
        workflow_run_id: process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null,
      });
      await rest('smoke_page_results', results.map((r) => ({
        smoke_run_id: run.smoke_run_id, page_type: r.page_type, url: r.url, ok: r.ok, http_status: r.status ?? null,
        errors: r.errors, warnings: r.warnings, ttfb_ms: r.ttfb_ms ?? null, fcp_ms: r.fcp_ms ?? null, lcp_ms: r.lcp_ms ?? null,
        cls: r.cls ?? null, tbt_ms: r.tbt_ms ?? null, load_ms: r.load_ms ?? null, requests: r.requests ?? null,
        transfer_kb: r.transfer_kb ?? null, js_kb: r.js_kb ?? null, api_calls: r.api_calls ?? null,
        slowest_api_ms: r.slowest_api_ms ?? null, slowest_api_url: r.slowest_api_url ?? null,
        api_kb: r.api_kb ?? null, largest_api: r.largest_api ?? null, lcp_element: r.lcp_element ?? null, cls_sources: r.cls_sources ?? null,
      })), 'return=minimal');
      if (KIND === 'production') {
        await rest('pipeline_runs', {
          job_name: 'weekly_smoke', status: failed.length ? 'failed' : warned.length ? 'warning' : 'success',
          started_at: started, finished_at: report.finished, summary: summary.slice(0, 2000),
          rows_read: tested.length, rows_changed: failed.length,
        }, 'return=minimal');
      }
    } catch (e) {
      console.log(`::error::could not store results: ${e.message}`);
    }
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
