-- ============================================================================
-- Season order by start_year, not season_id
--
-- Historic seasons (1992/93 to 2013/14) are about to be inserted with
-- season_id 14 and up, so season_id stops being chronological: 14 will be
-- 1992/93, older than 1 (2014/15). Everything that treated a higher
-- season_id as "later" -- max(season_id) as the current season,
-- season_id < x as "earlier", season_id - 1 as "the season before",
-- ORDER BY season_id -- would jump to 1992/93 or skip seasons once those
-- rows have data. Season labels have the same problem as text: '9293'
-- sorts after '2627'.
--
-- This migration:
--   1. makes seasons.start_year unique, so it is a strict order;
--   2. adds small helpers: season_start_year(), previous_season_id(),
--      earlier_season() / later_season() (null-ignoring, like least/greatest);
--   3. rewrites each id-ordered function by anchored replacement on its
--      live definition (each anchor asserted to match exactly once);
--   4. recreates league_standings / team_season_movement (create or
--      replace) and model_scorecard_matches (drop + create; grants and the
--      unique index restored), then refreshes the matview.
--
-- Behaviour today is unchanged: with ids 1..13 in year order every rewrite
-- returns exactly what the old one did (checked before/after with a
-- fingerprint of every output in a rolled-back transaction). league_standings
-- gains one trailing column, season_start_year, for ordering on the client.
-- ============================================================================

-- 1. start_year is the order key: make it unambiguous. (Checked first: 13
--    rows, 13 distinct start_years.)
alter table public.seasons add constraint seasons_start_year_key unique (start_year);

-- 2. Helpers --------------------------------------------------------------
create or replace function public.season_start_year(p_season_id bigint)
returns integer language sql stable
set search_path to 'public', 'pg_temp'
as $$
  -- The chronological sort key for a season. season_id is NOT in date
  -- order (historic seasons were added after 2026/27); sort by this.
  select start_year from public.seasons where season_id = p_season_id
$$;
comment on function public.season_start_year(bigint) is
  'Chronological sort key for a season (seasons.start_year). season_id is not in date order: order and compare seasons by this, never by id.';

create or replace function public.previous_season_id(p_season_id bigint)
returns bigint language sql stable
set search_path to 'public', 'pg_temp'
as $$
  -- The season immediately before p_season_id by start_year (null if none).
  select s.season_id from public.seasons s
   where s.start_year < (select start_year from public.seasons where season_id = p_season_id)
   order by s.start_year desc
   limit 1
$$;
comment on function public.previous_season_id(bigint) is
  'The season immediately before the given one by start_year, or null. Replaces max(season_id) where season_id < x, which breaks once season_id is not chronological.';

create or replace function public.earlier_season(a bigint, b bigint)
returns bigint language sql stable
set search_path to 'public', 'pg_temp'
as $$
  -- least(a, b) by start_year: nulls ignored, as least() does.
  select case when a is null then b
              when b is null then a
              when public.season_start_year(a) <= public.season_start_year(b) then a
              else b end
$$;
comment on function public.earlier_season(bigint, bigint) is
  'The earlier of two seasons by start_year, ignoring nulls (least() by date, not id). Used to widen player_identity.first_seen_season_id.';

create or replace function public.later_season(a bigint, b bigint)
returns bigint language sql stable
set search_path to 'public', 'pg_temp'
as $$
  -- greatest(a, b) by start_year: nulls ignored, as greatest() does.
  select case when a is null then b
              when b is null then a
              when public.season_start_year(a) >= public.season_start_year(b) then a
              else b end
$$;
comment on function public.later_season(bigint, bigint) is
  'The later of two seasons by start_year, ignoring nulls (greatest() by date, not id). Used to widen player_identity.last_seen_season_id.';

-- 3. Functions: anchored replacement on the live definition -----------------
do $mig$
declare
  f regprocedure;
  src text;
  r record;
  n int;
