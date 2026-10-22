# UK TV broadcast research: the scheduled task's procedure

This is the whole procedure for the scheduled Claude task that keeps the UK TV
guide (`/tv-guide`, the "Where to watch" box on match pages and the badges in
the fixture list) up to date. It replaced the Airtable base on 22 Oct 2026.
Follow it step by step. Read `CLAUDE.md` in the repo root first: its rules on
migrations and pushing apply here too.

The task does four things:

1. Finds the fixtures in the horizon that have no UK decision yet, or whose
   decision may have changed.
2. Researches them in official sources only.
3. Writes the findings as one migration file that calls
   `public.ingest_broadcasts(...)`, and merges it through a PR.
4. Checks what the database did with each row, and fixes any it could not place.

Supabase project: `ppzfmpbnojyjeblelsuz`. Use the Supabase connector
(`execute_sql`) for **reads only**. Every write goes through the migration file.

---

## 1. Horizon and what counts as a decision

- **Horizon:** today through today + 21 days. Also include any later fixture
  whose selection has just been announced (for example the Premier League
  publishing a whole month, or a UEFA round's picks).
- **A decision** is any `fixture_broadcasts` row with `market = 'GB'`:
  - `confirmed_broadcast`: one viewing offer (broadcaster + channel/service).
    A fixture can have several, one per broadcaster/channel.
  - `confirmed_not_televised`: an official source says it is not shown live in
    the UK.
- **No row means "not yet known"**, never "not on TV". Leave a fixture with no
  row rather than guess.
- **Saturday 3pm blackout:** the database adds `confirmed_not_televised` rows
  (source `rule:3pm_blackout`) for E0, E1, E2, E3 and EC fixtures that kick
  off on a Saturday between 14:45 and 17:15 UK time. `apply_uk_3pm_blackout()`
  does this daily and after each submission, and removes them when a real
  listing arrives. **Never submit `confirmed_not_televised` for the blackout
  yourself.** Only submit it when an official source says a specific match is
  not televised.

Competitions in scope (league codes in the site's `leagues` table):

| Code | Competition | Code | Competition |
|---|---|---|---|
| E0 | Premier League | UCL | UEFA Champions League |
| E1 | Championship | UEL | UEFA Europa League |
| E2 | League One | UECL | UEFA Conference League |
| E3 | League Two | LC | Carabao Cup (EFL Cup) |
| EC | National League | FAC | FA Cup (when fixtures exist) |
| SC0 | Scottish Premiership | D1 | Bundesliga |
| I1 | Serie A | SP1 | La Liga |
| F1 | Ligue 1 | | |

Competitions the site has **no fixtures** for (2. Bundesliga, EFL Trophy,
Scottish Championship, Scottish League One, Premier Sports Cup; see
`broadcast_competition_coverage`) are out of scope. Rows for them are rejected
with "competition not covered by site fixtures".

---

## 2. Find what needs researching

Fixtures in the horizon with no GB decision, plus how many listings each has:

```sql
select l.code, f.fixture_id, f.kickoff_date, to_char(f.kickoff_time, 'HH24:MI') ko,
       ht.display_name home_team, at.display_name away_team,
       count(fb.broadcast_id) filter (where fb.status = 'confirmed_broadcast') listings,
       bool_or(fb.status = 'confirmed_not_televised') not_televised,
       bool_or(fb.source = 'rule:3pm_blackout') blackout_rule,
       max(fb.verified_at) last_verified
from public.fixtures f
join public.leagues l on l.league_id = f.league_id
join public.teams ht on ht.team_id = f.home_team_id
join public.teams at on at.team_id = f.away_team_id
left join public.fixture_broadcasts fb on fb.fixture_id = f.fixture_id and fb.market = 'GB'
where f.status = 'scheduled'
  and f.kickoff_date between current_date and current_date + 21
  and l.code in ('E0','E1','E2','E3','EC','SC0','UCL','UEL','UECL','LC','FAC','D1','I1','SP1','F1')
group by 1, 2, 3, 4, 5, 6
order by f.kickoff_date, f.kickoff_time, l.code;
```

Research, in this order:

1. Fixtures with **no row at all** (`listings = 0 and not not_televised`).
2. Fixtures whose only rows have `confidence` `probable` or
   `needs_verification` (fixture-level confirmation now exists).
3. Fixtures with listings where a selection may have moved (a new PL or EFL
   fixture-amendment announcement since `last_verified`).

To see existing rows for one fixture: `select * from public.fixture_broadcasts
where fixture_id = <id> and market = 'GB';`

Use the `home_team` / `away_team` names this query returns in your rows. They
always resolve. Other spellings work only when a team alias exists.

---

## 3. Sources, by competition

Use **primary/official sources only**: the league, the competition organiser
or the rights-holding broadcaster. Use a secondary listing site only to find a
primary page, never as the `source_url`. Every `confirmed_broadcast` row needs
a `source_url` you have opened that names that fixture (or, for "every match
is live", a rights statement that covers it plus the official fixture list).

| Competition | Where to look (official) | Usual answer |
|---|---|---|
| E0 Premier League | premierleague.com news: "Broadcast selections" and "Fixture amendments" articles, published in blocks of several rounds | Sky Sports or TNT Sports, one row; Amazon Prime Video no longer holds PL rights. Saturday 15:00 games: blackout rule |
| E1/E2/E3 EFL | skysports.com "Live EFL fixtures on Sky Sports" article (updated through the season); efl.com "fixture changes / TV selections" news | Saturday 12:30 and evening picks on Sky Sports / Sky Sports+. Midweek EFL games not picked for a main channel are streamed on Sky Sports+: only record them when the EFL or Sky page says so for that round |
| LC Carabao Cup | efl.com "Carabao Cup round X schedule confirmed" | Sky Sports (Football / Main Event / Sky Sports+); ITV for some ties |
| FAC FA Cup | thefa.com "Emirates FA Cup ... live on TV" round announcements | BBC (free) and TNT Sports |
| EC National League | thenationalleague.org.uk "How to watch ... this weekend" and DAZN's National League page | DAZN (National League TV); some games on TNT Sports or BBC |
| UCL | uefa.com fixtures; tntsports.co.uk Champions League schedule; Amazon Prime Video UK's UCL match calendar (Tuesday top pick) | TNT Sports for every match except the Prime Video pick |
| UEL / UECL | uefa.com fixtures + tntsports.co.uk statement that every Europa / Conference League match is live | TNT Sports (HBO Max) |
| SC0 Scottish Premiership | spfl.co.uk "TV selections and fixture changes" / "Latest live broadcast selections" | Sky Sports or Premier Sports |
| D1 Bundesliga | bundesliga.com UK & Ireland media news; Sky Sports' Bundesliga schedule | Sky Sports, BBC (some), Amazon Prime Video, Bundesliga FAST channel (Samsung TV Plus) |
| I1 Serie A | DAZN UK Serie A schedule (dazn.com/en-GB) | DAZN; TNT Sports for a few |
| F1 Ligue 1 | ligue1.com / Ligue 1+ UK announcements | Ligue 1+ (streaming) |
| SP1 La Liga | laliga.com UK broadcast partner news; Premier Sports' LaLiga schedule | Premier Sports / LALIGA TV; Disney+ for some |

Name broadcasters the way the site already does, so rows group in the TV
guide filters: `Sky Sports`, `TNT Sports`, `Amazon Prime Video`, `BBC`,
`ITV`, `DAZN`, `Premier Sports`, `Ligue 1+`, `Disney+`, `Samsung TV Plus`.
Put the specific channel in `channel` (`Sky Sports Main Event`,
`Sky Sports+`, `TNT Sports 1`, `BBC One`) and the app in `streaming_service`
(`Sky Go / NOW`, `HBO Max`, `Prime Video`, `BBC iPlayer`, `ITVX`, `DAZN`).
If the channel is not announced yet, use the broadcaster name or
"(channel TBC)" exactly as existing rows do. When it is announced later, the
same broadcaster's row is updated in place.

### Rules

- **Never guess.** No inferring from patterns ("Sky usually takes the 5:30").
  A rights deal alone is enough only where that deal covers every match of the
  competition (UEL, UECL, Ligue 1+, DAZN Serie A, Premier Sports La Liga). In
  that case set `confidence` to `probable` and say so in `availability_notes`.
- `confidence`: `confirmed_primary` = fixture named on an official page;
  `confirmed_secondary` = fixture named on the broadcaster's own schedule
  page; `probable` = covered by a whole-competition rights statement.
- `confirmed_not_televised` only on an explicit official statement for that
  match, never because you found nothing.
- Kick-off date and time are **UK local** (BST/GMT). Pass `kickoff_time` when
  the source gives it: it breaks ties and flags fixtures whose stored date or
  time is wrong.
- Send the **whole row** every time. A resubmitted row replaces the stored
  one, so a field you leave out is cleared (except `watch_url`, which is kept
  when omitted).
- Note anything you could not find in the PR description.

---

## 4. Row format

`public.ingest_broadcasts(p_rows jsonb, p_label text)` takes a JSON array, one
object per row:

| Field | Required | Notes |
|---|---|---|
| `competition` | yes | League code (`E0`, `UCL`, ...), league name, or a `broadcast_competition_map` label (`Carabao Cup`) |
| `home_team`, `away_team` | yes | Names from the query in step 2 |
| `kickoff_date` | yes | UK date, `YYYY-MM-DD` |
| `kickoff_time` | no | UK time, `HH:MM` |
| `market` | no | `GB` (default, the only one accepted) |
| `status` | yes | `confirmed_broadcast` or `confirmed_not_televised` |
| `broadcaster` | listings | e.g. `Sky Sports` |
| `channel`, `streaming_service`, `service_product`, `platform_device` | no | text |
| `access_type` | no | `free`, `free_compatible_device`, `subscription`, `ppv`, `unknown` |
| `is_free_to_air`, `is_subscription`, `is_ppv` | no | booleans, used only when `access_type` is absent |
| `delivery_methods` | no | array of `tv_channel`, `streaming`, `fast`, `web`, `app` (default from channel / streaming_service) |
| `is_live`, `uk_available` | no | booleans, default true. `uk_available: false` hides the row from the guide |
| `is_fast` | no | boolean (free ad-supported TV channel) |
| `watch_url` | no | https link to watch, if the broadcaster gives one |
| `source` | yes | Human description, e.g. `Premier League official broadcast selections, checked 22 Oct 2026` |
| `source_url` | listings | https page that confirms it |
| `verified_at` | no | When you checked (default now) |
| `confidence` | no | `confirmed_primary` (default), `confirmed_secondary`, `probable`, `needs_verification` |
| `availability_notes` | no | Short plain-English note shown to admins |
| `remove` | no | `true` deletes the matching row instead (see below) |

**Matching.** The row lands on the nearest fixture of those two teams within 3
days in that competition. A unique fixture of the pair on the exact date in
any competition also counts. The upsert key is fixture + market + status +
broadcaster + channel. A broadcaster's single existing row is updated in place
when only its channel changes.

**Removing.** To withdraw a listing (a match moved off TV, or a wrong row),
send the same competition / teams / date / status / broadcaster (and
`channel` to remove just one channel) with `"remove": true`. Removals run
before everything else in the submission. Nothing is ever deleted unless a row
says `"remove": true`.

**Conflicts.** A `confirmed_not_televised` row is refused while the fixture
has listings, and a listing is refused while a (non-blackout)
`confirmed_not_televised` row exists. Include a `remove` row for the old
decision in the same submission.

Example:

```json
[
  {"competition": "E0", "home_team": "Chelsea", "away_team": "Tottenham",
   "kickoff_date": "2026-10-24", "kickoff_time": "17:30",
   "status": "confirmed_broadcast", "broadcaster": "Sky Sports",
   "channel": "Sky Sports Main Event", "streaming_service": "Sky Go / NOW",
   "access_type": "subscription", "delivery_methods": ["tv_channel", "streaming", "app"],
   "source": "Premier League official broadcast selections, checked 22 Oct 2026",
   "source_url": "https://www.premierleague.com/en/news/4688862/fixture-amendments-for-premier-league-matches-in-october-and-november",
   "confidence": "confirmed_primary"},
  {"competition": "UEL", "home_team": "Aston Villa", "away_team": "Feyenoord",
   "kickoff_date": "2026-11-05", "status": "confirmed_broadcast",
   "broadcaster": "TNT Sports", "streaming_service": "HBO Max", "access_type": "subscription",
   "source": "TNT Sports: every Europa League match live in the UK; UEFA fixture list",
   "source_url": "https://www.uefa.com/uefaeuropaleague/fixtures-results/",
   "confidence": "probable",
   "availability_notes": "Whole-competition rights; channel not yet listed."}
]
```

---

## 5. Write the submission

One file per run: `supabase/migrations/<YYYYMMDDHHMMSS>_broadcasts_<yyyymmdd>.sql`,
timestamped now (UTC) and later than every file already in the folder:

```sql
-- UK TV broadcasts: research run <yyyy-mm-dd> (scheduled Claude task).
-- Horizon <from> to <to>; competitions ...; N rows.
-- Not found: <fixtures or competitions with no official announcement yet>.
select public.ingest_broadcasts($json$
[ ...rows... ]
$json$::jsonb, 'research <yyyy-mm-dd>');
```

- Use dollar quoting (`$json$ ... $json$`) so apostrophes in team names and
  notes need no escaping.
- Validate the JSON before committing, e.g.
  `python3 -c "import json,re,sys; s=open(sys.argv[1]).read(); json.loads(re.search(r'\$json\$(.*)\$json\$', s, re.S).group(1))" <file>`.
- Re-running the file is harmless: unchanged rows only get `last_synced_at`
  and `verified_at` refreshed.
- To check rows before the PR, run a read-only dry run with the connector:
  `begin; select public.ingest_broadcasts(...); rollback;`. Look at
  `unmatched_rows` and `kickoff_warnings`. Always end with `rollback`.

## 6. PR, checks, merge

As in `CLAUDE.md`:

1. Branch from `origin/main`, add only the migration file (plus alias
   migrations, if any), and commit.
2. Run `npx tsc --noEmit -p tsconfig.app.json`, `npm run build` and
   `timeout 580 npx vitest run`, in order, all green (after
   `npm install --no-save --no-audit --no-fund`, with a `.env.local` holding
   `VITE_SUPABASE_URL=https://example.supabase.co` and
   `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_mock`; never commit it).
3. Open the PR with `gh api repos/sharkey1982/football-data-webapp/pulls`
   (REST). Title: `UK TV broadcasts: research <date>`. In the body, give the
   counts per competition and list what could not be found.
4. Wait for three things on the head commit, polling every 30 s:
   - statuses `netlify/footballdatashark/deploy-preview` and `smoke/preview`
     both `success`
     (`gh api repos/sharkey1982/football-data-webapp/commits/<sha>/status`);
   - the check run `checks` (workflow `pr-checks.yml`) `completed` with
     conclusion `success`
     (`gh api repos/sharkey1982/football-data-webapp/commits/<sha>/check-runs --jq '.check_runs[] | {name, status, conclusion}'`).

   If main moved meanwhile, `git fetch origin main && git rebase origin/main`,
   re-run the three local checks, push, and wait again.
5. Squash-merge: `gh api -X PUT .../pulls/<n>/merge -f merge_method=squash`.

The `apply-migrations` workflow runs the file within a few minutes of the merge.

## 7. Verify

```sql
-- the file was applied
select * from public.repo_migrations order by applied_at desc limit 5;
-- the run
select run_id, ran_at, label, records_seen, inserted, updated, unchanged, removed, unmatched, notes
from public.broadcast_sync_runs where source = 'claude_research' order by run_id desc limit 3;
-- rows it could not place (open, upcoming)
select airtable_record_id as row_key, kickoff_date, competition_label, home_raw, away_raw, reason, category
from public.broadcast_unmatched_classified
where airtable_record_id like 'research:%' and not coalesce(is_past, false)
order by kickoff_date;
-- the health checks for this route
select * from public.check_broadcast_integrity();
```

Fix unmatched rows:

- **unknown team:** find the club with
  `select team_id, display_name, canonical_name from public.teams where display_name ilike '%<name>%';`
  then add an alias in the next submission's migration, before the
  `ingest_broadcasts` call:
  `insert into public.team_aliases (team_id, source_name, raw_name) select <team_id>, 'broadcasts', '<name as the source writes it>' where not exists (select 1 from public.team_aliases where source_name = 'broadcasts' and raw_name = '<name>');`
  Or resubmit the row with the site's name.
- **no fixture within 3 days / ambiguous fixture:** check the fixture list
  (`select * from public.fixtures where home_team_id = ... and away_team_id = ...`).
  If the site's date is wrong, report it in the PR. Do not change fixtures
  from this task.
- **conflict:** add the matching `remove` row.
- **competition not covered / not mapped:** out of scope, or a missing label
  in `broadcast_competition_map`. Use the league code instead.

`kickoff_warnings` in the result lists fixtures whose stored date or time
differs from the source. Mention them in the PR.

## Monitoring

- `job_registry` job `broadcast-research` (location `claude_task`) reads
  `broadcast_sync_runs` rows with source `claude_research`. It shows as stale
  in `job_health` after about 9 days without a run.
- The integrity area `broadcasts` (`check_broadcast_integrity()`, daily at
  09:45 UTC):
  - `broadcast_research_fresh` warns at 5 days without a submission and
    fails at 9.
  - `broadcast_decisions_next_10d` warns when Premier League, EFL or Carabao
    Cup fixtures in the next 10 days have no GB decision.
  - `broadcast_unmatched_upcoming` warns on unplaced rows for upcoming games.
