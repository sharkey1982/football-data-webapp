-- ============================================================================
-- Carabao Cup round 4: remove duplicate fixtures and guard against more.
--
-- Cause: ingest-cup-data upserted cup fixtures on the table's natural key,
-- which includes kickoff_date. Whenever footballwebpages.co.uk showed a tie
-- on a different date, a second row was inserted and the old one stayed
-- (nothing ever deletes cup fixtures). On 18 Sep the round-of-16 page listed
-- seven ties twice (27 Oct with no time, 28 Oct 7.45pm): fixtures 3235-3241
-- and 3242-3248 were created in the same 05:15 run, 0.4 s apart. On 19 Sep
-- Everton v Newcastle moved to 29 Oct and got a third row (3318). The source
-- has since split the round across two pages ("fourth-round" and
-- "round-of-16"), and the dropdown-position round number gave the same round
-- matchweek 4 on one page and 5 on the other.
--
-- True fixture per tie, from the source on 2026-09-26 (fixture_changes had
-- no rows for any of these; nothing references any of them -- every table
-- with a fixture_id / canonical_fixture_id column was checked, and none of
-- the rows carries a prediction):
--   Bradford v Peterborough  27 Oct 19:45  keep 3236, delete 3243 (28 Oct 19:45)
--   Fleetwood v Arsenal      27 Oct 20:00  keep 3238, delete 3245 (28 Oct 19:45)
--   Everton v Newcastle      29 Oct 19:45  keep 3318, delete 3237 (27 Oct, no time)
--                                                     and 3244 (28 Oct 19:45)
--   Man City v Brighton      28 Oct 19:30  3823, no duplicate
-- Four ties are no longer listed on the source at all (neither round page
-- nor the clubs' own fixture pages), so their date is unconfirmed. One row
-- is kept for each (the first listing, 27 Oct, no time); the next ingest
-- that lists them updates that row's date:
--   Bournemouth v Aston Villa    keep 3235, delete 3242 (28 Oct 19:45)
--   Fulham v Crystal Palace      keep 3239, delete 3246 (28 Oct 19:45)
--   Liverpool v Chelsea          keep 3240, delete 3247 (28 Oct 19:45)
--   Sunderland v Brentford       keep 3241, delete 3248 (28 Oct 19:45)
-- Deleted fixture_ids: 3237, 3242, 3243, 3244, 3245, 3246, 3247, 3248.
--
-- Also: round 4 is matchweek 4 on every row (3318 and 3823 carried 5), and a
-- unique index on (league, season, home, away, matchweek) for the two cup
-- competitions. Checked first: after this cleanup there is no such duplicate
-- in LC or FAC. A replay or second leg reverses home and away (and FA Cup
-- replays carry their own round number), so neither is blocked. The
-- index is not applied to UEFA competitions: a league-phase pairing can meet
-- again, same way round, in the knockouts.
-- ============================================================================

create temp table _cup_dupes (dup_id bigint primary key, keep_id bigint not null) on commit drop;
insert into _cup_dupes values
  (3243, 3236), (3245, 3238), (3237, 3318), (3244, 3318),
  (3242, 3235), (3246, 3239), (3247, 3240), (3248, 3241);

-- Only act on a pair that is still what this migration expects: same
-- competition, season and teams. Anything else stops the migration.
do $$ declare n int; begin
  select count(*) into n from _cup_dupes d
  join public.fixtures a on a.fixture_id = d.dup_id
  join public.fixtures b on b.fixture_id = d.keep_id
  where (a.league_id, a.season_id, a.home_team_id, a.away_team_id)
     is distinct from (b.league_id, b.season_id, b.home_team_id, b.away_team_id)
     or a.league_id <> (select league_id from public.leagues where code = 'LC');
  if n > 0 then raise exception '% duplicate/kept pair(s) do not match', n; end if;
end $$;

-- Re-point every reference to the kept row (none existed when this was
-- written; kept so a re-run or late reference is still safe).
do $$ declare r record; begin
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t using (table_schema, table_name)
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
      and c.column_name in ('fixture_id', 'canonical_fixture_id') and c.table_name <> 'fixtures'
  loop
    execute format('update public.%I x set %I = d.keep_id from _cup_dupes d where x.%I = d.dup_id',
                   r.table_name, r.column_name, r.column_name);
  end loop;
end $$;

delete from public.fixtures f using _cup_dupes d
where f.fixture_id = d.dup_id and exists (select 1 from public.fixtures k where k.fixture_id = d.keep_id);

update public.fixtures set matchweek = 4, updated_at = now()
where fixture_id in (3318, 3823) and matchweek = 5;

-- Guard. Built from the league codes so no id is hard-coded.
do $$ declare v_ids text; n int; begin
  select string_agg(league_id::text, ',' order by league_id) into v_ids from public.leagues where code in ('LC', 'FAC');
  select count(*) into n from (
    select 1 from public.fixtures f join public.leagues l using (league_id) where l.code in ('LC', 'FAC')
    group by f.league_id, f.season_id, f.home_team_id, f.away_team_id, f.matchweek having count(*) > 1) d;
  if n > 0 then raise exception '% duplicate cup tie(s) remain', n; end if;
  execute 'drop index if exists public.fixtures_cup_tie_unique';
  execute format('create unique index fixtures_cup_tie_unique on public.fixtures '
                 '(league_id, season_id, home_team_id, away_team_id, matchweek) where league_id in (%s)', v_ids);
end $$;

comment on index public.fixtures_cup_tie_unique is
  'One fixture per cup tie (LC, FAC): league, season, home, away, round. Added 2026-09-26 after date changes created duplicate Carabao Cup round-4 rows.';
