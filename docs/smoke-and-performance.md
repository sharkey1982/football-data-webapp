# Smoke tests and performance budgets

`scripts/smoke/weekly_smoke.mjs`, run by `.github/workflows/weekly-smoke.yml`.

## When it runs

| Trigger | Site | Mode | Recorded as |
|---|---|---|---|
| Monday 07:12 UTC | fixtureshark.com | full: Pixel 7, slow 4G (150 ms RTT, 1.6 Mbit/s), CPU x4 | `production` + `pipeline_runs` (weekly_smoke) |
| Every finished Netlify deploy preview | the preview | quick: unthrottled, errors only | `preview` + commit status `smoke/preview` on the PR |
| By hand (Actions → Smoke tests → Run) | any `base` | `full` or `quick`; `only` = page types; `block` = regex of requests to abort | `manual` |

## What fails a page

HTTP error; a JavaScript error or console error; a failed or 4xx/5xx request to
the site or Supabase; error text on the page; under 300 characters of text; a
table with no rows; "Loading" still showing after the network is idle; no `<h1>`.

## Budgets (warnings)

| Measure | Budget | Why |
|---|---|---|
| LCP | 2.5 s | Google "good" |
| CLS | 0.1 | Google "good" |
| FCP | 1.8 s | Google "good" |
| TTFB | 0.8 s | Google "good" |
| Slowest Supabase call | 1.5 s | anon calls stop at 3 s |
| Largest Supabase payload | 250 KB | ~1.3 s on slow 4G |
| JavaScript | 350 KB | |
| Requests | 120 | |

Warnings name the cause: the LCP element, the elements that moved (with their
share of the shift), the slowest and largest API calls.

## Where the results are

- `public.smoke_runs`, `public.smoke_page_results`; `public.smoke_latest` = newest production run.
- Daily checks (`check_job_health`): `smoke_tests_passed` (failed if a page failed, warning if over budget), `smoke_performance_trend` (median LCP +20% on the previous run), and job staleness via `job_registry` (`weekly-smoke`).

## Lessons recorded so far (Oct 2026)

- A page that catches its own failed request and shows less is invisible to
  every server-side check; the browser test found two such pages on its first run.
- Layout shift: a footer that starts inside the first screen moves when data
  arrives; static HTML without the site header is pushed down when the app
  starts; a font swap re-wraps headings. All three are fixed; keep `main`
  `min-h-screen`, keep the chrome in the static render, keep fallback metrics.
- `font-display: swap` made the font swap the Largest Contentful Paint on
  static pages; fonts use `optional`.
- Deploy previews load Netlify's toolbar, which production never does; the
  test blocks it so preview numbers compare with production.
