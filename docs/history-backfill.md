# English league history, 1992/93 to 2013/14

Results for English tiers 1-4 (E0 Premier League, E1-E3 the Football
League divisions under their era names) from 1992/93 to 2013/14, loaded on
27 September 2026. Together with the regular imports from 2014/15, `matches`
now holds every league game in the top four divisions since the Premier
League began: 44,768 historic matches.

## Sources

| Seasons | Source | `matches.source_name` | What exists |
|---|---|---|---|
| 1992/93 | [engsoccerdata](https://github.com/jalapic/engsoccerdata) `data-raw/england.csv` | `engsoccerdata` | Date, full-time score (result derived from the goals). No half-time, stats, referee, kick-off time or odds. football-data.co.uk has no 1992/93. |
| 1993/94 - 2013/14 | football-data.co.uk `/mmz4281/<label>/E0-E3.csv` | `football-data.co.uk` | As the file has it -- see coverage below. Raw rows archived in `raw_match_files` / `source_match_rows`. |

### Coverage (matches per division-season; every season is complete)

| Seasons | Matches | Half-time | Stats (shots, corners, fouls, cards) and referee | Odds (`match_odds`) |
|---|---|---|---|---|
| 1992/93 | all | none | none | none |
| 1993/94 - 1994/95 | all | none | none | none |
| 1995/96 - 1996/97 | all | E0 only | none | none |
| 1997/98 - 1999/00 | all | E0, E1 | none | none |
| 2000/01 - 2001/02 | all | all | all | 1X2 Interwetten and William Hill (6 of 4,072 matches without) |
| 2002/03 - 2004/05 | all | all | all (2002/03: 6 E2/E3 matches without stats) | adds Bet365 1X2 (from 2002/03), Bet365 O/U 2.5 (2002/03-2004/05), Bet365 AH (2003/04, 2004/05), bwin (2004/05); no O/U or AH again until 2019/20 (see below) |
| 2005/06 - 2011/12 | all | all | all | 1X2 Bet365, bwin, Interwetten, VC Bet, William Hill |
| 2012/13 - 2013/14 | all | all | all, except no referee in E1-E3 2012/13 | adds Pinnacle, including Pinnacle closing prices |

Division sizes (from both sources): Premier League 22 clubs to 1994/95 (462
matches), 20 after; tier 4 had 22 clubs in 1992/93-1994/95 (462); 24 clubs
(552) otherwise.

Known gaps in what the site can show:
- **Cards before 2000/01 are 0, not unknown.** `home/away_yellow_cards` and
  `_red_cards` are NOT NULL, so the importer (like `import-daily.ts`) writes
  0 when the file has no cards. Anything averaging cards per match across
  seasons must filter to matches with stats (`home_shots is not null`).
  Referee-based pages are unaffected (no referee in those rows).
- **No market-average odds, O/U or AH prices for 2005/06-2018/19.** Those files carry
  Betbrain maximum/average columns (`BbMx*`, `BbAv*`, `BbOU`, `BbAH`), which
  `backfill_match_odds()` does not read; only the individual bookmakers above
  are stored. The same applies to the existing 2014/15-2018/19 rows.
- **Points deductions are applied** from 1992/93 (34 deductions, migration
  `20260927120000_historic_point_deductions.sql`; see League tables below).

## Clubs

Every football-data.co.uk name was matched to an engsoccerdata name by
aligning fixtures (same division and season, date within 3 days, same
score): each pairing won by at least 3 to 1 over any alternative, and the
mapping is one to one (110 names each side). engsoccerdata has no 1992/93
club missing from 1993-2013. Aliases were added for both sources
(`team_aliases.source_name` `football-data.co.uk` and `engsoccerdata`).

New teams (7): Wimbledon, Halifax Town, Chester City, Hereford United,
Darlington, Scarborough, Rushden & Diamonds.

Judgement calls:
- **Wimbledon** (to 2003/04) is its own team, separate from Milton Keynes
  Dons (renamed and relocated 2004) and AFC Wimbledon (founded 2002) -- as
  both sources treat them.
- **Halifax Town** (wound up 2008) and **FC Halifax Town** (team `halifax`,
  founded 2008) are different clubs; so are **Chester City** (expelled 2010)
  and **Chester FC** (team `chester`). football-data.co.uk spells each pair
  the same ("Halifax", "Chester"), and `team_aliases` holds one team per
  spelling, so the aliases stay on the current clubs and the history
  importer's `ERA_OVERRIDES` sends Halifax up to 2007/08 and Chester up to
  2009/10 to the old clubs. Odds for those matches were matched the same way
  (migration `20260927120200_history_match_odds.sql`). The current clubs are
  displayed as "FC Halifax Town" and "Chester FC" (and `telford-united` as
  "AFC Telford United"), so they read differently from the old clubs in team
  search and lists; slugs are unchanged (migration
  `20260927160100_team_display_names_same_town_clubs.sql`).
- **Hereford United** gets slug `hereford-united`, leaving `hereford` for
  Hereford FC should it ever appear.
- **Boston United** (League 2002-2007, "Boston") is the existing team
  `boston-united`; **Aldershot** in 2008-2013 is Aldershot Town, the existing
  team `aldershot` (Aldershot FC folded in March 1992, before this data);
  **Macclesfield** is Macclesfield Town, the existing team `macclesfield`.

## Differences between the sources

Every football-data.co.uk result was compared with engsoccerdata's for the
same fixture (same teams, division and season). All 42,740 fixtures pair
up; 18 rows differed. 11v11.com match records were used as the third source:

| Season | Div | Match (football-data.co.uk) | football-data.co.uk | engsoccerdata | Kept |
|---|---|---|---|---|---|
| 1993/94 | E2 | Bristol Rovers v Barnet, 26 Mar 1994 | 2-5 | 5-2 | 5-2 |
| 1994/95 | E1 | Swindon v West Brom, 19 Mar 1995 | 5-2 | West Brom 2-5 Swindon | West Brom 2-5 Swindon |
| 1994/95 | E1 | West Brom v Swindon, 31 Aug 1994 | 0-0 | Swindon 0-0 West Brom | Swindon 0-0 West Brom |
| 1994/95 | E2 | Blackpool v Oxford, 11 Feb 1995 | 2-1 | 2-0 | **2-1** (11v11 agrees with football-data.co.uk) |
| 1994/95 | E2 | Hull v Wrexham, 29 Apr 1995 | 3-1 | 3-2 | 3-2 |
| 1994/95 | E3 | Carlisle v Lincoln, 6 May 1995 | 2-3 | 1-3 | 1-3 |
| 1995/96 | E1 | Huddersfield v Crystal Palace, 24 Feb 1996 | 2-0 | 3-0 | 3-0 |
| 1995/96 | E2 | Blackpool v Notts County, 9 Mar 1996 | 2-0 | 1-0 | 1-0 |
| 1995/96 | E2 | York v Blackpool, 4 May 1996 | 0-1 | 0-2 | 0-2 |
| 1995/96 | E3 | Lincoln v Scarborough, 2 Apr 1996 | 2-1 | 3-1 | 3-1 |
| 1995/96 | E3 | Northampton v Doncaster, 24 Feb 1996 | 2-2 | 3-3 | 3-3 |
| 1995/96 | E3 | Scunthorpe v Fulham, 23 Mar 1996 | 3-0 | 3-1 | 3-1 |
| 1996/97 | E1 | Man City v Grimsby, 16 Apr 1997 | 3-0 | 3-1 | 3-1 |
| 1996/97 | E1 | Tranmere v Southend, 28 Mar 1997 | 2-0 | 3-0 | 3-0 |
| 1996/97 | E2 | Wrexham v Wycombe, 30 Nov 1996 | 2-0 | 1-0 | 1-0 |
| 1996/97 | E3 | Cardiff v Scarborough, 18 Mar 1997 | 2-2 | 1-1 | 1-1 |
| 1999/00 | E3 | Rochdale v Hartlepool, 8 Apr 2000 | 0-0 | 2-0 | 2-0 |
| 2012/13 | E2 | Portsmouth v Shrewsbury, 20 Oct 2012 | 2-1 | 3-1 | 3-1 |

The 17 corrections are applied by the importer itself (`CORRECTIONS` in
`scripts/history_backfill.py`), so re-running an import cannot restore a
wrong score. The raw rows in `source_match_rows` stay as published. The
Swindon/West Brom file rows had home and away reversed for both fixtures
(same dates, same totals). Portsmouth v Shrewsbury keeps the file's
half-time 0-0.

After the load, every stored result matches engsoccerdata except Blackpool v
Oxford; no duplicate fixtures, no club playing twice on a day, every result
letter agrees with its score, every date inside its season.

## League tables

Computed tables (`league_standings`) agree with engsoccerdata's results in
every division-season: same champions, same bottom three, same order --
except 2010/11 League One positions 17-18 (Oldham and Tranmere level on
points, goal difference and goals scored; ours are in name order).

Where engsoccerdata's own deduction list applies, its final order differs
from ours only by those points (candidates for `point_deductions`):

| Season | Div | Deduction (engsoccerdata) | Changes the bottom three? |
|---|---|---|---|
| 1996/97 | E0 | Middlesbrough -3 | yes |
| 1996/97 | E3 | Brighton -2 | no |
| 1997/98 | E3 | Leyton Orient -3 | no |
| 2000/01 | E3 | Chesterfield -9 | no |
| 2002/03 | E3 | Boston United -4 | no |
| 2004/05 | E3 | Cambridge United -10 | no |
| 2006/07 | E1 | Leeds United -10 | no |
| 2006/07 | E2 | Rotherham -10 | yes |
| 2007/08 | E2 | Leeds -15, Bournemouth -10, Luton -10 | no |
| 2007/08 | E3 | Rotherham -10 | no |
| 2008/09 | E2 | Stockport -10 | no |
| 2008/09 | E3 | Luton -30, Bournemouth -17, Rotherham -17, Darlington -10 | yes |
| 2009/10 | E1 | Crystal Palace -10 | no |
| 2009/10 | E2 | Southampton -10, Hartlepool -3 | no |
| 2010/11 | E2 | Plymouth -10 | yes |
| 2010/11 | E3 | Hereford -3, Torquay -1 | no |
| 2011/12 | E1 | Portsmouth -10 | yes |
| 2011/12 | E3 | Port Vale -10 | no |
| 2012/13 | E2 | Coventry -10, Portsmouth -10 | no |
| 2013/14 | E2 | Coventry -10 | no |
| 2013/14 | E3 | AFC Wimbledon -3 | no |

engsoccerdata's list is not authoritative: it has, for example, Wrexham
-10 in tier 3 for 2006/07, when Wrexham were in tier 4 (their 10 points
were deducted in 2004/05), and Portsmouth's 2009/10 Premier League -9 did
not change any position here.

### Deductions and tie-breaks (applied 27 Sep 2026)

34 deductions for 1992/93-2013/14 were researched season by season from the
division articles and loaded into `point_deductions`. Not applied:
Tottenham 1994/95 (-12, cut to -6, then quashed in Dec 1994). Leeds' 2006/07
-10 is recorded in 2006/07 (imposed after relegation); Southampton's -10 in
2009/10 (applied at the start of that season). engsoccerdata's Wrexham 2006/07
entry is wrong and was not used. Conference deductions (20, including
Chester City 2009/10, whose record was expunged) wait for the National League
backfill.

The Football League (tiers 2-4) separated clubs level on points by goals
scored, not goal difference, until 1998/99. `league_standings` now does the
same for those seasons (the Premier League always used goal difference).
This moved 66 club positions, including three that matter: Wigan, not Fulham, won
the 1996/97 Third Division; Brighton, not Hereford, stayed up in 1996/97; and
Bury, not Port Vale, went down from the First Division in 1998/99.

Checked after both changes: every champion and every relegated club in
E0-E3 1992/93-2013/14 matches the historical record, including the five
seasons where deductions decide the bottom three (1996/97 E0, 2006/07 E2,
2008/09 E3, 2010/11 E2, 2011/12 E1).

## Effect on the model and current numbers

Checked before and after the load (fingerprints of the rows):
- Fits, predictions and fixtures' predicted scores: unchanged; nothing
  refitted or re-predicted (the daily fit uses a 730-day window).
- `model_scorecard_matches` (refreshed in a rolled-back transaction),
  `get_model_scorecard()`: identical.
- `league_standings` for 2014/15 onwards: identical; 2026/27 is still the
  current season.
- `team_season_movement` for 2015/16 onwards: identical. **2014/15 changed**:
  it was the first season in the data, so every club was "unknown"; it now
  has real promoted / relegated / new / stayed values. The scorecard only
  uses seasons with predictions (2023/24 on), so it is unaffected.
- All-time pages now include the history by design: team pages
  (`league_standings`, `get_team_month_profile`), strictest referees, most
  common scoreline, market efficiency and overround trends (odds from
  2000/01), country competitiveness. `team_home_away_adjustment_experimental_v1`
  weights by recency (180-day half-life), so the old matches carry
  effectively zero weight.

## Rerunning

Workflow **History backfill** (`.github/workflows/history-backfill.yml`,
manual), script `scripts/history_backfill.py`:
- `stage` -- reload `historic_source_rows` from both sources.
- `import-fd` with targets `all` (every E0-E3 file 1993/94-2013/14, newest
  first) or a list such as `E0:1314,E3:9394`. Upserts on the natural key,
  archives raw rows, applies `ERA_OVERRIDES` and `CORRECTIONS`, logs one
  `match_import_runs` row per file (`error_message` starts `history <label>`).
  `rows_seen` counts blank comma-only lines in some old files (e.g. E0
  1995/96 shows 552 for 380 matches), as `import-daily.ts` does.
- `import-esd` with `esd_years` (default `1992`).
Each run logs a `pipeline_runs` row (`job_name` `history_backfill`). The
final `backfill_match_odds()` call can time out through the API after a
large load; run `select public.backfill_match_odds();` in SQL instead.

The scratch table `historic_source_rows` can be dropped once this load is
signed off (it is catalogued as scratch).

# National League (Conference), 2004/05 to 2013/14

Tier 5 (league EC, league_id 5) from 2004/05, loaded on 27 September 2026
with the same script and workflow. With the regular imports from 2014/15,
`matches` now holds every National League game since 2004/05: 5,294
historic matches. The division is named "Conference National" for
2004/05-2014/15 (`league_season_names`, already in place).

## Sources

| Seasons | Source | `matches.source_name` | What exists |
|---|---|---|---|
| 2004/05 | [engsoccerdata](https://github.com/jalapic/engsoccerdata) `data-raw/england_nonleague.csv` (division `conference`, tier 5) | `engsoccerdata` | Date and full-time score only. football-data.co.uk has no Conference file before 2005/06. |
| 2005/06 - 2013/14 | football-data.co.uk `/mmz4281/<label>/EC.csv` | `football-data.co.uk` | Half-time score, shots, shots on target, corners, fouls, cards for every match; referee for nearly all (none in 2012/13; a handful missing in 2005/06-2011/12); 1X2 odds (below). Raw rows archived in `raw_match_files` / `source_match_rows`. |

| Season | Clubs x games | Matches | Odds (`match_odds`, 1X2) |
|---|---|---|---|
| 2004/05 | 22 x 42 | 462 | none |
| 2005/06 | 22 x 42 | 462 | Bet365, bwin, Interwetten, VC Bet, William Hill (420 matches) |
| 2006/07 - 2008/09 | 24 x 46 | 552 each | as above (506-537 matches a season) |
| 2009/10 | 23 x 44 | 506 | as above (all) |
| 2010/11 - 2011/12 | 24 x 46 | 552 each | as above (531-552) |
| 2012/13 - 2013/14 | 24 x 46 | 552 each | adds Pinnacle, including closing prices (all) |

**2009/10**: Chester City were expelled on 26 February 2010 and their record
expunged on 8 March 2010. Neither source has their matches (both files
have 23 clubs and 506 rows); `EXPUNGED` in the script would drop them
anyway. Rushden & Diamonds (2010/11), Halifax Town (2007/08), Hereford
United and Salisbury City (2013/14) left after their seasons, so all their
games stand.

## Clubs

Names were matched by aligning every football-data.co.uk fixture with
engsoccerdata's (same season, date within 3 days, same score): each name
pairs with one engsoccerdata name by at least 5 to 1 (Halifax excepted, see
below). Migration `20260927130100_historic_conference_teams_and_aliases.sql`.

New teams (17): Bath City, Canvey Island, Droylsden, Eastbourne Borough,
Farnborough Town, Farsley Celtic, Grays Athletic, Hayes & Yeading United,
Histon, Hyde United, Kettering Town, Leigh RMI, Lewes, Northwich Victoria,
Salisbury City, St Albans City, Stafford Rangers.

Judgement calls:
- **Salisbury City** (wound up 2014) and **Farsley Celtic** (wound up 2010)
  are kept apart from the later clubs of the same towns (Salisbury FC,
  founded 2015; the Farsley Celtic founded in 2010 as Farsley AFC): their
  canonical names are the full old names, leaving "Salisbury"/"Farsley"
  free. **Farnborough Town** (wound up 2007) likewise is not Farnborough FC.
- **Leigh RMI** is named as it was in 2004/05 (engsoccerdata calls it by its
  later name, Leigh Genesis).
- **Hyde United** played 2012/13-2013/14 as Hyde FC; same club.
- **Gravesend** (Gravesend & Northfleet, renamed 2007) is the existing team
  `ebbsfleet`.
- **AFC Telford United** (2011/12) and **Telford United** (2012/13) in
  football-data.co.uk are both AFC Telford United, founded 2004 -- the
  existing team `telford-united` (the old Telford United folded in 2004).
- **Halifax**: 2005/06-2007/08 is Halifax Town (`ERA_OVERRIDES`, as for
  tier 4); 2013/14 is FC Halifax Town (team `halifax`).
- **Chester** 2013/14 is Chester FC (team `chester`). engsoccerdata's
  "Chester" alias stays on Chester City (england.csv); in
  england_nonleague.csv the same spelling is Chester FC. Only 2004/05 is
  imported from engsoccerdata tier 5, so this matters only for
  cross-checks.
- Reused existing teams: Stevenage (Stevenage Borough to 2010), Oxford
  (Oxford United), Aldershot (Aldershot Town), Dag and Red, Hereford United,
  Rushden & Diamonds, Darlington, Scarborough, AFC Wimbledon, Fleetwood,
  Crawley, Kidderminster, Forest Green, Woking, York and the rest already
  aliased from 2014/15 on.

## Differences between the sources

All 4,832 football-data.co.uk results for 2005/06-2013/14 pair with an
engsoccerdata fixture (same teams and season), none left over on either
side: every score agrees and every date is within 3 days. No corrections
were needed. 2004/05 has no second source for the match rows; its final
table agrees with Wikipedia's 2004-05 Football Conference article in every
row (checked below).

## Points deductions

Migration `20260927130200_historic_conference_point_deductions.sql`
(clubs by slug, seasons by start year; fails if a deduction does not
resolve to a club that played that season):

| Season | Club | Points | Reason |
|---|---|---|---|
| 2004/05 | Tamworth | -3 | Breach of league rules |
| 2004/05 | Northwich Victoria | -10 | Administration |
| 2005/06 | Altrincham | -18 | Fielding an ineligible player |
| 2006/07 | Crawley Town | -10 | Administration |
| 2007/08 | Crawley Town | -6 | Breach of financial regulations |
| 2007/08 | Halifax Town | -10 | Administration |
| 2008/09 | Oxford United | -5 | Fielding an ineligible player |
| 2008/09 | Mansfield Town | -4 | Breach of league rules |
| 2008/09 | Crawley Town | -1 | Ineligible player (-4 cut to -1 on appeal, Feb 2009) |
| 2009/10 | Salisbury City | -10 | Administration |
| 2009/10 | Gateshead | -1 | Failing to fulfil a fixture |
| 2009/10 | Grays Athletic | -2 | Fielding ineligible players |
| 2010/11 | Kidderminster Harriers | -5 | Misleading financial information |
| 2010/11 | Histon | -5 | Misleading financial information |
| 2010/11 | Rushden & Diamonds | -5 | Misleading financial information |
| 2010/11 | Kettering Town | -2 | Fielding an ineligible player |
| 2011/12 | Darlington | -10 | Administration |
| 2011/12 | Kettering Town | -3 | Failing to pay football creditors |
| 2013/14 | Alfreton Town | -3 | Fielding an ineligible player |
| 2013/14 | Aldershot Town | -10 | Administration |

Not applied: Chester City 2009/10 (-25, record expunged).

## League tables and checks

With the deductions, `league_standings` gives every season's recorded
final table: champions Barnet, Accrington, Dagenham & Redbridge,
Aldershot, Burton, Stevenage, Crawley, Fleetwood, Mansfield, Luton; the
relegation places (including clubs reprieved or demoted for off-field
reasons) fall on the recorded clubs. 2004/05 and 2009/10 were compared
row by row with the Wikipedia season tables (position, W/D/L, goals,
points): identical. The Conference ranked on goal difference in this
period, which `league_standings` does for tier 5.

After the load: no duplicate fixtures, no club playing twice on a day,
every result letter agrees with its score, every date inside its season,
every club has 42, 44 or 46 games; `check_model_integrity()` has nothing
failed. `team_season_movement` now has real values for EC 2014/15 (it was
the first EC season in the data) and League Two shows two promoted clubs
from the Conference each season from 2005/06.

Performance (timed after the load, in rolled-back transactions):
`backfill_match_odds()` 4 s, `league_standings` (all rows) 0.6 s,
`team_season_movement` 0.15 s, `sync_fixture_status_from_results()` 0.2 s.
`refresh_model_scorecard()` took 31-35 s against 21-27 s in the cron runs
before any history was loaded (tiers 1-5 together); it runs twice a day
under pg_cron with no statement timeout, so this is noted, not changed.

## Rerunning (tier 5)

- `stage` with targets `EC` (football-data.co.uk 2005/06-2013/14 plus
  engsoccerdata tier 5 2004-2013).
- `import-fd` with targets `EC`.
- `import-esd` with `esd_codes` `EC` and `esd_years` `2004`.

---

# European top flights, 2011/12 and 2016/17 to 2024/25

Loaded on 27 September 2026 so Country Insights and the competitiveness
measures can compare more seasons: 46,098 matches, 46,094 from
football-data.co.uk plus four Greek results the files lack (below).

## Coverage

| Leagues | Before | After | Source file |
|---|---|---|---|
| SP1, D1, I1, F1 | 2021/22 on | **2011/12 on** (15 seasons) | `/mmz4281/<label>/<code>.csv` |
| P1, B1, T1, G1, N1, SC0 | 2025/26 on | **2016/17 on** (10 seasons) | `/mmz4281/<label>/<code>.csv` |
| AUT, DNK, POL, ROU, SWZ | 2025/26 on | **2016/17 on** (10 seasons) | all-seasons `/new/<code>.csv` |
| NOR, SWE, FIN | 2025 on | **2016 on** (10 seasons) | all-seasons `/new/<code>.csv` |

Calendar-year leagues keep the existing mapping (footballDataCsv.ts): the
2016 season is stored under the season that starts in 2016 (label 1617).
The existing seasons were already complete (every big-five season
2021/22-2025/26 has 380 or 306 matches; Ligue 1 has 18 clubs from 2023/24).

What the files carry: the per-season files have half-time scores and match
stats (shots, corners, fouls, cards), except **2016/17 Belgium, Greece,
Netherlands, Portugal and Turkey (no stats at all)**; referees only for
Scotland. The all-seasons files have full-time scores and kick-off times
only. Cards are 0 where the file has none (NOT NULL columns); anything
averaging cards must filter to `home_shots is not null`, as
`get_country_league_summary()` now does.

**No odds and no raw-row archive.** No European league has odds for its
current seasons (the daily import archives raw rows for English divisions
only), and odds for 2011-2024 alone would shift the pooled overround trend
on the market page when the league mix changes at 2025/26. The script can
archive raw rows and fill `match_odds` (`--with-odds`) if that is wanted
together with the daily import and a per-league market page.

## Clubs

Every club name resolves through `team_aliases` (`football-data.co.uk`):
161 spellings added and 154 teams created (migration
`20260927140100_european_history_teams_and_aliases.sql`), after checking
every unmapped name against the existing teams of every country. For the ten
main-file leagues the names were also aligned with engsoccerdata's fixtures:
one to one, except that engsoccerdata files Gazelec Ajaccio's 2015/16
season under "AC Ajaccio".

New teams: Austria 5, Belgium 7, Denmark 6, Finland 8, France 11, Germany 6,
Greece 10, Italy 13, Netherlands 7, Norway 6, Poland 10, Portugal 10,
Romania 14, Scotland 4, Spain 5, Sweden 11, Switzerland 3, Turkey 18.

Judgement calls:
- **Renamed clubs map to the existing team**: "Waasland-Beveren" (to 2020/21)
  is SK Beveren; "Erzurum BB" is Erzurumspor FK; "U Craiova" (to February
  2021) is Universitatea Craiova; "Ham-Kam" is HamKam; "Gornik Z." is Gornik
  Zabrze; "Viitorul Constanta" (2016/17-2020/21) is Farul Constanta -- in the
  2021 merger Viitorul's club took the Farul name and kept its Liga I place.
- **Same-looking names, different clubs**: "Ajaccio GFCO" (Gazelec, 2015/16)
  is not AC Ajaccio; "U Craiova 1948" (FC U Craiova 1948, 2021-2024) is not
  Universitatea Craiova; "Gaziantepspor" (dissolved 2020) is not Gaziantep FK;
  "Lausanne Ouchy" is Stade Lausanne-Ouchy, not Lausanne-Sport; "Zaglebie
  Sosnowiec" is not Zaglebie Lubin; "Aves" (CD Aves, dissolved 2020) is not
  AVS. No single spelling means two clubs within the loaded seasons, so no
  era override was needed (`EU_ERA_OVERRIDES` is empty).
- **Belenenses** (2016/17-2020/21) is the SAD that kept the Primeira Liga
  place after the 2018 split (later B-SAD): team `belenenses-sad`.
- **Play-off clubs**: promotion/relegation play-offs against lower-division
  clubs are excluded by footballDataCsv.ts's rule (a club with under a
  quarter of the season's median games): 98 rows, listed on the
  `match_import_runs` rows. Neustadt, Kongsvinger, Moss, Brage, Landskrona,
  Aarau and Schaffhausen appear only there and got no team.

## Results added by hand (`source_name` `verified_web`)

Migration `20260927140300_european_history_missing_results.sql`:
- Super League Greece 2018/19, Panathinaikos 0-3 Olympiacos, 17 March 2019:
  the file has the fixture without a score. It was suspended before kick-off
  and awarded 0-3. Without it the season had 239 matches, so
  `league_standings` flagged it curtailed and ranked it on points per game.
- Super League Greece 2024/25, relegation round matchday 10 (22 May 2025),
  missing from the file: Levadiakos 3-2 Volos, Panetolikos 1-0 Panserraikos,
  Athens Kallithea 3-0 Lamia (ESPN, Soccerway, FIFA match centre; they
  reproduce Wikipedia's final play-out table exactly).

## Match counts and formats

Every league-season was checked: no duplicate fixtures, no club playing
twice on a day, every result letter agrees with its score, every date inside
its season. Counts against the format:

| League | Seasons | Matches | Format |
|---|---|---|---|
| SP1, I1 | 2011/12-2020/21 | 380 | 20 clubs, double round robin |
| D1 | 2011/12-2020/21 | 306 | 18 clubs |
| F1 | 2011/12-2020/21 | 380; **2019/20: 279** | 2019/20 ended in April 2020 (Covid), decided on points per game |
| P1, N1 | 2016/17-2024/25 | 306; **N1 2019/20: 232** | Eredivisie 2019/20 abandoned: no champion, no promotion or relegation; European places from the 8 March table |
| T1 | 2016/17-2024/25 | 306 / 420 / 380 / 342 / 380 / 342 | 18, 21, 20, 19, 20, 19 clubs; 2022/23 includes the matches awarded 3-0 after Hatayspor and Gaziantep withdrew (their records match the official table) |
| G1 | 2016/17-2018/19 | 240 | 16 clubs, regular season only (the Europe play-offs are not in the files) |
| G1 | 2019/20-2023/24; 2024/25 | 240; 236 | 14 clubs: 182 + top-six double round robin (30) + bottom-eight single round robin (28); 2024/25 182 + 12 + 12 + 30 |
| B1 | 2016/17-2018/19; 2020/21-2022/23 | 240; 306 | Regular season only (16 / 18 clubs): the play-offs, with halved points, are not in the files |
| B1 | 2019/20 | 232 | Ended after 29 of 30 rounds (Covid); decided on points, same order as points per game |
| B1 | 2023/24-2024/25 | 312 | 240 + Champions' and Europe play-offs (30 + 30) + relegation play-off (12), halved points |
| SC0 | 2016/17-2024/25 | 228; **2019/20: 179** | 12 clubs, 33 rounds + split (5 rounds); 2019/20 curtailed, decided on points per game |
| AUT | 2016/17-2017/18 | 180 | 10 clubs, four rounds |
| AUT | 2018/19-2023/24; 2024/25 | 195; 192 | 12 clubs, 22 rounds + two groups of six (60), points halved at the split; + 3 Europe play-off games (semi-final, two-leg final) |
| DNK | 2016/17-2019/20 | 251 / 251 / 247 / 243 | 14 clubs: 182 + championship round (30) + qualification groups (24) = 236, + European play-off ties between Superliga clubs |
| DNK | 2020/21-2023/24; 2024/25 | 193; 192 | 12 clubs: 132 + two groups of six (60), + 1 European play-off final |
| POL | 2016/17-2019/20; 2020/21; 2021/22 on | 296; 240; 306 | 16 clubs, 30 rounds + two groups of eight (56), points halved; then no split; 18 clubs from 2021/22 |
| ROU | 2016/17-2018/19; 2019/20 | 268; 260 | 14 clubs: 182 + play-off (30) + play-out (56), points halved; 2019/20 play-out cut short (Covid) |
| ROU | 2020/21-2023/24; 2024/25 | 317 / 316 / 317 / 317; 315 | 16 clubs: 240 + play-off (30) + play-out (45), halved, + 1-2 Conference League play-off games |
| NOR, SWE | 2016-2024 | 240 | 16 clubs |
| SWZ | 2016/17-2022/23; 2023/24 on | 180; 228 | 10 clubs, four rounds; then 12 clubs, 33 rounds + split (30) |
| FIN | 2016-2018; 2019 and 2022-2024; 2020; 2021 | 198; 167; 132; 162 | 12 clubs, 33 rounds; then 22 rounds + two groups of six (30) + 5 Conference League play-off games; 2020 shortened to 22 rounds |

## Champions

With the split-format rules below (27 September 2026), the top of every
computed table matches the historical record except:

| Season | League | Computed #1 | Champion | Why |
|---|---|---|---|---|
| 2021/22 | Belgium | Union SG | Club Brugge | play-offs not in the file (regular-season table) |
| 2022/23 | Belgium | Genk | Antwerp | play-offs not in the file (regular-season table) |
| 2019/20 | Netherlands | Ajax | none | season abandoned |

Before the split-format rules, Belgium 2023/24 (Union SG), Austria 2023/24
(Salzburg) and Finland 2023 (VPS) also had the wrong club top, and Scotland
2019/20 was ranked on points instead of points per game.

## How `league_standings` and Country Insights treat split formats

- `league_standings` follows the official method for the split and play-off
  formats listed in `league_season_formats` (next section). Seasons without a
  row are ranked on total points over every game, as before; the Belgian
  files 2016/17-2022/23 hold only the regular season, so those tables are the
  regular-season tables (rows with format `regular_season_only` record this).
  Official tie-breaks such as head-to-head are modelled only for split
  seasons (e.g. Serie A 2017/18 Inter/Lazio is still decided on goal
  difference).
- `get_country_competitiveness()` does not use `league_standings`: it ranks
  clubs by points per game over all their games and measures the spread and
  top-half v bottom-half results. It needs no format rules and is unaffected
  by halving or locked halves; play-off games add a little weight to
  top-v-top and bottom-v-bottom games only.
- `get_country_league_summary()` averages over every game, awarded results
  included (e.g. Turkey 2022/23's 3-0 awards).
- The League Table page (`getLeagueTable`) reads `league_standings`, so it
  shows the same order, with a note and group lines for split seasons.
- Country Insights offers every season with at least two top flights
  (`comparableSeasons`): 2011/12-2015/16 show England and the big four (the
  season picker says "5 top flights"), 2016/17 on all 19. It also pools the
  last 5, last 10 and all 15 complete seasons (`periodOptions`,
  `poolSeasons`): each country over the seasons in the period it has data
  for, with the coverage listed on the page (England and the big four
  2011/12-2025/26, the rest 2016/17-2025/26). Averages are weighted by
  matches over the seasons that have the measure; the competitiveness
  measures are the mean of the seasons' figures.

## Split formats in `league_standings` (27 September 2026)

Migrations 20260927170000-20260927170600. One `league_season_formats` row per
league-season whose official table is not total points over every game in
the file: 61 `split` rows, 4 `curtailed` rows (Scotland, Belgium, France,
Netherlands 2019/20) and 9 `regular_season_only` rows (Belgium 2016/17-
2022/23 except 2019/20, Greece 2016/17-2018/19). Each row carries notes and
the Wikipedia season article it was checked against.

### Formats found

| League | Seasons | Before the split | Groups (clubs / games each) | Points halved | Ties after points | Play-off ties in the file (left out) |
|---|---|---|---|---|---|---|
| Scotland | 2016/17-2025/26 except 2019/20 | 33 rounds | 6/5, 6/5 | no | goal difference, goals | none |
| Scotland | 2019/20 | curtailed before the split | - | - | points per game | - |
| Switzerland | 2023/24-2025/26 | 33 rounds | 6/5, 6/5 | no | goal difference, goals | none |
| Austria | 2018/19-2025/26 | 22 rounds | 6/10, 6/10 | both groups, rounded down | head-to-head (whole season) | 3 a season to 2023/24 |
| Belgium | 2023/24-2025/26 | 30 rounds | 6/10, 6/10, 4/6 | Champions' and Europe play-offs, rounded up | regular-season position | 1 (2023/24 Genk v Gent) |
| Denmark | 2016/17-2019/20 | 26 rounds | 6/10, then two groups of four (6 games) ranked together as places 7-14 | no | goal difference, goals | 15, 15, 11, 7 (Europe and relegation play-offs between Superliga clubs) |
| Denmark | 2020/21-2025/26 | 22 rounds | 6/10, 6/10 | no | goal difference, goals | 1 a season to 2023/24 |
| Finland | 2019, 2021-2024, 2026 | 22 rounds | 6/5, 6/5 | no | goal difference, goals | 5 in 2019, 2022, 2023, 2024 |
| Finland | 2025 | 22 rounds | 6/10, 6/5 | no | goal difference, goals | none |
| Greece | 2019/20-2023/24 | 26 rounds | 6/10, 8/7 | no | head-to-head | none |
| Greece | 2024/25-2025/26 | 26 rounds | 4/6, 4/6, 6/10 | Europe play-off (places 5-8), rounded up | head-to-head | none |
| Poland | 2016/17 | 30 rounds | 8/7, 8/7 | both, rounded up | regular-season points, then head-to-head in the regular season | none |
| Poland | 2017/18-2019/20 | 30 rounds | 8/7, 8/7 | no | as 2016/17 | none |
| Romania | 2016/17-2019/20 | 26 rounds | 6/10, 8/14 | both, rounded up | regular-season points, then head-to-head | none |
| Romania | 2020/21-2025/26 | 30 rounds | 6/10, 10/9 | both, rounded up | regular-season points, then head-to-head | 2, 1, 2, 2, 0, 2 (Conference League play-off) |

Norway, Sweden, Portugal, the Netherlands, Turkey, the big five and Finland
2016-2018 and 2020 have no split. 100 play-off games are left out in all.

### What the view does

For a `split` row: a pair of clubs' meetings beyond `regular_meetings` (in
date order) are post-split games, so a postponed regular-season game played
after the split still counts as regular season. Each club goes into the
group its regular-season rank gives (`group_sizes`), then into the group most
of its first `group_games` post-split opponents are in, so a tie at the cut
that the view breaks differently from the league cannot misplace it. Groups
are locked (`split_group` 1 above 2 above 3). A club's post-split games
beyond its group's `group_games`, and any post-split game between groups, are
play-off ties and are left out of every column. Halved groups carry half the
regular-season points plus any deduction in force before the first
post-split game, rounded as the league does (`split_adjustment` holds the
points removed); ties are broken on the unrounded total, then the league's
tie-break, then goal difference and goals. W/D/L, goals and home/away splits
cover the regular season plus the group games. Scotland 2019/20 is ranked on
points per game (`curtailed_on_ppg`). Every other league-season gives exactly
the rows it gave before: the md5 of each league-season's rows (all columns
before the change) was taken before and compared after -- all 307
league-seasons without a row, the 9 `regular_season_only` and 3 of the 4
`curtailed` seasons are identical, England included; only Scotland 2019/20
and 56 of the 61 split seasons changed.

### Data added for the split seasons

Migration 20260927170300, found by the comparison with the official tables:
- Deductions: Austria 2019/20 LASK -4 (after the halving, effective
  2 June 2020), Austria 2022/23 Austria Wien -3 (before the halving); Greece
  2019/20 Xanthi -12, Panionios -6; Poland 2016/17 Ruch Chorzow -4 (before the
  halving), 2017/18 Lechia Gdansk -1; Romania 2016/17 CFR Cluj -6, Pandurii
  -6, ACS Poli Timisoara -14, ASA Targu Mures -9, 2019/20 Astra -3, 2022/23
  Hermannstadt -9 (all before the halving), 2021/22 Gaz Metan -22 (before)
  and -50 (after), Academica Clinceni -44 (after).
- Awarded results the files keep as played (score kept, points moved as for
  Nantes/Bastia): Veikkausliiga 2022 AC Oulu 1-0 Inter Turku awarded 0-3 (too
  few home-grown players): Oulu -3, Inter +3; Greece 2023/24 Kifisia 0-0
  Volos awarded 3-0 (ESPN, WhoScored): Kifisia +2, Volos -1.
- Missing results (`verified_web`): Belgium 2023/24 Standard Liege 0-5
  Westerlo, Europe play-offs, 10 May 2024 (not played, awarded); Belgium
  2025/26 Dender 2-1 La Louviere, relegation play-offs, 3 May 2026 (Sporza,
  FIFA match centre); Romania 2019/20 Sepsi 4-0 Academica Clinceni,
  10 December 2019 (ESPN) -- without it the pair's first play-out meeting was
  read as a regular-season game.

### Verification

Each of the 61 split seasons was compared with the final table in its
Wikipedia season article (points and club at every position; 814 rows):
every champion, European place and relegation place matches, and every
points total matches except one. Remaining differences:

| Season | League | Computed | Official | Why |
|---|---|---|---|---|
| 2021/22 | Austria | 9 Ried, 10 Altach (22 points, both rounded down) | 9 Altach, 10 Ried | head-to-head over the whole season favours Ried; the league's order is not reproduced by any single rule tried (whole season, post-split games only) |
| 2017/18 | Romania | 10 Concordia Chiajna, 11 Gaz Metan (30) | 10 Gaz Metan, 11 Chiajna | regular-season points favour Chiajna (28 v 16); 2017/18 evidently used head-to-head first |
| 2021/22 | Romania | Academica Clinceni -37 | -43 | the article's footnote gives a 44-point deduction, which with Clinceni's 7 starting points gives -37; position (15th) is the same |
| 2017/18 | Denmark | 9 Sonderjyske, 10 Aarhus (41) | no official order | places 7-14 are two parallel groups of four; the view ranks them together on points, which the league does not |

Denmark 2016/17-2019/20: the official table leaves places 7-14 to the
play-offs, so the view's order there (the two qualification groups together
on points) is not an official one. Greece 2023/24: Wikipedia's table shows
Olympiacos -1, which CAS later restored; not loaded, and the table matches
Wikipedia's anyway.

### Performance

The whole view: 0.74 s before, 0.77-0.79 s after (best of three, in SQL).
The split logic joins on single composite keys, because the planner has no
statistics for CTEs and otherwise chose nested loops (a first version took
5.5 s); `agg` now aggregates the home and away sides separately and joins
them, which pays for the split logic. Readers (found through pg_depend and a
grep of the repo): team history panels (select by team_id, 0.79 s),
`ai_tool_get_league_table` (0.71 s; now also returns split_group and
split_adjustment and says so in its note) and `check_model_integrity`
(0.31 s). `get_country_competitiveness` and `get_country_league_summary` do
not read the view.

### Maintenance

Every new season of a split-format league needs its own row before its split
(formats change: the Austrian Bundesliga stops halving points from 2026/27,
Belgium has 18 clubs in 2026/27). `check_model_integrity` warns
(`split_formats_configured`) once a season of a league with an earlier split
row is past its split without one. Finland 2026 (in progress, split under
way) has its row.

## Points deductions

Researched season by season from each season's Wikipedia article (table
footnotes, checked against the table's W/D/L arithmetic) for every season
whose computed table follows the official method. Loaded (migration
`20260927140200_european_point_deductions.sql`, 25 rows):

| Season | League | Adjustment | Moves |
|---|---|---|---|
| 2011/12 | Serie A | Atalanta -6 | 9th -> 12th |
| 2012/13 | Serie A | Siena -6, Atalanta -2, Sampdoria -1, Torino -1 | Siena 18th -> 19th |
| 2014/15 | Serie A | Parma -7 | 19th -> 20th |
| 2018/19 | Serie A | Chievo -3 | no |
| 2022/23 | Serie A | Juventus -10 | 4th -> 7th |
| 2012/13 | Ligue 1 | AC Ajaccio -2 | 15th -> 17th |
| 2013/14 | Ligue 1 | Nantes -3, Bastia +3 | Nantes 2-0 Bastia was awarded to Bastia (ineligible player); the score stays as played; Bastia 10th, Nantes 13th as officially |
| 2022/23 | Super Lig | Kayserispor -3 | no |
| 2023/24 | Super Lig | Kayserispor -3, Istanbulspor -3 | Kayserispor 11th -> 14th |
| 2024/25 | Super Lig | Adana Demirspor -12 | no |
| 2023/24 | Eredivisie | Vitesse -18 | 17th -> 18th |
| 2016/17 | Greece | PAOK -3 | no |
| 2017/18 | Greece | Panathinaikos -8, PAOK -3, Olympiacos -3 | Panathinaikos 8th -> 11th |
| 2018/19 | Greece | Panathinaikos -11, AEK -3, PAOK -2 | Panathinaikos 6th -> 8th; the table now equals the official one |
| 2016/17 | Belgium (regular season) | Standard -3 (abandoned match: no points to either side, score stood) | no |
| 2020/21 | Ekstraklasa | Cracovia -5 | 11th -> 14th |

Not loaded:
- Lazio 2017/18 -1 and 2018/19 -2: in Wikipedia's current tables, not in
  Sporting Life's; neither moves Lazio.
- Split-format seasons: loaded later with the split-format rules (section
  "Split formats in `league_standings`"), except Greece 2019/20 PAOK -7
  (quashed) and Greece 2023/24 Olympiacos -1 (restored by CAS).
- Awarded results already in the files as scored, e.g. IFK Goteborg 0-3
  Malmo (Allsvenskan 2016), Bastia 0-3 Lyon (Ligue 1 2016/17), Lausanne-Sport
  0-3 Thun (Swiss 2017/18), OH Leuven 5-0 Mechelen and Union 5-0 Beerschot
  (Belgium 2021/22).

## Checks against a second source

- **engsoccerdata** covers the ten main-file leagues, but for these seasons
  its rows are derived from football-data.co.uk (same row order, same blank
  Panathinaikos-Olympiacos row), so it only catches transcription drift. All
  29,531 rows pair up by fixture; one score differs (Nantes-Bastia 2013/14,
  0-0 there), which led to the Nantes/Bastia adjustment above.
- **Web spot checks** of randomly drawn loaded results (ESPN, FIFA match
  centre, WhoScored, club site): AC Oulu 1-1 Haka (2023), Standard 0-1 OH
  Leuven (2025), Zaglebie Lubin 3-1 Wisla Plock (2022), Falkenbergs 1-1 AIK
  (2020), Djurgarden 3-1 Ostersund (2019) -- all agree.
- **Official tables**: Greece 2018/19 and the 2024/25 play-outs, Turkey
  2022/23 (Hatayspor, Gaziantep) and the Belgian 2016/17 regular season
  reproduce Wikipedia's tables once the adjustments above are applied.

## Effect on the model, performance and current numbers

- No European league has a model fit (`league_fit_status` shows none), so no
  fit, prediction or rating is affected. Checked before and after (md5 of
  every row): `match_predictions` (6,253 rows), `model_fit_runs`,
  `team_ratings`, `model_scorecard_matches`, `get_model_scorecard()`,
  `fixtures`, and `team_season_movement` (which does not cover leagues
  13-30) -- all identical.
- `league_standings` for 2025/26 on is unchanged (no rows in those seasons
  were touched). Serie A 2022/23 changed by design (Juventus -10).
- Timed before -> after (in SQL): `refresh_model_scorecard()` 36s -> 31s
  (pg_cron, no API limit), `backfill_match_odds()` 2.9s -> 2.4s (no rows
  archived), `sync_fixture_status_from_results()` 0.2s,
  `get_country_league_summary()` 0.1s -> 0.3s,
  `get_country_competitiveness()` 0.1s -> 0.3s, the whole `league_standings`
  view 0.6s -> 0.9s. Every other anon function that reads `matches` runs in
  under 1s, except `get_countries_by_relevance()`, which went to 13.6s and was
  rewritten (0.1s; migration 20260927140400, see docs/incidents.md).
- `get_country_league_summary()` now averages cards only over matches with
  stats (migration 20260927140600): 2016/17 Belgium, Greece, Netherlands,
  Portugal and Turkey show no card figures instead of 0, and seasons with
  single stat-less rows moved slightly (Turkey 2022/23 4.11 -> 4.50 yellows
  a game).

## Rerunning

Script `scripts/history_backfill_europe.py` (reuses `history_backfill.py`'s
helpers), workflow **History backfill (European top flights)**
(`.github/workflows/history-backfill-europe.yml`, manual):
- `stage-eu` with targets `all` or e.g. `SP1:2011-2020,AUT:2016-2024`
  reloads `historic_source_rows_europe` (and engsoccerdata tier 1 unless
  `--no-esd`).
- `import-eu` with the same targets upserts on the natural key, writes one
  `match_import_runs` row per league-season (`error_message` starts
  `history <label>`) and refuses 2025/26 on. `--with-odds` archives raw rows
  and runs `backfill_match_odds()` (off for this load).

The load itself ran through `history-backfill.yml` on a throwaway branch
(`european-league-history-runner`), because GitHub dispatches only workflows
that exist on the default branch. The scratch table
`historic_source_rows_europe` can be dropped once this load is signed off.
