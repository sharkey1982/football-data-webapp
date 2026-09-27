# Season rollover runbook

What has to happen when one season ends and the next begins. Written for
2026/27 → 2027/28 (June–August 2027); the same steps apply every year.

## Two "current seasons"

Nothing may hard-code a season id or label (`13`, `'2627'`, `-2026`), use
`max(season_id)` or sort by `season_id`: ids are not in date order
(1992/93–2013/14 are 14–35, 2014/15–2026/27 are 1–13, the next one will be 36).
Order by `seasons.start_year` (`season_start_year()`, `previous_season_id()`,
`earlier_season()`, `later_season()`).

| Function | Meaning | Rolls over |
|---|---|---|
| `current_season_id()` | Football season: the one whose **1 July – 30 June** window contains today (`season_id_for_date(date)`). | On 1 July, once next season's `seasons` row exists. If it doesn't, stays on the old season and the integrity check fails. |
| `fpl_current_season_id()` | FPL season: the latest season (by start year) with rows in `fpl_gameweeks`. | When `private.refresh_fpl()` first stores the new game's gameweeks (from 1 August, see below). |

Football uses: fixture feeds, National League and cup ingestion, the daily
results import, betting defaults, the final-table simulation, promoted-team
estimates, Model Returns / Scorecard pages. FPL uses: every FPL function
default, the FPL projection chain, FPL scripts, build-time sitemap and static
pages, and the FPL pages of the site (`src/lib/currentSeason.ts`).

## What is now automatic

- **Fixture feeds** (`refresh_fixture_feeds`, `refresh_feed_nearest_date`,
  `refresh_scottish_premiership_fixtures`, 04:15 UTC): from 1 July they read
  the `…-2027` fixturedownload.com feeds. A league with no fixtures yet for the
  new season gets its whole list inserted once. A 404 before 1 October (feed
  not published yet; UEFA feeds appear after the late-August draw) is skipped
  and noted on the `fixture_refresh_runs` row instead of failing every feed.
- **National League** (`refresh_national_league_fixtures`, 04:35 UTC) and
  **cups** (`ingest-cup-data` edge function v9, 05:15 UTC): current season from
  `current_season_id()`; rows dated outside its 1 July – 30 June window are
  ignored, so next season's list shown early on the source page is never
  stored as this season.
- **Daily results import** (`scripts/import-daily.ts`, both daily workflows):
  season label from `current_season_id()`; the CSV URL follows it. In July and
  August a 404 (file not published yet) is logged as success, so the fit steps
  that follow still run.
- **Model fits and predictions**: unchanged, already season-agnostic. New
  fixtures get predictions from the newest accepted fit dated before kick-off
  (`backfill_fixture_predictions`, point-in-time); no hindsight predictions are
  created. Promoted teams get estimated ratings from
  `scripts/estimate_promoted_team_ratings.py` (now reads the current season's
  fixtures).
- **Final-table simulation**: `scripts/simulate_final_table.py` defaults to
  `current_season_id()` (workflow input blank = current).
- **FPL**: every `p_season_id` default is `fpl_current_season_id()` (was 13),
  the FPL joins are scoped to one season (FPL reuses player, team, fixture and
  event ids every season), the live-event refresh ignores last season's
  `is_current` GW38, and the FPL scripts and build scripts read the season from
  the database.
- **Site**: season ids come from `getCurrentFplSeasonId()` /
  `getCurrentSeasonId()` (one lookup per page load). Model Returns lists
  2023/24 up to the current season from the `seasons` table; the Scorecard
  names and orders seasons from it and marks the current one "(so far)".
- **Self-check**: `check_model_integrity()` → `season_rollover_ready` (daily,
  09:45 UTC):
  - **failed** – no `seasons` row covers today; or FPL gameweeks with a
    deadline after their season's 30 June end are stored under that season
    (the FPL overwrite described below has happened).
  - **warning** – from 1 March, next season's row is missing; and every day
    15 June – 31 July as the reminder to pause the FPL refresh.

## Checklist

### By 1 March 2027 — add the 2027/28 season row

Norway, Sweden and Finland play calendar-year seasons stored under the split
season that starts that year, so their 2027 results need the 2027/28 row as
soon as they kick off. Migration (idempotent):

```sql
insert into public.seasons (label, start_year, end_year, slug)
values ('2728', 2027, 2028, '2027-28')
on conflict do nothing;
```

