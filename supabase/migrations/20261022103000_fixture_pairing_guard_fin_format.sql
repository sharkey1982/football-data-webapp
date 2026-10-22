-- DQ-05 + DQ-06 (audit 22 Oct 2026).
--
-- DQ-05: Ligue 1 held Rennes v PSG twice (5303, 23 Aug, played; 5302,
-- 6 Mar 2027) and PSG v Rennes never. FixtureDownload's own Ligue 1 feed lists
-- "Stade Rennais FC v Paris Saint-Germain" for both round 1 and round 23, so
-- refresh_feed_nearest_date() inserted the second one. Fix: 5302 becomes PSG v
-- Rennes (slug too: the old one named the wrong home side, and nothing else
-- holds this pairing); the feed matcher no longer inserts a pairing a
-- double-round-robin league already has (SC0, whose 33-game format repeats
-- pairings, keeps its 60-day window); a partial unique index makes a repeat
-- impossible in the double-round-robin leagues; integrity check
-- league_pairing_repeated covers every league (by code) except SC0.
-- Note: 5302 gets no date updates from FixtureDownload while its feed has the
-- teams the wrong way round (the feed row matches no fixture and is skipped).
--
-- DQ-06: Veikkausliiga 2026 (FIN, season 13) had group_games [5,5]; the top
-- six have already played 6 group games (2026, as in 2025: the championship
-- group is a double round robin, 10 games; the challenger group single, 5),
-- so league_standings dropped each one's latest game (HJK, KuPS 3 points
-- short). Now [10,5], as season 12 (2025) already has. Integrity check standings_played_matches covers every
-- current-season table.
-- Safe to re-run.

-- ---------------------------------------------------------------- DQ-05 data
update public.fixtures f
   set home_team_id = 166, away_team_id = 204,
       slug = 'paris-saint-germain-v-rennes-' || f.kickoff_date::text,
       -- the stored prediction and market goals were for the wrong home side
       predicted_home_goals = null, predicted_away_goals = null,
       raw_predicted_home_goals = null, raw_predicted_away_goals = null,
       market_home_goals = null, market_away_goals = null, market_rated_at = null,
       updated_at = now()
 where f.fixture_id = 5302 and f.home_team_id = 204 and f.away_team_id = 166;
-- Re-predict it the right way round (the daily feed run does this too).
select public.backfill_fixture_predictions();

-- ---------------------------------------------------------------- DQ-05 matcher
do $mig$
declare
  d text := pg_get_functiondef('public.refresh_feed_nearest_date(text,text)'::regprocedure);
  a text := $a$  from _feed s
  where not exists (
    select 1 from public.fixtures f where f.league_id = v_league and f.season_id = v_season
      and f.home_team_id = s.home_id and f.away_team_id = s.away_id
      and abs(f.kickoff_date - s.ko_date) <= 60)
  on conflict$a$;
  b text := $b$  from _feed s
  where not exists (
    select 1 from public.fixtures f where f.league_id = v_league and f.season_id = v_season
      and f.home_team_id = s.home_id and f.away_team_id = s.away_id
      -- DQ-05 (2026-10-22): a double round robin holds each pairing once, so
      -- a second listing (a feed error) is never inserted; SC0's format
      -- repeats pairings, so it keeps the 60-day window.
      and (p_code <> 'SC0' or abs(f.kickoff_date - s.ko_date) <= 60))
    and (p_code = 'SC0' or not exists (
      select 1 from _feed s2 where s2.home_id = s.home_id and s2.away_id = s.away_id and s2.ko < s.ko))
  on conflict$b$;