begin
  for f in
    select distinct fn from (values
      ('public.ai_current_season(bigint)'::regprocedure),
      ('public.ai_resolve_season(bigint,text)'),
      ('public.ai_tool_get_fpl_players(jsonb)'),
      ('public.ai_tool_get_data_status(jsonb)'),
      ('public.check_model_integrity()'),
      ('public.fpl_current_season_id()'),
      ('public.get_player_by_slug(text)'),
      ('public.search_players(text,integer)'),
      ('public.get_player_career(bigint)'),
      ('public.get_player_seasons(bigint)'),
      ('public.sync_player_identity()'),
      ('public.import_fpl_season(bigint,text)'),
      ('public.get_country_league_summary()'),
      ('public.get_cross_league_summary()'),
      ('public.get_overround_trend(text)'),
      ('public.get_country_competitiveness()')
    ) v(fn)
  loop
    src := pg_get_functiondef(f);
    for r in
      select anchor, repl from (values
        -- Latest season with fixtures or results for a league.
        ('public.ai_current_season(bigint)'::regprocedure, 1,
         $a$select max(season_id) from ($a$,
         $b$select se.season_id from seasons se where se.season_id in ($b$),
        ('public.ai_current_season(bigint)', 2,
         $a$where league_id = p_league_id) s$a$,
         $b$where league_id = p_league_id)
   order by se.start_year desc limit 1$b$),
        -- 'last season' = the one before the current season.
        ('public.ai_resolve_season(bigint,text)', 1,
         $a$(select max(season_id) from seasons where season_id < public.ai_current_season(p_league_id))$a$,
         $b$public.previous_season_id(public.ai_current_season(p_league_id))$b$),
        ('public.ai_tool_get_fpl_players(jsonb)', 1,
         $a$(select max(season_id) from seasons where season_id < cur)$a$,
         $b$public.previous_season_id(cur)$b$),
        -- Coverage: first / latest season with results, by year.
        ('public.ai_tool_get_data_status(jsonb)', 1,
         $a$public.ai_season_label(min(m.season_id)) first_season, public.ai_season_label(max(m.season_id)) latest_season$a$,
         $b$public.ai_season_label((select s1.season_id from seasons s1 where s1.start_year = min(sn.start_year))) first_season, public.ai_season_label((select s1.season_id from seasons s1 where s1.start_year = max(sn.start_year))) latest_season$b$),
        ('public.ai_tool_get_data_status(jsonb)', 2,
         $a$from matches m join leagues l using (league_id)$a$,
         $b$from matches m join seasons sn on sn.season_id = m.season_id join leagues l using (league_id)$b$),
        -- Current season = latest season with English results.
        ('public.check_model_integrity()', 1,
         $a$with cur as (select max(season_id) s from public.matches where league_id between 1 and 5)$a$,
         $b$with cur as (select se.season_id s from public.seasons se
                where se.start_year = (select max(sm.start_year) from public.seasons sm
                                        where sm.season_id in (select m.season_id from public.matches m where m.league_id between 1 and 5)))$b$),
        ('public.fpl_current_season_id()', 1,
         $a$select max(season_id) from public.fpl_gameweeks;$a$,
         $b$-- Latest by start_year: season_id is not in date order.
  select s.season_id from public.seasons s
   where s.start_year = (select max(sg.start_year) from public.seasons sg
                          where sg.season_id in (select g.season_id from public.fpl_gameweeks g));$b$),
        -- "latest" name / team / position = the most recent season's.
        ('public.get_player_by_slug(text)', 1,
         $a$(array_agg(t.web_name order by t.season_id desc))[1]$a$,
         $b$(array_agg(t.web_name order by public.season_start_year(t.season_id) desc))[1]$b$),
        ('public.get_player_by_slug(text)', 2,
         $a$(array_agg(t.team_name order by t.season_id desc))[1]$a$,
         $b$(array_agg(t.team_name order by public.season_start_year(t.season_id) desc))[1]$b$),
        ('public.get_player_by_slug(text)', 3,
         $a$(array_agg(t.element_type order by t.season_id desc))[1]$a$,
         $b$(array_agg(t.element_type order by public.season_start_year(t.season_id) desc))[1]$b$),
        ('public.search_players(text,integer)', 1,
         $a$(array_agg(t.web_name order by t.season_id desc))[1]$a$,
         $b$(array_agg(t.web_name order by public.season_start_year(t.season_id) desc))[1]$b$),
        ('public.search_players(text,integer)', 2,
         $a$(array_agg(t.team_name order by t.season_id desc))[1]$a$,
         $b$(array_agg(t.team_name order by public.season_start_year(t.season_id) desc))[1]$b$),
        ('public.search_players(text,integer)', 3,
         $a$(array_agg(t.element_type order by t.season_id desc))[1]$a$,
         $b$(array_agg(t.element_type order by public.season_start_year(t.season_id) desc))[1]$b$),
        -- Newest season first.
        ('public.get_player_career(bigint)', 1,
         $a$order by t.season_id desc;$a$,
         $b$order by s.start_year desc;$b$),
        ('public.get_player_seasons(bigint)', 1,
         $a$select distinct on (x.season_id) x.season_id$a$,
         $b$select distinct on (s.start_year) x.season_id$b$),
        ('public.get_player_seasons(bigint)', 2,
         $a$order by x.season_id desc;$a$,
         $b$order by s.start_year desc;$b$),
        -- Widen the seen-range by date, not id.
        ('public.sync_player_identity()', 1,
         $a$least(public.player_identity.first_seen_season_id$a$,
         $b$public.earlier_season(public.player_identity.first_seen_season_id$b$),
        ('public.sync_player_identity()', 2,
         $a$greatest(public.player_identity.last_seen_season_id$a$,
         $b$public.later_season(public.player_identity.last_seen_season_id$b$),
        ('public.import_fpl_season(bigint,text)', 1,
         $a$least(public.player_identity.first_seen_season_id$a$,
         $b$public.earlier_season(public.player_identity.first_seen_season_id$b$),
        ('public.import_fpl_season(bigint,text)', 2,
         $a$greatest(public.player_identity.last_seen_season_id$a$,
         $b$public.later_season(public.player_identity.last_seen_season_id$b$),
        -- Labels sort as text ('9293' after '2627'): order by year instead.
        ('public.get_country_league_summary()', 1,
         $a$order by c.name, s.label;$a$,
         $b$order by c.name, min(s.start_year);$b$),
        ('public.get_cross_league_summary()', 1,
         $a$order by l.code, s.label;$a$,
         $b$order by l.code, min(s.start_year);$b$),
        ('public.get_overround_trend(text)', 1,
         $a$order by s.label, l.code;$a$,
         $b$order by min(s.start_year), l.code;$b$),
        ('public.get_country_competitiveness()', 1,
         $a$order by h.code, h.label;$a$,
         $b$order by h.code, (select se.start_year from public.seasons se where se.label = h.label);$b$)
      ) v(fn, ord, anchor, repl)
      where v.fn = f
      order by v.ord
    loop
      n := (length(src) - length(replace(src, r.anchor, ''))) / length(r.anchor);
      if n <> 1 then
        raise exception 'Anchor for % matched % times (expected 1): %', f, n, r.anchor;
      end if;
      src := replace(src, r.anchor, r.repl);
    end loop;
    execute src;
  end loop;
end
$mig$;

-- 4. Views -----------------------------------------------------------------
do $mig$
declare
  src text;
  r record;
  n int;
  v regclass;
begin
  foreach v in array array['public.league_standings'::regclass, 'public.team_season_movement'::regclass] loop
    src := pg_get_viewdef(v, true);
    for r in
      select anchor, repl from (values
        -- is_current: latest season with domestic league results, by year.
        ('public.league_standings'::regclass, 1,
         $a$SELECT max(matches.season_id) AS season_id$a$,
         $b$SELECT se_cur.season_id FROM seasons se_cur WHERE se_cur.start_year = (SELECT max(se_m.start_year) FROM seasons se_m WHERE se_m.season_id IN (SELECT matches.season_id$b$),
        ('public.league_standings'::regclass, 2,
         $a$), res AS ($a$,
         $b$)) ), res AS ($b$),
        -- Chronological sort key for clients (appended; columns before it unchanged).
        ('public.league_standings'::regclass, 3,
         $a$FROM ranked r$a$,
         $b$, se.start_year AS season_start_year
   FROM ranked r$b$),
        -- First season on record = earliest by year.
        ('public.team_season_movement'::regclass, 1,
         $a$SELECT min(ts.season_id) AS season_id$a$,
         $b$SELECT se_first.season_id FROM seasons se_first WHERE se_first.start_year = (SELECT min(se_m.start_year) FROM seasons se_m WHERE se_m.season_id IN (SELECT ts.season_id$b$),
        ('public.team_season_movement'::regclass, 2,
         E'FROM ts\n',
         E'FROM ts))\n'),
        -- Previous season = start_year - 1, not season_id - 1.
        ('public.team_season_movement'::regclass, 3,
         $a$LEFT JOIN ts p ON p.team_id = t.team_id AND p.season_id = (t.season_id - 1)$a$,
         $b$LEFT JOIN seasons se_t ON se_t.season_id = t.season_id
     LEFT JOIN seasons se_prev ON se_prev.start_year = (se_t.start_year - 1)
     LEFT JOIN ts p ON p.team_id = t.team_id AND p.season_id = se_prev.season_id$b$)
      ) x(obj, ord, anchor, repl)
      where x.obj = v
      order by x.ord
    loop
      n := (length(src) - length(replace(src, r.anchor, ''))) / length(r.anchor);
      if n <> 1 then
        raise exception 'Anchor for % matched % times (expected 1): %', v, n, r.anchor;
      end if;
      src := replace(src, r.anchor, r.repl);
    end loop;
    execute format('create or replace view %s as %s', v, src);
  end loop;
end
$mig$;

-- CREATE OR REPLACE VIEW keeps privileges, but restate the public read so a
-- future drop-and-create cannot lose it silently.
grant select on public.league_standings, public.team_season_movement to anon, authenticated, service_role;

-- 5. Materialized view: no CREATE OR REPLACE, so drop and recreate. Nothing
--    depends on it; its grants, unique index (needed for REFRESH
--    CONCURRENTLY by refresh_model_scorecard) are restored below.
do $mig$
declare
  src text;
  r record;
  n int;
begin
  src := pg_get_viewdef('public.model_scorecard_matches'::regclass, true);
  for r in
    select anchor, repl from (values
      (1, $a$SELECT max(matches.season_id) AS s$a$,
          $b$SELECT se_cur.season_id AS s, se_cur.start_year AS y FROM seasons se_cur WHERE se_cur.start_year = (SELECT max(se_m.start_year) FROM seasons se_m WHERE se_m.season_id IN (SELECT matches.season_id$b$),
      (2, $a$), preds AS ($a$,
          $b$)) ), preds AS ($b$),
      -- Archived predictions: seasons before the current one, by year.
      (3, $a$m.season_id < (( SELECT cur.s$a$,
          $b$(SELECT se_p.start_year FROM seasons se_p WHERE se_p.season_id = m.season_id) < (( SELECT cur.y$b$)
    ) x(ord, anchor, repl)
    order by x.ord
  loop
    n := (length(src) - length(replace(src, r.anchor, ''))) / length(r.anchor);
    if n <> 1 then
      raise exception 'Anchor for model_scorecard_matches matched % times (expected 1): %', n, r.anchor;
    end if;
    src := replace(src, r.anchor, r.repl);
  end loop;
  drop materialized view public.model_scorecard_matches;
  execute 'create materialized view public.model_scorecard_matches as ' || src;
end
$mig$;

create unique index model_scorecard_matches_pk on public.model_scorecard_matches using btree (match_id);
-- Same ACL as before: {anon,authenticated,service_role}=rDxtm (select, truncate,
-- references, trigger, maintain), owner postgres.
revoke all on public.model_scorecard_matches from anon, authenticated, service_role;
grant select, truncate, references, trigger, maintain on public.model_scorecard_matches to anon, authenticated, service_role;
refresh materialized view public.model_scorecard_matches;
