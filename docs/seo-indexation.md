# Indexation policy (6 Oct 2026; audited 7 Oct 2026; sitemap slimmed 29 Oct 2026)

Which page families search engines should index, and which go in the sitemap.
`scripts/generate-sitemap.mjs` implements this family by family, and
`scripts/generate-static.mjs` writes the pages (full HTML, or the head only
where the body loads in the browser). A new database row only becomes a
sitemap URL if its family is listed here as **A**. The per-family cut-offs
(years, game counts, the match window) live in `scripts/lib/sitemapPolicy.mjs`.

- **A** index + sitemap
- **B** indexable (reachable by links, self-canonical) but not in the sitemap
- **C** noindex
- **D** blocked in robots.txt (private or operational)

/sitemap.xml is a sitemap index with one file per section
(`/sitemaps/core.xml`, `football`, `international`, `fpl`, `nfl`, `tennis`,
`finance`, `tv`), so Search Console reports each section separately. Each
file is far below Google's 50,000-URL limit.

`lastmod` is given only where a real content date exists: match pages
(prediction time), finance (latest filing), NFL games (game day, once
played), international nations and editions (latest game). Elsewhere it is
omitted rather than set to the build date.

| Family | Example | URLs (6 Oct) | Policy | Why |
|---|---|---|---|---|
| Hubs, stage and list pages | /football, /fpl/value, /tennis/players | ~70 | A | Persistent destinations whose data updates |
| Premier League match pages (this season) | /football/matches/:slug | 380 | A | Static HTML with prediction, market and preview |
| Other leagues' match pages | /football/matches/… (EFL, Europe) | ~4,270 | B | Served by the app shell only; removed from the sitemap on 28 Sep 2026 (#138) as thin |
| Club pages (current PL) | /football/teams/arsenal | 20 | A | Static HTML; lists the club's FPL players (links) |
| Club pages (other clubs) | /football/teams/hull, /football/teams/caen | ~675 linked | B | Browser only; reached from club-season pages and match lists. Candidate for A (static) for English tiers 1–5 |
| Club seasons (English tiers 1–5), 2023/24 on | /football/teams/hull/2024-25 | ~464 | A | Static, unique table and results per season |
| Club seasons (English tiers 1–5), before 2023/24 | /football/teams/plymouth/2018-19 | ~3,300 | B | Static and linked from the club's other seasons and the league tables; out of the sitemap since 29 Oct 2026 (44% of Google's "Discovered, not indexed" sample) |
| League histories; league seasons of English tiers 1–5 (all), other leagues from 2020/21 | /football/leagues/premier-league/1992-93 | ~290 | A | Static historical tables |
| Other leagues' seasons before 2020/21 | /football/leagues/la-liga/2012-13 | ~90 | B | Static; out of the sitemap since 29 Oct 2026 |
| Records and trends per league | /football/records/premier-league | ~45 | A | Static |
| FPL player pages | /fpl/players/:slug | 667 | A | Static projection pages |
| FPL Player Scout, current players | /fpl/player-scout/:slug | ~669 | B (canonical → /fpl/players/:slug) | Head static, body in browser. One page per player: the FPL player page carries the same career table in its server HTML (29 Oct 2026) |
| FPL Player Scout, former players | /fpl/player-scout/thomas-meunier | ~764 | C (noindex,follow) | Head-only static page and no other page for the player; still reachable and usable |
| FPL team of the week | /fpl/team-of-the-week/gw5 | 1 per played GW | A | Persistent per gameweek |
| Club finances and compare | /football/teams/arsenal/finances, /finance/compare | every club with filed accounts | A | Static, filed accounts with sources; in the finance sitemap file |
| NFL lists, seasons, teams | /nfl/seasons/2025, /nfl/teams/buffalo-bills | ~70 | A | Static season stories and team pages |
| NFL game pages (latest season) | /nfl/games/2026_02_sea_ari | 272 | A | Static: result, model v market, form, head-to-head |
| NFL game pages (older seasons) | /nfl/games/2019_… | ~6,500 | B | Reachable from season pages; not pre-rendered |
| NFL match-projection pages | /nfl/match-projections/:gameId | ~16 a week | B | Transient (one week); browser only |
| NFL player pages | /nfl/players/:id | ~1,900 | B | Browser only; low search value today |
| Tennis seasons | /tennis/seasons/atp/2024 | 47 | A | Static |
| Tennis players: 50+ recent matches, any title, or 200+ career matches | /tennis/players/atp/federer-r | ~650 | A | Static. Titles and long careers added 7 Oct 2026: the old rule noindexed Federer, Nadal, Murray, Serena Williams |
| Other tennis players | /tennis/players/atp/… | ~2,350 | C | Thin; noindex in the page |
| Tennis tournaments | /tennis/tournaments/atp/wimbledon | 300 | A | Static champions and records |
| Tennis big editions (Slams, Finals, 1000s), 2015 on | /tennis/tournaments/atp/wimbledon/2025 | ~263 | A | Static draw and paths |
| Tennis big editions before 2015 | /tennis/tournaments/atp/australian-open/2003 | ~269 | B | Static; out of the sitemap since 29 Oct 2026 |
| Tennis other editions | /tennis/tournaments/atp/doha/2019 | ~2,280 | B | Browser only |
| Tennis WTA list views | /tennis/players?tour=wta | 4 | B | Query-string view of the ATP list page; canonical is the list page |
| Tennis rivalries (most-played pairs) | /tennis/head-to-head/atp/alcaraz-c/sinner-j | up to 30 a tour (8+ meetings, both players active) | A | Static: record, every meeting, model chance by surface; slugs in alphabetical order are canonical |
| Tennis other pairs | /tennis/head-to-head/atp/:a/:b | any pair | B | Browser only; self-canonical (alphabetical order) |
| International hub and lists | /international/tournaments | 7 | A | Head static |
| International nations, 50+ games and an Elo ranking | /international/teams/england | 216 men, 129 women | A | Full static HTML; record, Elo, tournament history, squad |
| International nations, 30+ games but under 50 or unranked | /international/teams/alderney | ~32 men, ~37 women | B | Static; non-FIFA island and regional sides (Alderney, Åland Islands, Jersey) have no Elo rank. Out of the sitemap since 29 Oct 2026 |
| International nations (<30 games) | /international/teams/… | ~90 | B | Thin |
| International match pages | /international/matches/2022-12-18-argentina-v-france | ~5,450 linked | B | Browser only, ~120 words (prediction, form, head to head); linked from nation and edition pages |
| International tournaments | /international/tournaments/world-cup | 8 | A | Head static |
| International editions | /international/tournaments/world-cup/2022 | 174 | A | Full static HTML; groups, bracket, scorers |
| Filtered tool views | /table?league=1&season=12, /international/fixtures?team=wales, /nfl/fixtures?season=2019&week=3 | ~680 linked | B | Canonical is the unfiltered page. Links to them from static pages carry rel="nofollow" (7 Oct 2026) |
| Unknown slugs (any section) | /tennis/players/atp/nobody | – | C | `useNoindex` / NotFoundPage (served with HTTP 200 by the app shell) |
| Admin, login, data-health, source data | /admin/fanteam | – | D | robots.txt |

