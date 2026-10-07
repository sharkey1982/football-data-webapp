# Indexation policy (6 Oct 2026; audited 7 Oct 2026)

Which page families search engines should index, and which go in the sitemap.
`scripts/generate-sitemap.mjs` implements this family by family, and
`scripts/generate-static.mjs` writes the pages (full HTML, or the head only
where the body loads in the browser). A new database row only becomes a
sitemap URL if its family is listed here as **A**.

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
| Club seasons (English tiers 1–5) | /football/teams/hull/2024-25 | 3,764 | A | Static, unique table and results per season |
| League histories and seasons | /football/leagues/premier-league/1992-93 | ~400 | A | Static historical tables |
| Records and trends per league | /football/records/premier-league | ~45 | A | Static |
| FPL player pages | /fpl/players/:slug | 667 | A | Static projection pages |
| FPL Player Scout (career) | /fpl/player-scout/:slug | 1,431 | A | Head static, body in browser; evergreen career records |
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
| Tennis big editions (Slams, Finals, 1000s) | /tennis/tournaments/atp/wimbledon/2025 | 532 | A | Static draw and paths |
| Tennis other editions | /tennis/tournaments/atp/doha/2019 | ~2,280 | B | Browser only |
| Tennis WTA list views | /tennis/players?tour=wta | 4 | B | Query-string view of the ATP list page; canonical is the list page |
| Tennis rivalries (most-played pairs) | /tennis/head-to-head/atp/alcaraz-c/sinner-j | up to 30 a tour (8+ meetings, both players active) | A | Static: record, every meeting, model chance by surface; slugs in alphabetical order are canonical |
| Tennis other pairs | /tennis/head-to-head/atp/:a/:b | any pair | B | Browser only; self-canonical (alphabetical order) |
| International hub and lists | /international/tournaments | 7 | A | Head static |
| International nations (30+ games) | /international/teams/england | 248 | A | Full static HTML; record, Elo, tournament history, squad |
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

