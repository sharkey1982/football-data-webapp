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
  (migration `20260927120200_history_match_odds.sql`).
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
This moved 68 positions, including three that matter: Wigan, not Fulham, won
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