begin
  if position('DQ-05 (2026-10-22)' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'refresh_feed_nearest_date anchor not found exactly once'; end if;
  execute replace(d, a, b);
end;
$mig$;

-- ---------------------------------------------------------------- DQ-05 guard
-- League ids: E0 1, E1 2, E2 3, E3 4, SP1 13, D1 14, I1 15, F1 16: the leagues
-- whose fixtures only refresh_feed_nearest_date inserts (it now skips a repeat
-- pairing, so the index can never fail a feed run). EC (5) is left out: the
-- National League scraper inserts without ON CONFLICT and a single-leg
-- play-off can repeat a league pairing; the integrity check still covers it.
create unique index if not exists fixtures_league_pairing_unique
  on public.fixtures (league_id, season_id, home_team_id, away_team_id)
  where league_id in (1, 2, 3, 4, 13, 14, 15, 16);
comment on index public.fixtures_league_pairing_unique is
  'Double-round-robin leagues hold each home/away pairing once per season (DQ-05, 22 Oct 2026). SC0 is excluded: its 33-game format repeats pairings.';

-- ---------------------------------------------------------------- DQ-06 data
update public.league_season_formats
   set group_games = array[10, 5]::smallint[],
       notes = '22 rounds + championship group (double round robin, 10 games) and challenger group (single round robin, 5 games), full points, as in 2025 (season in progress; set knockout_ties if the file gains play-off ties). group_games corrected from [5,5] on 22 Oct 2026 (audit DQ-06): the top six had played 6 group games.'
 where league_id = 30 and season_id = 13 and group_games is distinct from array[10, 5]::smallint[];

select public.refresh_league_standings_cache(true);

-- ---------------------------------------------------------------- integrity checks
do $mig$
declare
  d text := pg_get_functiondef('public.check_model_integrity()'::regprocedure);
  a text := $a$  -- Catalogue (2026-09-26): every live, non-scratch object has a description,$a$;
  b text := $b$  -- DQ-05 (2026-10-22): a league other than SC0 holds each home/away pairing once.
  select 'league_pairing_repeated', case when n = 0 then 'ok' else 'failed' end, n,
    'League fixtures whose home/away pairing appears more than once in the season (SC0 and split formats excepted): ' || coalesce(ids, 'none')
  from (select count(*) n, string_agg(code || ' ' || ids, '; ') ids
        from (select l.code, string_agg(f.fixture_id::text, ',' order by f.fixture_id) ids
              from public.fixtures f join public.leagues l on l.league_id = f.league_id
              where l.competition_type = 'league' and l.code <> 'SC0'
                -- split formats (groups after the regular rounds) repeat pairings by design
                and not exists (select 1 from public.league_season_formats lsf
                                where lsf.league_id = f.league_id and lsf.season_id = f.season_id and lsf.group_sizes is not null)
              group by l.code, f.season_id, f.home_team_id, f.away_team_id having count(*) > 1) p) x
  union all
  -- DQ-06 (2026-10-22): a current-season table counts every league match played.
  select 'standings_played_matches', case when n = 0 then 'ok' else 'warning' end, n,
    'Current-season team rows whose league_standings played count is below their matches (check league_season_formats): ' || coalesce(ids, 'none')
  from (select count(*) n, string_agg(l.code || ' ' || t.canonical_name || ' ' || c.played || '/' || m.n, ', ' order by l.code, t.canonical_name) ids
        from (select mm.league_id, mm.season_id, x.team_id, count(*) n
                from public.matches mm
                cross join lateral (values (mm.home_team_id), (mm.away_team_id)) x(team_id)
               where mm.season_id = public.current_season_id() and mm.full_time_home_goals is not null
               group by 1, 2, 3) m
        join public.league_standings_cache c on c.league_id = m.league_id and c.season_id = m.season_id and c.team_id = m.team_id
        join public.leagues l on l.league_id = m.league_id
        join public.teams t on t.team_id = m.team_id
        where c.played < m.n) x
  union all
  -- Catalogue (2026-09-26): every live, non-scratch object has a description,$b$;
begin
  if position('league_pairing_repeated' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'check_model_integrity anchor not found exactly once'; end if;
  execute replace(d, a, b);
end;
$mig$;
