# Indexation policy (6 Oct 2026)

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
| Club pages (current PL) | /football/teams/arsenal | 20 | A | Static HTML |
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
| Tennis players with 50+ recent matches | /tennis/players/atp/sinner-j | 217 | A | Static |
| Tennis players below 50 recent matches | /tennis/players/atp/… | ~2,775 | C | Thin; noindex in the page |
| Tennis tournaments | /tennis/tournaments/atp/wimbledon | 300 | A | Static champions and records |
| Tennis big editions (Slams, Finals, 1000s) | /tennis/tournaments/atp/wimbledon/2025 | 532 | A | Static draw and paths |
| Tennis other editions | /tennis/tournaments/atp/doha/2019 | ~2,280 | B | Browser only |
| Tennis WTA list views | /tennis/players?tour=wta | 4 | B | Query-string view of the ATP list page; canonical is the list page |
| Tennis rivalries (most-played pairs) | /tennis/head-to-head/atp/alcaraz-c/sinner-j | up to 30 a tour (8+ meetings, both players active) | A | Static: record, every meeting, model chance by surface; slugs in alphabetical order are canonical |
| Tennis other pairs | /tennis/head-to-head/atp/:a/:b | any pair | B | Browser only; self-canonical (alphabetical order) |
| International hub and lists | /international/tournaments | 7 | A | Head static |
| International nations (30+ games) | /international/teams/england | 248 | A | Full static HTML; record, Elo, tournament history, squad |
| International nations (<30 games) | /international/teams/… | ~90 | B | Thin |
| International tournaments | /international/tournaments/world-cup | 8 | A | Head static |
| International editions | /international/tournaments/world-cup/2022 | 174 | A | Full static HTML; groups, bracket, scorers |
| Unknown slugs (any section) | /tennis/players/atp/nobody | – | C | `useNoindex` / NotFoundPage (served with HTTP 200 by the app shell) |
| Admin, login, data-health, source data | /admin/fanteam | – | D | robots.txt |

Follow-ups: path-based WTA list pages. A real 404 status for unknown paths
isn't possible per section: valid client-rendered pages share the same
folders (minor players, smaller nations, older NFL games), so missing
entities get noindex instead.