Follow-ups: path-based WTA list pages. A real 404 status for unknown paths
isn't possible per section: valid client-rendered pages share the same
folders (minor players, smaller nations, older NFL games), so missing
entities get noindex instead.

## Rules every sitemap URL must meet (checked on every build)

`scripts/check-indexability.mjs` runs last in the Netlify build and checks
every sitemap URL against its generated file, using the rules in
`scripts/lib/indexability.mjs`: https on the apex host, lower case, no
trailing slash, no query string; not blocked by robots.txt; a generated file
whose canonical is exactly that URL; no noindex; a title no other sitemap
page uses. Private paths must stay blocked and out of the sitemap. The result
is in /build-report.txt (report-only: it never fails a deploy).
`src/__tests__/indexability.test.tsx` pins the rules, and `site-health.yml`
checks the live site daily (sampled canonicals, host/scheme/case/slash
variants, robots blocks).

## One address per page

- Generated pages: Netlify 301s `/x/` and `/X` to `/x`, and `http://` and
  `www.` to `https://fixtureshark.com` (http://www takes two hops).
- Client-rendered pages (the app-shell fallback answers any spelling with
  200): `CanonicalPathRedirect` replaces a trailing-slash or upper-case path
  with the canonical one before the page renders, and every page's
  canonical names the clean form.
- Query strings never change the canonical, except where the query is the
  page's identity (none in the sitemap).
- Links between pages use the canonical form (tennis pairs in alphabetical
  order; a source-level test rejects slash, upper-case and www links).

## Audit 7 Oct 2026

Crawl of every sitemap URL and every link target (24,695 URLs) plus a
rendered sample: report in the Claude Docs doc "FixtureShark indexing audit,
7 Oct 2026". Fixed then: /fpl's rendered canonical pointed at
/fpl/gameweek/N; trailing-slash/upper-case variants of client-rendered pages
answered 200; ATP and WTA Grand Slam editions shared titles and H1s; 46
tennis pair links used the reverse order; FPL player and Player Scout pages
(2,098 sitemap URLs) had no link in any server HTML; filter views linked
from static pages without nofollow.


## Search Console drop, 29 Oct 2026

Finding: impressions fell from ~200 to ~10 a day on 19 Oct across every
section. Indexed ~1,284; not indexed 7,859 "Discovered, currently not
indexed" and 736 "Duplicate, Google chose a different canonical". Fetched as
Googlebot without JavaScript:

- Matches outside the Premier League were the bare app shell (title
  "FixtureShark", no canonical, no robots tag, only the cookie banner in the
  body): 102 of the 736 duplicates. Not in the sitemap; found via links from
  the EFL club pages.
- Player Scout pages had the right title and canonical but an empty body,
  while the same player's /fpl/players page had ~1,000 words: two pages per
  player, 142 of the duplicates.
- The sitemap listed ~9,600 URLs. The "Discovered" sample was 44% club-season
  pages, then Player Scout, FPL players, old tennis editions, tennis players,
  old league seasons, tiny nations and NFL pages: Google was declining to
  crawl the long tail.

Fixes, part 1 (sitemap and Player Scout):

- Sitemap slimmed to the pages people search for (`scripts/lib/sitemapPolicy.mjs`):
  club seasons from 2023/24; league seasons of other countries from 2020/21
  (English tiers 1–5 keep every season); tennis big editions from 2015;
  nations with 50+ games and an Elo ranking; Player Scout pages removed.
  Every dropped page stays on the site, indexable and linked (policy B).
- Player Scout: a current player's scout page names /fpl/players/:slug as
  canonical, in the static file and in the browser (PlayerRecordPage). The
  FPL player page's server HTML now carries the career table, from one bulk
  read of `fpl_player_season_totals` (~2,800 rows). A former player's scout
  page is noindex,follow (static file and browser).

## Search Console data (from 11 Oct 2026)

Search performance for `sc-domain:fixtureshark.com` is loaded daily into the
private `gsc` schema by `scripts/gsc_import.py` (workflow `gsc-import.yml`,
07:17 UTC), using the read-only service account
`id-fixtureshark-gsc-reader@fixtureshark-analytics.iam.gserviceaccount.com`.

- Tables: `gsc.daily_totals`, `daily_by_device`, `daily_by_country`,
  `daily_by_page`, `daily_by_query`, `daily_by_page_query` (web search;
  clicks, impressions, CTR, average position, `is_final`).
- Each run rewrites its whole date window in one transaction: the last 10
  days (Google revises them) plus any gap since the last load. The first run,
  or `mode=backfill`, loads everything Google keeps (~16 months).
- Query-level rows omit queries Google anonymises, so they sum to less than
  the daily totals. Device and country rows do add up to the totals; the
  `gsc_breakdowns_reconcile` integrity check watches that.
- Run log: `gsc.import_runs`, plus `pipeline_runs` rows named `gsc_import`
  (counts only, as pipeline_runs is public). Integrity area `gsc`.
- Not exposed to the Data API (own schema, no anon/authenticated grants,
  RLS on). The key is only in the `GSC_SERVICE_ACCOUNT_JSON` Actions secret.

## Google Analytics data and the Site traffic page (from 12 Oct 2026)

GA4 traffic is loaded daily into the private `ga` schema by
`scripts/ga_import.py` (workflow `ga-import.yml`, 07:27 UTC), with the same
service account and `GSC_SERVICE_ACCOUNT_JSON` secret (Viewer on the GA4
property). Tables: `ga.daily_totals`, `daily_by_channel`,
`daily_by_landing_page`, `daily_by_page`, `daily_by_device`,
`daily_by_country`. Each run rewrites the last 5 days plus any gap, in one
transaction. Logged in `ga.import_runs` and `pipeline_runs` (`ga_import`);
integrity area `ga`.

GA only loads after a visitor accepts the cookie banner, and never on an
admin's device, so it undercounts. Search Console counts every search.

`/admin/traffic` (admin only, `public.get_site_traffic(p_days)`) shows both
sources for 7/28/90 days against the previous period: totals, daily bars,
sources (Google, Reddit, direct), sections, landing pages, pages, Google
searches, pages in Google, devices and countries.