`season_id` comes from the sequence (expect 36; check it before relying on
it). Don't dry-run this insert inside `begin … rollback`: the sequence still
advances (docs/incidents.md, 2026-09-27); if it has, reset it to
`max(season_id)` first. Then `select * from check_model_integrity() where check_name =
'season_rollover_ready';` should read `ok` … "next season's row exists".

### Mid-June — before the new FPL game launches (usually mid-July)

**Manual until `private.refresh_fpl()` is fixed.** It stamps everything it
loads with the season whose *1 August* window contains today. Once FPL
relaunches (July), the new game's teams, players, gameweeks and fixtures would
be written under 2026/27 and overwrite its final rows (same ids, upserted).
Pause both FPL jobs when the old game is over and resume them on 1 August:

```sql
select cron.alter_job((select jobid from cron.job where jobname = 'fpl-refresh-6-hourly'), active := false);
```

```sql
select cron.alter_job((select jobid from cron.job where jobname = 'fpl-live-current-6-hourly'), active := false);
```

and on 1 August the same with `active := true`. If the check has already
failed, the 2026/27 FPL rows have been overwritten: reload 2026/27 from the
season archive (`import_fpl_season` / `import_fpl_gameweeks`, folder
`2026-27`) once it is published. The permanent fix is to derive the season in
`private.refresh_fpl()` / `private.refresh_fpl_live_event()` from the
bootstrap itself (e.g. the year of GW1's deadline) rather than from today's
date — left to the owner, as that function is not edited by automation.

### June — fixtures published

- Nothing to run: from 1 July the feeds insert each league's new list.
- Check `get_unmapped_alias_names()` and the `fixture_refresh_runs` /
  `match_import_runs` errors for promoted and relegated clubs and add
  `team_aliases` rows (sources `FixtureDownload`, `football-data.co.uk`,
  `FootballWebPages`). Unmapped rows are skipped, not stored.
- National League: the source lists months as a dropdown; the function fails
  loudly if fewer than six are listed (normal right at the start of a season —
  it recovers as months are added).

### 1 July — rollover day

```sql
select public.current_season_id(), public.season_start_year(public.current_season_id());
```

```sql
select l.code, count(*) from fixtures f join leagues l using (league_id)
 where f.season_id = public.current_season_id() group by 1 order by 1;
```

```sql
select * from check_model_integrity() where status <> 'ok';
```

### August — season starts

- 1 August: resume the two FPL cron jobs. Within six hours
  `fpl_current_season_id()` should become 2027/28:
  ```sql
  select public.fpl_current_season_id(), public.season_start_year(public.fpl_current_season_id());
  ```
- Before GW1's deadline: the FPL Projections Pipeline needs new-season
  fixtures with predictions and `fpl_fixtures.canonical_fixture_id` mapped.
  `snapshot_due_fpl_projections()` takes the GW1 pre-deadline snapshot by
  itself; that snapshot is what makes a "model view at start of season" Season
  XI possible (OUTSTANDING.md, Set-and-Forget XI).
- Archive the finished FPL season when vaastav publishes it:
  `import_fpl_season(<2026/27 id>, '2026-27')` then `import_fpl_gameweeks(…)`,
  and store its Season XI row so /fpl/season-xi lists it.

## Known remaining items

- `private.refresh_fpl()` / `private.refresh_fpl_live_event()` August
  boundary (above). `public.set_current_season_id()` (the trigger that fills a
  missing `season_id` on FPL rows) uses the same August rule on purpose, to
  stay consistent with them.
- Edge function `fpl-optimize-squad` (deployed, not in the repo) looks up its
  exact-solver cache with `MILP_SEASON_ID = 13`. After the rollover the cache
  simply misses and the live heuristic answers; bring the source into the repo
  and use `fpl_current_season_id()`.
- Manual tools with stale defaults, harmless because they take parameters:
  `backfill-football-raw` (`seasons` default `['2526']`), `backfill-cup-raw`
  (`['2025-2026']`), `scripts/sync-fixtures.ts` (superseded;
  `SYNC_SEASON_LABEL`).
- `league_standings` (owned elsewhere): its current season is the latest by
  start year with results, so the finished season shows `is_final = false`
  from 1 July until the first result of the new season arrives. Ordering is by
  start year; no season-id ordering was found.
