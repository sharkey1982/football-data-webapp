-- ============================================================================
-- FixtureShark -- public schema baseline
--
-- Generated 2026-09-21 from the live database's own catalogue (project
-- ppzfmpbnojyjeblelsuz, PostgreSQL 17), because production had 342 recorded
-- migrations but the repository held only a handful as files: the repo could
-- not rebuild the database (audit 2026-09-21, finding 1).
--
-- A SNAPSHOT, not a migration. It records what the public schema IS so it can
-- be rebuilt or diffed; it is not replayed as part of migration history.
-- .github/workflows/schema-snapshot.yml replaces this file with a true
-- pg_dump once the SUPABASE_DB_URL secret is set.
--
-- WHAT IS INCLUDED: extensions, 79 functions, 85 tables (columns, defaults,
-- identity), keys/unique/check constraints, indexes, foreign keys, 42 views
-- (dependency order, with security_invoker where set), triggers, row-level
-- security, 69 policies, and every table/view/function privilege -- each
-- object's privileges are REVOKEd first and then GRANTed exactly as live,
-- because Supabase's default privileges would otherwise grant more.
--
-- NOT INCLUDED: data; identity sequence positions (they restart at 1);
-- object ownership (postgres); Supabase platform objects (auth, storage,
-- event triggers); pg_cron job commands (names and schedules only, below).
--
-- REQUIRES PostgreSQL 17+: table grants include MAINTAIN (new in 17).
--
-- VERIFIED 2026-09-21: restored into an empty PostgreSQL with ZERO errors,
-- and supabase/schema/verify/fingerprint.sql matched production on every
-- row -- 85 tables, 42 views, 79 functions, 273 constraints, 203 indexes,
-- 8 triggers, 69 policies, every column type, 15 SECURITY DEFINER functions
-- and their search_path settings, and exactly which tables and functions
-- anon (60 functions) and authenticated (67) can read, write and call.
-- (The test server was PostgreSQL 16, so MAINTAIN was removed from the test
-- copy only.) To repeat: supabase/schema/verify/README.md.
--
-- Scanned for secrets before committing (JWTs, API keys, bearer tokens,
-- passwords, credentialled URLs): none found. The repository is public.
-- ============================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- EXTENSIONS
-- ----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- FUNCTIONS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._check_auth_user_token_nulls_impl()
 RETURNS TABLE(bad_rows integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
  select count(*)::int from auth.users
  where confirmation_token is null or recovery_token is null
     or email_change_token_new is null or email_change is null
     or email_change_token_current is null or phone_change is null
     or phone_change_token is null or reauthentication_token is null;
$function$
;

CREATE OR REPLACE FUNCTION public._get_data_integrity_report_impl()
 RETURNS TABLE(check_name text, status text, detail text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  r record;
begin
  select count(*) as n, coalesce(string_agg(object_name, ', '), '') as names into r
  from public.get_public_read_audit()
  where not anon_can_read and anon_has_select_grant;
  return query select 'public read access'::text,
    case when r.n = 0 then 'ok' else 'FAIL' end,
    case when r.n = 0 then 'nothing granted-but-blocked'
         else r.n || ' object(s) granted to anon but blocked: ' || r.names end;

  -- FPL refresh freshness.
  select max(started_at) as last_ok into r
  from public.fpl_ingestion_runs ir where ir.status = 'success';
  return query select 'fpl refresh is current'::text,
    case when r.last_ok >= now() - interval '9 hours' then 'ok' else 'FAIL' end,
    case when r.last_ok is null then 'no successful refresh recorded'
         else 'last success ' || to_char(r.last_ok, 'YYYY-MM-DD HH24:MI') || ' UTC ('
              || round(extract(epoch from now() - r.last_ok) / 3600)::text || 'h ago; runs every 6h)' end;

  -- Failures cron saw that the runs table can't.
  select count(*) as n, max(d.start_time) as last_fail into r
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
  where j.command ilike '%refresh_fpl()%'
    and d.status = 'failed'
    and d.start_time > now() - interval '48 hours';
  return query select 'fpl refresh failures (48h)'::text,
    case when r.n = 0 then 'ok' else 'FAIL' end,
    case when r.n = 0 then 'none in cron log'
         else r.n || ' failed run(s), last ' || to_char(r.last_fail, 'YYYY-MM-DD HH24:MI')
              || ' UTC -- these do NOT appear in fpl_ingestion_runs' end;

  select (select bad_rows from public.check_auth_user_token_nulls()) as n into r;
  return query select 'auth token columns'::text,
    case when r.n = 0 then 'ok' else 'FAIL' end,
    case when r.n = 0 then 'no NULL token columns in auth.users'
         else r.n || ' user(s) with NULL token columns -- sign-in will 500 for everyone' end;

  select count(*) as n into r from (
    select 1 from public.fpl_players where season_id is null
    union all select 1 from public.fpl_player_snapshots where season_id is null
    union all select 1 from public.fpl_player_gameweeks where season_id is null
    union all select 1 from public.fpl_fixtures where season_id is null
    union all select 1 from public.fpl_teams where season_id is null
    union all select 1 from public.fpl_gameweeks where season_id is null
  ) z;
  return query select 'fpl season_id populated'::text,
    case when r.n = 0 then 'ok' else 'FAIL' end,
    case when r.n = 0 then 'no NULL season_id across six FPL tables' else r.n || ' row(s) with NULL season_id' end;

  select
    count(*) filter (where c.points_mismatch > 0) as bad_seasons,
    coalesce(sum(c.points_mismatch), 0) as bad_players,
    count(*) as seasons_checked,
    coalesce(string_agg(s.slug, ', ') filter (where c.points_mismatch > 0), '') as which
  into r
  from (select distinct season_id from public.fpl_player_gameweek_history) h
  join public.seasons s on s.season_id = h.season_id
  cross join lateral public.check_fpl_history_integrity(h.season_id) c;
  return query select 'gameweek history reconciles'::text,
    case when r.bad_players = 0 then 'ok' else 'WARN' end,
    case when r.bad_players = 0 then r.seasons_checked || ' season(s) reconcile exactly'
         else r.bad_players || ' player(s) across ' || r.bad_seasons || ' of ' || r.seasons_checked
              || ' season(s) do not reconcile (' || r.which || ')' end;

  select count(*) as n into r from (
    select season_id from public.season_best_xi group by season_id having count(*) <> 11
    union all
    select season_id from (
      select season_id, team_name, count(*) c from public.season_best_xi group by season_id, team_name
    ) t where t.c > 3
  ) z;
  return query select 'stored XIs are legal'::text,
    case when r.n = 0 then 'ok' else 'FAIL' end,
    case when r.n = 0 then 'all 11 players, max 3 per club' else r.n || ' season(s) with an illegal XI' end;

  select count(*) as n into r
  from public.fpl_player_season_totals t
  where not exists (select 1 from public.player_identity i where i.fpl_code = t.fpl_code);
  return query select 'historic players have identities'::text,
    case when r.n = 0 then 'ok' else 'FAIL' end,
    case when r.n = 0 then 'every player-season resolves to a code'
         else r.n || ' player-season(s) with no identity' end;
end $function$
;

CREATE OR REPLACE FUNCTION public._get_public_read_audit_impl()
 RETURNS TABLE(object_name text, object_kind text, rls_enabled boolean, has_select_policy boolean, anon_has_select_grant boolean, anon_can_read boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  with objs as (
    select c.relname::text as nm,
      case c.relkind when 'r' then 'table' when 'v' then 'view' when 'm' then 'matview' end as kind,
      c.relkind, c.relrowsecurity
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'v', 'm')
  ),
  enriched as (
    select o.nm, o.kind, o.relkind, o.relrowsecurity,
      exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = o.nm and p.cmd in ('SELECT', 'ALL')
      ) as has_pol,
      exists (
        select 1 from information_schema.role_table_grants g
        where g.table_schema = 'public' and g.table_name = o.nm
          and g.grantee = 'anon' and g.privilege_type = 'SELECT'
      ) as has_grant
    from objs o
  )
  select nm, kind, relrowsecurity, has_pol, has_grant,
    case when relkind in ('v', 'm') then has_grant
         else has_grant and (not relrowsecurity or has_pol) end
  from enriched
  order by
    case when relkind in ('v', 'm') then has_grant
         else has_grant and (not relrowsecurity or has_pol) end,
    nm;
$function$
;

CREATE OR REPLACE FUNCTION public._require_admin()
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'admin only' using errcode = '42501';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.backfill_fixture_predictions()
 RETURNS integer
 LANGUAGE sql
AS $function$
with latest_fit as (
 select distinct on (league_id) league_id,fit_run_id,rho,home_advantage,window_start_date,window_end_date from public.model_fit_runs where status='accepted' order by league_id,fitted_at desc
), appearances as (
 select lf.league_id,lf.fit_run_id,x.team_id,count(*)::numeric n
 from latest_fit lf join lateral (
   select m.home_team_id team_id from public.matches m where m.league_id=lf.league_id and m.match_date between lf.window_start_date and lf.window_end_date
   union all
   select m.away_team_id from public.matches m where m.league_id=lf.league_id and m.match_date between lf.window_start_date and lf.window_end_date
 ) x on true group by lf.league_id,lf.fit_run_id,x.team_id
), base as (
 select f.fixture_id,lf.fit_run_id,
 -- The model's own terms, with overrides deliberately NOT included --
 -- they're added separately below so both versions come from one
 -- expression rather than two that could drift apart.
 lf.home_advantage + hr.attack_strength*(case when f.league_id=1 and coalesce(ha.n,0)<12 then coalesce(ha.n,0)/(coalesce(ha.n,0)+12) else 1 end)
 - ar.defence_strength*(case when f.league_id=1 and coalesce(aa.n,0)<12 then coalesce(aa.n,0)/(coalesce(aa.n,0)+12) else 1 end)
 + case when f.league_id=1 then coalesce(hadj.centered_home_attack_dev,0)*(case when coalesce(ha.n,0)<12 then coalesce(ha.n,0)/(coalesce(ha.n,0)+12) else 1 end) - coalesce(aadj.centered_away_defence_dev,0)*(case when coalesce(aa.n,0)<12 then coalesce(aa.n,0)/(coalesce(aa.n,0)+12) else 1 end) else 0 end
 as home_exponent,
 ar.attack_strength*(case when f.league_id=1 and coalesce(aa.n,0)<12 then coalesce(aa.n,0)/(coalesce(aa.n,0)+12) else 1 end)
 - hr.defence_strength*(case when f.league_id=1 and coalesce(ha.n,0)<12 then coalesce(ha.n,0)/(coalesce(ha.n,0)+12) else 1 end)
 + case when f.league_id=1 then coalesce(aadj.centered_away_attack_dev,0)*(case when coalesce(aa.n,0)<12 then coalesce(aa.n,0)/(coalesce(aa.n,0)+12) else 1 end) - coalesce(hadj.centered_home_defence_dev,0)*(case when coalesce(ha.n,0)<12 then coalesce(ha.n,0)/(coalesce(ha.n,0)+12) else 1 end) else 0 end
 as away_exponent,
 coalesce(hov.attack_adjustment,0) - coalesce(aov.defence_adjustment,0) as home_override,
 coalesce(aov.attack_adjustment,0) - coalesce(hov.defence_adjustment,0) as away_override,
 case when f.league_id=1 then 'dc_home_away_sparse_shrink_v2' else 'dc_baseline_v1' end model_version
 from fixtures f join latest_fit lf on lf.league_id=f.league_id join team_ratings hr on hr.team_id=f.home_team_id and hr.fit_run_id=lf.fit_run_id join team_ratings ar on ar.team_id=f.away_team_id and ar.fit_run_id=lf.fit_run_id
 left join appearances ha on ha.league_id=f.league_id and ha.fit_run_id=lf.fit_run_id and ha.team_id=f.home_team_id left join appearances aa on aa.league_id=f.league_id and aa.fit_run_id=lf.fit_run_id and aa.team_id=f.away_team_id
 left join team_home_away_adjustment_v1 hadj on hadj.team_id=f.home_team_id left join team_home_away_adjustment_v1 aadj on aadj.team_id=f.away_team_id
 left join team_strength_manual_override hov on hov.team_id=f.home_team_id left join team_strength_manual_override aov on aov.team_id=f.away_team_id
 where f.status in('scheduled','postponed')
), preds as (
 select fixture_id, fit_run_id, model_version,
   exp(home_exponent + home_override) as pred_home,
   exp(away_exponent + away_override) as pred_away,
   exp(home_exponent) as raw_home,
   exp(away_exponent) as raw_away
 from base
), updated as (
 update fixtures f set
   predicted_home_goals=p.pred_home, predicted_away_goals=p.pred_away,
   raw_predicted_home_goals=p.raw_home, raw_predicted_away_goals=p.raw_away,
   prediction_fit_run_id=p.fit_run_id, prediction_model_version=p.model_version, predicted_at=now()
 from preds p where p.fixture_id=f.fixture_id and f.status in('scheduled','postponed') returning f.fixture_id
) select count(*)::integer from updated;
$function$
;

CREATE OR REPLACE FUNCTION public.backfill_historic_fixture_predictions(target_season_id bigint)
 RETURNS integer
 LANGUAGE sql
AS $function$
  with candidate_fits as (
    select
      f.fixture_id,
      mfr.fit_run_id,
      mfr.rho,
      mfr.home_advantage,
      row_number() over (partition by f.fixture_id order by mfr.fitted_at desc) as rn
    from public.fixtures f
    join public.model_fit_runs mfr
      on mfr.league_id = f.league_id
      and mfr.status = 'accepted'
      and mfr.fitted_at::date < f.kickoff_date
    where f.season_id = target_season_id
      and f.predicted_home_goals is null
  ),
  chosen as (
    select fixture_id, fit_run_id, rho, home_advantage
    from candidate_fits
    where rn = 1
  ),
  preds as (
    select
      c.fixture_id,
      c.fit_run_id,
      exp(c.home_advantage + hr.attack_strength - ar.defence_strength) as pred_home,
      exp(ar.attack_strength - hr.defence_strength) as pred_away
    from chosen c
    join public.fixtures f on f.fixture_id = c.fixture_id
    join public.team_ratings hr on hr.team_id = f.home_team_id and hr.fit_run_id = c.fit_run_id
    join public.team_ratings ar on ar.team_id = f.away_team_id and ar.fit_run_id = c.fit_run_id
  ),
  updated as (
    update public.fixtures f
    set predicted_home_goals = p.pred_home,
        predicted_away_goals = p.pred_away,
        prediction_fit_run_id = p.fit_run_id,
        predicted_at = now()
    from preds p
    where p.fixture_id = f.fixture_id
      and f.predicted_home_goals is null
    returning f.fixture_id
  )
  select count(*)::integer from updated;
$function$
;

CREATE OR REPLACE FUNCTION public.backfill_match_odds()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  v_rows integer;
begin
  with resolved as (
    select r.raw_data, m.match_id
    from public.source_match_rows r
    join public.matches m
      on m.match_date = r.source_match_date
     and m.home_team_id = (
       select ta.team_id from public.team_aliases ta
       where ta.source_name = 'football-data.co.uk' and ta.raw_name = r.source_home_team limit 1
     )
     and m.away_team_id = (
       select ta.team_id from public.team_aliases ta
       where ta.source_name = 'football-data.co.uk' and ta.raw_name = r.source_away_team limit 1
     )
  ),
  unpivoted as (
    select match_id, '1x2' as market, bm as bookmaker, is_close,
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'H')) as price_home,
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'D')) as price_draw,
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'A')) as price_away,
      null::numeric as line, null::numeric as price_over, null::numeric as price_under
    from resolved
    cross join (values ('B365'), ('BW'), ('IW'), ('PS'), ('WH'), ('VC'), ('Max'), ('Avg')) b(bm)
    cross join (values (false), (true)) c(is_close)

    union all

    select match_id, 'ou25', bm, is_close,
      null, null, null, 2.5,
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || '>2.5')),
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || '<2.5'))
    from resolved
    cross join (values ('B365'), ('Max'), ('Avg'), ('P')) b(bm)
    cross join (values (false), (true)) c(is_close)

    union all

    select match_id, 'ah', bm, is_close,
      public.safe_numeric(raw_data->>(case when is_close then 'AHCh' else 'AHh' end)),
      null, null, null,
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'AHH')),
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'AHA'))
    from resolved
    cross join (values ('B365'), ('Max'), ('Avg'), ('P')) b(bm)
    cross join (values (false), (true)) c(is_close)
  )
  insert into public.match_odds (
    match_id, source_name, market, bookmaker, is_closing,
    price_home, price_draw, price_away, line, price_over, price_under
  )
  select match_id, 'football-data.co.uk', market, bookmaker, is_close,
    price_home, price_draw, price_away,
    case when market = 'ah' then line when market = 'ou25' then 2.5 end,
    price_over, price_under
  from unpivoted
  where coalesce(price_home, price_over, price_under) is not null
  on conflict do nothing;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_auth_user_token_nulls()
 RETURNS TABLE(bad_rows integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  perform public._require_admin();
  return query select * from public._check_auth_user_token_nulls_impl();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_fpl_history_integrity(p_season_id bigint)
 RETURNS TABLE(players_checked bigint, points_mismatch bigint, minutes_mismatch bigint, goals_mismatch bigint, assists_mismatch bigint, worst_points_gap integer)
 LANGUAGE sql
 STABLE
AS $function$
  with gw as (
    select fpl_code,
      sum(total_points) pts, sum(minutes) mins,
      sum(goals_scored) gls, sum(assists) ast
    from public.fpl_player_gameweek_history
    where season_id = p_season_id
    group by fpl_code
  )
  select
    count(*)::bigint,
    count(*) filter (where gw.pts <> t.total_points)::bigint,
    count(*) filter (where gw.mins <> t.minutes)::bigint,
    count(*) filter (where gw.gls <> t.goals_scored)::bigint,
    count(*) filter (where gw.ast <> t.assists)::bigint,
    coalesce(max(abs(gw.pts - t.total_points)), 0)::integer
  from gw
  join public.fpl_player_season_totals t
    on t.season_id = p_season_id and t.fpl_code = gw.fpl_code;
$function$
;

CREATE OR REPLACE FUNCTION public.fixture_derived_markets(p_lambda_home numeric, p_lambda_away numeric, p_rho numeric)
 RETURNS TABLE(home_win numeric, draw numeric, away_win numeric, over_2_5 numeric, under_2_5 numeric, btts numeric, home_clean_sheet numeric, away_clean_sheet numeric)
 LANGUAGE sql
 IMMUTABLE
AS $function$
  with grid as (
    select h, a,
      case
        when h = 0 and a = 0 then 1 - p_lambda_home * p_lambda_away * p_rho
        when h = 0 and a = 1 then 1 + p_lambda_home * p_rho
        when h = 1 and a = 0 then 1 + p_lambda_away * p_rho
        when h = 1 and a = 1 then 1 - p_rho
        else 1
      end
      * (exp(-p_lambda_home) * power(p_lambda_home, h) / (select coalesce(prod, 1) from (select exp(sum(ln(g))) as prod from generate_series(1, greatest(h,1)) g where h > 0) x))
      * (exp(-p_lambda_away) * power(p_lambda_away, a) / (select coalesce(prod, 1) from (select exp(sum(ln(g))) as prod from generate_series(1, greatest(a,1)) g where a > 0) y))
      as p
    from generate_series(0, 8) h, generate_series(0, 8) a
  ),
  t as (select sum(p) as total from grid)
  select
    round((sum(p) filter (where h > a) / total * 100)::numeric, 2),
    round((sum(p) filter (where h = a) / total * 100)::numeric, 2),
    round((sum(p) filter (where h < a) / total * 100)::numeric, 2),
    round((sum(p) filter (where h + a > 2) / total * 100)::numeric, 2),
    round((sum(p) filter (where h + a <= 2) / total * 100)::numeric, 2),
    round((sum(p) filter (where h > 0 and a > 0) / total * 100)::numeric, 2),
    round((sum(p) filter (where a = 0) / total * 100)::numeric, 2),
    round((sum(p) filter (where h = 0) / total * 100)::numeric, 2)
  from grid, t group by total;
$function$
;

CREATE OR REPLACE FUNCTION public.fpl_gameweek_for_date(p_season_id bigint, p_date date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select max(fpl_event_id)::integer
  from public.fpl_gameweeks
  where season_id = p_season_id
    and (deadline_time at time zone 'Europe/London')::date < p_date;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_fixture_slug()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_home_slug text;
  v_away_slug text;
begin
  if new.slug is not null then
    return new;
  end if;
  select slug into v_home_slug from public.teams where team_id = new.home_team_id;
  select slug into v_away_slug from public.teams where team_id = new.away_team_id;
  if v_home_slug is null or v_away_slug is null then
    raise exception 'Cannot generate fixture slug: missing team slug for home_team_id=% or away_team_id=%', new.home_team_id, new.away_team_id;
  end if;
  new.slug := v_home_slug || '-v-' || v_away_slug || '-' || new.kickoff_date::text;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_fpl_player_slug()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_base text;
  v_candidate text;
  v_suffix int := 1;
begin
  v_base := public.slugify(coalesce(nullif(trim(coalesce(new.first_name,'') || ' ' || coalesce(new.second_name,'')), ''), new.web_name));
  if v_base is null then
    new.slug := null;
    return new;
  end if;

  -- Unchanged name on an update: keep the existing slug so a public URL
  -- stays stable rather than churning on every ingestion pass.
  if tg_op = 'UPDATE' and new.slug is not null
     and public.slugify(coalesce(nullif(trim(coalesce(old.first_name,'') || ' ' || coalesce(old.second_name,'')), ''), old.web_name)) is not distinct from v_base then
    return new;
  end if;

  v_candidate := v_base;
  while exists (
    select 1 from public.fpl_players
    where season_id = new.season_id and slug = v_candidate
      and fpl_player_id is distinct from new.fpl_player_id
  ) loop
    v_suffix := v_suffix + 1;
    v_candidate := v_base || '-' || v_suffix;
  end loop;

  new.slug := v_candidate;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_actual_value_table(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(fpl_player_id bigint, web_name text, slug text, team_name text, position_label text, price numeric, total_points integer, points_per_million numeric, minutes integer, goals integer, assists integer, clean_sheets integer, bonus integer, ownership numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with latest as (
    select max(snapshot_date) as d from public.fpl_player_snapshots
  ),
  snap as (
    select s.* from public.fpl_player_snapshots s, latest l where s.snapshot_date = l.d
  ),
  totals as (
    select g.fpl_player_id,
      sum(coalesce(g.minutes, 0))::integer as mins,
      sum(coalesce(g.goals_scored, 0))::integer as gls,
      sum(coalesce(g.assists, 0))::integer as ast,
      sum(coalesce(g.clean_sheets, 0))::integer as cs,
      sum(coalesce(g.bonus, 0))::integer as bns
    from public.fpl_player_gameweeks g
    where g.season_id = p_season_id
    group by g.fpl_player_id
  )
  select
    p.fpl_player_id, p.web_name, p.slug, t.display_name,
    case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end,
    round(sn.now_cost / 10.0, 1),
    coalesce(sn.total_points, 0),
    case when sn.now_cost > 0 then round((coalesce(sn.total_points, 0) / (sn.now_cost / 10.0))::numeric, 2) else 0 end,
    coalesce(tt.mins, 0), coalesce(tt.gls, 0), coalesce(tt.ast, 0), coalesce(tt.cs, 0), coalesce(tt.bns, 0),
    round(sn.selected_by_percent::numeric, 1)
  from snap sn
  join public.fpl_players p on p.fpl_player_id = sn.fpl_player_id
  left join public.teams t on t.team_id = p.canonical_team_id
  left join totals tt on tt.fpl_player_id = sn.fpl_player_id
  where p.web_name is not null and coalesce(sn.total_points, 0) > 0
  order by 8 desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_all_time_top_scorers()
 RETURNS TABLE(display_name text, goals bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select t.display_name,
    sum(case when m.home_team_id = t.team_id then m.full_time_home_goals else m.full_time_away_goals end)::bigint
  from public.matches m
  join public.teams t on t.team_id in (m.home_team_id, m.away_team_id)
  group by t.display_name
  order by 2 desc
  limit 4;
$function$
;

CREATE OR REPLACE FUNCTION public.get_best_defence_rating(p_league_id bigint)
 RETURNS TABLE(canonical_name text, goals_against_per_game numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with latest_fit as (
    select fit_run_id from public.model_fit_runs
    where league_id = p_league_id and status = 'accepted'
    order by fitted_at desc
    limit 1
  )
  select t.canonical_name,
    exp(-(tr.defence_strength + coalesce(o.defence_adjustment, 0))) as goals_against_per_game
  from public.team_ratings tr
  join latest_fit lf on lf.fit_run_id = tr.fit_run_id
  join public.teams t on t.team_id = tr.team_id
  left join public.team_strength_manual_override o on o.team_id = tr.team_id
  order by goals_against_per_game asc
  limit 4;
$function$
;

CREATE OR REPLACE FUNCTION public.get_biggest_comebacks()
 RETURNS TABLE(home text, away text, ht_home integer, ht_away integer, ft_home integer, ft_away integer, match_date date, league_code text, deficit integer)
 LANGUAGE sql
 STABLE
AS $function$
  select ht.display_name, at.display_name,
    m.half_time_home_goals, m.half_time_away_goals,
    m.full_time_home_goals, m.full_time_away_goals,
    m.match_date, l.code,
    greatest(m.half_time_away_goals - m.half_time_home_goals,
             m.half_time_home_goals - m.half_time_away_goals) as deficit
  from public.matches m
  join public.teams ht on ht.team_id = m.home_team_id
  join public.teams at on at.team_id = m.away_team_id
  join public.leagues l on l.league_id = m.league_id
  where m.half_time_home_goals is not null
    and (
      (m.half_time_away_goals - m.half_time_home_goals >= 2 and m.full_time_home_goals > m.full_time_away_goals)
      or (m.half_time_home_goals - m.half_time_away_goals >= 2 and m.full_time_away_goals > m.full_time_home_goals)
    )
  order by deficit desc, m.match_date desc
  limit 8;
$function$
;

CREATE OR REPLACE FUNCTION public.get_completed_gameweeks(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(fpl_event_id integer, players bigint, total_points bigint, best_score integer)
 LANGUAGE sql
 STABLE
AS $function$
  select h.gameweek::integer, count(*)::bigint, sum(h.total_points)::bigint, max(h.total_points)::integer
  from public.fpl_player_gameweek_history h
  where h.season_id = p_season_id
  group by h.gameweek
  union all
  select g.fpl_event_id::integer, count(*)::bigint, sum(g.total_points)::bigint, max(g.total_points)::integer
  from public.fpl_player_gameweeks g
  where g.season_id = p_season_id
    and not exists (select 1 from public.fpl_player_gameweek_history h2 where h2.season_id = p_season_id)
    and g.total_points is not null
    and g.fpl_event_id in (
      select f.fpl_event_id from public.fpl_fixtures f
      where f.season_id = p_season_id group by f.fpl_event_id having bool_and(f.finished)
    )
  group by g.fpl_event_id
  order by 1 desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_cross_league_summary()
 RETURNS TABLE(league_code text, league_name text, season_label text, matches bigint, goals_per_game numeric, home_goals_per_game numeric, away_goals_per_game numeric, home_win_pct numeric, draw_pct numeric, away_win_pct numeric, yellows_per_game numeric, reds_per_game numeric, over_two_five_pct numeric, both_scored_pct numeric, nil_nil_pct numeric, comeback_pct numeric)
 LANGUAGE sql
 STABLE
AS $function$
  select l.code, l.name, s.label,
    count(*)::bigint,
    round(avg(m.full_time_home_goals + m.full_time_away_goals)::numeric, 2),
    round(avg(m.full_time_home_goals)::numeric, 2),
    round(avg(m.full_time_away_goals)::numeric, 2),
    round(100.0 * avg(case when m.full_time_result = 'H' then 1 else 0 end)::numeric, 1),
    round(100.0 * avg(case when m.full_time_result = 'D' then 1 else 0 end)::numeric, 1),
    round(100.0 * avg(case when m.full_time_result = 'A' then 1 else 0 end)::numeric, 1),
    round(avg(m.home_yellow_cards + m.away_yellow_cards)::numeric, 2),
    round(avg(m.home_red_cards + m.away_red_cards)::numeric, 3),
    round(100.0 * avg(case when m.full_time_home_goals + m.full_time_away_goals > 2.5 then 1 else 0 end)::numeric, 1),
    round(100.0 * avg(case when m.full_time_home_goals > 0 and m.full_time_away_goals > 0 then 1 else 0 end)::numeric, 1),
    round(100.0 * avg(case when m.full_time_home_goals = 0 and m.full_time_away_goals = 0 then 1 else 0 end)::numeric, 1),
    -- Share of matches where the side leading at half time did not win.
    -- Null half-time data is excluded from the denominator rather than
    -- counted as "no comeback", which would understate it.
    round(100.0 * (
      count(*) filter (
        where m.half_time_result is not null and m.half_time_result <> 'D'
          and m.half_time_result <> m.full_time_result
      )::numeric
      / nullif(count(*) filter (where m.half_time_result is not null and m.half_time_result <> 'D'), 0)
    ), 1)
  from public.matches m
  join public.leagues l on l.league_id = m.league_id
  join public.seasons s on s.season_id = m.season_id
  where l.code in ('E0', 'E1', 'E2', 'E3', 'EC')
    and m.full_time_result is not null
  group by l.code, l.name, s.label
  having count(*) >= 100
  order by l.code, s.label;
$function$
;

CREATE OR REPLACE FUNCTION public.get_daily_digest(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(change_type text, fpl_player_id bigint, web_name text, slug text, team_name text, position_label text, ownership numeric, old_value text, new_value text, detail text, from_date date, to_date date)
 LANGUAGE sql
 STABLE
AS $function$
  with dates as (
    select max(snapshot_date) as to_d,
           (select max(snapshot_date) from public.fpl_player_snapshots
            where snapshot_date < (select max(snapshot_date) from public.fpl_player_snapshots)) as from_d
    from public.fpl_player_snapshots
  ),
  cur as (
    select s.* from public.fpl_player_snapshots s, dates d where s.snapshot_date = d.to_d
  ),
  prev as (
    select s.* from public.fpl_player_snapshots s, dates d where s.snapshot_date = d.from_d
  ),
  joined as (
    select c.fpl_player_id, c.now_cost as c_cost, p.now_cost as p_cost,
      c.selected_by_percent as c_own, p.selected_by_percent as p_own,
      c.status as c_status, p.status as p_status, c.news as c_news,
      pl.web_name, pl.slug, pl.element_type, t.display_name as team_name
    from cur c
    join prev p on p.fpl_player_id = c.fpl_player_id
    join public.fpl_players pl on pl.fpl_player_id = c.fpl_player_id
    left join public.teams t on t.team_id = pl.canonical_team_id
    where pl.web_name is not null
  ),
  labelled as (
    select j.*,
      case j.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end as pos
    from joined j
  )
  select 'price_rise', fpl_player_id, web_name, slug, team_name, pos,
    round(c_own::numeric, 1),
    '£' || round(p_cost / 10.0, 1)::text || 'm', '£' || round(c_cost / 10.0, 1)::text || 'm',
    null, (select from_d from dates), (select to_d from dates)
  from labelled where c_cost > p_cost

  union all
  select 'price_fall', fpl_player_id, web_name, slug, team_name, pos,
    round(c_own::numeric, 1),
    '£' || round(p_cost / 10.0, 1)::text || 'm', '£' || round(c_cost / 10.0, 1)::text || 'm',
    null, (select from_d from dates), (select to_d from dates)
  from labelled where c_cost < p_cost

  union all
  -- Availability changes are the ones people most want pushed at them,
  -- and the only category where the direction of travel matters more
  -- than the magnitude.
  select 'availability', fpl_player_id, web_name, slug, team_name, pos,
    round(c_own::numeric, 1), p_status, c_status, nullif(c_news, ''),
    (select from_d from dates), (select to_d from dates)
  from labelled where c_status is distinct from p_status

  union all
  select 'ownership', fpl_player_id, web_name, slug, team_name, pos,
    round(c_own::numeric, 1),
    round(p_own::numeric, 1)::text || '%', round(c_own::numeric, 1)::text || '%',
    null, (select from_d from dates), (select to_d from dates)
  from labelled
  where abs(c_own::numeric - p_own::numeric) >= 0.5

  order by 7 desc nulls last;
$function$
;

CREATE OR REPLACE FUNCTION public.get_data_integrity_report()
 RETURNS TABLE(check_name text, status text, detail text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  perform public._require_admin();
  return query select * from public._get_data_integrity_report_impl();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_digest_gameweeks(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(gameweek integer, first_date date, last_date date, days integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with days as (select distinct snapshot_date as d from public.fpl_player_snapshots),
  pairs as (select d as to_d, lag(d) over (order by d) as from_d from days),
  owned as (
    select p.to_d, public.fpl_gameweek_for_date(p_season_id, p.to_d) as gw
    from pairs p where p.from_d is not null
  )
  select gw::integer, min(to_d), max(to_d), count(*)::integer
  from owned where gw is not null
  group by gw
  order by gw desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_fpl_default_matchweek(p_season_id bigint, p_league_id bigint)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  with next_scheduled as (
    select min(f.matchweek) as mw
    from public.fixtures f
    where f.season_id = p_season_id and f.league_id = p_league_id and f.status = 'scheduled'
  ),
  covered as (
    select distinct f.matchweek
    from public.fpl_player_projections pr
    join public.fixtures f on f.fixture_id = pr.fixture_id
    where pr.model_version = 'leaguewide_v6' and f.season_id = p_season_id and f.league_id = p_league_id
  )
  select coalesce(
    -- exact match: next scheduled week has data
    (select mw from next_scheduled where mw in (select matchweek from covered)),
    -- next scheduled has no data yet: nearest covered week at or after it
    (select min(matchweek) from covered, next_scheduled where covered.matchweek >= next_scheduled.mw),
    -- next scheduled is beyond ALL covered weeks: nearest covered week before it (closest available)
    (select max(matchweek) from covered),
    -- no coverage at all: fall back to next scheduled itself, or week 1
    (select mw from next_scheduled),
    1
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_fpl_fixture_bonus_v4(p_fixture_id bigint)
 RETURNS TABLE(fpl_player_id bigint, expected_bonus_points numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with b as (
    select fpl_player_id,
      expected_bps_score::float8 as bps,
      greatest(5.0::float8, (7.0::float8 + (0.10::float8 * expected_bps_score::float8))) as bps_sd
    from public.fpl_fixture_bps_projection_v1
    where fixture_id = p_fixture_id
  ),
  pairwise as (
    select a.fpl_player_id,
      sum(case when o.fpl_player_id <> a.fpl_player_id
          then 1.0::float8/(1.0::float8+exp((a.bps-o.bps)/sqrt(a.bps_sd*a.bps_sd + o.bps_sd*o.bps_sd)))
          else 0::float8 end) as expected_players_ahead
    from b a join b o on true
    group by a.fpl_player_id
  ),
  strength as (
    select fpl_player_id, exp(-0.50::float8 * expected_players_ahead) as w
    from pairwise
  ),
  total as (
    select sum(w) as s from strength
  ),
  p1 as (
    select st.fpl_player_id, st.w, t.s, (st.w / nullif(t.s, 0::float8)) as p_rank1
    from strength st cross join total t
  ),
  p2 as (
    select i.fpl_player_id,
      sum(case when k.fpl_player_id <> i.fpl_player_id
          then (k.w / nullif(i.s, 0::float8)) * (i.w / nullif(i.s - k.w, 0::float8))
          else 0::float8 end) as p_rank2
    from p1 i join strength k on true
    group by i.fpl_player_id
  ),
  p3 as (
    select i.fpl_player_id,
      sum(case when k.fpl_player_id <> i.fpl_player_id and l.fpl_player_id <> i.fpl_player_id and k.fpl_player_id <> l.fpl_player_id
          then (k.w / nullif(i.s, 0::float8)) * (l.w / nullif(i.s - k.w, 0::float8)) * (i.w / nullif(i.s - k.w - l.w, 0::float8))
          else 0::float8 end) as p_rank3
    from p1 i join strength k on true join strength l on true
    group by i.fpl_player_id
  )
  select p1.fpl_player_id, (((3::float8 * p1.p_rank1) + (2::float8 * p2.p_rank2) + p3.p_rank3))::numeric as expected_bonus_points
  from p1
  join p2 on p2.fpl_player_id = p1.fpl_player_id
  join p3 on p3.fpl_player_id = p1.fpl_player_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_fpl_market_movers(p_days integer DEFAULT 7)
 RETURNS TABLE(fpl_player_id bigint, web_name text, slug text, team_name text, position_label text, price_now numeric, price_change numeric, ownership_now numeric, ownership_change numeric, transfers_in_event bigint, transfers_out_event bigint, status text, news text, from_date date, to_date date)
 LANGUAGE sql
 STABLE
AS $function$
  with bounds as (
    select max(snapshot_date) as to_d,
           max(snapshot_date) - (p_days || ' days')::interval as cutoff
    from public.fpl_player_snapshots
  ),
  first_in_window as (
    select distinct on (s.fpl_player_id) s.fpl_player_id, s.now_cost, s.selected_by_percent, s.snapshot_date
    from public.fpl_player_snapshots s, bounds b
    where s.snapshot_date >= b.cutoff::date
    order by s.fpl_player_id, s.snapshot_date asc
  ),
  latest as (
    select s.*
    from public.fpl_player_snapshots s, bounds b
    where s.snapshot_date = b.to_d
  )
  select
    l.fpl_player_id,
    p.web_name,
    p.slug,
    t.display_name,
    case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end,
    round(l.now_cost / 10.0, 1),
    round((l.now_cost - f.now_cost) / 10.0, 1),
    round(l.selected_by_percent::numeric, 1),
    round(l.selected_by_percent::numeric - f.selected_by_percent::numeric, 1),
    coalesce(l.transfers_in_event, 0)::bigint,
    coalesce(l.transfers_out_event, 0)::bigint,
    l.status,
    nullif(l.news, ''),
    f.snapshot_date,
    l.snapshot_date
  from latest l
  join first_in_window f on f.fpl_player_id = l.fpl_player_id
  join public.fpl_players p on p.fpl_player_id = l.fpl_player_id
  left join public.teams t on t.team_id = p.canonical_team_id
  where p.web_name is not null;
$function$
;

CREATE OR REPLACE FUNCTION public.get_fpl_optimizer_candidates(p_from_matchweek integer, p_to_matchweek integer)
 RETURNS TABLE(matchweek integer, fpl_player_id integer, web_name text, team_id bigint, team_name text, fpl_position integer, price_m numeric, expected_fpl_points numeric, start_probability numeric, sub_appearance_probability numeric, expected_minutes numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
begin
  return query
  select
    v.matchweek,
    v.fpl_player_id,
    v.web_name,
    v.team_id,
    v.team_name,
    v.fpl_position,
    v.price_m,
    v.expected_fpl_points,
    v.start_probability,
    v.sub_appearance_probability,
    v.expected_minutes
  from public.fpl_optimizer_candidate_feed_v2 v
  where v.matchweek between p_from_matchweek and p_to_matchweek
    and v.price_m is not null
    and v.expected_fpl_points is not null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_fpl_optimizer_candidates_json(p_from_matchweek integer, p_to_matchweek integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
  from (
    select
      matchweek, fpl_player_id, web_name, team_id, team_name, fpl_position,
      price_m, expected_fpl_points, start_probability, sub_appearance_probability, expected_minutes,
      is_home, opponent_team_name
    from public.fpl_optimizer_candidate_feed_v2
    where matchweek between p_from_matchweek and p_to_matchweek
      and price_m is not null
      and expected_fpl_points is not null
  ) v;
$function$
;

CREATE OR REPLACE FUNCTION public.get_fpl_optimizer_candidates_scenario_json(p_season_id bigint, p_league_id bigint, p_model_version text, p_scenario_key text, p_from_matchweek integer, p_to_matchweek integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
  from (
    select
      f.matchweek, pr.fpl_player_id, fp.web_name, fp.canonical_team_id as team_id,
      t.canonical_name as team_name, fp.element_type as fpl_position,
      (fp.now_cost::numeric / 10) as price_m,
      pr.expected_fpl_points, pr.start_probability, pr.sub_appearance_probability, pr.expected_minutes,
      (fp.canonical_team_id = f.home_team_id) as is_home,
      coalesce(opp.canonical_name, 'Unknown') as opponent_team_name,
      (pr.expected_fpl_points * (0.5 + 0.5 * coalesce(pr.start_probability, 0))) as captain_score
    from public.fpl_player_projections pr
    join public.fixtures f on f.fixture_id = pr.fixture_id
    join public.fpl_players fp on fp.fpl_player_id = pr.fpl_player_id and fp.season_id = pr.season_id
    left join public.teams t on t.team_id = fp.canonical_team_id
    left join public.teams opp on opp.team_id = (case when fp.canonical_team_id = f.home_team_id then f.away_team_id else f.home_team_id end)
    where pr.season_id = p_season_id
      and f.league_id = p_league_id
      and pr.model_version = p_model_version
      and pr.scenario_key = p_scenario_key
      and f.matchweek between p_from_matchweek and p_to_matchweek
      and fp.now_cost is not null
      and pr.expected_fpl_points is not null
  ) v;
$function$
;

CREATE OR REPLACE FUNCTION public.get_fpl_optimizer_earliest_matchweek()
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select min(f.matchweek)
  from public.fpl_player_projections pr
  join public.fixtures f on f.fixture_id = pr.fixture_id
  where pr.model_version = 'leaguewide_v6';
$function$
;

CREATE OR REPLACE FUNCTION public.get_fpl_played_matchweeks(p_season_id bigint, p_league_id bigint)
 RETURNS integer[]
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(array_agg(distinct f.matchweek order by f.matchweek), array[]::int[])
  from public.fpl_player_gameweeks gw
  join public.fixtures f on f.fixture_id = gw.fpl_fixture_id
  where gw.season_id = p_season_id and f.league_id = p_league_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_fpl_projection_available_matchweeks(p_season_id bigint, p_league_id bigint, p_model_version text, p_scenario_key text)
 RETURNS integer[]
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(array_agg(distinct f.matchweek order by f.matchweek), array[]::int[])
  from public.fpl_player_projections pr
  join public.fixtures f on f.fixture_id = pr.fixture_id
  where pr.season_id = p_season_id
    and f.league_id = p_league_id
    and pr.model_version = p_model_version
    and pr.scenario_key = p_scenario_key;
$function$
;

CREATE OR REPLACE FUNCTION public.get_fpl_projection_snapshot(p_season_id bigint, p_league_id bigint, p_model_version text, p_scenario_key text, p_from_matchweek integer, p_to_matchweek integer)
 RETURNS TABLE(max_generated_at timestamp with time zone, row_count bigint, matchweeks_covered integer)
 LANGUAGE sql
 STABLE
AS $function$
  select max(pr.generated_at), count(*), count(distinct f.matchweek)::int
  from public.fpl_player_projections pr
  join public.fixtures f on f.fixture_id = pr.fixture_id
  where pr.season_id = p_season_id
    and f.league_id = p_league_id
    and pr.model_version = p_model_version
    and pr.scenario_key = p_scenario_key
    and f.matchweek between p_from_matchweek and p_to_matchweek;
$function$
;

CREATE OR REPLACE FUNCTION public.get_gameweek_digest(p_season_id bigint DEFAULT 13, p_gameweek integer DEFAULT NULL::integer)
 RETURNS TABLE(gameweek integer, event_date date, change_type text, fpl_player_id bigint, web_name text, slug text, team_name text, position_label text, ownership numeric, old_value text, new_value text, detail text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with days as (select distinct snapshot_date as d from public.fpl_player_snapshots),
  pairs as (select d as to_d, lag(d) over (order by d) as from_d from days),
  owned as (
    select p.to_d, p.from_d, public.fpl_gameweek_for_date(p_season_id, p.to_d) as gw
    from pairs p where p.from_d is not null
  ),
  target as (select coalesce(p_gameweek, (select max(gw) from owned)) as gw),
  sel as (select o.* from owned o, target t where o.gw = t.gw),
  joined as (
    select s.gw, s.to_d, c.fpl_player_id,
      c.now_cost as c_cost, pv.now_cost as p_cost,
      c.selected_by_percent as c_own, pv.selected_by_percent as p_own,
      c.status as c_status, pv.status as p_status, c.news as c_news,
      pl.web_name, pl.slug, pl.element_type, t.display_name as team_name
    from sel s
    join public.fpl_player_snapshots c on c.snapshot_date = s.to_d
    join public.fpl_player_snapshots pv on pv.snapshot_date = s.from_d and pv.fpl_player_id = c.fpl_player_id
    join public.fpl_players pl on pl.fpl_player_id = c.fpl_player_id
    left join public.teams t on t.team_id = pl.canonical_team_id
    where pl.web_name is not null
  ),
  labelled as (
    select j.*, case j.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end as pos
    from joined j
  )
  select gw::integer, to_d, 'price_rise', fpl_player_id, web_name, slug, team_name, pos, round(c_own::numeric, 1),
    '£' || round(p_cost / 10.0, 1)::text || 'm', '£' || round(c_cost / 10.0, 1)::text || 'm', null
  from labelled where c_cost > p_cost
  union all
  select gw::integer, to_d, 'price_fall', fpl_player_id, web_name, slug, team_name, pos, round(c_own::numeric, 1),
    '£' || round(p_cost / 10.0, 1)::text || 'm', '£' || round(c_cost / 10.0, 1)::text || 'm', null
  from labelled where c_cost < p_cost
  union all
  select gw::integer, to_d, 'availability', fpl_player_id, web_name, slug, team_name, pos, round(c_own::numeric, 1),
    p_status, c_status, nullif(c_news, '')
  from labelled where c_status is distinct from p_status
  union all
  select gw::integer, to_d, 'ownership', fpl_player_id, web_name, slug, team_name, pos, round(c_own::numeric, 1),
    round(p_own::numeric, 1)::text || '%', round(c_own::numeric, 1)::text || '%', null
  from labelled where abs(c_own::numeric - p_own::numeric) >= 0.5
  order by 2 desc, 9 desc nulls last;
$function$
;

CREATE OR REPLACE FUNCTION public.get_injury_report(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(fpl_player_id bigint, web_name text, slug text, team_id bigint, team_name text, position_label text, price numeric, ownership numeric, total_points integer, status text, chance_next_round integer, news text, return_date date, fixtures_missed integer, next_fixture_date date)
 LANGUAGE sql
 STABLE
AS $function$
  with latest as (
    select max(snapshot_date) as d from public.fpl_player_snapshots
  ),
  snap as (
    select s.* from public.fpl_player_snapshots s, latest l
    where s.snapshot_date = l.d and s.status is not null and s.status <> 'a'
  ),
  parsed as (
    select sn.*,
      case
        when sn.news ~* 'unknown return' then null
        else (
          select to_date(
            m[1] || ' ' || m[2] || ' ' ||
            case
              when to_number(to_char(to_date(m[2], 'Mon'), 'MM'), '99') < extract(month from current_date)
                then extract(year from current_date) + 1
              else extract(year from current_date)
            end::text,
            'DD Mon YYYY'
          )
          from regexp_match(sn.news, '(\d{1,2})\s+(\w{3})', 'i') as m
        )
      end as ret
    from snap sn
  )
  select
    p.fpl_player_id, p.web_name, p.slug, t.team_id, t.display_name,
    case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end,
    round(pa.now_cost / 10.0, 1),
    round(pa.selected_by_percent::numeric, 1),
    coalesce(pa.total_points, 0),
    pa.status,
    pa.chance_of_playing_next_round,
    nullif(pa.news, ''),
    pa.ret,
    case when pa.ret is null then null else (
      select count(*)::integer from public.fixtures f
      where f.season_id = p_season_id
        and (f.home_team_id = t.team_id or f.away_team_id = t.team_id)
        and f.status = 'scheduled'
        and f.kickoff_date >= current_date
        and f.kickoff_date < pa.ret
    ) end,
    (
      select min(f.kickoff_date) from public.fixtures f
      where f.season_id = p_season_id
        and (f.home_team_id = t.team_id or f.away_team_id = t.team_id)
        and f.status = 'scheduled'
        and f.kickoff_date >= current_date
    )
  from parsed pa
  join public.fpl_players p on p.fpl_player_id = pa.fpl_player_id
  left join public.teams t on t.team_id = p.canonical_team_id
  where p.web_name is not null
  order by coalesce(pa.total_points, 0) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_market_efficiency(p_bookmaker text DEFAULT 'Avg'::text, p_closing boolean DEFAULT true)
 RETURNS TABLE(league_code text, league_name text, market text, matches bigint, overround numeric, roi_favourite numeric, roi_outsider numeric, roi_home numeric, roi_draw numeric, roi_away numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with q as (
    select l.code, l.name, o.market,
      o.price_home, o.price_draw, o.price_away,
      m.full_time_result res
    from public.match_odds o
    join public.matches m on m.match_id = o.match_id
    join public.leagues l on l.league_id = m.league_id
    where o.market = '1x2'
      and o.bookmaker = p_bookmaker
      and o.is_closing = p_closing
      and o.price_home is not null and o.price_draw is not null and o.price_away is not null
      and m.full_time_result is not null
  ),
  tagged as (
    select *,
      -- Favourite/outsider by price, which is how the market itself
      -- ranks them -- not by home/away, which confounds the two.
      least(price_home, price_draw, price_away) as fav_price,
      greatest(price_home, price_draw, price_away) as dog_price,
      case
        when price_home <= price_draw and price_home <= price_away then 'H'
        when price_away <= price_home and price_away <= price_draw then 'A'
        else 'D'
      end as fav_outcome,
      case
        when price_home >= price_draw and price_home >= price_away then 'H'
        when price_away >= price_home and price_away >= price_draw then 'A'
        else 'D'
      end as dog_outcome
    from q
  )
  select code, name, market, count(*)::bigint,
    round(avg(1/price_home + 1/price_draw + 1/price_away)::numeric, 4),
    round(100 * (sum(case when res = fav_outcome then fav_price - 1 else -1 end) / count(*))::numeric, 2),
    round(100 * (sum(case when res = dog_outcome then dog_price - 1 else -1 end) / count(*))::numeric, 2),
    round(100 * (sum(case when res = 'H' then price_home - 1 else -1 end) / count(*))::numeric, 2),
    round(100 * (sum(case when res = 'D' then price_draw - 1 else -1 end) / count(*))::numeric, 2),
    round(100 * (sum(case when res = 'A' then price_away - 1 else -1 end) / count(*))::numeric, 2)
  from tagged
  group by code, name, market
  order by code;
$function$
;

CREATE OR REPLACE FUNCTION public.get_matchweek_head_to_head(p_league_id bigint, p_season_id bigint, p_matchweek integer DEFAULT NULL::integer)
 RETURNS TABLE(fixture_id bigint, meetings bigint, home_wins bigint, draws bigint, away_wins bigint, last_meeting_date date, last_home_goals integer, last_away_goals integer, last_home_was_fixture_home boolean)
 LANGUAGE sql
 STABLE
AS $function$
  with fx as (
    select f.fixture_id, f.home_team_id as fx_home, f.away_team_id as fx_away
    from public.fixtures f
    where f.league_id = p_league_id
      and f.season_id = p_season_id
      and (p_matchweek is null or f.matchweek = p_matchweek)
  ),
  met as (
    select fx.fixture_id, fx.fx_home, fx.fx_away,
      m.home_team_id as m_home, m.full_time_result as res,
      m.match_date, m.full_time_home_goals as hg, m.full_time_away_goals as ag
    from fx
    join public.matches m
      on (m.home_team_id = fx.fx_home and m.away_team_id = fx.fx_away)
      or (m.home_team_id = fx.fx_away and m.away_team_id = fx.fx_home)
    where m.full_time_result is not null
  ),
  agg as (
    select fixture_id,
      count(*)::bigint as meetings,
      count(*) filter (where (m_home = fx_home and res = 'H') or (m_home = fx_away and res = 'A'))::bigint as home_wins,
      count(*) filter (where res = 'D')::bigint as draws,
      count(*) filter (where (m_home = fx_away and res = 'H') or (m_home = fx_home and res = 'A'))::bigint as away_wins
    from met group by fixture_id
  ),
  latest as (
    select distinct on (fixture_id) fixture_id, match_date, hg, ag, (m_home = fx_home) as home_was_home
    from met order by fixture_id, match_date desc
  )
  select a.fixture_id, a.meetings, a.home_wins, a.draws, a.away_wins,
         l.match_date, l.hg, l.ag, l.home_was_home
  from agg a left join latest l on l.fixture_id = a.fixture_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_model_accuracy(p_league_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(fixture_id bigint, league_code text, kickoff_date date, home_team text, away_team text, p_home numeric, p_draw numeric, p_away numeric, picked text, actual text, correct boolean, p_actual numeric, brier numeric)
 LANGUAGE sql
 STABLE
AS $function$
  select
    f.fixture_id, l.code, f.kickoff_date,
    ht.display_name, at2.display_name,
    dm.home_win, dm.draw, dm.away_win,
    case when dm.home_win >= dm.draw and dm.home_win >= dm.away_win then 'H'
         when dm.draw    >= dm.away_win then 'D' else 'A' end,
    m.full_time_result,
    (case when dm.home_win >= dm.draw and dm.home_win >= dm.away_win then 'H'
          when dm.draw    >= dm.away_win then 'D' else 'A' end) = m.full_time_result,
    round(case m.full_time_result when 'H' then dm.home_win when 'D' then dm.draw else dm.away_win end, 2),
    round(
      power(dm.home_win/100 - (case when m.full_time_result='H' then 1 else 0 end), 2)
    + power(dm.draw    /100 - (case when m.full_time_result='D' then 1 else 0 end), 2)
    + power(dm.away_win/100 - (case when m.full_time_result='A' then 1 else 0 end), 2)
    , 4)
  from public.fixtures f
  join public.model_fit_runs r on r.fit_run_id = f.prediction_fit_run_id
  join public.leagues l on l.league_id = f.league_id
  join public.teams ht on ht.team_id = f.home_team_id
  join public.teams at2 on at2.team_id = f.away_team_id
  -- No FK between fixtures and matches; joined on the natural key, as
  -- documented in the project notes.
  join public.matches m on m.league_id = f.league_id and m.season_id = f.season_id
    and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
    and m.match_date = f.kickoff_date
  cross join lateral public.fixture_derived_markets(
    f.predicted_home_goals::numeric, f.predicted_away_goals::numeric, r.rho::numeric) dm
  where f.status = 'played'
    and f.predicted_home_goals is not null
    and r.rho is not null
    and m.full_time_result is not null
    and (p_league_id is null or f.league_id = p_league_id)
  order by f.kickoff_date desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_model_accuracy_summary(p_league_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(fixtures integer, correct integer, hit_rate numeric, always_home_hit_rate numeric, model_brier numeric, uniform_brier numeric, mean_p_actual numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with a as (select * from public.get_model_accuracy(p_league_id))
  select
    count(*)::int,
    count(*) filter (where correct)::int,
    round(100.0 * count(*) filter (where correct) / nullif(count(*),0), 1),
    -- Baseline 1: always pick the home team. Home advantage alone is a
    -- surprisingly strong predictor, so beating it is the real bar.
    round(100.0 * count(*) filter (where actual = 'H') / nullif(count(*),0), 1),
    round(avg(brier), 4),
    -- Baseline 2: a model that always says 33.3/33.3/33.3 scores 0.6667.
    0.6667,
    round(avg(p_actual), 1)
  from a;
$function$
;

CREATE OR REPLACE FUNCTION public.get_model_calibration(p_league_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(band text, forecasts integer, mean_predicted numeric, actual_rate numeric, gap numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with forecasts as (
    select unnest(array[a.p_home, a.p_draw, a.p_away]) as p,
           unnest(array[
             (a.actual = 'H')::int, (a.actual = 'D')::int, (a.actual = 'A')::int
           ]) as hit
    from public.get_model_accuracy(p_league_id) a
  ),
  banded as (
    select case
      when p < 10 then '0-10'   when p < 20 then '10-20'
      when p < 30 then '20-30'  when p < 40 then '30-40'
      when p < 50 then '40-50'  when p < 60 then '50-60'
      else '60+' end as band,
      p, hit
    from forecasts
  )
  select band, count(*)::int, round(avg(p),1), round(100.0*sum(hit)/count(*),1),
         round(100.0*sum(hit)/count(*) - avg(p), 1)
  from banded group by band
  order by case band when '0-10' then 1 when '10-20' then 2 when '20-30' then 3
                     when '30-40' then 4 when '40-50' then 5 when '50-60' then 6 else 7 end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_most_common_scoreline(p_league_id bigint)
 RETURNS TABLE(home_goals integer, away_goals integer, occurrences bigint, total_matches bigint)
 LANGUAGE sql
 STABLE
AS $function$
  with counts as (
    select full_time_home_goals, full_time_away_goals, count(*) as occurrences
    from public.matches
    where league_id = p_league_id
    group by full_time_home_goals, full_time_away_goals
  ), total as (
    select count(*) as total_matches from public.matches where league_id = p_league_id
  )
  select c.full_time_home_goals, c.full_time_away_goals, c.occurrences, t.total_matches
  from counts c, total t
  order by c.occurrences desc
  limit 4;
$function$
;

CREATE OR REPLACE FUNCTION public.get_overround_trend(p_bookmaker text DEFAULT 'Avg'::text)
 RETURNS TABLE(season_label text, league_code text, matches bigint, overround numeric)
 LANGUAGE sql
 STABLE
AS $function$
  select s.label, l.code, count(*)::bigint,
    round(avg(1/o.price_home + 1/o.price_draw + 1/o.price_away)::numeric, 4)
  from public.match_odds o
  join public.matches m on m.match_id = o.match_id
  join public.seasons s on s.season_id = m.season_id
  join public.leagues l on l.league_id = m.league_id
  where o.market = '1x2'
    and o.bookmaker = p_bookmaker
    and o.is_closing
    and o.price_home is not null and o.price_draw is not null and o.price_away is not null
  group by s.label, l.code
  -- A part-played season or a thin division reads as a spike otherwise.
  having count(*) >= 100
  order by s.label, l.code;
$function$
;

CREATE OR REPLACE FUNCTION public.get_player_by_slug(p_slug text)
 RETURNS TABLE(fpl_code bigint, slug text, canonical_name text, latest_web_name text, latest_team text, element_type integer, seasons_played bigint, career_points bigint, career_minutes bigint, first_season text, last_season text, current_slug text, current_fpl_player_id bigint, current_total_points integer, current_minutes integer, current_goals integer, current_assists integer, current_bonus integer, current_now_cost integer)
 LANGUAGE sql
 STABLE
AS $function$
  select i.fpl_code, i.slug, i.canonical_name,
    (array_agg(t.web_name order by t.season_id desc))[1],
    (array_agg(t.team_name order by t.season_id desc))[1],
    (array_agg(t.element_type order by t.season_id desc))[1],
    count(t.season_id)::bigint,
    coalesce(sum(t.total_points), 0)::bigint,
    coalesce(sum(t.minutes), 0)::bigint,
    fs.slug, ls.slug,
    cur.slug,
    cur.fpl_player_id::bigint,
    cur.total_points, cur.minutes, cur.goals_scored, cur.assists, cur.bonus, cur.now_cost
  from public.player_identity i
  left join public.fpl_player_season_totals t on t.fpl_code = i.fpl_code
  left join public.seasons fs on fs.season_id = i.first_seen_season_id
  left join public.seasons ls on ls.season_id = i.last_seen_season_id
  -- Current squad only. A player who has left has no row here, and every
  -- current_* column comes back null.
  left join public.fpl_players cur on cur.fpl_code = i.fpl_code and cur.season_id = 13
  where i.slug = p_slug
  group by i.fpl_code, i.slug, i.canonical_name, fs.slug, ls.slug,
    cur.slug, cur.fpl_player_id, cur.total_points, cur.minutes,
    cur.goals_scored, cur.assists, cur.bonus, cur.now_cost;
$function$
;

CREATE OR REPLACE FUNCTION public.get_player_career(p_fpl_code bigint)
 RETURNS TABLE(season_id bigint, season_slug text, web_name text, team_name text, element_type integer, start_cost integer, end_cost integer, total_points integer, minutes integer, goals_scored integer, assists integer, clean_sheets integer, bonus integer, points_per_start_million numeric, points_early integer, points_mid integer, points_late integer)
 LANGUAGE sql
 STABLE
AS $function$
  select t.season_id, s.slug, t.web_name, t.team_name, t.element_type,
    t.start_cost, t.end_cost, t.total_points, t.minutes,
    t.goals_scored, t.assists, t.clean_sheets, t.bonus,
    case when t.start_cost > 0
         then round((t.total_points / (t.start_cost / 10.0))::numeric, 2) end,
    h.early, h.mid, h.late
  from public.fpl_player_season_totals t
  join public.seasons s on s.season_id = t.season_id
  left join lateral (
    select sum(g.total_points) filter (where g.gameweek <= 13)::int early,
           sum(g.total_points) filter (where g.gameweek between 14 and 26)::int mid,
           sum(g.total_points) filter (where g.gameweek >= 27)::int late
    from public.fpl_player_gameweek_history g
    where g.season_id = t.season_id and g.fpl_code = t.fpl_code
  ) h on true
  where t.fpl_code = p_fpl_code
  order by t.season_id desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_player_gameweek_breakdown(p_fpl_player_id bigint, p_season_id bigint DEFAULT 13)
 RETURNS TABLE(gameweek integer, opponent text, was_home boolean, kickoff_date date, minutes integer, total_points integer, goals_scored integer, assists integer, clean_sheets integer, goals_conceded integer, bonus integer, bps integer, saves integer, yellow_cards integer, red_cards integer, own_goals integer, penalties_missed integer, penalties_saved integer, defensive_contribution integer, projected_points numeric)
 LANGUAGE sql
 STABLE
AS $function$
  select
    g.fpl_event_id::integer,
    opp.display_name,
    case when ff.fpl_home_team_id = p.fpl_team_id then true else false end,
    f.kickoff_date,
    g.minutes, g.total_points, g.goals_scored, g.assists, g.clean_sheets,
    g.goals_conceded, g.bonus, g.bps, g.saves, g.yellow_cards, g.red_cards,
    g.own_goals, g.penalties_missed, g.penalties_saved,
    coalesce((g.source_payload->'stats'->>'defensive_contribution')::int, 0),
    (
      select round(pr.expected_fpl_points::numeric, 1)
      from public.fpl_player_projections pr
      where pr.fixture_id = f.fixture_id
        and pr.fpl_player_id = g.fpl_player_id
        and pr.model_version = 'leaguewide_v6'
        and pr.generated_at < (f.kickoff_date::timestamp + coalesce(f.kickoff_time, '00:00:00'::time)::interval)
      order by pr.generated_at desc
      limit 1
    )
  from public.fpl_player_gameweeks g
  join public.fpl_players p
    on p.fpl_player_id = g.fpl_player_id and p.season_id = g.season_id
  join public.fpl_fixtures ff
    on ff.fpl_fixture_id = g.fpl_fixture_id and ff.season_id = g.season_id
  left join public.fixtures f on f.fixture_id = ff.canonical_fixture_id
  left join public.fpl_teams oppt
    on oppt.fpl_team_id = case when ff.fpl_home_team_id = p.fpl_team_id
                               then ff.fpl_away_team_id else ff.fpl_home_team_id end
   and oppt.season_id = g.season_id
  left join public.teams opp on opp.team_id = oppt.canonical_team_id
  where g.fpl_player_id = p_fpl_player_id and g.season_id = p_season_id
  order by g.fpl_event_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_player_season_gameweeks(p_fpl_code bigint, p_season_id bigint)
 RETURNS TABLE(gameweek integer, opponent text, was_home boolean, minutes integer, total_points integer, goals_scored integer, assists integer, clean_sheets integer, goals_conceded integer, bonus integer, saves integer, yellow_cards integer, red_cards integer, own_goals integer, penalties_missed integer, penalties_saved integer, defensive_contribution integer, price integer)
 LANGUAGE sql
 STABLE
AS $function$
  select
    g.fpl_event_id::integer, opp.display_name,
    case when ff.fpl_home_team_id = p.fpl_team_id then true else false end,
    g.minutes, g.total_points, g.goals_scored, g.assists, g.clean_sheets,
    g.goals_conceded, g.bonus, g.saves, g.yellow_cards, g.red_cards,
    g.own_goals, g.penalties_missed, g.penalties_saved,
    coalesce((g.source_payload->'stats'->>'defensive_contribution')::int, 0),
    null::int
  from public.fpl_players p
  join public.fpl_player_gameweeks g
    on g.fpl_player_id = p.fpl_player_id and g.season_id = p.season_id
  join public.fpl_fixtures ff
    on ff.fpl_fixture_id = g.fpl_fixture_id and ff.season_id = g.season_id
  left join public.fpl_teams oppt
    on oppt.fpl_team_id = case when ff.fpl_home_team_id = p.fpl_team_id
                               then ff.fpl_away_team_id else ff.fpl_home_team_id end
   and oppt.season_id = g.season_id
  left join public.teams opp on opp.team_id = oppt.canonical_team_id
  where p.fpl_code = p_fpl_code and p.season_id = p_season_id

  union all

  select
    h.gameweek, null::text, h.was_home,
    h.minutes, h.total_points, h.goals_scored, h.assists, h.clean_sheets,
    h.goals_conceded, h.bonus, h.saves, h.yellow_cards, h.red_cards,
    0, 0, 0, 0, h.value
  from public.fpl_player_gameweek_history h
  where h.fpl_code = p_fpl_code and h.season_id = p_season_id

  order by 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_player_seasons(p_fpl_code bigint)
 RETURNS TABLE(season_id bigint, season_slug text, total_points integer, is_current boolean)
 LANGUAGE sql
 STABLE
AS $function$
  select distinct on (x.season_id) x.season_id, s.slug, x.total_points, (x.season_id = 13)
  from (
    select t.season_id, t.total_points from public.fpl_player_season_totals t where t.fpl_code = p_fpl_code
    union all
    select p.season_id, p.total_points from public.fpl_players p
      where p.fpl_code = p_fpl_code and p.season_id = 13
  ) x
  join public.seasons s on s.season_id = x.season_id
  order by x.season_id desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_price_change_risk(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(fpl_player_id bigint, web_name text, slug text, team_name text, position_label text, price numeric, ownership numeric, transfers_in integer, transfers_out integer, net_transfers integer, pressure numeric, direction text)
 LANGUAGE sql
 STABLE
AS $function$
  with latest as (
    select max(snapshot_date) as d from public.fpl_player_snapshots
  ),
  snap as (
    select s.* from public.fpl_player_snapshots s
    join latest l on s.snapshot_date = l.d
  ),
  -- Total squads is unknown, so ownership share stands in for the owner
  -- base. Any constant scale factor cancels when players are compared
  -- with each other, which is all this ranking needs.
  calc as (
    select sn.*,
      coalesce(sn.transfers_in_event, 0) - coalesce(sn.transfers_out_event, 0) as net,
      greatest(sn.selected_by_percent::numeric, 0.1) as owned
    from snap sn
  )
  select
    p.fpl_player_id, p.web_name, p.slug, t.display_name,
    case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end,
    round(c.now_cost / 10.0, 1),
    round(c.selected_by_percent::numeric, 1),
    coalesce(c.transfers_in_event, 0),
    coalesce(c.transfers_out_event, 0),
    c.net::integer,
    round((c.net / c.owned / 1000.0)::numeric, 2),
    case when c.net > 0 then 'rise' when c.net < 0 then 'fall' else 'steady' end
  from calc c
  join public.fpl_players p on p.fpl_player_id = c.fpl_player_id
  left join public.teams t on t.team_id = p.canonical_team_id
  where p.web_name is not null and c.net <> 0
  order by abs(c.net / c.owned) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_read_audit()
 RETURNS TABLE(object_name text, object_kind text, rls_enabled boolean, has_select_policy boolean, anon_has_select_grant boolean, anon_can_read boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  perform public._require_admin();
  return query select * from public._get_public_read_audit_impl();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rolling_xi_candidates(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(fpl_code bigint, web_name text, team_name text, element_type integer, august_cost integer, now_cost integer, total_points integer, minutes integer)
 LANGUAGE sql
 STABLE
AS $function$
  select
    p.fpl_code, p.web_name, t.display_name, p.element_type,
    -- cost_change_start is the movement SINCE the season opened, so
    -- subtracting it recovers the opening price.
    (p.now_cost - coalesce((p.source_payload->>'cost_change_start')::int, 0)),
    p.now_cost, coalesce(p.total_points, 0), coalesce(p.minutes, 0)
  from public.fpl_players p
  left join public.teams t on t.team_id = p.canonical_team_id
  where p.season_id = p_season_id
    and p.now_cost is not null
    and p.element_type is not null
    -- A player who hasn't appeared can't be in a best XI, and including
    -- them only slows the solve.
    and coalesce(p.minutes, 0) > 0
  order by coalesce(p.total_points, 0) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_scout_vs_model()
 RETURNS TABLE(scored_fixtures bigint, scout_mae numeric, model_mae numeric, scout_better bigint, model_better bigint, ties bigint)
 LANGUAGE sql
 STABLE
AS $function$
  with played as (
    select f.fixture_id,
      f.predicted_home_goals ph, f.predicted_away_goals pa,
      f.raw_predicted_home_goals rh, f.raw_predicted_away_goals ra,
      m.full_time_home_goals gh, m.full_time_away_goals ga
    from public.fixtures f
    join public.matches m
      on m.league_id = f.league_id and m.season_id = f.season_id
     and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
     and m.match_date = f.kickoff_date
    where f.status = 'played'
      and f.predicted_home_goals is not null
      and f.raw_predicted_home_goals is not null
      and m.full_time_home_goals is not null
      -- Only where the adjustment bit.
      and (abs(f.raw_predicted_home_goals - f.predicted_home_goals) > 0.001
        or abs(f.raw_predicted_away_goals - f.predicted_away_goals) > 0.001)
  ),
  errs as (
    select
      (abs(ph - gh) + abs(pa - ga)) / 2 as scout_err,
      (abs(rh - gh) + abs(ra - ga)) / 2 as model_err
    from played
  )
  select
    count(*)::bigint,
    round(avg(scout_err)::numeric, 3),
    round(avg(model_err)::numeric, 3),
    count(*) filter (where scout_err < model_err)::bigint,
    count(*) filter (where model_err < scout_err)::bigint,
    count(*) filter (where abs(scout_err - model_err) < 1e-9)::bigint
  from errs;
$function$
;

CREATE OR REPLACE FUNCTION public.get_season_player_projections_json(p_matchweek integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
with target_fixtures as materialized (
  select fixture_id, matchweek, kickoff_date, home_team_id, away_team_id, predicted_home_goals, predicted_away_goals
  from public.fixtures
  where matchweek = p_matchweek and season_id = 13
    and predicted_home_goals is not null and predicted_away_goals is not null
),
alloc as materialized (
  select a.*
  from public.fpl_projection_leaguewide_allocation_v2 a
  join target_fixtures tf on tf.fixture_id = a.fixture_id
),
dc as materialized (
  select d.*
  from public.fpl_defensive_contribution_projection_leaguewide d
  join target_fixtures tf on tf.fixture_id = d.fixture_id
),
bonus as materialized (
  select b.*
  from public.fpl_fixture_bonus_projection_v3 b
  join target_fixtures tf on tf.fixture_id = b.fixture_id
)
select jsonb_agg(row_to_json(t)) from (
  select alloc.fixture_id, tf.matchweek, tf.kickoff_date, alloc.team_id, p.web_name, alloc.fpl_player_id,
    alloc.element_type as fpl_position, alloc.real_tactical_role as tactical_role, alloc.expected_minutes,
    alloc.prob_starting_xi as start_probability, alloc.prob_sub_appearance as sub_appearance_probability,
    alloc.shrunk_xg90, alloc.shrunk_xa90, alloc.expected_goals, alloc.expected_assists,
    exp(-(case when alloc.team_id = tf.home_team_id then tf.predicted_away_goals else tf.predicted_home_goals end))::numeric as clean_sheet_probability,
    coalesce(dc.defensive_contribution_probability, 0) as defensive_contribution_probability,
    coalesce(bonus.expected_bonus_points, 0) as experimental_expected_bonus
  from alloc
  join target_fixtures tf on tf.fixture_id = alloc.fixture_id
  join public.fpl_players p on p.fpl_player_id = alloc.fpl_player_id and p.season_id = 13
  left join dc on dc.fixture_id = alloc.fixture_id and dc.fpl_player_id = alloc.fpl_player_id
  left join bonus on bonus.fixture_id = alloc.fixture_id and bonus.fpl_player_id = alloc.fpl_player_id
) t;
$function$
;

CREATE OR REPLACE FUNCTION public.get_set_piece_index(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(team_id bigint, team_name text, player_name text, duties integer, index_score numeric, detail text)
 LANGUAGE sql
 STABLE
AS $function$
  with weights as (
    -- Per-taker value, from opta_slot_breakdown. A share of goals is
    -- worth more than the same share of assists (6 points vs 3 for a
    -- midfielder), so goals carry double.
    select
      (select sum(goals_from_penalties)::numeric / nullif(sum(goals), 0) from public.opta_slot_breakdown) * 2 as w_pen,
      (select sum(goals_from_direct_fk)::numeric / nullif(sum(goals), 0) from public.opta_slot_breakdown) * 2
        + (select sum(assist_free_kick)::numeric / nullif(sum(assists), 0) from public.opta_slot_breakdown) as w_fk,
      (select sum(goals_from_corners)::numeric / nullif(sum(goals), 0) from public.opta_slot_breakdown) * 2
        + (select sum(assist_corner)::numeric / nullif(sum(assists), 0) from public.opta_slot_breakdown) as w_corner
  ),
  scored as (
    select h.team_id, h.player_name,
      case h.set_piece_type
        when 'penalty' then w.w_pen
        when 'direct_free_kick' then w.w_fk
        when 'corner_left' then w.w_corner / 2      -- one side only
        when 'corner_right' then w.w_corner / 2
        else 0
      end
      -- Rank decay: a second-choice taker only takes them when the
      -- first isn't on the pitch. Steeper than linear because a
      -- third-choice penalty taker almost never takes one.
      * (1.0 / h.rank)
      as value,
      h.set_piece_type, h.rank
    from public.set_piece_hierarchies h
    cross join weights w
    where h.season_id = p_season_id
      and (h.valid_to is null or h.valid_to > now())
      and h.set_piece_type <> 'indirect_free_kick'
  )
  select s.team_id, t.display_name, s.player_name,
    count(*)::integer,
    round(sum(s.value) * 100, 1),
    string_agg(
      replace(replace(s.set_piece_type, '_', ' '), 'direct free kick', 'free kicks') || ' #' || s.rank,
      ', ' order by s.value desc
    )
  from scored s
  join public.teams t on t.team_id = s.team_id
  group by s.team_id, t.display_name, s.player_name
  having sum(s.value) > 0
  order by sum(s.value) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_set_piece_takers(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(team_id bigint, team_name text, team_slug text, set_piece_type text, player_name text, rank integer, confidence numeric, source_name text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  select
    t.team_id, t.display_name, t.slug,
    h.set_piece_type, h.player_name, h.rank, h.confidence, h.source_name, h.updated_at
  from public.set_piece_hierarchies h
  join public.teams t on t.team_id = h.team_id
  where h.season_id = p_season_id
    and (h.valid_to is null or h.valid_to > now())
  order by t.display_name, h.set_piece_type, h.rank;
$function$
;

CREATE OR REPLACE FUNCTION public.get_strictest_referees()
 RETURNS TABLE(referee text, red_cards bigint, matches bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select m.referee, sum(m.home_red_cards + m.away_red_cards)::bigint, count(*)::bigint
  from public.matches m
  where m.referee is not null and m.home_red_cards is not null
  group by m.referee
  having count(*) >= 50
  order by 2 desc
  limit 4;
$function$
;

CREATE OR REPLACE FUNCTION public.get_tactical_role_worklist(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(team_id bigint, team_name text, fpl_player_id bigint, web_name text, slug text, position_label text, assigned_role text, confidence numeric, minutes integer, ownership numeric, total_points integer, priority text)
 LANGUAGE sql
 STABLE
AS $function$
  with mins as (
    select g.fpl_player_id, sum(g.minutes)::integer as m, sum(g.total_points)::integer as pts
    from public.fpl_player_gameweeks g
    where g.season_id = p_season_id
    group by g.fpl_player_id
  ),
  latest_snap as (
    select distinct on (s.fpl_player_id) s.fpl_player_id, s.selected_by_percent
    from public.fpl_player_snapshots s
    order by s.fpl_player_id, s.snapshot_date desc
  )
  select
    d.team_id, t.display_name, d.fpl_player_id, p.web_name, p.slug,
    case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end,
    d.tactical_role, d.confidence,
    coalesce(m.m, 0), round(coalesce(ls.selected_by_percent, 0)::numeric, 1), coalesce(m.pts, 0),
    case
      when coalesce(m.m, 0) >= 270 then 'starter'
      when coalesce(m.m, 0) >= 90 then 'rotation'
      else 'fringe'
    end
  from public.team_player_tactical_defaults d
  join public.fpl_players p on p.fpl_player_id = d.fpl_player_id
  left join public.teams t on t.team_id = d.team_id
  left join mins m on m.fpl_player_id = d.fpl_player_id
  left join latest_snap ls on ls.fpl_player_id = d.fpl_player_id
  where d.season_id = p_season_id
    and d.source_name = 'fpl_position_fallback'
    -- A keeper's position IS their role.
    and p.element_type <> 1
  order by coalesce(m.m, 0) desc, coalesce(ls.selected_by_percent, 0) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_of_the_week(p_event_id integer DEFAULT NULL::integer, p_season_id bigint DEFAULT 13)
 RETURNS TABLE(fpl_event_id integer, fpl_player_id bigint, web_name text, slug text, team_name text, position_label text, points integer, minutes integer, is_mandatory boolean, goals integer, assists integer, clean_sheets integer, bonus integer)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_event integer;
  v_historic boolean;
  excluded_ids bigint[] := '{}';
  offender bigint;
  guard int := 0;
begin
  select exists (select 1 from public.fpl_player_gameweek_history h where h.season_id = p_season_id)
    into v_historic;

  if v_historic then
    select coalesce(p_event_id, (
      select max(h.gameweek) from public.fpl_player_gameweek_history h where h.season_id = p_season_id
    )) into v_event;
  else
    select coalesce(p_event_id, (
      select max(f.fpl_event_id) from public.fpl_fixtures f
      where f.season_id = p_season_id
      group by f.fpl_event_id having bool_and(f.finished)
      order by max(f.fpl_event_id) desc limit 1
    )) into v_event;
  end if;

  if v_event is null then return; end if;

  loop
    guard := guard + 1;
    select k.pid into offender
    from (
      with src as (
        select h.fpl_code as pid, sum(h.total_points)::int pts, sum(h.minutes)::int mins,
               t.team_name tname, t.element_type
        from public.fpl_player_gameweek_history h
        join public.fpl_player_season_totals t on t.season_id = h.season_id and t.fpl_code = h.fpl_code
        where v_historic and h.season_id = p_season_id and h.gameweek = v_event
        group by h.fpl_code, t.team_name, t.element_type
        union all
        select g.fpl_player_id::bigint, g.total_points, g.minutes, tm.display_name, p.element_type
        from public.fpl_player_gameweeks g
        join public.fpl_players p on p.fpl_player_id = g.fpl_player_id
        left join public.teams tm on tm.team_id = p.canonical_team_id
        where not v_historic and g.season_id = p_season_id and g.fpl_event_id = v_event
          and g.total_points is not null
      ),
      ranked as (
        select *, row_number() over (partition by element_type order by pts desc, mins desc) rn
        from src where not (pid = any(excluded_ids))
      ),
      picked as (
        select * from ranked
        where (element_type=1 and rn<=1) or (element_type=2 and rn<=3)
           or (element_type=3 and rn<=3) or (element_type=4 and rn<=1)
        union all
        select * from (
          select * from ranked
          where (element_type=2 and rn between 4 and 5) or (element_type=3 and rn between 4 and 5)
             or (element_type=4 and rn between 2 and 3)
          order by pts desc, mins desc limit 3
        ) f
      )
      select pk.pid, pk.pts, pk.mins, count(*) over (partition by pk.tname) per_club from picked pk
    ) k
    where k.per_club > 3
    order by k.pts asc, k.mins asc limit 1;

    exit when offender is null or guard > 8;
    excluded_ids := excluded_ids || offender;
    offender := null;
  end loop;

  return query
  with src as (
    select h.fpl_code pid, sum(h.total_points)::int pts, sum(h.minutes)::int mins,
           sum(h.goals_scored)::int gls, sum(h.assists)::int ast,
           sum(h.clean_sheets)::int cs, sum(h.bonus)::int bns,
           t.web_name wn, null::text sl, t.team_name tname, t.element_type
    from public.fpl_player_gameweek_history h
    join public.fpl_player_season_totals t on t.season_id = h.season_id and t.fpl_code = h.fpl_code
    where v_historic and h.season_id = p_season_id and h.gameweek = v_event
    group by h.fpl_code, t.web_name, t.team_name, t.element_type
    union all
    select g.fpl_player_id::bigint, g.total_points, g.minutes,
           coalesce(g.goals_scored,0), coalesce(g.assists,0),
           coalesce(g.clean_sheets,0), coalesce(g.bonus,0),
           p.web_name, p.slug, tm.display_name, p.element_type
    from public.fpl_player_gameweeks g
    join public.fpl_players p on p.fpl_player_id = g.fpl_player_id
    left join public.teams tm on tm.team_id = p.canonical_team_id
    where not v_historic and g.season_id = p_season_id and g.fpl_event_id = v_event
      and g.total_points is not null
  ),
  ranked as (
    select *, row_number() over (partition by element_type order by pts desc, mins desc) rn
    from src where not (pid = any(excluded_ids))
  ),
  picked as (
    select *, true mand from ranked
    where (element_type=1 and rn<=1) or (element_type=2 and rn<=3)
       or (element_type=3 and rn<=3) or (element_type=4 and rn<=1)
    union all
    select * from (
      select *, false from ranked
      where (element_type=2 and rn between 4 and 5) or (element_type=3 and rn between 4 and 5)
         or (element_type=4 and rn between 2 and 3)
      order by pts desc, mins desc limit 3
    ) f
  )
  select v_event, k.pid, k.wn, k.sl, k.tname,
         case k.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' end,
         k.pts, k.mins, k.mand, k.gls, k.ast, k.cs, k.bns
  from picked k order by k.element_type, k.pts desc;
end $function$
;

CREATE OR REPLACE FUNCTION public.get_top_actual_fpl_scorer(p_season_id bigint)
 RETURNS TABLE(web_name text, total_points bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select fp.web_name, sum(g.total_points) as total_points
  from public.fpl_player_gameweeks g
  join public.fpl_players fp on fp.fpl_player_id = g.fpl_player_id and fp.season_id = p_season_id
  where g.season_id = p_season_id
  group by fp.web_name
  order by total_points desc
  limit 4;
$function$
;

CREATE OR REPLACE FUNCTION public.get_totw_vs_model(p_event_id integer DEFAULT NULL::integer, p_season_id bigint DEFAULT 13)
 RETURNS TABLE(fpl_event_id integer, actual_xi_points integer, model_xi_actual_points integer, overlap_count integer, model_xi_projected numeric, overlap_names text[])
 LANGUAGE sql
 STABLE
AS $function$
  with totw as (
    select * from public.get_team_of_the_week(p_event_id, p_season_id)
  ),
  ev as (select coalesce(p_event_id, (select max(fpl_event_id) from totw)) as e),
  -- The model's preferred XI for the same gameweek, by projected points,
  -- under the same formation minimums.
  proj as (
    select pr.fpl_player_id, p.element_type,
      sum(pr.expected_fpl_points) as proj_pts,
      row_number() over (
        partition by p.element_type order by sum(pr.expected_fpl_points) desc
      ) as rn
    from public.fpl_player_projections pr
    join public.fixtures f on f.fixture_id = pr.fixture_id
    join public.fpl_players p on p.fpl_player_id = pr.fpl_player_id
    join ev on f.matchweek = ev.e
    where pr.model_version = 'leaguewide_v6' and pr.scenario_key = 'baseline'
      and f.season_id = p_season_id
    group by pr.fpl_player_id, p.element_type
  ),
  model_xi as (
    select * from (
      select *, true as mand from proj
      where (element_type=1 and rn<=1) or (element_type=2 and rn<=3)
         or (element_type=3 and rn<=3) or (element_type=4 and rn<=1)
      union all
      select * from (
        select *, false from proj
        where (element_type=2 and rn between 4 and 5) or (element_type=3 and rn between 4 and 5)
           or (element_type=4 and rn between 2 and 3)
        order by proj_pts desc limit 3
      ) f2
    ) m
  ),
  model_actual as (
    select mx.fpl_player_id, coalesce(g.total_points, 0) as pts, mx.proj_pts
    from model_xi mx
    left join public.fpl_player_gameweeks g
      on g.fpl_player_id = mx.fpl_player_id and g.season_id = p_season_id
     and g.fpl_event_id = (select e from ev)
  )
  select
    (select e from ev)::integer,
    (select sum(points)::integer from totw),
    (select sum(pts)::integer from model_actual),
    (select count(*)::integer from totw t where t.fpl_player_id in (select fpl_player_id from model_xi)),
    (select round(sum(proj_pts)::numeric, 1) from model_actual),
    (select array_agg(t.web_name order by t.points desc) from totw t where t.fpl_player_id in (select fpl_player_id from model_xi));
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_is_admin boolean;
begin
  -- Case-insensitive: email providers treat the local part as
  -- case-insensitive in practice, and a capitalised sign-in silently
  -- failing to match would be a confusing way to lose admin.
  select exists (
    select 1 from public.admin_bootstrap_emails
    where lower(email) = lower(new.email)
  ) into v_is_admin;

  insert into public.app_users (user_id, email, is_admin)
  values (new.id, new.email, coalesce(v_is_admin, false))
  on conflict (user_id) do update
    set email = excluded.email,
        is_admin = public.app_users.is_admin or excluded.is_admin;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.import_fpl_gameweeks(p_season_id bigint, p_folder text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  raw_content text;
  header text[];
  http_status int;
  n_total int;
  n_bad int;
  n_rows int;
  n_unmatched int;
begin
  if not exists (select 1 from public.fpl_player_season_totals where season_id = p_season_id) then
    raise exception 'Season % has no player totals; import those first so elements can resolve to codes', p_season_id;
  end if;

  drop table if exists gw_lines;
  drop table if exists gw_staged;

  select status, content into http_status, raw_content
  from extensions.http_get('https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/' || p_folder || '/gws/merged_gw.csv');
  if http_status <> 200 then
    raise exception 'Fetch failed for %/gws/merged_gw.csv (HTTP %)', p_folder, http_status;
  end if;

  create temp table gw_lines as
  select row_number() over () as ln, replace(l, E'\r', '') as l
  from (select unnest(string_to_array(raw_content, E'\n')) as l) s
  where length(trim(l)) > 0;

  select string_to_array(l, ',') into header from gw_lines where ln = 1;

  if array_position(header,'element') is null or array_position(header,'round') is null
     or array_position(header,'fixture') is null or array_position(header,'total_points') is null then
    raise exception 'Required columns missing from %/gws header', p_folder;
  end if;

  select count(*) into n_total from gw_lines where ln > 1;
  select count(*) into n_bad from gw_lines
  where ln > 1 and (array_length(string_to_array(l, ','), 1) <> array_length(header, 1) or l like '%"%');

  if n_bad > greatest(5, n_total / 100) then
    raise exception '%/gws has % malformed row(s) of % -- format change, not a quirk; aborting', p_folder, n_bad, n_total;
  end if;

  create temp table gw_staged as
  select string_to_array(l, ',') as f from gw_lines
  where ln > 1
    and array_length(string_to_array(l, ','), 1) = array_length(header, 1)
    and l not like '%"%';

  insert into public.fpl_player_gameweek_history (
    season_id, fpl_code, gameweek, fixture_id, opponent_team_num, was_home, minutes,
    total_points, starts, goals_scored, assists, clean_sheets, goals_conceded, bonus, bps,
    saves, yellow_cards, red_cards, value, selected, transfers_in, transfers_out,
    expected_goals, expected_assists
  )
  select p_season_id, tot.fpl_code,
    (f[array_position(header,'round')])::int,
    (f[array_position(header,'fixture')])::int,
    nullif(f[array_position(header,'opponent_team')],'')::int,
    lower(f[array_position(header,'was_home')]) = 'true',
    (f[array_position(header,'minutes')])::int,
    (f[array_position(header,'total_points')])::int,
    coalesce(nullif(f[array_position(header,'starts')],'')::int, 0),
    (f[array_position(header,'goals_scored')])::int,
    (f[array_position(header,'assists')])::int,
    (f[array_position(header,'clean_sheets')])::int,
    (f[array_position(header,'goals_conceded')])::int,
    (f[array_position(header,'bonus')])::int,
    (f[array_position(header,'bps')])::int,
    (f[array_position(header,'saves')])::int,
    (f[array_position(header,'yellow_cards')])::int,
    (f[array_position(header,'red_cards')])::int,
    nullif(f[array_position(header,'value')],'')::int,
    nullif(f[array_position(header,'selected')],'')::bigint,
    nullif(f[array_position(header,'transfers_in')],'')::bigint,
    nullif(f[array_position(header,'transfers_out')],'')::bigint,
    nullif(f[array_position(header,'expected_goals')],'')::numeric,
    nullif(f[array_position(header,'expected_assists')],'')::numeric
  from gw_staged g
  join public.fpl_player_season_totals tot
    on tot.season_id = p_season_id
   and tot.fpl_element_id = (g.f[array_position(header,'element')])::int
  on conflict (season_id, fpl_code, gameweek, fixture_id) do nothing;

  get diagnostics n_rows = row_count;

  select count(*) into n_unmatched
  from gw_staged g
  where not exists (
    select 1 from public.fpl_player_season_totals tot
    where tot.season_id = p_season_id
      and tot.fpl_element_id = (g.f[array_position(header,'element')])::int
  );

  drop table if exists gw_lines;
  drop table if exists gw_staged;

  return jsonb_build_object(
    'season_id', p_season_id, 'folder', p_folder,
    'rows_imported', n_rows, 'rows_skipped_malformed', n_bad,
    'rows_unmatched_element', n_unmatched
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.import_fpl_season(p_season_id bigint, p_folder text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  raw_content text;
  header text[];
  n_bad int;
  n_total int;
  n_rows int;
  http_status int;
begin
  drop table if exists lines_t;
  drop table if exists staged_t;

  select status, content into http_status, raw_content
  from extensions.http_get('https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/' || p_folder || '/players_raw.csv');

  if http_status <> 200 then
    raise exception 'Fetch failed for % (HTTP %)', p_folder, http_status;
  end if;

  create temp table lines_t as
  select row_number() over () as ln, replace(l, E'\r', '') as l
  from (select unnest(string_to_array(raw_content, E'\n')) as l) s
  where length(trim(l)) > 0;

  select string_to_array(l, ',') into header from lines_t where ln = 1;

  if array_position(header,'code') is null or array_position(header,'cost_change_start') is null
     or array_position(header,'now_cost') is null or array_position(header,'total_points') is null then
    raise exception 'Required columns missing from % header', p_folder;
  end if;

  select count(*) into n_total from lines_t where ln > 1;
  select count(*) into n_bad from lines_t
  where ln > 1 and (array_length(string_to_array(l, ','), 1) <> array_length(header, 1) or l like '%"%');

  if n_bad > greatest(5, n_total / 100) then
    raise exception '% has % malformed row(s) of % -- that is a format change, not a quirk; aborting',
      p_folder, n_bad, n_total;
  end if;

  create temp table staged_t as
  select string_to_array(l, ',') as f from lines_t
  where ln > 1
    and array_length(string_to_array(l, ','), 1) = array_length(header, 1)
    and l not like '%"%';

  insert into public.fpl_player_season_totals (
    season_id, fpl_code, fpl_element_id, web_name, full_name, element_type,
    start_cost, end_cost, total_points, minutes, goals_scored, assists, clean_sheets,
    goals_conceded, bonus, bps, saves, yellow_cards, red_cards, penalties_missed,
    penalties_saved, own_goals, selected_by_percent
  )
  select p_season_id,
    (f[array_position(header,'code')])::bigint,
    (f[array_position(header,'id')])::int,
    f[array_position(header,'web_name')],
    trim(f[array_position(header,'first_name')] || ' ' || f[array_position(header,'second_name')]),
    (f[array_position(header,'element_type')])::int,
    (f[array_position(header,'now_cost')])::int - (f[array_position(header,'cost_change_start')])::int,
    (f[array_position(header,'now_cost')])::int,
    (f[array_position(header,'total_points')])::int,
    (f[array_position(header,'minutes')])::int,
    (f[array_position(header,'goals_scored')])::int,
    (f[array_position(header,'assists')])::int,
    (f[array_position(header,'clean_sheets')])::int,
    (f[array_position(header,'goals_conceded')])::int,
    (f[array_position(header,'bonus')])::int,
    (f[array_position(header,'bps')])::int,
    (f[array_position(header,'saves')])::int,
    (f[array_position(header,'yellow_cards')])::int,
    (f[array_position(header,'red_cards')])::int,
    (f[array_position(header,'penalties_missed')])::int,
    (f[array_position(header,'penalties_saved')])::int,
    (f[array_position(header,'own_goals')])::int,
    nullif(f[array_position(header,'selected_by_percent')], '')::numeric
  from staged_t
  where (f[array_position(header,'minutes')])::int > 0
  on conflict (season_id, fpl_code) do nothing;

  get diagnostics n_rows = row_count;

  insert into public.player_identity (fpl_code, canonical_name, first_seen_season_id, last_seen_season_id)
  select t.fpl_code, t.full_name, p_season_id, p_season_id
  from public.fpl_player_season_totals t
  where t.season_id = p_season_id
  on conflict (fpl_code) do update set
    first_seen_season_id = least(public.player_identity.first_seen_season_id, excluded.first_seen_season_id),
    last_seen_season_id = greatest(public.player_identity.last_seen_season_id, excluded.last_seen_season_id),
    updated_at = now();

  drop table if exists lines_t;
  drop table if exists staged_t;

  return jsonb_build_object(
    'season_id', p_season_id, 'folder', p_folder,
    'players_imported', n_rows, 'rows_skipped_malformed', n_bad
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select exists (
    select 1 from public.app_users
    where user_id = auth.uid() and is_admin
  );
$function$
;

CREATE OR REPLACE FUNCTION public.list_scout_players(p_season_id bigint DEFAULT 13, p_position integer DEFAULT NULL::integer, p_team_id bigint DEFAULT NULL::bigint, p_min_minutes integer DEFAULT 0, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 100)
 RETURNS TABLE(fpl_code bigint, slug text, fpl_player_id bigint, web_name text, full_name text, team_name text, team_id bigint, element_type integer, now_cost integer, total_points integer, minutes integer, goals_scored integer, assists integer, clean_sheets integer, bonus integer, selected_by_percent numeric, points_per_million numeric, seasons_played bigint, price_pressure numeric, price_direction text)
 LANGUAGE sql
 STABLE
AS $function$
  with pressure as (
    select r.fpl_player_id, r.pressure, r.direction
    from public.get_price_change_risk(p_season_id) r
  )
  select
    p.fpl_code, i.slug, p.fpl_player_id::bigint, p.web_name,
    trim(coalesce(p.first_name,'') || ' ' || coalesce(p.second_name,'')),
    t.display_name, p.canonical_team_id::bigint, p.element_type,
    p.now_cost, p.total_points, p.minutes, p.goals_scored, p.assists,
    p.clean_sheets, p.bonus, p.selected_by_percent,
    case when p.now_cost > 0
         then round((p.total_points / (p.now_cost / 10.0))::numeric, 2) end,
    (select count(*) from public.fpl_player_season_totals st where st.fpl_code = p.fpl_code),
    round(abs(pr.pressure)::numeric, 1), pr.direction
  from public.fpl_players p
  left join public.teams t on t.team_id = p.canonical_team_id
  left join public.player_identity i on i.fpl_code = p.fpl_code
  left join pressure pr on pr.fpl_player_id = p.fpl_player_id
  where p.season_id = p_season_id
    and (p_position is null or p.element_type = p_position)
    and (p_team_id is null or p.canonical_team_id = p_team_id)
    and coalesce(p.minutes, 0) >= coalesce(p_min_minutes, 0)
    and (
      p_search is null or length(trim(p_search)) = 0
      or p.web_name ilike '%' || trim(p_search) || '%'
      or trim(coalesce(p.first_name,'') || ' ' || coalesce(p.second_name,'')) ilike '%' || trim(p_search) || '%'
    )
  order by p.total_points desc nulls last, p.minutes desc nulls last
  limit greatest(1, least(p_limit, 700));
$function$
;

CREATE OR REPLACE FUNCTION public.list_scout_teams(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(team_id bigint, team_name text, players integer)
 LANGUAGE sql
 STABLE
AS $function$
  select t.team_id::bigint, t.display_name, count(*)::int
  from public.fpl_players p
  join public.teams t on t.team_id = p.canonical_team_id
  where p.season_id = p_season_id
  group by t.team_id, t.display_name
  order by t.display_name;
$function$
;

CREATE OR REPLACE FUNCTION public.list_scoutable_players()
 RETURNS TABLE(slug text, canonical_name text, career_points bigint, seasons_played bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select i.slug, i.canonical_name,
    sum(t.total_points)::bigint, count(*)::bigint
  from public.player_identity i
  join public.fpl_player_season_totals t on t.fpl_code = i.fpl_code
  group by i.slug, i.canonical_name
  having sum(t.minutes) > 0
  order by sum(t.total_points) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.record_team_slug_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.slug is distinct from new.slug then
    insert into public.team_slug_history (team_id, old_slug) values (old.team_id, old.slug);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_fixture_feeds()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
declare v_run_id bigint; v_code text; v_url text; v_league_id bigint; v_season_id bigint; v_body text; v_json jsonb; v_seen int:=0; v_updated int:=0; v_count int; v_http_status int; v_predictions int;
begin
 insert into public.fixture_refresh_runs(competitions) values(array['E0','E1','E2','E3','UCL','UEL','UECL']) returning refresh_run_id into v_run_id;
 select season_id into v_season_id from public.seasons where label='2627' limit 1;
 for v_code,v_url in select * from (values
 ('E0','https://fixturedownload.com/feed/json/epl-2026'),('E1','https://fixturedownload.com/feed/json/championship-2026'),('E2','https://fixturedownload.com/feed/json/efl-league-one-2026'),('E3','https://fixturedownload.com/feed/json/efl-league-two-2026'),('UCL','https://fixturedownload.com/feed/json/champions-league-2026'),('UEL','https://fixturedownload.com/feed/json/europa-league-2026'),('UECL','https://fixturedownload.com/feed/json/conference-league-2026')) x(code,url)
 loop
  select league_id into v_league_id from public.leagues where code=v_code limit 1; if v_league_id is null then continue; end if;
  select status,content into v_http_status,v_body from extensions.http_get(v_url);
  if v_http_status<>200 then raise exception 'Feed % returned HTTP %',v_code,v_http_status; end if;
  v_json:=v_body::jsonb; v_count:=jsonb_array_length(v_json); v_seen:=v_seen+v_count;
  with src as (select elem->>'HomeTeam' home_raw,elem->>'AwayTeam' away_raw,(elem->>'DateUtc')::timestamptz ko,nullif(regexp_replace(coalesce(elem->>'RoundNumber',''),'[^0-9]','','g'),'')::int round_no from jsonb_array_elements(v_json) elem where elem ? 'DateUtc'),
  mapped as (select s.*,coalesce(ha.team_id,ht.team_id) home_id,coalesce(aa.team_id,at.team_id) away_id from src s left join public.team_aliases ha on ha.source_name='FixtureDownload' and ha.raw_name=s.home_raw left join public.teams ht on ht.canonical_name=s.home_raw left join public.team_aliases aa on aa.source_name='FixtureDownload' and aa.raw_name=s.away_raw left join public.teams at on at.canonical_name=s.away_raw),
  pending_changes as (
    select f.fixture_id, f.kickoff_date as old_date, (m.ko at time zone 'Europe/London')::date as new_date,
           f.kickoff_time as old_time, (m.ko at time zone 'Europe/London')::time as new_time
    from mapped m
    join public.fixtures f on f.league_id=v_league_id and f.season_id=v_season_id and f.home_team_id=m.home_id and f.away_team_id=m.away_id
    where m.ko is not null and m.home_id is not null and m.away_id is not null
      and (f.kickoff_date <> (m.ko at time zone 'Europe/London')::date or f.kickoff_time is distinct from (m.ko at time zone 'Europe/London')::time)
  )
  insert into public.fixture_changes(fixture_id, old_kickoff_date, new_kickoff_date, old_kickoff_time, new_kickoff_time)
  select fixture_id, old_date, new_date, old_time, new_time from pending_changes;

  with src as (select elem->>'HomeTeam' home_raw,elem->>'AwayTeam' away_raw,(elem->>'DateUtc')::timestamptz ko,nullif(regexp_replace(coalesce(elem->>'RoundNumber',''),'[^0-9]','','g'),'')::int round_no from jsonb_array_elements(v_json) elem where elem ? 'DateUtc'),
  mapped as (select s.*,coalesce(ha.team_id,ht.team_id) home_id,coalesce(aa.team_id,at.team_id) away_id from src s left join public.team_aliases ha on ha.source_name='FixtureDownload' and ha.raw_name=s.home_raw left join public.teams ht on ht.canonical_name=s.home_raw left join public.team_aliases aa on aa.source_name='FixtureDownload' and aa.raw_name=s.away_raw left join public.teams at on at.canonical_name=s.away_raw)
  update public.fixtures f set kickoff_date=(m.ko at time zone 'Europe/London')::date,kickoff_time=(m.ko at time zone 'Europe/London')::time,matchweek=coalesce(m.round_no,f.matchweek),status=case when m.ko<now() then 'played' else 'scheduled' end,source_name='FixtureDownload',source_file=v_url,updated_at=now() from mapped m where m.ko is not null and m.home_id is not null and m.away_id is not null and f.league_id=v_league_id and f.season_id=v_season_id and f.home_team_id=m.home_id and f.away_team_id=m.away_id;
  get diagnostics v_count=row_count; v_updated:=v_updated+v_count;
 end loop;
 select public.backfill_fixture_predictions() into v_predictions;
 update public.fixture_refresh_runs set finished_at=now(),rows_seen=v_seen,rows_updated=v_updated,status='success' where refresh_run_id=v_run_id;
exception when others then update public.fixture_refresh_runs set finished_at=now(),rows_seen=v_seen,rows_updated=v_updated,status='failed',error_message=sqlerrm where refresh_run_id=v_run_id; raise;
end;$function$
;

CREATE OR REPLACE FUNCTION public.refresh_fpl()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
  -- Wrapper only. The body lives in private.refresh_fpl(), which is what
  -- pg_cron runs. Two independent copies diverged silently once and took
  -- the pipeline down for half a day; never let that happen again.
  select private.refresh_fpl();
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_fpl_bonus_v3_for_fixture(p_fixture_id bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count integer;
begin
with hist as (
 select p.fpl_player_id,p.element_type,coalesce(sum(g.minutes),0)::numeric mins,coalesce(sum(g.bps),0)::numeric bps
 from fpl_players p left join fpl_player_gameweeks g on g.season_id=13 and g.fpl_player_id=p.fpl_player_id where p.season_id=13 group by p.fpl_player_id,p.element_type
), base as (
 select a.fixture_id,a.team_id,a.fpl_player_id,a.element_type,a.expected_minutes,a.expected_goals,a.expected_assists,
 exp(-case when a.team_id=f.home_team_id then f.predicted_away_goals else f.predicted_home_goals end)::numeric cs,
 coalesce(d.defensive_contribution_probability,0::numeric) dc,h.mins,h.bps,
 case a.element_type when 1 then 15.88 when 2 then 19.27 when 3 then 27.39 when 4 then 33.24 else 20 end::numeric prior
 from fpl_projection_leaguewide_allocation_v2 a join fixtures f on f.fixture_id=a.fixture_id join hist h on h.fpl_player_id=a.fpl_player_id
 left join fpl_defensive_contribution_projection_leaguewide d on d.fixture_id=a.fixture_id and d.fpl_player_id=a.fpl_player_id
 where a.fixture_id=p_fixture_id
), score as (
 select *, (bps+prior*5)/(mins+450)*expected_minutes + expected_goals*(case element_type when 1 then 12 when 2 then 12 when 3 then 18 when 4 then 24 else 18 end) + expected_assists*9 + cs*least(1,expected_minutes/60)*(case when element_type in(1,2) then 6 else 0 end) + dc*2 expected_bps_score from base
), weights as (
 select fixture_id,fpl_player_id,exp(least(50::numeric,expected_bps_score/12::numeric)) w from score
), totals as (select sum(w) s from weights),
p1 as (select i.fpl_player_id,i.w/t.s p1 from weights i cross join totals t),
p2 as (select i.fpl_player_id,sum((j.w/t.s)*(i.w/nullif(t.s-j.w,0))) p2 from weights i join weights j on j.fpl_player_id<>i.fpl_player_id cross join totals t group by i.fpl_player_id),
p3 as (select i.fpl_player_id,sum((j.w/t.s)*(k.w/nullif(t.s-j.w,0))*(i.w/nullif(t.s-j.w-k.w,0))) p3 from weights i join weights j on j.fpl_player_id<>i.fpl_player_id join weights k on k.fpl_player_id<>i.fpl_player_id and k.fpl_player_id<>j.fpl_player_id cross join totals t group by i.fpl_player_id),
bonus as (select w.fixture_id,w.fpl_player_id,round((3*p1.p1+2*p2.p2+p3.p3)::numeric,8) bonus from weights w join p1 using(fpl_player_id) join p2 using(fpl_player_id) join p3 using(fpl_player_id))
update fpl_player_projections pr set expected_bonus=b.bonus,xpts_bonus=b.bonus,expected_fpl_points=pr.expected_fpl_points-pr.xpts_bonus+b.bonus,generated_at=now() from bonus b where pr.fixture_id=p_fixture_id and pr.fixture_id=b.fixture_id and pr.fpl_player_id=b.fpl_player_id and pr.model_version='leaguewide_v6' and pr.scenario_key='baseline';
get diagnostics v_count=row_count; return v_count;
end $function$
;

CREATE OR REPLACE FUNCTION public.refresh_fpl_projection_fixture_v6(p_fixture_id bigint, p_allow_played boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  v_status text;
  v_rows integer;
begin
  if not p_allow_played then
    select status into v_status from public.fixtures where fixture_id = p_fixture_id;
    if v_status = 'played' then
      -- Nothing written, and deliberately not an error: the routine
      -- pipeline sweeps a matchweek range that may include just-played
      -- fixtures, and that is normal, not a failure.
      return 0;
    end if;
  end if;

  select public.refresh_fpl_projection_fixture_v6_impl(p_fixture_id) into v_rows;
  return v_rows;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_fpl_projection_fixture_v6_impl(p_fixture_id bigint)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  v_count integer;
  v_has_mc boolean;
begin
  select exists(select 1 from public.fpl_fixture_bonus_montecarlo_v1 where fixture_id = p_fixture_id) into v_has_mc;

  if v_has_mc then
    insert into public.fpl_player_projections(season_id,fixture_id,fpl_player_id,generated_at,model_version,expected_minutes,expected_goals,expected_assists,clean_sheet_probability,expected_saves,defensive_contribution_probability,expected_bonus,xpts_appearance,xpts_goals,xpts_assists,xpts_clean_sheet,xpts_saves,xpts_defensive_contribution,xpts_cards_own_goals,xpts_bonus,expected_fpl_points,start_probability,sub_appearance_probability,xpts_goals_conceded,xpts_penalties,availability_probability,lineup_confidence,tactical_role,minutes_source)
    select 13,p.fixture_id,p.fpl_player_id,now(),'leaguewide_v6',p.expected_minutes,p.expected_goals,p.expected_assists,p.clean_sheet_probability,case when p.element_type=1 then s.xpts_saves*3 else 0 end,p.defensive_contribution_probability,
      coalesce(mc.expected_bonus_points, p.expected_bonus),
      p.xpts_appearance,p.xpts_goals,p.xpts_assists,p.xpts_clean_sheet,s.xpts_saves,p.xpts_defensive_contribution,s.xpts_cards_own_goals,
      coalesce(mc.expected_bonus_points, p.xpts_bonus),
      (p.xpts_appearance + p.xpts_goals + p.xpts_assists + p.xpts_clean_sheet + p.xpts_defensive_contribution + coalesce(mc.expected_bonus_points, p.xpts_bonus) + s.xpts_saves + s.xpts_goals_conceded + s.xpts_cards_own_goals + s.xpts_penalties) as expected_fpl_points,
      p.prob_starting_xi,p.prob_sub_appearance,s.xpts_goals_conceded,s.xpts_penalties,coalesce(m.availability_probability,1),case m.minutes_source when 'consensus_v3' then .90 when 'squad_state_override' then .95 when 'nailed_history_v6' then .80 when 'strong_history_v6' then .70 else .55 end,coalesce(tc.tactical_role,m.tactical_role,td.tactical_role,case p.element_type when 1 then 'GK' when 2 then 'DEF' when 3 then 'MID' when 4 then 'CF' else 'TBC' end),m.minutes_source
    from public.fpl_projection_leaguewide_final p
      join public.fpl_projection_secondary_scoring s on s.fixture_id=p.fixture_id and s.fpl_player_id=p.fpl_player_id
      left join public.fixture_player_expected_minutes_resolved_v3 m on m.fixture_id=p.fixture_id and m.fpl_player_id=p.fpl_player_id
      left join public.fixture_player_tactical_consensus tc on tc.fixture_id=p.fixture_id and tc.fpl_player_id=p.fpl_player_id
      left join public.team_player_tactical_defaults td on td.season_id=13 and td.team_id=p.team_id and td.fpl_player_id=p.fpl_player_id
      left join public.fpl_fixture_bonus_montecarlo_v1 mc on mc.fixture_id=p.fixture_id and mc.fpl_player_id=p.fpl_player_id
    where p.fixture_id=p_fixture_id
    on conflict(fixture_id,fpl_player_id,model_version) do update set generated_at=excluded.generated_at,expected_minutes=excluded.expected_minutes,expected_goals=excluded.expected_goals,expected_assists=excluded.expected_assists,clean_sheet_probability=excluded.clean_sheet_probability,expected_saves=excluded.expected_saves,defensive_contribution_probability=excluded.defensive_contribution_probability,expected_bonus=excluded.expected_bonus,xpts_appearance=excluded.xpts_appearance,xpts_goals=excluded.xpts_goals,xpts_assists=excluded.xpts_assists,xpts_clean_sheet=excluded.xpts_clean_sheet,xpts_saves=excluded.xpts_saves,xpts_defensive_contribution=excluded.xpts_defensive_contribution,xpts_cards_own_goals=excluded.xpts_cards_own_goals,xpts_bonus=excluded.xpts_bonus,expected_fpl_points=excluded.expected_fpl_points,start_probability=excluded.start_probability,sub_appearance_probability=excluded.sub_appearance_probability,xpts_goals_conceded=excluded.xpts_goals_conceded,xpts_penalties=excluded.xpts_penalties,availability_probability=excluded.availability_probability,lineup_confidence=excluded.lineup_confidence,tactical_role=excluded.tactical_role,minutes_source=excluded.minutes_source;
  else
    insert into public.fpl_player_projections(season_id,fixture_id,fpl_player_id,generated_at,model_version,expected_minutes,expected_goals,expected_assists,clean_sheet_probability,expected_saves,defensive_contribution_probability,expected_bonus,xpts_appearance,xpts_goals,xpts_assists,xpts_clean_sheet,xpts_saves,xpts_defensive_contribution,xpts_cards_own_goals,xpts_bonus,expected_fpl_points,start_probability,sub_appearance_probability,xpts_goals_conceded,xpts_penalties,availability_probability,lineup_confidence,tactical_role,minutes_source)
    select 13,p.fixture_id,p.fpl_player_id,now(),'leaguewide_v6',p.expected_minutes,p.expected_goals,p.expected_assists,p.clean_sheet_probability,case when p.element_type=1 then s.xpts_saves*3 else 0 end,p.defensive_contribution_probability,
      coalesce(bv4.expected_bonus_points, p.expected_bonus),
      p.xpts_appearance,p.xpts_goals,p.xpts_assists,p.xpts_clean_sheet,s.xpts_saves,p.xpts_defensive_contribution,s.xpts_cards_own_goals,
      coalesce(bv4.expected_bonus_points, p.xpts_bonus),
      (p.xpts_appearance + p.xpts_goals + p.xpts_assists + p.xpts_clean_sheet + p.xpts_defensive_contribution + coalesce(bv4.expected_bonus_points, p.xpts_bonus) + s.xpts_saves + s.xpts_goals_conceded + s.xpts_cards_own_goals + s.xpts_penalties) as expected_fpl_points,
      p.prob_starting_xi,p.prob_sub_appearance,s.xpts_goals_conceded,s.xpts_penalties,coalesce(m.availability_probability,1),case m.minutes_source when 'consensus_v3' then .90 when 'squad_state_override' then .95 when 'nailed_history_v6' then .80 when 'strong_history_v6' then .70 else .55 end,coalesce(tc.tactical_role,m.tactical_role,td.tactical_role,case p.element_type when 1 then 'GK' when 2 then 'DEF' when 3 then 'MID' when 4 then 'CF' else 'TBC' end),m.minutes_source
    from public.fpl_projection_leaguewide_final p
      join public.fpl_projection_secondary_scoring s on s.fixture_id=p.fixture_id and s.fpl_player_id=p.fpl_player_id
      left join public.fixture_player_expected_minutes_resolved_v3 m on m.fixture_id=p.fixture_id and m.fpl_player_id=p.fpl_player_id
      left join public.fixture_player_tactical_consensus tc on tc.fixture_id=p.fixture_id and tc.fpl_player_id=p.fpl_player_id
      left join public.team_player_tactical_defaults td on td.season_id=13 and td.team_id=p.team_id and td.fpl_player_id=p.fpl_player_id
      left join public.get_fpl_fixture_bonus_v4(p_fixture_id) bv4 on bv4.fpl_player_id=p.fpl_player_id
    where p.fixture_id=p_fixture_id
    on conflict(fixture_id,fpl_player_id,model_version) do update set generated_at=excluded.generated_at,expected_minutes=excluded.expected_minutes,expected_goals=excluded.expected_goals,expected_assists=excluded.expected_assists,clean_sheet_probability=excluded.clean_sheet_probability,expected_saves=excluded.expected_saves,defensive_contribution_probability=excluded.defensive_contribution_probability,expected_bonus=excluded.expected_bonus,xpts_appearance=excluded.xpts_appearance,xpts_goals=excluded.xpts_goals,xpts_assists=excluded.xpts_assists,xpts_clean_sheet=excluded.xpts_clean_sheet,xpts_saves=excluded.xpts_saves,xpts_defensive_contribution=excluded.xpts_defensive_contribution,xpts_cards_own_goals=excluded.xpts_cards_own_goals,xpts_bonus=excluded.xpts_bonus,expected_fpl_points=excluded.expected_fpl_points,start_probability=excluded.start_probability,sub_appearance_probability=excluded.sub_appearance_probability,xpts_goals_conceded=excluded.xpts_goals_conceded,xpts_penalties=excluded.xpts_penalties,availability_probability=excluded.availability_probability,lineup_confidence=excluded.lineup_confidence,tactical_role=excluded.tactical_role,minutes_source=excluded.minutes_source;
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_fpl_projections_range(p_from_matchweek integer, p_to_matchweek integer, p_season_id bigint DEFAULT 13, p_league_id bigint DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fixture record;
  v_total integer := 0;
begin
  for v_fixture in select fixture_id from public.fixtures where matchweek between p_from_matchweek and p_to_matchweek and season_id = p_season_id and league_id = p_league_id
  loop
    perform public.refresh_fpl_projection_fixture_v6(v_fixture.fixture_id);
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.safe_numeric(p_text text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_text ~ '^-?[0-9]+(\.[0-9]+)?$' then p_text::numeric
    else null
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.search_players(p_query text, p_limit integer DEFAULT 20)
 RETURNS TABLE(fpl_code bigint, slug text, canonical_name text, latest_web_name text, latest_team text, element_type integer, seasons_played bigint, career_points bigint, first_season text, last_season text, current_slug text)
 LANGUAGE sql
 STABLE
AS $function$
  with matches as (
    select i.fpl_code, i.slug, i.canonical_name, i.first_seen_season_id, i.last_seen_season_id
    from public.player_identity i
    where p_query is not null and length(trim(p_query)) >= 2
      and i.canonical_name ilike '%' || trim(p_query) || '%'
  ),
  agg as (
    select m.fpl_code, m.slug, m.canonical_name, m.first_seen_season_id, m.last_seen_season_id,
      count(*)::bigint seasons_played, sum(t.total_points)::bigint career_points,
      (array_agg(t.web_name order by t.season_id desc))[1] latest_web_name,
      (array_agg(t.team_name order by t.season_id desc))[1] latest_team,
      (array_agg(t.element_type order by t.season_id desc))[1] element_type
    from matches m
    join public.fpl_player_season_totals t on t.fpl_code = m.fpl_code
    group by m.fpl_code, m.slug, m.canonical_name, m.first_seen_season_id, m.last_seen_season_id
  )
  select a.fpl_code, a.slug, a.canonical_name, a.latest_web_name, a.latest_team, a.element_type,
    a.seasons_played, a.career_points, fs.slug, ls.slug,
    (select p.slug from public.fpl_players p where p.fpl_code = a.fpl_code and p.season_id = 13 limit 1)
  from agg a
  left join public.seasons fs on fs.season_id = a.first_seen_season_id
  left join public.seasons ls on ls.season_id = a.last_seen_season_id
  order by a.career_points desc
  limit greatest(1, least(p_limit, 50));
$function$
;

CREATE OR REPLACE FUNCTION public.set_current_season_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_season bigint;
begin
  if new.season_id is not null then
    return new;
  end if;
  -- Seasons run August to May, so the season a date belongs to is the
  -- one whose August start it falls after. Derived rather than
  -- hardcoded, so this keeps working at the 2027/28 rollover instead of
  -- silently stamping next season's data as 2026/27.
  select s.season_id into v_season
  from public.seasons s
  where current_date >= make_date(s.start_year, 8, 1)
    and current_date <  make_date(s.end_year, 8, 1)
  limit 1;

  new.season_id := v_season;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_fpl_code_from_payload()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.fpl_code is null and new.source_payload ? 'code' then
    new.fpl_code := (new.source_payload->>'code')::bigint;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.slugify(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select nullif(
    trim(both '-' from
      regexp_replace(
        regexp_replace(lower(public.unaccent(coalesce(input, ''))), '[^a-z0-9]+', '-', 'g'),
        '-{2,}', '-', 'g'
      )
    ),
    ''
  )
$function$
;

CREATE OR REPLACE FUNCTION public.slugify_player_name(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select nullif(
    trim(both '-' from
      regexp_replace(
        regexp_replace(
          lower(unaccent(coalesce(p_name, ''))),
          '[^a-z0-9]+', '-', 'g'
        ),
        '-{2,}', '-', 'g'
      )
    ),
  '');
$function$
;

CREATE OR REPLACE FUNCTION public.sync_player_identity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_name text;
  v_slug text;
begin
  if new.fpl_code is null then
    return new;
  end if;

  v_name := trim(coalesce(new.first_name,'') || ' ' || coalesce(new.second_name,''));
  v_slug := coalesce(public.slugify_player_name(v_name), 'player-' || new.fpl_code);

  -- Deterministic collision handling: append the code, never a counter,
  -- so two players can't swap slugs on a reimport.
  if exists (select 1 from public.player_identity i where i.slug = v_slug and i.fpl_code <> new.fpl_code) then
    v_slug := v_slug || '-' || new.fpl_code;
  end if;

  insert into public.player_identity (fpl_code, canonical_name, slug, first_seen_season_id, last_seen_season_id)
  values (new.fpl_code, v_name, v_slug, new.season_id, new.season_id)
  on conflict (fpl_code) do update set
    -- Widen the seen-range; never narrow it. Slug and name are left
    -- alone on conflict: an existing URL must keep working.
    first_seen_season_id = least(public.player_identity.first_seen_season_id, excluded.first_seen_season_id),
    last_seen_season_id  = greatest(public.player_identity.last_seen_season_id, excluded.last_seen_season_id),
    updated_at = now();
  return new;
end;
$function$
;

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE public.admin_bootstrap_emails (
    email text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.app_users (
    user_id uuid NOT NULL,
    email text,
    is_admin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.backup_fpl_player_gameweeks_20260919 (
    fpl_player_id integer,
    fpl_event_id integer,
    fpl_fixture_id integer,
    opponent_fpl_team_id integer,
    was_home boolean,
    kickoff_time timestamp with time zone,
    total_points integer,
    minutes integer,
    goals_scored integer,
    assists integer,
    clean_sheets integer,
    goals_conceded integer,
    own_goals integer,
    penalties_saved integer,
    penalties_missed integer,
    yellow_cards integer,
    red_cards integer,
    saves integer,
    bonus integer,
    bps integer,
    influence numeric,
    creativity numeric,
    threat numeric,
    ict_index numeric,
    expected_goals numeric,
    expected_assists numeric,
    expected_goal_involvements numeric,
    expected_goals_conceded numeric,
    value integer,
    selected bigint,
    transfers_in bigint,
    transfers_out bigint,
    source_payload jsonb,
    updated_at timestamp with time zone,
    season_id bigint
);

CREATE TABLE public.backup_fpl_player_snapshots_20260919 (
    snapshot_date date,
    captured_at timestamp with time zone,
    fpl_player_id integer,
    fpl_team_id integer,
    now_cost integer,
    selected_by_percent numeric,
    total_points integer,
    event_points integer,
    status text,
    chance_of_playing_next_round integer,
    chance_of_playing_this_round integer,
    transfers_in bigint,
    transfers_out bigint,
    transfers_in_event bigint,
    transfers_out_event bigint,
    news text,
    source_payload jsonb,
    season_id bigint
);

CREATE TABLE public.backup_fpl_players_20260919 (
    fpl_player_id integer,
    canonical_team_id bigint,
    fpl_team_id integer,
    first_name text,
    second_name text,
    web_name text,
    element_type integer,
    status text,
    now_cost integer,
    selected_by_percent numeric,
    total_points integer,
    event_points integer,
    minutes integer,
    goals_scored integer,
    assists integer,
    clean_sheets integer,
    goals_conceded integer,
    own_goals integer,
    penalties_saved integer,
    penalties_missed integer,
    yellow_cards integer,
    red_cards integer,
    saves integer,
    bonus integer,
    bps integer,
    influence numeric,
    creativity numeric,
    threat numeric,
    ict_index numeric,
    expected_goals numeric,
    expected_assists numeric,
    expected_goal_involvements numeric,
    expected_goals_conceded numeric,
    chance_of_playing_next_round integer,
    chance_of_playing_this_round integer,
    news text,
    news_added timestamp with time zone,
    source_payload jsonb,
    updated_at timestamp with time zone,
    season_id bigint,
    slug text,
    fpl_code bigint
);

CREATE TABLE public.backup_player_availability_events_20260919 (
    availability_event_id bigint,
    season_id bigint,
    fpl_player_id integer,
    observed_at timestamp with time zone,
    status text,
    chance_of_playing_next_round integer,
    chance_of_playing_this_round integer,
    news text,
    news_added timestamp with time zone,
    availability_category text,
    expected_return_date date,
    source_name text,
    source_payload jsonb
);

CREATE TABLE public.countries (
    country_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    name text NOT NULL,
    code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.data_source_competitions (
    source_competition_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    source_name text NOT NULL,
    country_name text NOT NULL,
    source_code text NOT NULL,
    competition_code text NOT NULL,
    competition_type text NOT NULL,
    season_label text NOT NULL,
    source_url text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.finance_filings (
    filing_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    reporting_entity_id bigint NOT NULL,
    ingestion_run_id bigint,
    source text DEFAULT 'companies_house'::text NOT NULL,
    filing_reference text,
    document_id text,
    source_url text NOT NULL,
    filing_date date NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    period_months numeric(6,2) NOT NULL,
    is_consolidated boolean,
    document_format text,
    document_sha256 text,
    retrieved_at timestamp with time zone DEFAULT now() NOT NULL,
    extraction_status text DEFAULT 'discovered'::text NOT NULL,
    validation_status text DEFAULT 'unreviewed'::text NOT NULL,
    supersedes_filing_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    retrieval_method text,
    retrieval_notes text,
    raw_fact_count integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.finance_ingestion_runs (
    ingestion_run_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    source text DEFAULT 'companies_house'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    filings_discovered integer DEFAULT 0 NOT NULL,
    filings_processed integer DEFAULT 0 NOT NULL,
    facts_extracted integer DEFAULT 0 NOT NULL,
    facts_mapped integer DEFAULT 0 NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.finance_metric_dictionary (
    metric_key text NOT NULL,
    display_name text NOT NULL,
    definition text NOT NULL,
    metric_type text NOT NULL,
    statement_type text,
    value_kind text DEFAULT 'monetary'::text NOT NULL,
    expected_sign text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.finance_metric_mappings (
    mapping_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    source text DEFAULT 'companies_house'::text NOT NULL,
    xbrl_concept text NOT NULL,
    metric_key text NOT NULL,
    mapping_version integer DEFAULT 1 NOT NULL,
    context_rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.finance_metric_values (
    metric_value_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    financial_id bigint NOT NULL,
    metric_key text NOT NULL,
    value numeric,
    currency text,
    unit_scale integer,
    raw_fact_id bigint,
    original_xbrl_concept text,
    original_value text,
    original_unit text,
    filing_reference text,
    document_id text,
    source_url text,
    mapping_version integer,
    validation_status text DEFAULT 'unreviewed'::text NOT NULL,
    validation_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.finance_periods (
    financial_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    team_id bigint NOT NULL,
    filing_id bigint NOT NULL,
    season_id bigint,
    period_start date NOT NULL,
    period_end date NOT NULL,
    period_months numeric(6,2) NOT NULL,
    reporting_entity text NOT NULL,
    company_number text NOT NULL,
    is_consolidated boolean,
    currency text DEFAULT 'GBP'::text NOT NULL,
    unit_scale integer DEFAULT 1 NOT NULL,
    season_mapping_method text,
    season_mapping_confidence text,
    is_latest boolean DEFAULT false NOT NULL,
    is_current_version boolean DEFAULT true NOT NULL,
    is_comparable boolean DEFAULT true NOT NULL,
    supersedes_financial_id bigint,
    filing_date date NOT NULL,
    source_url text NOT NULL,
    validation_status text DEFAULT 'unreviewed'::text NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.finance_raw_facts (
    raw_fact_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    filing_id bigint NOT NULL,
    xbrl_concept text NOT NULL,
    context_ref text,
    period_start date,
    period_end date,
    instant_date date,
    original_value text,
    numeric_value numeric,
    original_unit text,
    currency text,
    unit_scale integer,
    dimensions jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_locator text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.finance_reporting_entities (
    reporting_entity_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    team_id bigint NOT NULL,
    company_number text NOT NULL,
    reporting_entity text NOT NULL,
    relationship_type text DEFAULT 'football_club'::text NOT NULL,
    is_preferred boolean DEFAULT false NOT NULL,
    effective_from date,
    effective_to date,
    source_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.fixture_actual_lineup_players (
    fixture_id bigint NOT NULL,
    team_id bigint NOT NULL,
    player_name_source text NOT NULL,
    fpl_player_id integer,
    tactical_role text,
    starter boolean DEFAULT true NOT NULL,
    lineup_order smallint,
    source_name text NOT NULL,
    source_url text,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    web_name text,
    minutes integer
);

CREATE TABLE public.fixture_actual_team_lineups (
    fixture_id bigint NOT NULL,
    team_id bigint NOT NULL,
    formation text,
    source_name text NOT NULL,
    source_url text,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    source_is_inferred boolean DEFAULT false NOT NULL
);

CREATE TABLE public.fixture_changes (
    change_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    fixture_id bigint NOT NULL,
    old_kickoff_date date NOT NULL,
    new_kickoff_date date NOT NULL,
    old_kickoff_time time without time zone,
    new_kickoff_time time without time zone,
    detected_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.fixture_lineup_prediction_players (
    lineup_prediction_player_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    lineup_prediction_id bigint NOT NULL,
    fpl_player_id integer NOT NULL,
    predicted_start boolean DEFAULT true NOT NULL,
    source_start_probability numeric,
    tactical_role text
);

CREATE TABLE public.fixture_lineup_predictions (
    lineup_prediction_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    fixture_id bigint NOT NULL,
    team_id bigint NOT NULL,
    lineup_source_id bigint NOT NULL,
    formation text,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    source_reference text
);

CREATE TABLE public.fixture_refresh_runs (
    refresh_run_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    competitions text[],
    rows_seen integer DEFAULT 0 NOT NULL,
    rows_updated integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    error_message text
);

CREATE TABLE public.fixtures (
    fixture_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    league_id bigint NOT NULL,
    season_id bigint NOT NULL,
    home_team_id bigint NOT NULL,
    away_team_id bigint NOT NULL,
    kickoff_date date NOT NULL,
    kickoff_time time without time zone,
    matchweek integer,
    status text DEFAULT 'scheduled'::text NOT NULL,
    source_name text DEFAULT 'official-fixture-list'::text NOT NULL,
    source_file text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    round text,
    round_number integer,
    stage text,
    predicted_home_goals double precision,
    predicted_away_goals double precision,
    prediction_fit_run_id bigint,
    predicted_at timestamp with time zone,
    prediction_model_version text,
    slug text NOT NULL,
    raw_predicted_home_goals double precision,
    raw_predicted_away_goals double precision
);

CREATE TABLE public.formation_code_names (
    source_formation_code text NOT NULL,
    canonical_formation text NOT NULL
);

CREATE TABLE public.formation_slot_geometry (
    source_formation_code text NOT NULL,
    canonical_formation text NOT NULL,
    slot integer NOT NULL,
    x_pct integer NOT NULL,
    y_pct integer NOT NULL
);

CREATE TABLE public.fpl_fixture_bonus_montecarlo_v1 (
    fixture_id bigint NOT NULL,
    fpl_player_id integer NOT NULL,
    expected_bonus_points numeric NOT NULL,
    simulated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.fpl_fixtures (
    fpl_fixture_id integer NOT NULL,
    canonical_fixture_id bigint,
    fpl_event_id integer,
    kickoff_time timestamp with time zone,
    fpl_home_team_id integer,
    fpl_away_team_id integer,
    team_h_score integer,
    team_a_score integer,
    finished boolean,
    started boolean,
    team_h_difficulty integer,
    team_a_difficulty integer,
    source_payload jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    season_id bigint
);

CREATE TABLE public.fpl_gameweeks (
    fpl_event_id integer NOT NULL,
    name text NOT NULL,
    deadline_time timestamp with time zone,
    average_entry_score numeric,
    highest_score integer,
    finished boolean,
    data_checked boolean,
    is_previous boolean,
    is_current boolean,
    is_next boolean,
    source_payload jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    season_id bigint
);

CREATE TABLE public.fpl_hindsight_optimal_squad (
    hindsight_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    season_id bigint NOT NULL,
    league_id bigint NOT NULL,
    from_matchweek integer NOT NULL,
    to_matchweek integer NOT NULL,
    budget numeric NOT NULL,
    optimiser_version text NOT NULL,
    solver_status text NOT NULL,
    objective_points numeric NOT NULL,
    solve_time_ms integer,
    result jsonb NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.fpl_ingestion_runs (
    run_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    teams_upserted integer DEFAULT 0 NOT NULL,
    players_upserted integer DEFAULT 0 NOT NULL,
    gameweeks_upserted integer DEFAULT 0 NOT NULL,
    fixtures_upserted integer DEFAULT 0 NOT NULL,
    player_gameweeks_upserted integer DEFAULT 0 NOT NULL,
    error_message text
);

CREATE TABLE public.fpl_player_gameweek_history (
    season_id bigint NOT NULL,
    fpl_code bigint NOT NULL,
    gameweek integer NOT NULL,
    opponent_team_num integer,
    was_home boolean,
    minutes integer DEFAULT 0 NOT NULL,
    total_points integer DEFAULT 0 NOT NULL,
    starts integer DEFAULT 0 NOT NULL,
    goals_scored integer DEFAULT 0 NOT NULL,
    assists integer DEFAULT 0 NOT NULL,
    clean_sheets integer DEFAULT 0 NOT NULL,
    goals_conceded integer DEFAULT 0 NOT NULL,
    bonus integer DEFAULT 0 NOT NULL,
    bps integer DEFAULT 0 NOT NULL,
    saves integer DEFAULT 0 NOT NULL,
    yellow_cards integer DEFAULT 0 NOT NULL,
    red_cards integer DEFAULT 0 NOT NULL,
    value integer,
    selected bigint,
    transfers_in bigint,
    transfers_out bigint,
    expected_goals numeric,
    expected_assists numeric,
    fixture_id integer NOT NULL
);

CREATE TABLE public.fpl_player_gameweeks (
    fpl_player_id integer NOT NULL,
    fpl_event_id integer NOT NULL,
    fpl_fixture_id integer NOT NULL,
    opponent_fpl_team_id integer,
    was_home boolean,
    kickoff_time timestamp with time zone,
    total_points integer,
    minutes integer,
    goals_scored integer,
    assists integer,
    clean_sheets integer,
    goals_conceded integer,
    own_goals integer,
    penalties_saved integer,
    penalties_missed integer,
    yellow_cards integer,
    red_cards integer,
    saves integer,
    bonus integer,
    bps integer,
    influence numeric,
    creativity numeric,
    threat numeric,
    ict_index numeric,
    expected_goals numeric,
    expected_assists numeric,
    expected_goal_involvements numeric,
    expected_goals_conceded numeric,
    value integer,
    selected bigint,
    transfers_in bigint,
    transfers_out bigint,
    source_payload jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    season_id bigint
);

CREATE TABLE public.fpl_player_projections (
    projection_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    season_id bigint NOT NULL,
    fixture_id bigint NOT NULL,
    fpl_player_id integer NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    model_version text NOT NULL,
    expected_minutes numeric,
    expected_goals numeric,
    expected_assists numeric,
    clean_sheet_probability numeric,
    expected_saves numeric,
    defensive_contribution_probability numeric,
    expected_bonus numeric,
    xpts_appearance numeric,
    xpts_goals numeric,
    xpts_assists numeric,
    xpts_clean_sheet numeric,
    xpts_saves numeric,
    xpts_defensive_contribution numeric,
    xpts_cards_own_goals numeric,
    xpts_bonus numeric,
    expected_fpl_points numeric,
    start_probability numeric,
    sub_appearance_probability numeric,
    xpts_goals_conceded numeric,
    xpts_penalties numeric,
    availability_probability numeric,
    lineup_confidence numeric,
    scenario_key text DEFAULT 'baseline'::text NOT NULL,
    tactical_role text,
    minutes_source text
);

CREATE TABLE public.fpl_player_return_assumptions (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    season_id bigint NOT NULL,
    fpl_player_id integer NOT NULL,
    expected_return_date date,
    return_uncertainty_days integer DEFAULT 7 NOT NULL,
    pre_return_availability numeric DEFAULT 0 NOT NULL,
    post_return_availability numeric DEFAULT 1 NOT NULL,
    post_return_start_probability numeric,
    reason text,
    source_name text,
    source_reference text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.fpl_player_season_totals (
    season_id bigint NOT NULL,
    fpl_code bigint NOT NULL,
    fpl_element_id integer,
    web_name text NOT NULL,
    full_name text,
    element_type integer NOT NULL,
    team_name text,
    start_cost integer NOT NULL,
    end_cost integer NOT NULL,
    total_points integer DEFAULT 0 NOT NULL,
    minutes integer DEFAULT 0 NOT NULL,
    goals_scored integer DEFAULT 0 NOT NULL,
    assists integer DEFAULT 0 NOT NULL,
    clean_sheets integer DEFAULT 0 NOT NULL,
    goals_conceded integer DEFAULT 0 NOT NULL,
    bonus integer DEFAULT 0 NOT NULL,
    bps integer DEFAULT 0 NOT NULL,
    saves integer DEFAULT 0 NOT NULL,
    yellow_cards integer DEFAULT 0 NOT NULL,
    red_cards integer DEFAULT 0 NOT NULL,
    penalties_missed integer DEFAULT 0 NOT NULL,
    penalties_saved integer DEFAULT 0 NOT NULL,
    own_goals integer DEFAULT 0 NOT NULL,
    selected_by_percent numeric,
    source_name text DEFAULT 'vaastav/Fantasy-Premier-League'::text NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.fpl_player_snapshots (
    snapshot_date date NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    fpl_player_id integer NOT NULL,
    fpl_team_id integer,
    now_cost integer,
    selected_by_percent numeric,
    total_points integer,
    event_points integer,
    status text,
    chance_of_playing_next_round integer,
    chance_of_playing_this_round integer,
    transfers_in bigint,
    transfers_out bigint,
    transfers_in_event bigint,
    transfers_out_event bigint,
    news text,
    source_payload jsonb,
    season_id bigint
);

CREATE TABLE public.fpl_player_squad_state (
    season_id bigint NOT NULL,
    fpl_player_id integer NOT NULL,
    team_id bigint,
    state text DEFAULT 'active'::text NOT NULL,
    availability_probability numeric,
    start_probability_override numeric,
    effective_from timestamp with time zone DEFAULT now() NOT NULL,
    effective_to timestamp with time zone,
    source_name text,
    source_reference text,
    evidence text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.fpl_players (
    fpl_player_id integer NOT NULL,
    canonical_team_id bigint,
    fpl_team_id integer,
    first_name text,
    second_name text,
    web_name text,
    element_type integer,
    status text,
    now_cost integer,
    selected_by_percent numeric,
    total_points integer,
    event_points integer,
    minutes integer,
    goals_scored integer,
    assists integer,
    clean_sheets integer,
    goals_conceded integer,
    own_goals integer,
    penalties_saved integer,
    penalties_missed integer,
    yellow_cards integer,
    red_cards integer,
    saves integer,
    bonus integer,
    bps integer,
    influence numeric,
    creativity numeric,
    threat numeric,
    ict_index numeric,
    expected_goals numeric,
    expected_assists numeric,
    expected_goal_involvements numeric,
    expected_goals_conceded numeric,
    chance_of_playing_next_round integer,
    chance_of_playing_this_round integer,
    news text,
    news_added timestamp with time zone,
    source_payload jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    season_id bigint NOT NULL,
    slug text,
    fpl_code bigint
);

CREATE TABLE public.fpl_projection_model_parameters (
    parameter_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    season_id bigint NOT NULL,
    model_version text NOT NULL,
    parameter_name text NOT NULL,
    player_position text,
    parameter_value numeric NOT NULL,
    notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.fpl_scoring_rules (
    rule_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    season_id bigint NOT NULL,
    rule_code text NOT NULL,
    player_position text,
    points numeric NOT NULL,
    threshold numeric,
    notes text,
    source_name text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.fpl_teams (
    fpl_team_id integer NOT NULL,
    canonical_team_id bigint,
    code integer,
    name text NOT NULL,
    short_name text,
    strength integer,
    strength_overall_home integer,
    strength_overall_away integer,
    strength_attack_home integer,
    strength_attack_away integer,
    strength_defence_home integer,
    strength_defence_away integer,
    source_payload jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    season_id bigint
);

CREATE TABLE public.leagues (
    league_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    country_id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    tier integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    competition_type text,
    scope text,
    confederation text,
    slug text NOT NULL
);

CREATE TABLE public.lineup_prediction_sources (
    lineup_source_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    source_name text NOT NULL,
    source_type text DEFAULT 'web'::text NOT NULL,
    source_weight numeric DEFAULT 1 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.match_import_runs (
    import_run_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    started_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone,
    league_code text NOT NULL,
    rows_seen integer,
    rows_upserted integer,
    status text NOT NULL,
    error_message text
);

CREATE TABLE public.match_odds (
    match_odds_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    match_id bigint NOT NULL,
    source_name text NOT NULL,
    market text NOT NULL,
    bookmaker text DEFAULT 'aggregate'::text NOT NULL,
    price_home numeric,
    price_draw numeric,
    price_away numeric,
    line numeric,
    price_over numeric,
    price_under numeric,
    is_closing boolean DEFAULT false NOT NULL,
    raw_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.matches (
    match_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    league_id bigint NOT NULL,
    season_id bigint NOT NULL,
    home_team_id bigint NOT NULL,
    away_team_id bigint NOT NULL,
    match_date date NOT NULL,
    kickoff_time time without time zone,
    referee text,
    full_time_home_goals integer NOT NULL,
    full_time_away_goals integer NOT NULL,
    full_time_result text NOT NULL,
    half_time_home_goals integer,
    half_time_away_goals integer,
    half_time_result text,
    home_shots integer,
    away_shots integer,
    home_shots_on_target integer,
    away_shots_on_target integer,
    home_corners integer,
    away_corners integer,
    home_fouls integer,
    away_fouls integer,
    home_yellow_cards integer DEFAULT 0 NOT NULL,
    away_yellow_cards integer DEFAULT 0 NOT NULL,
    home_red_cards integer DEFAULT 0 NOT NULL,
    away_red_cards integer DEFAULT 0 NOT NULL,
    source_name text DEFAULT 'football-data.co.uk'::text NOT NULL,
    source_file text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    round text,
    round_number integer,
    stage text,
    home_xg numeric,
    away_xg numeric,
    attendance integer,
    decided_by text,
    winner_team_id bigint,
    home_penalty_goals integer,
    away_penalty_goals integer,
    source_match_id text
);

CREATE TABLE public.model_fit_runs (
    fit_run_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    league_id bigint NOT NULL,
    window_start_date date NOT NULL,
    window_end_date date NOT NULL,
    rho double precision NOT NULL,
    home_advantage double precision NOT NULL,
    decay_half_life_days double precision NOT NULL,
    log_likelihood double precision,
    converged boolean DEFAULT true NOT NULL,
    matches_used integer NOT NULL,
    fitted_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    rejection_reason text,
    validation_warnings jsonb DEFAULT '[]'::jsonb NOT NULL,
    validation_checks jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.opta_player_match (
    opta_row_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    match_date date NOT NULL,
    opta_player_id bigint NOT NULL,
    player_name text NOT NULL,
    team_name text NOT NULL,
    opta_team_id bigint,
    opposition_name text,
    venue text,
    position_id integer,
    formation_code text,
    formation_slot integer,
    starts integer,
    minutes integer,
    goals integer,
    goals_open_play integer,
    goals_from_corners integer,
    goals_from_direct_fk integer,
    goals_from_set_play integer,
    goals_from_penalties integer,
    penalties_taken integer,
    penalty_goals integer,
    assists integer,
    assist_corner integer,
    assist_free_kick integer,
    assist_throw_in integer,
    assist_set_piece integer,
    key_passes integer,
    corners_taken integer,
    shots_on_target integer,
    shots_off_target integer,
    big_chances integer,
    touches_opp_box integer
);

CREATE TABLE public.opta_slot_breakdown (
    formation_code text NOT NULL,
    slot integer NOT NULL,
    starts integer DEFAULT 0 NOT NULL,
    minutes integer DEFAULT 0 NOT NULL,
    goals integer DEFAULT 0 NOT NULL,
    goals_open_play integer DEFAULT 0 NOT NULL,
    goals_from_corners integer DEFAULT 0 NOT NULL,
    goals_from_direct_fk integer DEFAULT 0 NOT NULL,
    goals_from_set_play integer DEFAULT 0 NOT NULL,
    goals_from_penalties integer DEFAULT 0 NOT NULL,
    penalties_taken integer DEFAULT 0 NOT NULL,
    penalty_goals integer DEFAULT 0 NOT NULL,
    assists integer DEFAULT 0 NOT NULL,
    assist_corner integer DEFAULT 0 NOT NULL,
    assist_free_kick integer DEFAULT 0 NOT NULL,
    assist_throw_in integer DEFAULT 0 NOT NULL,
    assist_set_piece integer DEFAULT 0 NOT NULL,
    key_passes integer DEFAULT 0 NOT NULL,
    corners_taken integer DEFAULT 0 NOT NULL,
    shots_on_target integer DEFAULT 0 NOT NULL,
    shots_off_target integer DEFAULT 0 NOT NULL,
    big_chances integer DEFAULT 0 NOT NULL,
    touches_opp_box integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.pipeline_runs (
    run_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    job_name text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    summary text,
    error_message text
);

CREATE TABLE public.player_availability_events (
    availability_event_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    season_id bigint NOT NULL,
    fpl_player_id integer NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    status text,
    chance_of_playing_next_round integer,
    chance_of_playing_this_round integer,
    news text,
    news_added timestamp with time zone,
    availability_category text,
    expected_return_date date,
    source_name text DEFAULT 'official_fpl'::text NOT NULL,
    source_payload jsonb
);

CREATE TABLE public.player_identity (
    fpl_code bigint NOT NULL,
    canonical_name text NOT NULL,
    first_seen_season_id bigint,
    last_seen_season_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    slug text NOT NULL
);

CREATE TABLE public.player_lineup_predictions (
    lineup_prediction_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    season_id bigint NOT NULL,
    fixture_id bigint NOT NULL,
    source_name text DEFAULT 'internal_model'::text NOT NULL,
    source_player_id text NOT NULL,
    player_name text,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    model_version text NOT NULL,
    prob_start numeric,
    prob_60_plus numeric,
    prob_appearance numeric,
    expected_minutes numeric,
    predicted_role text,
    evidence jsonb
);

CREATE TABLE public.player_match_roles (
    player_match_role_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    fixture_id bigint NOT NULL,
    team_id bigint NOT NULL,
    season_id bigint NOT NULL,
    source_name text NOT NULL,
    source_player_id text NOT NULL,
    player_name text,
    started boolean,
    nominal_position text,
    tactical_role text,
    formation_slot text,
    minutes integer,
    source_payload jsonb,
    observed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.player_squad_hierarchy (
    player_squad_hierarchy_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    season_id bigint NOT NULL,
    team_id bigint NOT NULL,
    fpl_player_id integer NOT NULL,
    squad_status text NOT NULL,
    hierarchy_score numeric,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.player_tactical_profiles (
    player_tactical_profile_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    season_id bigint NOT NULL,
    team_id bigint NOT NULL,
    source_name text NOT NULL,
    source_player_id text NOT NULL,
    player_name text NOT NULL,
    fpl_position text,
    tactical_role text,
    role_confidence numeric,
    prob_start numeric,
    prob_appearance numeric,
    prob_60_plus numeric,
    expected_minutes numeric,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    prob_starting_xi numeric,
    prob_sub_appearance numeric,
    expected_minutes_if_start numeric,
    expected_minutes_if_sub numeric
);

CREATE TABLE public.point_deductions (
    deduction_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    league_id bigint NOT NULL,
    season_id bigint NOT NULL,
    team_id bigint NOT NULL,
    points integer NOT NULL,
    reason text,
    effective_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.projection_scenario_players (
    scenario_player_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    scenario_id bigint NOT NULL,
    fpl_player_id integer NOT NULL,
    selected_start boolean,
    expected_minutes numeric,
    tactical_role text,
    penalty_rank integer,
    direct_free_kick_rank integer,
    corner_left_rank integer,
    corner_right_rank integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.projection_scenario_teams (
    scenario_team_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    scenario_id bigint NOT NULL,
    team_id bigint NOT NULL,
    formation text,
    formation_overridden boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.projection_scenarios (
    scenario_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    season_id bigint NOT NULL,
    fixture_id bigint NOT NULL,
    scenario_name text DEFAULT 'Custom scenario'::text NOT NULL,
    created_by uuid,
    is_model_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.raw_match_files (
    raw_file_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    source_name text NOT NULL,
    source_url text NOT NULL,
    source_code text,
    competition_code text,
    season_label text,
    retrieved_at timestamp with time zone DEFAULT now() NOT NULL,
    content_hash text NOT NULL,
    row_count integer,
    column_names jsonb,
    file_metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.result_ingestion_runs (
    ingestion_run_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    source_name text NOT NULL,
    competitions_attempted integer DEFAULT 0 NOT NULL,
    rows_seen integer DEFAULT 0 NOT NULL,
    rows_stored integer DEFAULT 0 NOT NULL,
    matches_upserted integer DEFAULT 0 NOT NULL,
    unmatched_rows integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    error_message text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    matches_inserted integer DEFAULT 0 NOT NULL,
    matches_changed integer DEFAULT 0 NOT NULL,
    matches_unchanged integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.season_best_xi (
    season_id bigint NOT NULL,
    fpl_code bigint NOT NULL,
    web_name text NOT NULL,
    team_name text,
    element_type integer NOT NULL,
    start_cost integer NOT NULL,
    total_points integer NOT NULL
);

CREATE TABLE public.seasons (
    season_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    label text NOT NULL,
    start_year integer NOT NULL,
    end_year integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    slug text NOT NULL
);

CREATE TABLE public.set_piece_hierarchies (
    set_piece_hierarchy_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    season_id bigint NOT NULL,
    team_id bigint NOT NULL,
    set_piece_type text NOT NULL,
    source_name text NOT NULL,
    source_player_id text NOT NULL,
    player_name text,
    rank integer NOT NULL,
    confidence numeric,
    valid_from date,
    valid_to date,
    evidence_count integer,
    source_payload jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.source_match_rows (
    source_match_row_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    source_competition_id bigint,
    source_row_key text NOT NULL,
    source_home_team text,
    source_away_team text,
    source_match_date date,
    source_kickoff_time time without time zone,
    raw_data jsonb NOT NULL,
    raw_hash text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    raw_file_id bigint,
    source_row_number integer
);

CREATE TABLE public.tactical_data_sources (
    tactical_source_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    source_name text NOT NULL,
    source_season_label text NOT NULL,
    competition_name text,
    provider text,
    source_notes text,
    source_date_from date,
    source_date_to date,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tactical_formation_mappings (
    tactical_source_id bigint NOT NULL,
    source_formation_code text NOT NULL,
    canonical_formation text,
    mapping_confidence numeric,
    mapping_method text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tactical_formation_slot_aggregates (
    tactical_source_id bigint NOT NULL,
    source_formation_code text NOT NULL,
    source_formation_slot text NOT NULL,
    venue_scope text NOT NULL,
    starts integer DEFAULT 0 NOT NULL,
    minutes numeric DEFAULT 0 NOT NULL,
    goals numeric DEFAULT 0 NOT NULL,
    open_play_goals numeric DEFAULT 0 NOT NULL,
    assists numeric DEFAULT 0 NOT NULL,
    key_passes numeric DEFAULT 0 NOT NULL,
    shots numeric DEFAULT 0 NOT NULL,
    shots_on_target numeric DEFAULT 0 NOT NULL,
    big_chances numeric DEFAULT 0 NOT NULL,
    opp_box_touches numeric DEFAULT 0 NOT NULL,
    set_piece_assists numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tactical_player_match_observations (
    tactical_player_match_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    tactical_team_match_id bigint NOT NULL,
    source_player_id text,
    source_unique_player_ref text,
    source_player_name text,
    source_position_code text,
    source_formation_slot text,
    canonical_role text,
    role_mapping_confidence numeric(5,4),
    role_mapping_method text,
    is_starter boolean DEFAULT true NOT NULL,
    minutes numeric(8,2),
    goals numeric(8,2),
    open_play_goals numeric(8,2),
    assists numeric(8,2),
    key_passes numeric(8,2),
    shots numeric(8,2),
    shots_on_target numeric(8,2),
    big_chances numeric(8,2),
    opp_box_touches numeric(8,2),
    set_piece_assists numeric(8,2),
    canonical_player_id bigint,
    raw_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tactical_role_priors (
    tactical_role text NOT NULL,
    role_group text NOT NULL,
    goal_weight numeric NOT NULL,
    assist_weight numeric NOT NULL,
    evidence_basis text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tactical_team_match_observations (
    tactical_team_match_id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    tactical_source_id bigint NOT NULL,
    source_match_ref text NOT NULL,
    match_date date,
    source_team_id text NOT NULL,
    source_team_name text,
    source_opponent_id text,
    source_opponent_name text,
    venue text,
    source_formation_code text,
    canonical_formation text,
    formation_mapping_confidence numeric(5,4),
    formation_mapping_method text,
    canonical_team_id bigint,
    canonical_fixture_id bigint,
    raw_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.team_aliases (
    team_alias_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    team_id bigint NOT NULL,
    source_name text NOT NULL,
    raw_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.team_categories (
    category_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    display_color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.team_category_memberships (
    membership_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    category_id bigint NOT NULL,
    team_id bigint NOT NULL,
    season_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.team_finishing_position_projection (
    league_id bigint NOT NULL,
    season_id bigint NOT NULL,
    team_id bigint NOT NULL,
    projected_points_mean numeric NOT NULL,
    projected_position_mean numeric NOT NULL,
    projected_position_median integer NOT NULL,
    current_actual_points integer NOT NULL,
    current_played integer NOT NULL,
    position_distribution jsonb NOT NULL,
    n_simulations integer NOT NULL,
    simulated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.team_match_tactics (
    team_match_tactic_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    fixture_id bigint NOT NULL,
    team_id bigint NOT NULL,
    season_id bigint NOT NULL,
    formation text,
    source_name text NOT NULL,
    confidence numeric,
    source_payload jsonb,
    observed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.team_player_tactical_defaults (
    season_id bigint NOT NULL,
    team_id bigint NOT NULL,
    fpl_player_id integer NOT NULL,
    tactical_role text NOT NULL,
    confidence numeric DEFAULT 0.75 NOT NULL,
    source_name text DEFAULT 'fantasy_football_scout'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    depth_rank integer,
    depth_rank_source text,
    manual_status text,
    manual_status_note text
);

CREATE TABLE public.team_ratings (
    team_rating_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    fit_run_id bigint NOT NULL,
    team_id bigint NOT NULL,
    attack_strength double precision NOT NULL,
    defence_strength double precision NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_estimated boolean DEFAULT false NOT NULL,
    estimated_from_team_id bigint,
    estimated_from_fit_run_id bigint,
    estimation_note text
);

CREATE TABLE public.team_slug_history (
    team_slug_history_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    team_id bigint NOT NULL,
    old_slug text NOT NULL,
    replaced_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.team_strength_forward_adjustments (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    season_id bigint NOT NULL,
    team_id bigint NOT NULL,
    scope text DEFAULT 'admin'::text NOT NULL,
    scenario_key text DEFAULT 'baseline'::text NOT NULL,
    attack_log_adjustment numeric DEFAULT 0 NOT NULL,
    defence_log_adjustment numeric DEFAULT 0 NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    decay_fixtures numeric,
    reason text,
    source_name text,
    source_reference text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.team_strength_manual_override (
    team_id bigint NOT NULL,
    attack_adjustment numeric DEFAULT 0 NOT NULL,
    defence_adjustment numeric DEFAULT 0 NOT NULL,
    note text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.team_tactical_defaults (
    team_tactical_default_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    season_id bigint NOT NULL,
    team_id bigint NOT NULL,
    formation text NOT NULL,
    confidence numeric NOT NULL,
    source_name text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.team_tactical_review_log (
    season_id bigint NOT NULL,
    team_id bigint NOT NULL,
    reviewed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.teams (
    team_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    country_id bigint NOT NULL,
    canonical_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    slug text NOT NULL,
    display_name text NOT NULL
);

-- ----------------------------------------------------------------------------
-- CONSTRAINTS
-- ----------------------------------------------------------------------------

ALTER TABLE ONLY public.admin_bootstrap_emails ADD CONSTRAINT admin_bootstrap_emails_pkey PRIMARY KEY (email);
ALTER TABLE ONLY public.app_users ADD CONSTRAINT app_users_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY public.countries ADD CONSTRAINT countries_pkey PRIMARY KEY (country_id);
ALTER TABLE ONLY public.data_source_competitions ADD CONSTRAINT data_source_competitions_pkey PRIMARY KEY (source_competition_id);
ALTER TABLE ONLY public.finance_filings ADD CONSTRAINT finance_filings_pkey PRIMARY KEY (filing_id);
ALTER TABLE ONLY public.finance_ingestion_runs ADD CONSTRAINT finance_ingestion_runs_pkey PRIMARY KEY (ingestion_run_id);
ALTER TABLE ONLY public.finance_metric_dictionary ADD CONSTRAINT finance_metric_dictionary_pkey PRIMARY KEY (metric_key);
ALTER TABLE ONLY public.finance_metric_mappings ADD CONSTRAINT finance_metric_mappings_pkey PRIMARY KEY (mapping_id);
ALTER TABLE ONLY public.finance_metric_values ADD CONSTRAINT finance_metric_values_pkey PRIMARY KEY (metric_value_id);
ALTER TABLE ONLY public.finance_periods ADD CONSTRAINT finance_periods_pkey PRIMARY KEY (financial_id);
ALTER TABLE ONLY public.finance_raw_facts ADD CONSTRAINT finance_raw_facts_pkey PRIMARY KEY (raw_fact_id);
ALTER TABLE ONLY public.finance_reporting_entities ADD CONSTRAINT finance_reporting_entities_pkey PRIMARY KEY (reporting_entity_id);
ALTER TABLE ONLY public.fixture_actual_lineup_players ADD CONSTRAINT fixture_actual_lineup_players_pkey PRIMARY KEY (fixture_id, team_id, player_name_source);
ALTER TABLE ONLY public.fixture_actual_team_lineups ADD CONSTRAINT fixture_actual_team_lineups_pkey PRIMARY KEY (fixture_id, team_id);
ALTER TABLE ONLY public.fixture_changes ADD CONSTRAINT fixture_changes_pkey PRIMARY KEY (change_id);
ALTER TABLE ONLY public.fixture_lineup_prediction_players ADD CONSTRAINT fixture_lineup_prediction_players_pkey PRIMARY KEY (lineup_prediction_player_id);
ALTER TABLE ONLY public.fixture_lineup_predictions ADD CONSTRAINT fixture_lineup_predictions_pkey PRIMARY KEY (lineup_prediction_id);
ALTER TABLE ONLY public.fixture_refresh_runs ADD CONSTRAINT fixture_refresh_runs_pkey PRIMARY KEY (refresh_run_id);
ALTER TABLE ONLY public.fixtures ADD CONSTRAINT fixtures_pkey PRIMARY KEY (fixture_id);
ALTER TABLE ONLY public.formation_code_names ADD CONSTRAINT formation_code_names_pkey PRIMARY KEY (source_formation_code);
ALTER TABLE ONLY public.formation_slot_geometry ADD CONSTRAINT formation_slot_geometry_pkey PRIMARY KEY (source_formation_code, slot);
ALTER TABLE ONLY public.fpl_fixture_bonus_montecarlo_v1 ADD CONSTRAINT fpl_fixture_bonus_montecarlo_v1_pkey PRIMARY KEY (fixture_id, fpl_player_id);
ALTER TABLE ONLY public.fpl_fixtures ADD CONSTRAINT fpl_fixtures_pkey PRIMARY KEY (fpl_fixture_id);
ALTER TABLE ONLY public.fpl_gameweeks ADD CONSTRAINT fpl_gameweeks_pkey PRIMARY KEY (fpl_event_id);
ALTER TABLE ONLY public.fpl_hindsight_optimal_squad ADD CONSTRAINT fpl_hindsight_optimal_squad_pkey PRIMARY KEY (hindsight_id);
ALTER TABLE ONLY public.fpl_ingestion_runs ADD CONSTRAINT fpl_ingestion_runs_pkey PRIMARY KEY (run_id);
ALTER TABLE ONLY public.fpl_player_gameweek_history ADD CONSTRAINT fpl_player_gameweek_history_pkey PRIMARY KEY (season_id, fpl_code, gameweek, fixture_id);
ALTER TABLE ONLY public.fpl_player_gameweeks ADD CONSTRAINT fpl_player_gameweeks_pkey PRIMARY KEY (fpl_player_id, fpl_fixture_id);
ALTER TABLE ONLY public.fpl_player_projections ADD CONSTRAINT fpl_player_projections_pkey PRIMARY KEY (projection_id);
ALTER TABLE ONLY public.fpl_player_return_assumptions ADD CONSTRAINT fpl_player_return_assumptions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.fpl_player_season_totals ADD CONSTRAINT fpl_player_season_totals_pkey PRIMARY KEY (season_id, fpl_code);
ALTER TABLE ONLY public.fpl_player_snapshots ADD CONSTRAINT fpl_player_snapshots_pkey PRIMARY KEY (snapshot_date, fpl_player_id);
ALTER TABLE ONLY public.fpl_player_squad_state ADD CONSTRAINT fpl_player_squad_state_pkey PRIMARY KEY (season_id, fpl_player_id, effective_from);
ALTER TABLE ONLY public.fpl_players ADD CONSTRAINT fpl_players_pkey PRIMARY KEY (fpl_player_id, season_id);
ALTER TABLE ONLY public.fpl_projection_model_parameters ADD CONSTRAINT fpl_projection_model_parameters_pkey PRIMARY KEY (parameter_id);
ALTER TABLE ONLY public.fpl_scoring_rules ADD CONSTRAINT fpl_scoring_rules_pkey PRIMARY KEY (rule_id);
ALTER TABLE ONLY public.fpl_teams ADD CONSTRAINT fpl_teams_pkey PRIMARY KEY (fpl_team_id);
ALTER TABLE ONLY public.leagues ADD CONSTRAINT leagues_pkey PRIMARY KEY (league_id);
ALTER TABLE ONLY public.lineup_prediction_sources ADD CONSTRAINT lineup_prediction_sources_pkey PRIMARY KEY (lineup_source_id);
ALTER TABLE ONLY public.match_import_runs ADD CONSTRAINT match_import_runs_pkey PRIMARY KEY (import_run_id);
ALTER TABLE ONLY public.match_odds ADD CONSTRAINT match_odds_pkey PRIMARY KEY (match_odds_id);
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_pkey PRIMARY KEY (match_id);
ALTER TABLE ONLY public.model_fit_runs ADD CONSTRAINT model_fit_runs_pkey PRIMARY KEY (fit_run_id);
ALTER TABLE ONLY public.opta_player_match ADD CONSTRAINT opta_player_match_pkey PRIMARY KEY (opta_row_id);
ALTER TABLE ONLY public.opta_slot_breakdown ADD CONSTRAINT opta_slot_breakdown_pkey PRIMARY KEY (formation_code, slot);
ALTER TABLE ONLY public.pipeline_runs ADD CONSTRAINT pipeline_runs_pkey PRIMARY KEY (run_id);
ALTER TABLE ONLY public.player_availability_events ADD CONSTRAINT player_availability_events_pkey PRIMARY KEY (availability_event_id);
ALTER TABLE ONLY public.player_identity ADD CONSTRAINT player_identity_pkey PRIMARY KEY (fpl_code);
ALTER TABLE ONLY public.player_lineup_predictions ADD CONSTRAINT player_lineup_predictions_pkey PRIMARY KEY (lineup_prediction_id);
ALTER TABLE ONLY public.player_match_roles ADD CONSTRAINT player_match_roles_pkey PRIMARY KEY (player_match_role_id);
ALTER TABLE ONLY public.player_squad_hierarchy ADD CONSTRAINT player_squad_hierarchy_pkey PRIMARY KEY (player_squad_hierarchy_id);
ALTER TABLE ONLY public.player_tactical_profiles ADD CONSTRAINT player_tactical_profiles_pkey PRIMARY KEY (player_tactical_profile_id);
ALTER TABLE ONLY public.point_deductions ADD CONSTRAINT point_deductions_pkey PRIMARY KEY (deduction_id);
ALTER TABLE ONLY public.projection_scenario_players ADD CONSTRAINT projection_scenario_players_pkey PRIMARY KEY (scenario_player_id);
ALTER TABLE ONLY public.projection_scenario_teams ADD CONSTRAINT projection_scenario_teams_pkey PRIMARY KEY (scenario_team_id);
ALTER TABLE ONLY public.projection_scenarios ADD CONSTRAINT projection_scenarios_pkey PRIMARY KEY (scenario_id);
ALTER TABLE ONLY public.raw_match_files ADD CONSTRAINT raw_match_files_pkey PRIMARY KEY (raw_file_id);
ALTER TABLE ONLY public.result_ingestion_runs ADD CONSTRAINT result_ingestion_runs_pkey PRIMARY KEY (ingestion_run_id);
ALTER TABLE ONLY public.season_best_xi ADD CONSTRAINT season_best_xi_pkey PRIMARY KEY (season_id, fpl_code);
ALTER TABLE ONLY public.seasons ADD CONSTRAINT seasons_pkey PRIMARY KEY (season_id);
ALTER TABLE ONLY public.set_piece_hierarchies ADD CONSTRAINT set_piece_hierarchies_pkey PRIMARY KEY (set_piece_hierarchy_id);
ALTER TABLE ONLY public.source_match_rows ADD CONSTRAINT source_match_rows_pkey PRIMARY KEY (source_match_row_id);
ALTER TABLE ONLY public.tactical_data_sources ADD CONSTRAINT tactical_data_sources_pkey PRIMARY KEY (tactical_source_id);
ALTER TABLE ONLY public.tactical_formation_mappings ADD CONSTRAINT tactical_formation_mappings_pkey PRIMARY KEY (tactical_source_id, source_formation_code);
ALTER TABLE ONLY public.tactical_formation_slot_aggregates ADD CONSTRAINT tactical_formation_slot_aggregates_pkey PRIMARY KEY (tactical_source_id, source_formation_code, source_formation_slot, venue_scope);
ALTER TABLE ONLY public.tactical_player_match_observations ADD CONSTRAINT tactical_player_match_observations_pkey PRIMARY KEY (tactical_player_match_id);
ALTER TABLE ONLY public.tactical_role_priors ADD CONSTRAINT tactical_role_priors_pkey PRIMARY KEY (tactical_role);
ALTER TABLE ONLY public.tactical_team_match_observations ADD CONSTRAINT tactical_team_match_observations_pkey PRIMARY KEY (tactical_team_match_id);
ALTER TABLE ONLY public.team_aliases ADD CONSTRAINT team_aliases_pkey PRIMARY KEY (team_alias_id);
ALTER TABLE ONLY public.team_categories ADD CONSTRAINT team_categories_pkey PRIMARY KEY (category_id);
ALTER TABLE ONLY public.team_category_memberships ADD CONSTRAINT team_category_memberships_pkey PRIMARY KEY (membership_id);
ALTER TABLE ONLY public.team_finishing_position_projection ADD CONSTRAINT team_finishing_position_projection_pkey PRIMARY KEY (league_id, season_id, team_id);
ALTER TABLE ONLY public.team_match_tactics ADD CONSTRAINT team_match_tactics_pkey PRIMARY KEY (team_match_tactic_id);
ALTER TABLE ONLY public.team_player_tactical_defaults ADD CONSTRAINT team_player_tactical_defaults_pkey PRIMARY KEY (season_id, team_id, fpl_player_id);
ALTER TABLE ONLY public.team_ratings ADD CONSTRAINT team_ratings_pkey PRIMARY KEY (team_rating_id);
ALTER TABLE ONLY public.team_slug_history ADD CONSTRAINT team_slug_history_pkey PRIMARY KEY (team_slug_history_id);
ALTER TABLE ONLY public.team_strength_forward_adjustments ADD CONSTRAINT team_strength_forward_adjustments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.team_strength_manual_override ADD CONSTRAINT team_strength_manual_override_pkey PRIMARY KEY (team_id);
ALTER TABLE ONLY public.team_tactical_defaults ADD CONSTRAINT team_tactical_defaults_pkey PRIMARY KEY (team_tactical_default_id);
ALTER TABLE ONLY public.team_tactical_review_log ADD CONSTRAINT team_tactical_review_log_pkey PRIMARY KEY (season_id, team_id);
ALTER TABLE ONLY public.teams ADD CONSTRAINT teams_pkey PRIMARY KEY (team_id);
ALTER TABLE ONLY public.countries ADD CONSTRAINT countries_name_unique UNIQUE (name);
ALTER TABLE ONLY public.data_source_competitions ADD CONSTRAINT data_source_competitions_source_name_source_code_season_lab_key UNIQUE (source_name, source_code, season_label);
ALTER TABLE ONLY public.finance_filings ADD CONSTRAINT finance_filings_reporting_entity_id_document_id_key UNIQUE (reporting_entity_id, document_id);
ALTER TABLE ONLY public.finance_metric_mappings ADD CONSTRAINT finance_metric_mappings_source_xbrl_concept_metric_key_mapp_key UNIQUE (source, xbrl_concept, metric_key, mapping_version);
ALTER TABLE ONLY public.finance_metric_values ADD CONSTRAINT finance_metric_values_financial_id_metric_key_key UNIQUE (financial_id, metric_key);
ALTER TABLE ONLY public.finance_reporting_entities ADD CONSTRAINT finance_reporting_entities_team_id_company_number_key UNIQUE (team_id, company_number);
ALTER TABLE ONLY public.fixture_lineup_prediction_players ADD CONSTRAINT fixture_lineup_prediction_pla_lineup_prediction_id_fpl_play_key UNIQUE (lineup_prediction_id, fpl_player_id);
ALTER TABLE ONLY public.fixture_lineup_predictions ADD CONSTRAINT fixture_lineup_predictions_fixture_id_team_id_lineup_source_key UNIQUE (fixture_id, team_id, lineup_source_id);
ALTER TABLE ONLY public.fixtures ADD CONSTRAINT fixtures_natural_key_unique UNIQUE (league_id, season_id, kickoff_date, home_team_id, away_team_id);
ALTER TABLE ONLY public.fixtures ADD CONSTRAINT fixtures_slug_key UNIQUE (slug);
ALTER TABLE ONLY public.fpl_hindsight_optimal_squad ADD CONSTRAINT fpl_hindsight_optimal_squad_identity UNIQUE (season_id, league_id, from_matchweek, to_matchweek, budget, optimiser_version);
ALTER TABLE ONLY public.leagues ADD CONSTRAINT leagues_country_code_unique UNIQUE (country_id, code);
ALTER TABLE ONLY public.leagues ADD CONSTRAINT leagues_slug_key UNIQUE (slug);
ALTER TABLE ONLY public.lineup_prediction_sources ADD CONSTRAINT lineup_prediction_sources_source_name_key UNIQUE (source_name);
ALTER TABLE ONLY public.match_odds ADD CONSTRAINT match_odds_match_id_source_name_market_bookmaker_is_closing_key UNIQUE (match_id, source_name, market, bookmaker, is_closing);
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_natural_key_unique UNIQUE (league_id, season_id, match_date, home_team_id, away_team_id);
ALTER TABLE ONLY public.opta_player_match ADD CONSTRAINT opta_player_match_opta_player_id_match_date_team_name_key UNIQUE (opta_player_id, match_date, team_name);
ALTER TABLE ONLY public.player_availability_events ADD CONSTRAINT player_availability_events_season_id_fpl_player_id_observed_key UNIQUE (season_id, fpl_player_id, observed_at);
ALTER TABLE ONLY public.player_lineup_predictions ADD CONSTRAINT player_lineup_predictions_fixture_id_source_name_source_pla_key UNIQUE (fixture_id, source_name, source_player_id, model_version, generated_at);
ALTER TABLE ONLY public.player_match_roles ADD CONSTRAINT player_match_roles_fixture_id_team_id_source_name_source_pl_key UNIQUE (fixture_id, team_id, source_name, source_player_id);
ALTER TABLE ONLY public.player_squad_hierarchy ADD CONSTRAINT player_squad_hierarchy_season_id_fpl_player_id_key UNIQUE (season_id, fpl_player_id);
ALTER TABLE ONLY public.projection_scenario_players ADD CONSTRAINT projection_scenario_players_scenario_id_fpl_player_id_key UNIQUE (scenario_id, fpl_player_id);
ALTER TABLE ONLY public.projection_scenario_teams ADD CONSTRAINT projection_scenario_teams_scenario_id_team_id_key UNIQUE (scenario_id, team_id);
ALTER TABLE ONLY public.raw_match_files ADD CONSTRAINT raw_match_files_source_name_source_url_content_hash_key UNIQUE (source_name, source_url, content_hash);
ALTER TABLE ONLY public.seasons ADD CONSTRAINT seasons_label_unique UNIQUE (label);
ALTER TABLE ONLY public.seasons ADD CONSTRAINT seasons_slug_key UNIQUE (slug);
ALTER TABLE ONLY public.set_piece_hierarchies ADD CONSTRAINT set_piece_hierarchies_season_id_team_id_set_piece_type_sour_key UNIQUE (season_id, team_id, set_piece_type, source_name, source_player_id, valid_from);
ALTER TABLE ONLY public.source_match_rows ADD CONSTRAINT source_match_rows_raw_file_row_key_unique UNIQUE (raw_file_id, source_row_key);
ALTER TABLE ONLY public.source_match_rows ADD CONSTRAINT source_match_rows_source_competition_id_source_row_key_key UNIQUE (source_competition_id, source_row_key);
ALTER TABLE ONLY public.tactical_data_sources ADD CONSTRAINT tactical_data_sources_source_name_source_season_label_key UNIQUE (source_name, source_season_label);
ALTER TABLE ONLY public.tactical_player_match_observations ADD CONSTRAINT tactical_player_match_observa_tactical_team_match_id_source_key UNIQUE (tactical_team_match_id, source_unique_player_ref, source_formation_slot);
ALTER TABLE ONLY public.tactical_team_match_observations ADD CONSTRAINT tactical_team_match_observati_tactical_source_id_source_mat_key UNIQUE (tactical_source_id, source_match_ref, source_team_id);
ALTER TABLE ONLY public.team_aliases ADD CONSTRAINT team_aliases_source_raw_unique UNIQUE (source_name, raw_name);
ALTER TABLE ONLY public.team_categories ADD CONSTRAINT team_categories_slug_unique UNIQUE (slug);
ALTER TABLE ONLY public.team_category_memberships ADD CONSTRAINT team_category_memberships_unique UNIQUE (category_id, team_id, season_id);
ALTER TABLE ONLY public.team_match_tactics ADD CONSTRAINT team_match_tactics_fixture_id_team_id_source_name_key UNIQUE (fixture_id, team_id, source_name);
ALTER TABLE ONLY public.team_ratings ADD CONSTRAINT team_ratings_unique_per_fit UNIQUE (fit_run_id, team_id);
ALTER TABLE ONLY public.team_tactical_defaults ADD CONSTRAINT team_tactical_defaults_season_team_key UNIQUE (season_id, team_id);
ALTER TABLE ONLY public.teams ADD CONSTRAINT teams_country_canonical_unique UNIQUE (country_id, canonical_name);
ALTER TABLE ONLY public.teams ADD CONSTRAINT teams_slug_key UNIQUE (slug);
ALTER TABLE ONLY public.data_source_competitions ADD CONSTRAINT data_source_competitions_competition_type_check CHECK ((competition_type = ANY (ARRAY['league'::text, 'cup'::text])));
ALTER TABLE ONLY public.finance_filings ADD CONSTRAINT finance_filings_check CHECK ((period_end >= period_start));
ALTER TABLE ONLY public.finance_filings ADD CONSTRAINT finance_filings_extraction_status_check CHECK ((extraction_status = ANY (ARRAY['discovered'::text, 'extracted'::text, 'mapped'::text, 'validated'::text, 'failed'::text])));
ALTER TABLE ONLY public.finance_filings ADD CONSTRAINT finance_filings_period_months_check CHECK ((period_months > (0)::numeric));
ALTER TABLE ONLY public.finance_filings ADD CONSTRAINT finance_filings_validation_status_check CHECK ((validation_status = ANY (ARRAY['unreviewed'::text, 'review_required'::text, 'validated'::text, 'rejected'::text])));
ALTER TABLE ONLY public.finance_ingestion_runs ADD CONSTRAINT finance_ingestion_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'partial'::text, 'failed'::text])));
ALTER TABLE ONLY public.finance_metric_dictionary ADD CONSTRAINT finance_metric_dictionary_expected_sign_check CHECK ((expected_sign = ANY (ARRAY['positive'::text, 'negative'::text, 'either'::text])));
ALTER TABLE ONLY public.finance_metric_dictionary ADD CONSTRAINT finance_metric_dictionary_metric_type_check CHECK ((metric_type = ANY (ARRAY['statutory'::text, 'normalized'::text, 'derived'::text])));
ALTER TABLE ONLY public.finance_metric_dictionary ADD CONSTRAINT finance_metric_dictionary_statement_type_check CHECK ((statement_type = ANY (ARRAY['income_statement'::text, 'balance_sheet'::text, 'cash_flow'::text, 'notes'::text, 'other'::text])));
ALTER TABLE ONLY public.finance_metric_dictionary ADD CONSTRAINT finance_metric_dictionary_value_kind_check CHECK ((value_kind = ANY (ARRAY['monetary'::text, 'count'::text, 'ratio'::text, 'text'::text])));
ALTER TABLE ONLY public.finance_metric_mappings ADD CONSTRAINT finance_metric_mappings_mapping_version_check CHECK ((mapping_version > 0));
ALTER TABLE ONLY public.finance_metric_values ADD CONSTRAINT finance_metric_values_unit_scale_check CHECK (((unit_scale IS NULL) OR (unit_scale > 0)));
ALTER TABLE ONLY public.finance_metric_values ADD CONSTRAINT finance_metric_values_validation_status_check CHECK ((validation_status = ANY (ARRAY['unreviewed'::text, 'review_required'::text, 'validated'::text, 'published'::text, 'rejected'::text])));
ALTER TABLE ONLY public.finance_periods ADD CONSTRAINT finance_periods_check CHECK ((period_end >= period_start));
ALTER TABLE ONLY public.finance_periods ADD CONSTRAINT finance_periods_check1 CHECK ((((validation_status = 'published'::text) AND (published_at IS NOT NULL)) OR (validation_status <> 'published'::text)));
ALTER TABLE ONLY public.finance_periods ADD CONSTRAINT finance_periods_period_months_check CHECK ((period_months > (0)::numeric));
ALTER TABLE ONLY public.finance_periods ADD CONSTRAINT finance_periods_season_mapping_confidence_check CHECK ((season_mapping_confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])));
ALTER TABLE ONLY public.finance_periods ADD CONSTRAINT finance_periods_unit_scale_check CHECK ((unit_scale > 0));
ALTER TABLE ONLY public.finance_periods ADD CONSTRAINT finance_periods_validation_status_check CHECK ((validation_status = ANY (ARRAY['unreviewed'::text, 'review_required'::text, 'validated'::text, 'published'::text, 'rejected'::text])));
ALTER TABLE ONLY public.finance_reporting_entities ADD CONSTRAINT finance_reporting_entities_relationship_type_check CHECK ((relationship_type = ANY (ARRAY['football_club'::text, 'parent'::text, 'holding_company'::text, 'stadium'::text, 'subsidiary'::text, 'other'::text])));
ALTER TABLE ONLY public.fixtures ADD CONSTRAINT fixtures_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'postponed'::text, 'played'::text])));
ALTER TABLE ONLY public.fixtures ADD CONSTRAINT fixtures_teams_distinct_check CHECK ((home_team_id <> away_team_id));
ALTER TABLE ONLY public.fpl_player_return_assumptions ADD CONSTRAINT fpl_player_return_assumption_post_return_start_probabilit_check CHECK (((post_return_start_probability IS NULL) OR ((post_return_start_probability >= (0)::numeric) AND (post_return_start_probability <= (1)::numeric))));
ALTER TABLE ONLY public.fpl_player_return_assumptions ADD CONSTRAINT fpl_player_return_assumptions_post_return_availability_check CHECK (((post_return_availability >= (0)::numeric) AND (post_return_availability <= (1)::numeric)));
ALTER TABLE ONLY public.fpl_player_return_assumptions ADD CONSTRAINT fpl_player_return_assumptions_pre_return_availability_check CHECK (((pre_return_availability >= (0)::numeric) AND (pre_return_availability <= (1)::numeric)));
ALTER TABLE ONLY public.fpl_player_return_assumptions ADD CONSTRAINT fpl_player_return_assumptions_return_uncertainty_days_check CHECK ((return_uncertainty_days >= 0));
ALTER TABLE ONLY public.fpl_player_squad_state ADD CONSTRAINT fpl_player_squad_state_state_check CHECK ((state = ANY (ARRAY['active'::text, 'favoured'::text, 'rotation'::text, 'out_of_favour'::text, 'injured'::text, 'doubtful'::text, 'suspended'::text, 'transferred'::text, 'loaned'::text, 'unavailable'::text])));
ALTER TABLE ONLY public.leagues ADD CONSTRAINT leagues_competition_type_check CHECK (((competition_type IS NULL) OR (competition_type = ANY (ARRAY['league'::text, 'cup'::text]))));
ALTER TABLE ONLY public.leagues ADD CONSTRAINT leagues_scope_check CHECK (((scope IS NULL) OR (scope = ANY (ARRAY['domestic'::text, 'continental'::text, 'international'::text]))));
ALTER TABLE ONLY public.match_import_runs ADD CONSTRAINT match_import_runs_status_check CHECK ((status = ANY (ARRAY['success'::text, 'failed'::text])));
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_attendance_nonnegative_check CHECK (((attendance IS NULL) OR (attendance >= 0))) NOT VALID;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_decided_by_check CHECK (((decided_by IS NULL) OR (decided_by = ANY (ARRAY['normal_time'::text, 'extra_time'::text, 'penalties'::text])))) NOT VALID;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_half_result_check CHECK (((half_time_result IS NULL) OR (half_time_result = ANY (ARRAY['H'::text, 'D'::text, 'A'::text]))));
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_penalty_goals_nonnegative_check CHECK ((((home_penalty_goals IS NULL) OR (home_penalty_goals >= 0)) AND ((away_penalty_goals IS NULL) OR (away_penalty_goals >= 0)))) NOT VALID;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_result_check CHECK ((full_time_result = ANY (ARRAY['H'::text, 'D'::text, 'A'::text])));
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_teams_distinct_check CHECK ((home_team_id <> away_team_id));
ALTER TABLE ONLY public.model_fit_runs ADD CONSTRAINT model_fit_runs_rho_check CHECK (((rho >= ('-1'::integer)::double precision) AND (rho <= (1)::double precision)));
ALTER TABLE ONLY public.model_fit_runs ADD CONSTRAINT model_fit_runs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])));
ALTER TABLE ONLY public.model_fit_runs ADD CONSTRAINT model_fit_runs_window_check CHECK ((window_end_date > window_start_date));
ALTER TABLE ONLY public.pipeline_runs ADD CONSTRAINT pipeline_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'warning'::text, 'failed'::text])));
ALTER TABLE ONLY public.player_lineup_predictions ADD CONSTRAINT player_lineup_predictions_expected_minutes_check CHECK (((expected_minutes IS NULL) OR ((expected_minutes >= (0)::numeric) AND (expected_minutes <= (130)::numeric))));
ALTER TABLE ONLY public.player_lineup_predictions ADD CONSTRAINT player_lineup_predictions_prob_60_plus_check CHECK (((prob_60_plus >= (0)::numeric) AND (prob_60_plus <= (1)::numeric)));
ALTER TABLE ONLY public.player_lineup_predictions ADD CONSTRAINT player_lineup_predictions_prob_appearance_check CHECK (((prob_appearance >= (0)::numeric) AND (prob_appearance <= (1)::numeric)));
ALTER TABLE ONLY public.player_lineup_predictions ADD CONSTRAINT player_lineup_predictions_prob_start_check CHECK (((prob_start >= (0)::numeric) AND (prob_start <= (1)::numeric)));
ALTER TABLE ONLY public.player_match_roles ADD CONSTRAINT player_match_roles_minutes_check CHECK (((minutes IS NULL) OR ((minutes >= 0) AND (minutes <= 130))));
ALTER TABLE ONLY public.player_squad_hierarchy ADD CONSTRAINT player_squad_hierarchy_squad_status_check CHECK ((squad_status = ANY (ARRAY['first_choice'::text, 'rotation'::text, 'backup'::text, 'fringe'::text, 'unknown'::text])));
ALTER TABLE ONLY public.point_deductions ADD CONSTRAINT point_deductions_points_check CHECK ((points <> 0));
ALTER TABLE ONLY public.result_ingestion_runs ADD CONSTRAINT result_ingestion_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'partial'::text, 'failed'::text])));
ALTER TABLE ONLY public.seasons ADD CONSTRAINT seasons_years_check CHECK (((end_year = (start_year + 1)) OR (end_year = start_year)));
ALTER TABLE ONLY public.set_piece_hierarchies ADD CONSTRAINT set_piece_hierarchies_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)));
ALTER TABLE ONLY public.set_piece_hierarchies ADD CONSTRAINT set_piece_hierarchies_rank_check CHECK ((rank > 0));
ALTER TABLE ONLY public.set_piece_hierarchies ADD CONSTRAINT set_piece_hierarchies_set_piece_type_check CHECK ((set_piece_type = ANY (ARRAY['penalty'::text, 'direct_free_kick'::text, 'corner_left'::text, 'corner_right'::text, 'indirect_free_kick'::text])));
ALTER TABLE ONLY public.tactical_formation_mappings ADD CONSTRAINT tactical_formation_mappings_mapping_confidence_check CHECK (((mapping_confidence >= (0)::numeric) AND (mapping_confidence <= (1)::numeric)));
ALTER TABLE ONLY public.tactical_formation_slot_aggregates ADD CONSTRAINT tactical_formation_slot_aggregates_venue_scope_check CHECK ((venue_scope = ANY (ARRAY['ALL'::text, 'H'::text, 'A'::text, 'N'::text])));
ALTER TABLE ONLY public.tactical_team_match_observations ADD CONSTRAINT tactical_team_match_observations_venue_check CHECK (((venue IS NULL) OR (venue = ANY (ARRAY['H'::text, 'A'::text, 'N'::text]))));
ALTER TABLE ONLY public.team_match_tactics ADD CONSTRAINT team_match_tactics_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)));
ALTER TABLE ONLY public.team_strength_forward_adjustments ADD CONSTRAINT team_strength_forward_adjustments_check CHECK (((effective_to IS NULL) OR (effective_to >= effective_from)));
ALTER TABLE ONLY public.team_strength_forward_adjustments ADD CONSTRAINT team_strength_forward_adjustments_decay_fixtures_check CHECK (((decay_fixtures IS NULL) OR (decay_fixtures > (0)::numeric)));
ALTER TABLE ONLY public.team_strength_forward_adjustments ADD CONSTRAINT team_strength_forward_adjustments_scope_check CHECK ((scope = ANY (ARRAY['system'::text, 'admin'::text, 'user'::text])));

-- ----------------------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------------------

CREATE INDEX finance_filings_entity_period_idx ON public.finance_filings USING btree (reporting_entity_id, period_end DESC);
CREATE INDEX finance_metric_mappings_concept_idx ON public.finance_metric_mappings USING btree (source, xbrl_concept) WHERE is_active;
CREATE INDEX finance_metric_values_financial_idx ON public.finance_metric_values USING btree (financial_id);
CREATE INDEX finance_metric_values_metric_idx ON public.finance_metric_values USING btree (metric_key);
CREATE UNIQUE INDEX finance_periods_current_version_uniq ON public.finance_periods USING btree (team_id, period_end) WHERE is_current_version;
CREATE INDEX finance_periods_published_idx ON public.finance_periods USING btree (team_id, period_end DESC) WHERE ((validation_status = 'published'::text) AND is_current_version);
CREATE INDEX finance_periods_team_period_idx ON public.finance_periods USING btree (team_id, period_end DESC);
CREATE INDEX finance_raw_facts_concept_idx ON public.finance_raw_facts USING btree (xbrl_concept);
CREATE INDEX finance_raw_facts_filing_idx ON public.finance_raw_facts USING btree (filing_id);
CREATE INDEX finance_reporting_entities_team_idx ON public.finance_reporting_entities USING btree (team_id);
CREATE INDEX idx_actual_lineup_players_fixture_team ON public.fixture_actual_lineup_players USING btree (fixture_id, team_id);
CREATE INDEX idx_actual_lineup_players_fpl ON public.fixture_actual_lineup_players USING btree (fpl_player_id);
CREATE INDEX fixture_changes_detected_at_idx ON public.fixture_changes USING btree (detected_at DESC);
CREATE INDEX fixture_changes_fixture_id_idx ON public.fixture_changes USING btree (fixture_id);
CREATE INDEX fixture_lineup_prediction_players_player_idx ON public.fixture_lineup_prediction_players USING btree (fpl_player_id);
CREATE INDEX fixture_lineup_predictions_fixture_idx ON public.fixture_lineup_predictions USING btree (fixture_id, team_id);
CREATE INDEX fixtures_slug_idx ON public.fixtures USING btree (slug);
CREATE INDEX idx_fixtures_away_team ON public.fixtures USING btree (away_team_id);
CREATE INDEX idx_fixtures_home_team ON public.fixtures USING btree (home_team_id);
CREATE INDEX idx_fixtures_league_season ON public.fixtures USING btree (league_id, season_id, kickoff_date);
CREATE INDEX idx_fixtures_season_matchweek_fixture ON public.fixtures USING btree (season_id, matchweek, fixture_id);
CREATE INDEX fpl_fixtures_event_idx ON public.fpl_fixtures USING btree (fpl_event_id);
CREATE INDEX fpl_fixtures_season_idx ON public.fpl_fixtures USING btree (season_id, fpl_fixture_id);
CREATE INDEX fpl_gw_history_code_idx ON public.fpl_player_gameweek_history USING btree (fpl_code, season_id);
CREATE INDEX fpl_gw_history_season_gw_idx ON public.fpl_player_gameweek_history USING btree (season_id, gameweek);
CREATE INDEX fpl_player_gameweeks_event_idx ON public.fpl_player_gameweeks USING btree (fpl_event_id);
CREATE INDEX fpl_player_gameweeks_season_idx ON public.fpl_player_gameweeks USING btree (season_id, fpl_player_id, fpl_event_id);
CREATE INDEX fpl_player_projections_fixture_model_idx ON public.fpl_player_projections USING btree (fixture_id, model_version);
CREATE UNIQUE INDEX fpl_player_projections_key_uidx ON public.fpl_player_projections USING btree (fixture_id, fpl_player_id, model_version);
CREATE INDEX fpl_player_projections_player_idx ON public.fpl_player_projections USING btree (fpl_player_id, fixture_id);
CREATE INDEX idx_fpl_player_projections_scenario_range ON public.fpl_player_projections USING btree (season_id, model_version, scenario_key, fixture_id);
CREATE INDEX idx_fpl_player_projections_season_model_fixture ON public.fpl_player_projections USING btree (season_id, model_version, fixture_id);
CREATE UNIQUE INDEX uq_fpl_player_return_active ON public.fpl_player_return_assumptions USING btree (season_id, fpl_player_id) WHERE is_active;
CREATE INDEX fpl_player_season_totals_points_idx ON public.fpl_player_season_totals USING btree (season_id, total_points DESC);
CREATE INDEX fpl_player_snapshots_player_date_idx ON public.fpl_player_snapshots USING btree (fpl_player_id, snapshot_date DESC);
CREATE INDEX fpl_player_snapshots_season_idx ON public.fpl_player_snapshots USING btree (season_id, fpl_player_id, snapshot_date DESC);
CREATE INDEX fpl_player_squad_state_current_idx ON public.fpl_player_squad_state USING btree (season_id, fpl_player_id, effective_from DESC);
CREATE UNIQUE INDEX fpl_players_code_season_unique ON public.fpl_players USING btree (fpl_code, season_id);
CREATE INDEX fpl_players_season_idx ON public.fpl_players USING btree (season_id, fpl_player_id);
CREATE UNIQUE INDEX fpl_players_slug_season_unique ON public.fpl_players USING btree (season_id, slug);
CREATE INDEX fpl_players_team_idx ON public.fpl_players USING btree (fpl_team_id);
CREATE UNIQUE INDEX fpl_projection_model_parameters_uidx ON public.fpl_projection_model_parameters USING btree (season_id, model_version, parameter_name, COALESCE(player_position, ''::text));
CREATE UNIQUE INDEX fpl_scoring_rules_key_uidx ON public.fpl_scoring_rules USING btree (season_id, rule_code, COALESCE(player_position, ''::text));
CREATE INDEX fpl_teams_season_idx ON public.fpl_teams USING btree (season_id, fpl_team_id);
CREATE INDEX leagues_slug_idx ON public.leagues USING btree (slug);
CREATE INDEX idx_match_odds_match ON public.match_odds USING btree (match_id);
CREATE UNIQUE INDEX match_odds_unique_quote ON public.match_odds USING btree (match_id, source_name, market, bookmaker, is_closing);
CREATE INDEX idx_model_fit_runs_league_id ON public.model_fit_runs USING btree (league_id, fitted_at DESC);
CREATE INDEX opta_player_match_formation_idx ON public.opta_player_match USING btree (formation_code, formation_slot);
CREATE INDEX opta_player_match_player_idx ON public.opta_player_match USING btree (opta_player_id);
CREATE INDEX pipeline_runs_job_name_started_at_idx ON public.pipeline_runs USING btree (job_name, started_at DESC);
CREATE INDEX player_availability_player_time_idx ON public.player_availability_events USING btree (season_id, fpl_player_id, observed_at DESC);
CREATE UNIQUE INDEX player_identity_slug_unique ON public.player_identity USING btree (slug);
CREATE INDEX lineup_predictions_fixture_latest_idx ON public.player_lineup_predictions USING btree (fixture_id, generated_at DESC);
CREATE INDEX player_match_roles_fixture_idx ON public.player_match_roles USING btree (fixture_id, team_id);
CREATE INDEX player_match_roles_source_player_idx ON public.player_match_roles USING btree (source_name, source_player_id);
CREATE INDEX player_squad_hierarchy_team_idx ON public.player_squad_hierarchy USING btree (season_id, team_id);
CREATE UNIQUE INDEX player_tactical_profiles_source_uidx ON public.player_tactical_profiles USING btree (season_id, source_name, source_player_id);
CREATE INDEX player_tactical_profiles_team_idx ON public.player_tactical_profiles USING btree (team_id);
CREATE INDEX projection_scenario_players_scenario_idx ON public.projection_scenario_players USING btree (scenario_id);
CREATE INDEX projection_scenarios_fixture_idx ON public.projection_scenarios USING btree (fixture_id);
CREATE INDEX raw_match_files_source_idx ON public.raw_match_files USING btree (source_name, season_label, competition_code, retrieved_at DESC);
CREATE INDEX idx_result_ingestion_runs_started ON public.result_ingestion_runs USING btree (started_at DESC);
CREATE INDEX seasons_slug_idx ON public.seasons USING btree (slug);
CREATE INDEX set_piece_team_type_idx ON public.set_piece_hierarchies USING btree (season_id, team_id, set_piece_type, rank);
CREATE INDEX idx_source_match_rows_lookup ON public.source_match_rows USING btree (source_competition_id, source_match_date, source_home_team, source_away_team);
CREATE INDEX source_match_rows_raw_file_idx ON public.source_match_rows USING btree (raw_file_id);
CREATE INDEX idx_tactical_player_role ON public.tactical_player_match_observations USING btree (canonical_role) WHERE (canonical_role IS NOT NULL);
CREATE INDEX idx_tactical_player_source_slot ON public.tactical_player_match_observations USING btree (source_formation_slot);
CREATE INDEX idx_tactical_player_team_match ON public.tactical_player_match_observations USING btree (tactical_team_match_id);
CREATE INDEX idx_tactical_team_match_canonical_formation ON public.tactical_team_match_observations USING btree (canonical_formation) WHERE (canonical_formation IS NOT NULL);
CREATE INDEX idx_tactical_team_match_fixture ON public.tactical_team_match_observations USING btree (canonical_fixture_id) WHERE (canonical_fixture_id IS NOT NULL);
CREATE INDEX idx_tactical_team_match_source_formation ON public.tactical_team_match_observations USING btree (tactical_source_id, source_formation_code);
CREATE INDEX idx_tactical_team_match_team ON public.tactical_team_match_observations USING btree (canonical_team_id) WHERE (canonical_team_id IS NOT NULL);
CREATE INDEX idx_team_category_memberships_category_season ON public.team_category_memberships USING btree (category_id, season_id);
CREATE INDEX idx_team_category_memberships_team ON public.team_category_memberships USING btree (team_id);
CREATE INDEX team_match_tactics_team_idx ON public.team_match_tactics USING btree (team_id, season_id);
CREATE INDEX idx_team_ratings_team_id ON public.team_ratings USING btree (team_id);
CREATE INDEX team_slug_history_old_slug_idx ON public.team_slug_history USING btree (old_slug);
CREATE INDEX idx_team_strength_forward_adj_lookup ON public.team_strength_forward_adjustments USING btree (season_id, team_id, scenario_key, effective_from, effective_to) WHERE is_active;
CREATE UNIQUE INDEX team_tactical_defaults_season_team_uidx ON public.team_tactical_defaults USING btree (season_id, team_id);
CREATE INDEX teams_slug_idx ON public.teams USING btree (slug);

-- ----------------------------------------------------------------------------
-- FOREIGN KEYS
-- ----------------------------------------------------------------------------

ALTER TABLE ONLY public.app_users ADD CONSTRAINT app_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.finance_filings ADD CONSTRAINT finance_filings_ingestion_run_id_fkey FOREIGN KEY (ingestion_run_id) REFERENCES finance_ingestion_runs(ingestion_run_id) ON DELETE SET NULL;
ALTER TABLE ONLY public.finance_filings ADD CONSTRAINT finance_filings_reporting_entity_id_fkey FOREIGN KEY (reporting_entity_id) REFERENCES finance_reporting_entities(reporting_entity_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.finance_filings ADD CONSTRAINT finance_filings_supersedes_filing_id_fkey FOREIGN KEY (supersedes_filing_id) REFERENCES finance_filings(filing_id) ON DELETE SET NULL;
ALTER TABLE ONLY public.finance_metric_mappings ADD CONSTRAINT finance_metric_mappings_metric_key_fkey FOREIGN KEY (metric_key) REFERENCES finance_metric_dictionary(metric_key) ON DELETE RESTRICT;
ALTER TABLE ONLY public.finance_metric_values ADD CONSTRAINT finance_metric_values_financial_id_fkey FOREIGN KEY (financial_id) REFERENCES finance_periods(financial_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.finance_metric_values ADD CONSTRAINT finance_metric_values_metric_key_fkey FOREIGN KEY (metric_key) REFERENCES finance_metric_dictionary(metric_key) ON DELETE RESTRICT;
ALTER TABLE ONLY public.finance_metric_values ADD CONSTRAINT finance_metric_values_raw_fact_id_fkey FOREIGN KEY (raw_fact_id) REFERENCES finance_raw_facts(raw_fact_id) ON DELETE SET NULL;
ALTER TABLE ONLY public.finance_periods ADD CONSTRAINT finance_periods_filing_id_fkey FOREIGN KEY (filing_id) REFERENCES finance_filings(filing_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.finance_periods ADD CONSTRAINT finance_periods_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.finance_periods ADD CONSTRAINT finance_periods_supersedes_financial_id_fkey FOREIGN KEY (supersedes_financial_id) REFERENCES finance_periods(financial_id) ON DELETE SET NULL;
ALTER TABLE ONLY public.finance_periods ADD CONSTRAINT finance_periods_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.finance_raw_facts ADD CONSTRAINT finance_raw_facts_filing_id_fkey FOREIGN KEY (filing_id) REFERENCES finance_filings(filing_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.finance_reporting_entities ADD CONSTRAINT finance_reporting_entities_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.fixture_actual_lineup_players ADD CONSTRAINT fixture_actual_lineup_players_fixture_id_team_id_fkey FOREIGN KEY (fixture_id, team_id) REFERENCES fixture_actual_team_lineups(fixture_id, team_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.fixture_actual_team_lineups ADD CONSTRAINT fixture_actual_team_lineups_fixture_id_fkey FOREIGN KEY (fixture_id) REFERENCES fixtures(fixture_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.fixture_actual_team_lineups ADD CONSTRAINT fixture_actual_team_lineups_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(team_id);
ALTER TABLE ONLY public.fixture_changes ADD CONSTRAINT fixture_changes_fixture_id_fkey FOREIGN KEY (fixture_id) REFERENCES fixtures(fixture_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.fixture_lineup_prediction_players ADD CONSTRAINT fixture_lineup_prediction_players_lineup_prediction_id_fkey FOREIGN KEY (lineup_prediction_id) REFERENCES fixture_lineup_predictions(lineup_prediction_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.fixture_lineup_predictions ADD CONSTRAINT fixture_lineup_predictions_lineup_source_id_fkey FOREIGN KEY (lineup_source_id) REFERENCES lineup_prediction_sources(lineup_source_id);
ALTER TABLE ONLY public.fixtures ADD CONSTRAINT fixtures_away_team_id_fkey FOREIGN KEY (away_team_id) REFERENCES teams(team_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.fixtures ADD CONSTRAINT fixtures_home_team_id_fkey FOREIGN KEY (home_team_id) REFERENCES teams(team_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.fixtures ADD CONSTRAINT fixtures_league_id_fkey FOREIGN KEY (league_id) REFERENCES leagues(league_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.fixtures ADD CONSTRAINT fixtures_prediction_fit_run_id_fkey FOREIGN KEY (prediction_fit_run_id) REFERENCES model_fit_runs(fit_run_id);
ALTER TABLE ONLY public.fixtures ADD CONSTRAINT fixtures_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.fpl_fixtures ADD CONSTRAINT fpl_fixtures_canonical_fixture_id_fkey FOREIGN KEY (canonical_fixture_id) REFERENCES fixtures(fixture_id);
ALTER TABLE ONLY public.fpl_fixtures ADD CONSTRAINT fpl_fixtures_fpl_away_team_id_fkey FOREIGN KEY (fpl_away_team_id) REFERENCES fpl_teams(fpl_team_id);
ALTER TABLE ONLY public.fpl_fixtures ADD CONSTRAINT fpl_fixtures_fpl_event_id_fkey FOREIGN KEY (fpl_event_id) REFERENCES fpl_gameweeks(fpl_event_id);
ALTER TABLE ONLY public.fpl_fixtures ADD CONSTRAINT fpl_fixtures_fpl_home_team_id_fkey FOREIGN KEY (fpl_home_team_id) REFERENCES fpl_teams(fpl_team_id);
ALTER TABLE ONLY public.fpl_fixtures ADD CONSTRAINT fpl_fixtures_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id);
ALTER TABLE ONLY public.fpl_gameweeks ADD CONSTRAINT fpl_gameweeks_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id);
ALTER TABLE ONLY public.fpl_player_gameweek_history ADD CONSTRAINT fpl_player_gameweek_history_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id);
ALTER TABLE ONLY public.fpl_player_gameweeks ADD CONSTRAINT fpl_player_gameweeks_fpl_event_id_fkey FOREIGN KEY (fpl_event_id) REFERENCES fpl_gameweeks(fpl_event_id);
ALTER TABLE ONLY public.fpl_player_gameweeks ADD CONSTRAINT fpl_player_gameweeks_fpl_fixture_id_fkey FOREIGN KEY (fpl_fixture_id) REFERENCES fpl_fixtures(fpl_fixture_id);
ALTER TABLE ONLY public.fpl_player_gameweeks ADD CONSTRAINT fpl_player_gameweeks_opponent_fpl_team_id_fkey FOREIGN KEY (opponent_fpl_team_id) REFERENCES fpl_teams(fpl_team_id);
ALTER TABLE ONLY public.fpl_player_gameweeks ADD CONSTRAINT fpl_player_gameweeks_player_season_fkey FOREIGN KEY (fpl_player_id, season_id) REFERENCES fpl_players(fpl_player_id, season_id);
ALTER TABLE ONLY public.fpl_player_gameweeks ADD CONSTRAINT fpl_player_gameweeks_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id);
ALTER TABLE ONLY public.fpl_player_season_totals ADD CONSTRAINT fpl_player_season_totals_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id);
ALTER TABLE ONLY public.fpl_player_snapshots ADD CONSTRAINT fpl_player_snapshots_player_season_fkey FOREIGN KEY (fpl_player_id, season_id) REFERENCES fpl_players(fpl_player_id, season_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.fpl_player_snapshots ADD CONSTRAINT fpl_player_snapshots_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id);
ALTER TABLE ONLY public.fpl_players ADD CONSTRAINT fpl_players_canonical_team_id_fkey FOREIGN KEY (canonical_team_id) REFERENCES teams(team_id);
ALTER TABLE ONLY public.fpl_players ADD CONSTRAINT fpl_players_fpl_team_id_fkey FOREIGN KEY (fpl_team_id) REFERENCES fpl_teams(fpl_team_id);
ALTER TABLE ONLY public.fpl_players ADD CONSTRAINT fpl_players_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id);
ALTER TABLE ONLY public.fpl_teams ADD CONSTRAINT fpl_teams_canonical_team_id_fkey FOREIGN KEY (canonical_team_id) REFERENCES teams(team_id);
ALTER TABLE ONLY public.fpl_teams ADD CONSTRAINT fpl_teams_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id);
ALTER TABLE ONLY public.leagues ADD CONSTRAINT leagues_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries(country_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.match_odds ADD CONSTRAINT match_odds_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_away_team_id_fkey FOREIGN KEY (away_team_id) REFERENCES teams(team_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_home_team_id_fkey FOREIGN KEY (home_team_id) REFERENCES teams(team_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_league_id_fkey FOREIGN KEY (league_id) REFERENCES leagues(league_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.matches ADD CONSTRAINT matches_winner_team_id_fkey FOREIGN KEY (winner_team_id) REFERENCES teams(team_id);
ALTER TABLE ONLY public.model_fit_runs ADD CONSTRAINT model_fit_runs_league_id_fkey FOREIGN KEY (league_id) REFERENCES leagues(league_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.player_availability_events ADD CONSTRAINT player_availability_events_player_season_fkey FOREIGN KEY (fpl_player_id, season_id) REFERENCES fpl_players(fpl_player_id, season_id);
ALTER TABLE ONLY public.player_availability_events ADD CONSTRAINT player_availability_events_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id);
ALTER TABLE ONLY public.player_identity ADD CONSTRAINT player_identity_first_seen_season_id_fkey FOREIGN KEY (first_seen_season_id) REFERENCES seasons(season_id);
ALTER TABLE ONLY public.player_identity ADD CONSTRAINT player_identity_last_seen_season_id_fkey FOREIGN KEY (last_seen_season_id) REFERENCES seasons(season_id);
ALTER TABLE ONLY public.player_lineup_predictions ADD CONSTRAINT player_lineup_predictions_fixture_id_fkey FOREIGN KEY (fixture_id) REFERENCES fixtures(fixture_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.player_lineup_predictions ADD CONSTRAINT player_lineup_predictions_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id);
ALTER TABLE ONLY public.player_match_roles ADD CONSTRAINT player_match_roles_fixture_id_fkey FOREIGN KEY (fixture_id) REFERENCES fixtures(fixture_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.player_match_roles ADD CONSTRAINT player_match_roles_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id);
ALTER TABLE ONLY public.player_match_roles ADD CONSTRAINT player_match_roles_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(team_id);
ALTER TABLE ONLY public.point_deductions ADD CONSTRAINT point_deductions_league_id_fkey FOREIGN KEY (league_id) REFERENCES leagues(league_id);
ALTER TABLE ONLY public.point_deductions ADD CONSTRAINT point_deductions_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id);
ALTER TABLE ONLY public.point_deductions ADD CONSTRAINT point_deductions_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(team_id);
ALTER TABLE ONLY public.projection_scenario_players ADD CONSTRAINT projection_scenario_players_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES projection_scenarios(scenario_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.projection_scenario_teams ADD CONSTRAINT projection_scenario_teams_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES projection_scenarios(scenario_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.season_best_xi ADD CONSTRAINT season_best_xi_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id);
ALTER TABLE ONLY public.set_piece_hierarchies ADD CONSTRAINT set_piece_hierarchies_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id);
ALTER TABLE ONLY public.set_piece_hierarchies ADD CONSTRAINT set_piece_hierarchies_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(team_id);
ALTER TABLE ONLY public.source_match_rows ADD CONSTRAINT source_match_rows_raw_file_id_fkey FOREIGN KEY (raw_file_id) REFERENCES raw_match_files(raw_file_id) ON DELETE SET NULL;
ALTER TABLE ONLY public.source_match_rows ADD CONSTRAINT source_match_rows_source_competition_id_fkey FOREIGN KEY (source_competition_id) REFERENCES data_source_competitions(source_competition_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tactical_formation_mappings ADD CONSTRAINT tactical_formation_mappings_tactical_source_id_fkey FOREIGN KEY (tactical_source_id) REFERENCES tactical_data_sources(tactical_source_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tactical_formation_slot_aggregates ADD CONSTRAINT tactical_formation_slot_aggregates_tactical_source_id_fkey FOREIGN KEY (tactical_source_id) REFERENCES tactical_data_sources(tactical_source_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tactical_player_match_observations ADD CONSTRAINT tactical_player_match_observations_tactical_team_match_id_fkey FOREIGN KEY (tactical_team_match_id) REFERENCES tactical_team_match_observations(tactical_team_match_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tactical_team_match_observations ADD CONSTRAINT tactical_team_match_observations_canonical_fixture_id_fkey FOREIGN KEY (canonical_fixture_id) REFERENCES fixtures(fixture_id);
ALTER TABLE ONLY public.tactical_team_match_observations ADD CONSTRAINT tactical_team_match_observations_canonical_team_id_fkey FOREIGN KEY (canonical_team_id) REFERENCES teams(team_id);
ALTER TABLE ONLY public.tactical_team_match_observations ADD CONSTRAINT tactical_team_match_observations_tactical_source_id_fkey FOREIGN KEY (tactical_source_id) REFERENCES tactical_data_sources(tactical_source_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_aliases ADD CONSTRAINT team_aliases_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_category_memberships ADD CONSTRAINT team_category_memberships_category_id_fkey FOREIGN KEY (category_id) REFERENCES team_categories(category_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_category_memberships ADD CONSTRAINT team_category_memberships_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_category_memberships ADD CONSTRAINT team_category_memberships_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_finishing_position_projection ADD CONSTRAINT team_finishing_position_projection_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(team_id);
ALTER TABLE ONLY public.team_match_tactics ADD CONSTRAINT team_match_tactics_fixture_id_fkey FOREIGN KEY (fixture_id) REFERENCES fixtures(fixture_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_match_tactics ADD CONSTRAINT team_match_tactics_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(season_id);
ALTER TABLE ONLY public.team_match_tactics ADD CONSTRAINT team_match_tactics_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(team_id);
ALTER TABLE ONLY public.team_ratings ADD CONSTRAINT team_ratings_estimated_from_fit_run_id_fkey FOREIGN KEY (estimated_from_fit_run_id) REFERENCES model_fit_runs(fit_run_id) ON DELETE SET NULL;
ALTER TABLE ONLY public.team_ratings ADD CONSTRAINT team_ratings_estimated_from_team_id_fkey FOREIGN KEY (estimated_from_team_id) REFERENCES teams(team_id) ON DELETE SET NULL;
ALTER TABLE ONLY public.team_ratings ADD CONSTRAINT team_ratings_fit_run_id_fkey FOREIGN KEY (fit_run_id) REFERENCES model_fit_runs(fit_run_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_ratings ADD CONSTRAINT team_ratings_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_slug_history ADD CONSTRAINT team_slug_history_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_strength_manual_override ADD CONSTRAINT team_strength_manual_override_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(team_id);
ALTER TABLE ONLY public.teams ADD CONSTRAINT teams_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries(country_id) ON DELETE RESTRICT;

-- ----------------------------------------------------------------------------
-- VIEWS
-- ----------------------------------------------------------------------------

CREATE VIEW public.data_health WITH (security_invoker=true) AS
 WITH fixture_last AS (
         SELECT fixture_refresh_runs.started_at,
            fixture_refresh_runs.finished_at,
            fixture_refresh_runs.status,
            fixture_refresh_runs.rows_seen,
            fixture_refresh_runs.rows_updated,
            fixture_refresh_runs.error_message,
            row_number() OVER (ORDER BY fixture_refresh_runs.started_at DESC) AS rn
           FROM fixture_refresh_runs
        ), result_last AS (
         SELECT result_ingestion_runs.started_at,
            result_ingestion_runs.finished_at,
            result_ingestion_runs.status,
            result_ingestion_runs.rows_seen,
            result_ingestion_runs.matches_upserted,
            result_ingestion_runs.matches_inserted,
            result_ingestion_runs.matches_changed,
            result_ingestion_runs.matches_unchanged,
            result_ingestion_runs.unmatched_rows,
            result_ingestion_runs.error_message,
            row_number() OVER (ORDER BY result_ingestion_runs.started_at DESC) AS rn
           FROM result_ingestion_runs
        ), prediction_stats AS (
         SELECT count(*) FILTER (WHERE fixtures.status = ANY (ARRAY['scheduled'::text, 'postponed'::text])) AS future_fixtures,
            count(*) FILTER (WHERE (fixtures.status = ANY (ARRAY['scheduled'::text, 'postponed'::text])) AND fixtures.prediction_fit_run_id IS NOT NULL) AS predicted_future_fixtures,
            max(fixtures.predicted_at) FILTER (WHERE fixtures.status = ANY (ARRAY['scheduled'::text, 'postponed'::text])) AS last_predicted_at
           FROM fixtures
        ), model_stats AS (
         SELECT max(model_fit_runs.fitted_at) AS last_model_fit_at,
            count(DISTINCT model_fit_runs.league_id) AS leagues_with_fit
           FROM model_fit_runs
        )
 SELECT 'Fixtures'::text AS component,
    f.started_at AS last_attempt_at,
        CASE
            WHEN f.status = 'success'::text THEN f.finished_at
            ELSE NULL::timestamp with time zone
        END AS last_success_at,
        CASE
            WHEN f.status = 'success'::text THEN 'Healthy'::text
            ELSE 'Warning'::text
        END AS health_status,
    f.status AS run_status,
    f.rows_seen::bigint AS rows_seen,
    f.rows_updated::bigint AS rows_changed,
    NULL::bigint AS rows_inserted,
    NULL::bigint AS rows_unchanged,
    NULL::bigint AS unmatched_rows,
    f.error_message AS details
   FROM fixture_last f
  WHERE f.rn = 1
UNION ALL
 SELECT 'League Results'::text AS component,
    r.started_at AS last_attempt_at,
    ( SELECT max(result_ingestion_runs.finished_at) AS max
           FROM result_ingestion_runs
          WHERE result_ingestion_runs.status = 'success'::text) AS last_success_at,
        CASE
            WHEN r.status = 'success'::text AND (r.matches_inserted + r.matches_changed) = 0 THEN 'No change'::text
            WHEN r.status = 'success'::text THEN 'Healthy'::text
            WHEN r.status = 'running'::text AND r.started_at < (now() - '00:20:00'::interval) THEN 'Stale'::text
            ELSE 'Warning'::text
        END AS health_status,
    r.status AS run_status,
    r.rows_seen::bigint AS rows_seen,
    r.matches_changed::bigint AS rows_changed,
    r.matches_inserted::bigint AS rows_inserted,
    r.matches_unchanged::bigint AS rows_unchanged,
    r.unmatched_rows::bigint AS unmatched_rows,
    r.error_message AS details
   FROM result_last r
  WHERE r.rn = 1
UNION ALL
 SELECT 'Predictions'::text AS component,
    p.last_predicted_at AS last_attempt_at,
    p.last_predicted_at AS last_success_at,
        CASE
            WHEN p.predicted_future_fixtures > 0 THEN 'Healthy'::text
            ELSE 'Warning'::text
        END AS health_status,
    'snapshot'::text AS run_status,
    p.future_fixtures AS rows_seen,
    p.predicted_future_fixtures AS rows_changed,
    NULL::bigint AS rows_inserted,
    p.future_fixtures - p.predicted_future_fixtures AS rows_unchanged,
    NULL::bigint AS unmatched_rows,
    concat(p.predicted_future_fixtures, ' of ', p.future_fixtures, ' future fixtures have predictions') AS details
   FROM prediction_stats p
UNION ALL
 SELECT 'Model Fit'::text AS component,
    m.last_model_fit_at AS last_attempt_at,
    m.last_model_fit_at AS last_success_at,
        CASE
            WHEN m.last_model_fit_at > (now() - '30 days'::interval) THEN 'Healthy'::text
            ELSE 'Warning'::text
        END AS health_status,
    'snapshot'::text AS run_status,
    m.leagues_with_fit AS rows_seen,
    NULL::bigint AS rows_changed,
    NULL::bigint AS rows_inserted,
    NULL::bigint AS rows_unchanged,
    NULL::bigint AS unmatched_rows,
    concat(m.leagues_with_fit, ' competitions have model fits') AS details
   FROM model_stats m;

CREATE VIEW public.finance_derived_metrics WITH (security_invoker=true) AS
 SELECT p.team_id,
    p.period_end,
    'staff_cost_ratio'::text AS metric_key,
        CASE
            WHEN rev.value IS NULL OR rev.value = 0::numeric THEN NULL::numeric
            ELSE staff.value / rev.value
        END AS value,
    'Staff costs divided by total revenue.'::text AS definition,
    1 AS calculation_version
   FROM finance_periods p
     JOIN finance_metric_values staff ON staff.financial_id = p.financial_id AND staff.metric_key = 'staff_costs'::text
     JOIN finance_metric_values rev ON rev.financial_id = p.financial_id AND rev.metric_key = 'revenue_total'::text;

CREATE VIEW public.finance_published_periods WITH (security_invoker=true) AS
 SELECT p.team_id,
    p.period_start,
    p.period_end,
    p.period_months,
    p.season_id,
    p.reporting_entity,
    p.company_number,
    p.is_consolidated,
    p.currency,
    p.unit_scale,
    max(v.value) FILTER (WHERE v.metric_key = 'revenue_total'::text) AS revenue_total,
    max(v.value) FILTER (WHERE v.metric_key = 'revenue_matchday'::text) AS revenue_matchday,
    max(v.value) FILTER (WHERE v.metric_key = 'revenue_broadcast'::text) AS revenue_broadcast,
    max(v.value) FILTER (WHERE v.metric_key = 'revenue_commercial'::text) AS revenue_commercial,
    max(v.value) FILTER (WHERE v.metric_key = 'revenue_other'::text) AS revenue_other,
    max(v.value) FILTER (WHERE v.metric_key = 'staff_costs'::text) AS staff_costs,
    max(v.value) FILTER (WHERE v.metric_key = 'player_amortisation'::text) AS player_amortisation,
    max(v.value) FILTER (WHERE v.metric_key = 'player_impairment'::text) AS player_impairment,
    max(v.value) FILTER (WHERE v.metric_key = 'profit_on_player_disposals'::text) AS profit_on_player_disposals,
    max(v.value) FILTER (WHERE v.metric_key = 'operating_profit'::text) AS operating_profit,
    max(v.value) FILTER (WHERE v.metric_key = 'profit_before_tax'::text) AS profit_before_tax,
    max(v.value) FILTER (WHERE v.metric_key = 'profit_after_tax'::text) AS profit_after_tax,
    max(v.value) FILTER (WHERE v.metric_key = 'cash'::text) AS cash,
    max(v.value) FILTER (WHERE v.metric_key = 'borrowings'::text) AS borrowings,
    max(v.value) FILTER (WHERE v.metric_key = 'total_assets'::text) AS total_assets,
    max(v.value) FILTER (WHERE v.metric_key = 'total_liabilities'::text) AS total_liabilities,
    max(v.value) FILTER (WHERE v.metric_key = 'net_assets'::text) AS net_assets,
    max(v.value) FILTER (WHERE v.metric_key = 'average_employees'::text) AS average_employees,
    p.is_latest,
    p.is_comparable,
    p.filing_date,
    p.source_url,
    p.validation_status
   FROM finance_periods p
     LEFT JOIN finance_metric_values v ON v.financial_id = p.financial_id
  GROUP BY p.financial_id;

CREATE VIEW public.finance_published_provenance WITH (security_invoker=true) AS
 SELECT p.team_id,
    p.period_end,
    v.metric_key,
    v.original_xbrl_concept,
    v.original_value,
    v.original_unit,
    v.filing_reference,
    v.document_id,
    v.source_url,
    v.mapping_version
   FROM finance_metric_values v
     JOIN finance_periods p ON p.financial_id = v.financial_id;

CREATE VIEW public.fixture_player_lineup_consensus WITH (security_invoker=true) AS
 WITH source_totals AS (
         SELECT lp.fixture_id,
            lp.team_id,
            sum(s.source_weight) AS available_weight,
            count(*) AS source_count
           FROM fixture_lineup_predictions lp
             JOIN lineup_prediction_sources s ON s.lineup_source_id = lp.lineup_source_id
          WHERE s.active
          GROUP BY lp.fixture_id, lp.team_id
        ), votes AS (
         SELECT lp.fixture_id,
            lp.team_id,
            lpp.fpl_player_id,
            sum(
                CASE
                    WHEN lpp.predicted_start THEN s.source_weight
                    ELSE 0::numeric
                END) AS positive_weight,
            count(*) FILTER (WHERE lpp.predicted_start) AS positive_sources,
            max(lpp.tactical_role) AS tactical_role
           FROM fixture_lineup_predictions lp
             JOIN fixture_lineup_prediction_players lpp ON lpp.lineup_prediction_id = lp.lineup_prediction_id
             JOIN lineup_prediction_sources s ON s.lineup_source_id = lp.lineup_source_id
          WHERE s.active
          GROUP BY lp.fixture_id, lp.team_id, lpp.fpl_player_id
        )
 SELECT st.fixture_id,
    st.team_id,
    p.fpl_player_id,
    p.web_name,
    COALESCE(v.positive_weight, 0::numeric) AS positive_weight,
    st.available_weight,
    COALESCE(v.positive_sources, 0::bigint) AS positive_sources,
    st.source_count,
        CASE
            WHEN st.available_weight > 0::numeric THEN COALESCE(v.positive_weight, 0::numeric) / st.available_weight
            ELSE 0::numeric
        END AS source_consensus_probability,
        CASE
            WHEN p.status = ANY (ARRAY['i'::text, 'u'::text, 's'::text]) THEN 0::numeric
            WHEN p.chance_of_playing_next_round IS NOT NULL THEN p.chance_of_playing_next_round::numeric / 100::numeric
            ELSE 1::numeric
        END AS availability_probability,
    v.tactical_role
   FROM source_totals st
     JOIN fpl_players p ON p.canonical_team_id = st.team_id
     LEFT JOIN votes v ON v.fixture_id = st.fixture_id AND v.team_id = st.team_id AND v.fpl_player_id = p.fpl_player_id;

CREATE VIEW public.fixture_player_tactical_consensus WITH (security_invoker=true) AS
 WITH real_consensus AS (
         SELECT lp.fixture_id,
            lp.team_id,
            lpp.fpl_player_id,
            lpp.tactical_role,
            sum(ls.source_weight * COALESCE(lpp.source_start_probability, 1::numeric)) AS role_weight,
            count(*) AS sources
           FROM fixture_lineup_predictions lp
             JOIN fixture_lineup_prediction_players lpp ON lpp.lineup_prediction_id = lp.lineup_prediction_id
             JOIN lineup_prediction_sources ls ON ls.lineup_source_id = lp.lineup_source_id AND ls.active
          WHERE lpp.tactical_role IS NOT NULL
          GROUP BY lp.fixture_id, lp.team_id, lpp.fpl_player_id, lpp.tactical_role
        ), ranked_real AS (
         SELECT real_consensus.fixture_id,
            real_consensus.team_id,
            real_consensus.fpl_player_id,
            real_consensus.tactical_role,
            real_consensus.role_weight,
            real_consensus.sources,
            row_number() OVER (PARTITION BY real_consensus.fixture_id, real_consensus.team_id, real_consensus.fpl_player_id ORDER BY real_consensus.role_weight DESC, real_consensus.tactical_role) AS rn
           FROM real_consensus
        ), projected AS (
         SELECT f.fixture_id,
                CASE
                    WHEN fp.canonical_team_id = f.home_team_id THEN f.home_team_id
                    ELSE f.away_team_id
                END AS team_id,
            fp.fpl_player_id,
            fp.element_type
           FROM fpl_players fp
             JOIN fixtures f ON (f.home_team_id = fp.canonical_team_id OR f.away_team_id = fp.canonical_team_id) AND f.season_id = 13
          WHERE fp.season_id = 13
        ), fallback AS (
         SELECT b.fixture_id,
            b.team_id,
            b.fpl_player_id,
            COALESCE(td.tactical_role,
                CASE b.element_type
                    WHEN 1 THEN 'GK'::text
                    WHEN 2 THEN 'DEF'::text
                    WHEN 3 THEN 'MID'::text
                    WHEN 4 THEN 'CF'::text
                    ELSE 'UNK'::text
                END) AS tactical_role,
            COALESCE(td.confidence, 0.30) AS role_weight,
            0::bigint AS sources
           FROM projected b
             LEFT JOIN team_player_tactical_defaults td ON td.season_id = 13 AND td.team_id = b.team_id AND td.fpl_player_id = b.fpl_player_id
          WHERE NOT (EXISTS ( SELECT 1
                   FROM ranked_real r
                  WHERE r.fixture_id = b.fixture_id AND r.team_id = b.team_id AND r.fpl_player_id = b.fpl_player_id AND r.rn = 1))
        )
 SELECT ranked_real.fixture_id,
    ranked_real.team_id,
    ranked_real.fpl_player_id,
    ranked_real.tactical_role,
    ranked_real.role_weight,
    ranked_real.sources
   FROM ranked_real
  WHERE ranked_real.rn = 1
UNION ALL
 SELECT fallback.fixture_id,
    fallback.team_id,
    fallback.fpl_player_id,
    fallback.tactical_role,
    fallback.role_weight,
    fallback.sources
   FROM fallback;

CREATE VIEW public.fixture_team_tactical_consensus WITH (security_invoker=true) AS
 WITH x AS (
         SELECT lp.fixture_id,
            lp.team_id,
            lp.formation,
            sum(s.source_weight) AS weight,
            count(*) AS sources,
            row_number() OVER (PARTITION BY lp.fixture_id, lp.team_id ORDER BY (sum(s.source_weight)) DESC, (count(*)) DESC, lp.formation) AS rn
           FROM fixture_lineup_predictions lp
             JOIN lineup_prediction_sources s ON s.lineup_source_id = lp.lineup_source_id AND s.active
          GROUP BY lp.fixture_id, lp.team_id, lp.formation
        ), manual AS (
         SELECT f.fixture_id,
            t.team_id,
            d.formation,
            d.confidence AS consensus_weight,
            0::bigint AS sources
           FROM fixtures f
             CROSS JOIN LATERAL ( VALUES (f.home_team_id), (f.away_team_id)) t(team_id)
             JOIN team_tactical_defaults d ON d.season_id = f.season_id AND d.team_id = t.team_id
          WHERE f.season_id = 13 AND d.source_name = 'manual'::text AND (EXISTS ( SELECT 1
                   FROM fpl_player_projections p
                  WHERE p.fixture_id = f.fixture_id AND p.model_version = 'leaguewide_v4'::text))
        ), src AS (
         SELECT x.fixture_id,
            x.team_id,
            x.formation,
            x.weight AS consensus_weight,
            x.sources
           FROM x
          WHERE x.rn = 1 AND NOT (EXISTS ( SELECT 1
                   FROM manual m
                  WHERE m.fixture_id = x.fixture_id AND m.team_id = x.team_id))
        ), fallback AS (
         SELECT f.fixture_id,
            t.team_id,
            d.formation,
            d.confidence AS consensus_weight,
            0::bigint AS sources
           FROM fixtures f
             CROSS JOIN LATERAL ( VALUES (f.home_team_id), (f.away_team_id)) t(team_id)
             JOIN team_tactical_defaults d ON d.season_id = f.season_id AND d.team_id = t.team_id
          WHERE f.season_id = 13 AND d.source_name <> 'manual'::text AND (EXISTS ( SELECT 1
                   FROM fpl_player_projections p
                  WHERE p.fixture_id = f.fixture_id AND p.model_version = 'leaguewide_v4'::text)) AND NOT (EXISTS ( SELECT 1
                   FROM src s
                  WHERE s.fixture_id = f.fixture_id AND s.team_id = t.team_id))
        )
 SELECT manual.fixture_id,
    manual.team_id,
    manual.formation,
    manual.consensus_weight,
    manual.sources
   FROM manual
UNION ALL
 SELECT src.fixture_id,
    src.team_id,
    src.formation,
    src.consensus_weight,
    src.sources
   FROM src
UNION ALL
 SELECT fallback.fixture_id,
    fallback.team_id,
    fallback.formation,
    fallback.consensus_weight,
    fallback.sources
   FROM fallback;

CREATE VIEW public.fpl_full_season_projection_health_v1 AS
 WITH fx AS (
         SELECT fixtures.matchweek,
            count(*) AS fixtures,
            count(*) FILTER (WHERE fixtures.predicted_home_goals IS NOT NULL AND fixtures.predicted_away_goals IS NOT NULL) AS team_predictions
           FROM fixtures
          WHERE fixtures.season_id = 13 AND fixtures.league_id = 1
          GROUP BY fixtures.matchweek
        ), pr AS (
         SELECT f.matchweek,
            count(*) AS player_projection_rows,
            count(DISTINCT p.fixture_id) AS projected_fixtures
           FROM fpl_player_projections p
             JOIN fixtures f ON f.fixture_id = p.fixture_id
          WHERE p.season_id = 13 AND p.model_version = 'leaguewide_v6'::text AND f.league_id = 1
          GROUP BY f.matchweek
        )
 SELECT fx.matchweek,
    fx.fixtures,
    fx.team_predictions,
    COALESCE(pr.projected_fixtures, 0::bigint) AS projected_fixtures,
    COALESCE(pr.player_projection_rows, 0::bigint) AS player_projection_rows,
    COALESCE(pr.projected_fixtures, 0::bigint) = fx.fixtures AS full_player_coverage
   FROM fx
     LEFT JOIN pr USING (matchweek)
  ORDER BY fx.matchweek;

CREATE VIEW public.fpl_player_defensive_contribution_usage WITH (security_invoker=true) AS
 SELECT p.season_id,
    p.fpl_player_id,
    p.element_type,
    count(g.fpl_fixture_id) FILTER (WHERE g.minutes > 0) AS appearances,
    sum(g.minutes) AS minutes,
    sum(COALESCE(((g.source_payload -> 'stats'::text) ->> 'clearances_blocks_interceptions'::text)::numeric, 0::numeric)) AS cbi,
    sum(COALESCE(((g.source_payload -> 'stats'::text) ->> 'recoveries'::text)::numeric, 0::numeric)) AS recoveries,
    sum(COALESCE(((g.source_payload -> 'stats'::text) ->> 'tackles'::text)::numeric, 0::numeric)) AS tackles
   FROM fpl_players p
     LEFT JOIN fpl_player_gameweeks g ON g.fpl_player_id = p.fpl_player_id AND g.season_id = p.season_id
  GROUP BY p.season_id, p.fpl_player_id, p.element_type;

CREATE VIEW public.fpl_player_squad_state_current WITH (security_invoker=true) AS
 SELECT DISTINCT ON (season_id, fpl_player_id) season_id,
    fpl_player_id,
    team_id,
    state,
    availability_probability,
    start_probability_override,
    effective_from,
    effective_to,
    source_name,
    source_reference,
    evidence,
    updated_at
   FROM fpl_player_squad_state
  WHERE effective_from <= now() AND (effective_to IS NULL OR effective_to > now())
  ORDER BY season_id, fpl_player_id, (source_name = 'manual_tactical_override'::text) DESC, effective_from DESC;

CREATE VIEW public.fpl_player_substitution_usage WITH (security_invoker=true) AS
 SELECT p.season_id,
    p.fpl_player_id,
    count(g.fpl_fixture_id) FILTER (WHERE g.minutes > 0) AS appearances,
    count(g.fpl_fixture_id) FILTER (WHERE g.minutes >= 60) AS likely_starts,
    count(g.fpl_fixture_id) FILTER (WHERE g.minutes >= 1 AND g.minutes <= 59) AS sub_appearances,
    COALESCE(avg(g.minutes) FILTER (WHERE g.minutes >= 1 AND g.minutes <= 59), 20::numeric) AS avg_sub_minutes
   FROM fpl_players p
     LEFT JOIN fpl_player_gameweeks g ON g.fpl_player_id = p.fpl_player_id AND g.season_id = p.season_id
  GROUP BY p.season_id, p.fpl_player_id;

CREATE VIEW public.fpl_prediction_actual_start_comparison WITH (security_invoker=true) AS
 SELECT f.fixture_id,
    f.matchweek,
    f.kickoff_date,
    f.kickoff_time,
    a.team_id,
    a.fpl_player_id,
    a.player_name_source,
    a.web_name,
    a.starter AS actual_started,
    a.minutes AS actual_minutes,
    p.model_version,
    p.start_probability AS predicted_start_probability,
    p.expected_minutes AS predicted_minutes,
    p.generated_at,
    p.generated_at < (f.kickoff_date::timestamp without time zone + COALESCE(f.kickoff_time, '00:00:00'::time without time zone)::interval) AS generated_pre_kickoff
   FROM fixture_actual_lineup_players a
     JOIN fixtures f ON f.fixture_id = a.fixture_id
     LEFT JOIN LATERAL ( SELECT pp.model_version,
            pp.start_probability,
            pp.expected_minutes,
            pp.generated_at
           FROM fpl_player_projections pp
          WHERE pp.fixture_id = a.fixture_id AND pp.fpl_player_id = a.fpl_player_id
          ORDER BY pp.generated_at DESC
         LIMIT 1) p ON true
  WHERE a.starter OR a.minutes > 0;

CREATE VIEW public.fpl_projection_fixture_readiness WITH (security_invoker=true) AS
 SELECT f.fixture_id,
    f.kickoff_date,
    f.home_team_id,
    f.away_team_id,
    f.predicted_home_goals,
    f.predicted_away_goals,
    f.predicted_home_goals IS NOT NULL AND f.predicted_away_goals IS NOT NULL AS has_team_xg,
    COALESCE(( SELECT count(*) AS count
           FROM fixture_lineup_predictions lp
          WHERE lp.fixture_id = f.fixture_id), 0::bigint) AS lineup_sources,
    COALESCE(( SELECT count(*) AS count
           FROM fixture_lineup_prediction_players lpp
             JOIN fixture_lineup_predictions lp ON lp.lineup_prediction_id = lpp.lineup_prediction_id
          WHERE lp.fixture_id = f.fixture_id), 0::bigint) AS lineup_player_rows,
    COALESCE(( SELECT count(*) AS count
           FROM fpl_player_projections p
          WHERE p.fixture_id = f.fixture_id AND p.model_version = 'prototype_v3'::text), 0::bigint) AS projection_rows
   FROM fixtures f
     JOIN leagues l ON l.league_id = f.league_id
  WHERE f.season_id = 13 AND l.code = 'E0'::text;

CREATE VIEW public.fpl_projection_frontend_feed_v6 WITH (security_invoker=true) AS
 SELECT pr.fixture_id,
    f.kickoff_date,
    pr.fpl_player_id,
    p.web_name,
    p.canonical_team_id AS team_id,
    p.element_type AS fpl_position,
    pr.tactical_role,
    pr.minutes_source,
    pr.model_version,
    pr.expected_minutes,
    LEAST(1::numeric, GREATEST(0::numeric, pr.start_probability)) AS start_probability,
    LEAST(GREATEST(0::numeric, 1::numeric - LEAST(1::numeric, GREATEST(0::numeric, pr.start_probability))), GREATEST(0::numeric, pr.sub_appearance_probability)) AS sub_appearance_probability,
    pr.expected_goals,
    pr.expected_assists,
    pr.clean_sheet_probability,
    pr.defensive_contribution_probability,
    pr.expected_bonus,
    pr.expected_fpl_points,
    pr.lineup_confidence,
    pr.generated_at
   FROM fpl_player_projections pr
     JOIN fixtures f ON f.fixture_id = pr.fixture_id
     JOIN fpl_players p ON p.season_id = pr.season_id AND p.fpl_player_id = pr.fpl_player_id
  WHERE pr.model_version = 'leaguewide_v6'::text;

CREATE VIEW public.fpl_season_fixture_feed WITH (security_invoker=true) AS
 SELECT f.fixture_id,
    f.season_id,
    f.matchweek,
    f.round,
    f.round_number,
    f.kickoff_date,
    f.kickoff_time,
    f.status,
    f.home_team_id,
    ht.canonical_name AS home_team,
    f.away_team_id,
    at.canonical_name AS away_team,
    f.predicted_home_goals,
    f.predicted_away_goals,
    f.predicted_at,
        CASE
            WHEN f.predicted_home_goals IS NOT NULL AND f.predicted_away_goals IS NOT NULL THEN true
            ELSE false
        END AS has_projection
   FROM fixtures f
     JOIN teams ht ON ht.team_id = f.home_team_id
     JOIN teams at ON at.team_id = f.away_team_id
  WHERE f.season_id = 13 AND f.league_id = (( SELECT leagues.league_id
           FROM leagues
          WHERE leagues.code = 'E0'::text
         LIMIT 1));

CREATE VIEW public.fpl_team_strength_current WITH (security_invoker=true) AS
 WITH latest_e0 AS (
         SELECT model_fit_runs.fit_run_id,
            model_fit_runs.league_id,
            model_fit_runs.window_start_date,
            model_fit_runs.window_end_date,
            model_fit_runs.rho,
            model_fit_runs.home_advantage,
            model_fit_runs.decay_half_life_days,
            model_fit_runs.matches_used,
            model_fit_runs.fitted_at
           FROM model_fit_runs
          WHERE model_fit_runs.league_id = 1 AND model_fit_runs.converged = true
          ORDER BY model_fit_runs.fitted_at DESC, model_fit_runs.fit_run_id DESC
         LIMIT 1
        ), current_teams AS (
         SELECT lf.fit_run_id,
            lf.league_id,
            lf.window_start_date,
            lf.window_end_date,
            lf.rho,
            lf.home_advantage,
            lf.decay_half_life_days,
            lf.matches_used,
            lf.fitted_at,
            tr.team_id,
            t.canonical_name,
            tr.attack_strength,
            tr.defence_strength,
            tr.is_estimated,
            ft.fpl_team_id,
            ft.name AS fpl_team_name,
            ft.short_name AS fpl_short_name
           FROM latest_e0 lf
             JOIN team_ratings tr ON tr.fit_run_id = lf.fit_run_id
             JOIN teams t ON t.team_id = tr.team_id
             JOIN fpl_teams ft ON ft.canonical_team_id = tr.team_id
        )
 SELECT fit_run_id,
    league_id,
    window_start_date,
    window_end_date,
    rho,
    home_advantage,
    decay_half_life_days,
    matches_used,
    fitted_at,
    team_id,
    canonical_name,
    attack_strength,
    defence_strength,
    is_estimated,
    fpl_team_id,
    fpl_team_name,
    fpl_short_name,
    round((100::double precision * percent_rank() OVER (ORDER BY attack_strength))::numeric, 1) AS attack_score,
    round((100::double precision * percent_rank() OVER (ORDER BY defence_strength))::numeric, 1) AS defence_score,
    round((50::double precision * percent_rank() OVER (ORDER BY attack_strength) + 50::double precision * percent_rank() OVER (ORDER BY defence_strength))::numeric, 1) AS overall_score,
    rank() OVER (ORDER BY attack_strength DESC) AS attack_rank,
    rank() OVER (ORDER BY defence_strength DESC) AS defence_rank
   FROM current_teams c;

CREATE VIEW public.league_fit_status WITH (security_invoker=true) AS
 SELECT l.league_id,
    l.code AS league_code,
    l.name AS league_name,
    latest_attempt.fit_run_id AS latest_attempted_fit_run_id,
    latest_attempt.status AS latest_attempted_status,
    latest_attempt.fitted_at AS latest_attempted_fitted_at,
    latest_attempt.matches_used AS latest_attempted_matches_used,
    latest_attempt.converged AS latest_attempted_converged,
    latest_attempt.rejection_reason AS latest_attempted_rejection_reason,
    latest_attempt.validation_warnings AS latest_attempted_validation_warnings,
    accepted.fit_run_id AS accepted_fit_run_id,
    accepted.fitted_at AS accepted_fitted_at,
    accepted.matches_used AS accepted_matches_used,
    accepted.rho AS accepted_rho,
    accepted.home_advantage AS accepted_home_advantage
   FROM leagues l
     LEFT JOIN LATERAL ( SELECT m.fit_run_id,
            m.league_id,
            m.window_start_date,
            m.window_end_date,
            m.rho,
            m.home_advantage,
            m.decay_half_life_days,
            m.log_likelihood,
            m.converged,
            m.matches_used,
            m.fitted_at,
            m.status,
            m.rejection_reason,
            m.validation_warnings,
            m.validation_checks
           FROM model_fit_runs m
          WHERE m.league_id = l.league_id
          ORDER BY m.fitted_at DESC
         LIMIT 1) latest_attempt ON true
     LEFT JOIN LATERAL ( SELECT m.fit_run_id,
            m.league_id,
            m.window_start_date,
            m.window_end_date,
            m.rho,
            m.home_advantage,
            m.decay_half_life_days,
            m.log_likelihood,
            m.converged,
            m.matches_used,
            m.fitted_at,
            m.status,
            m.rejection_reason,
            m.validation_warnings,
            m.validation_checks
           FROM model_fit_runs m
          WHERE m.league_id = l.league_id AND m.status = 'accepted'::text
          ORDER BY m.fitted_at DESC
         LIMIT 1) accepted ON true
  WHERE l.competition_type = 'league'::text;

CREATE VIEW public.tactical_formation_slot_priors WITH (security_invoker=true) AS
 SELECT a.tactical_source_id,
    s.source_name,
    s.source_season_label,
    s.competition_name,
    a.source_formation_code,
    m.canonical_formation,
    m.mapping_confidence,
    a.source_formation_slot,
    a.venue_scope,
    a.starts,
    a.minutes,
    a.goals,
    a.open_play_goals,
    a.assists,
    a.key_passes,
    a.shots,
    a.shots_on_target,
    a.big_chances,
    a.opp_box_touches,
    a.set_piece_assists,
        CASE
            WHEN a.minutes > 0::numeric THEN 90::numeric * a.goals / a.minutes
            ELSE NULL::numeric
        END AS goals_per90,
        CASE
            WHEN a.minutes > 0::numeric THEN 90::numeric * a.open_play_goals / a.minutes
            ELSE NULL::numeric
        END AS open_play_goals_per90,
        CASE
            WHEN a.minutes > 0::numeric THEN 90::numeric * a.assists / a.minutes
            ELSE NULL::numeric
        END AS assists_per90,
        CASE
            WHEN a.minutes > 0::numeric THEN 90::numeric * a.key_passes / a.minutes
            ELSE NULL::numeric
        END AS key_passes_per90,
        CASE
            WHEN a.minutes > 0::numeric THEN 90::numeric * a.shots / a.minutes
            ELSE NULL::numeric
        END AS shots_per90,
        CASE
            WHEN a.minutes > 0::numeric THEN 90::numeric * a.shots_on_target / a.minutes
            ELSE NULL::numeric
        END AS shots_on_target_per90,
        CASE
            WHEN a.minutes > 0::numeric THEN 90::numeric * a.big_chances / a.minutes
            ELSE NULL::numeric
        END AS big_chances_per90,
        CASE
            WHEN a.minutes > 0::numeric THEN 90::numeric * a.opp_box_touches / a.minutes
            ELSE NULL::numeric
        END AS opp_box_touches_per90,
        CASE
            WHEN sum(a.goals) OVER (PARTITION BY a.tactical_source_id, a.source_formation_code, a.venue_scope) > 0::numeric THEN a.goals / sum(a.goals) OVER (PARTITION BY a.tactical_source_id, a.source_formation_code, a.venue_scope)
            ELSE NULL::numeric
        END AS goal_share,
        CASE
            WHEN sum(a.assists) OVER (PARTITION BY a.tactical_source_id, a.source_formation_code, a.venue_scope) > 0::numeric THEN a.assists / sum(a.assists) OVER (PARTITION BY a.tactical_source_id, a.source_formation_code, a.venue_scope)
            ELSE NULL::numeric
        END AS assist_share,
        CASE
            WHEN sum(a.open_play_goals) OVER (PARTITION BY a.tactical_source_id, a.source_formation_code, a.venue_scope) > 0::numeric THEN a.open_play_goals / sum(a.open_play_goals) OVER (PARTITION BY a.tactical_source_id, a.source_formation_code, a.venue_scope)
            ELSE NULL::numeric
        END AS open_play_goal_share
   FROM tactical_formation_slot_aggregates a
     JOIN tactical_data_sources s USING (tactical_source_id)
     LEFT JOIN tactical_formation_mappings m USING (tactical_source_id, source_formation_code);

CREATE VIEW public.team_home_away_adjustment_experimental_v1 AS
 WITH params AS (
         SELECT 180.0::double precision AS half_life_days,
            12.0::double precision AS shrink_matches
        ), latest_date AS (
         SELECT max(matches.match_date) AS as_of_date
           FROM matches
          WHERE matches.league_id = 1 AND matches.full_time_home_goals IS NOT NULL
        ), weighted AS (
         SELECT m.match_id,
            m.league_id,
            m.season_id,
            m.home_team_id,
            m.away_team_id,
            m.match_date,
            m.kickoff_time,
            m.referee,
            m.full_time_home_goals,
            m.full_time_away_goals,
            m.full_time_result,
            m.half_time_home_goals,
            m.half_time_away_goals,
            m.half_time_result,
            m.home_shots,
            m.away_shots,
            m.home_shots_on_target,
            m.away_shots_on_target,
            m.home_corners,
            m.away_corners,
            m.home_fouls,
            m.away_fouls,
            m.home_yellow_cards,
            m.away_yellow_cards,
            m.home_red_cards,
            m.away_red_cards,
            m.source_name,
            m.source_file,
            m.created_at,
            m.updated_at,
            m.round,
            m.round_number,
            m.stage,
            m.home_xg,
            m.away_xg,
            m.attendance,
            m.decided_by,
            m.winner_team_id,
            m.home_penalty_goals,
            m.away_penalty_goals,
            m.source_match_id,
            power(0.5::double precision, GREATEST(0, ld_1.as_of_date - m.match_date)::double precision / p_1.half_life_days) AS w
           FROM matches m
             CROSS JOIN params p_1
             CROSS JOIN latest_date ld_1
          WHERE m.league_id = 1 AND m.full_time_home_goals IS NOT NULL AND m.full_time_away_goals IS NOT NULL AND m.match_date >= (ld_1.as_of_date - 730)
        ), team_rows AS (
         SELECT weighted.home_team_id AS team_id,
            'home'::text AS venue,
            weighted.w,
            weighted.full_time_home_goals AS gf,
            weighted.full_time_away_goals AS ga
           FROM weighted
        UNION ALL
         SELECT weighted.away_team_id,
            'away'::text,
            weighted.w,
            weighted.full_time_away_goals,
            weighted.full_time_home_goals
           FROM weighted
        ), agg AS (
         SELECT team_rows.team_id,
            sum(team_rows.w * team_rows.gf::double precision) / NULLIF(sum(team_rows.w), 0::double precision) AS overall_gf,
            sum(team_rows.w * team_rows.ga::double precision) / NULLIF(sum(team_rows.w), 0::double precision) AS overall_ga,
            sum(team_rows.w * team_rows.gf::double precision) FILTER (WHERE team_rows.venue = 'home'::text) / NULLIF(sum(team_rows.w) FILTER (WHERE team_rows.venue = 'home'::text), 0::double precision) AS home_gf,
            sum(team_rows.w * team_rows.ga::double precision) FILTER (WHERE team_rows.venue = 'home'::text) / NULLIF(sum(team_rows.w) FILTER (WHERE team_rows.venue = 'home'::text), 0::double precision) AS home_ga,
            sum(team_rows.w * team_rows.gf::double precision) FILTER (WHERE team_rows.venue = 'away'::text) / NULLIF(sum(team_rows.w) FILTER (WHERE team_rows.venue = 'away'::text), 0::double precision) AS away_gf,
            sum(team_rows.w * team_rows.ga::double precision) FILTER (WHERE team_rows.venue = 'away'::text) / NULLIF(sum(team_rows.w) FILTER (WHERE team_rows.venue = 'away'::text), 0::double precision) AS away_ga,
            sum(team_rows.w) FILTER (WHERE team_rows.venue = 'home'::text) AS home_weight,
            sum(team_rows.w) FILTER (WHERE team_rows.venue = 'away'::text) AS away_weight,
            count(*) FILTER (WHERE team_rows.venue = 'home'::text) AS home_matches,
            count(*) FILTER (WHERE team_rows.venue = 'away'::text) AS away_matches
           FROM team_rows
          GROUP BY team_rows.team_id
        ), d AS (
         SELECT a.team_id,
            a.overall_gf,
            a.overall_ga,
            a.home_gf,
            a.home_ga,
            a.away_gf,
            a.away_ga,
            a.home_weight,
            a.away_weight,
            a.home_matches,
            a.away_matches,
            ln(GREATEST(a.home_gf, 0.15::double precision) / GREATEST(a.overall_gf, 0.15::double precision)) AS raw_home_attack_dev,
            ln(GREATEST(a.away_gf, 0.15::double precision) / GREATEST(a.overall_gf, 0.15::double precision)) AS raw_away_attack_dev,
            ln(GREATEST(a.overall_ga, 0.15::double precision) / GREATEST(a.home_ga, 0.15::double precision)) AS raw_home_defence_dev,
            ln(GREATEST(a.overall_ga, 0.15::double precision) / GREATEST(a.away_ga, 0.15::double precision)) AS raw_away_defence_dev
           FROM agg a
        )
 SELECT d.team_id,
    t.canonical_name AS team_name,
    d.overall_gf,
    d.home_gf,
    d.away_gf,
    d.overall_ga,
    d.home_ga,
    d.away_ga,
    d.home_matches,
    d.away_matches,
    d.home_weight,
    d.away_weight,
    d.raw_home_attack_dev * (d.home_weight / (d.home_weight + p.shrink_matches)) AS home_attack_dev,
    d.raw_away_attack_dev * (d.away_weight / (d.away_weight + p.shrink_matches)) AS away_attack_dev,
    d.raw_home_defence_dev * (d.home_weight / (d.home_weight + p.shrink_matches)) AS home_defence_dev,
    d.raw_away_defence_dev * (d.away_weight / (d.away_weight + p.shrink_matches)) AS away_defence_dev,
    p.half_life_days,
    p.shrink_matches,
    ld.as_of_date
   FROM d
     JOIN teams t ON t.team_id = d.team_id
     CROSS JOIN params p
     CROSS JOIN latest_date ld;

CREATE VIEW public.team_strength_current WITH (security_invoker=true) AS
 WITH latest_fit AS (
         SELECT DISTINCT ON (model_fit_runs.league_id) model_fit_runs.fit_run_id,
            model_fit_runs.league_id,
            model_fit_runs.window_start_date,
            model_fit_runs.window_end_date,
            model_fit_runs.rho,
            model_fit_runs.home_advantage,
            model_fit_runs.decay_half_life_days,
            model_fit_runs.matches_used,
            model_fit_runs.fitted_at
           FROM model_fit_runs
          WHERE model_fit_runs.converged = true
          ORDER BY model_fit_runs.league_id, model_fit_runs.fitted_at DESC, model_fit_runs.fit_run_id DESC
        ), rated AS (
         SELECT lf.league_id,
            lf.fit_run_id,
            lf.window_start_date,
            lf.window_end_date,
            lf.rho,
            lf.home_advantage,
            lf.decay_half_life_days,
            lf.matches_used,
            lf.fitted_at,
            tr.team_id,
            t.canonical_name,
            tr.attack_strength,
            tr.defence_strength,
            tr.is_estimated,
            round((100::double precision * percent_rank() OVER (PARTITION BY lf.fit_run_id ORDER BY tr.attack_strength))::numeric, 1) AS attack_score,
            round((100::double precision * percent_rank() OVER (PARTITION BY lf.fit_run_id ORDER BY tr.defence_strength))::numeric, 1) AS defence_score,
            rank() OVER (PARTITION BY lf.fit_run_id ORDER BY tr.attack_strength DESC) AS attack_rank,
            rank() OVER (PARTITION BY lf.fit_run_id ORDER BY tr.defence_strength DESC) AS defence_rank
           FROM latest_fit lf
             JOIN team_ratings tr ON tr.fit_run_id = lf.fit_run_id
             JOIN teams t ON t.team_id = tr.team_id
        )
 SELECT r.league_id,
    r.fit_run_id,
    r.window_start_date,
    r.window_end_date,
    r.rho,
    r.home_advantage,
    r.decay_half_life_days,
    r.matches_used,
    r.fitted_at,
    r.team_id,
    r.canonical_name,
    r.attack_strength,
    r.defence_strength,
    r.is_estimated,
    r.attack_score,
    r.defence_score,
    r.attack_rank,
    r.defence_rank,
    round((r.attack_score + r.defence_score) / 2::numeric, 1) AS overall_score,
    ft.fpl_team_id,
    ft.name AS fpl_team_name,
    ft.short_name AS fpl_short_name
   FROM rated r
     LEFT JOIN fpl_teams ft ON ft.canonical_team_id = r.team_id;

CREATE VIEW public.fixture_player_expected_minutes WITH (security_invoker=true) AS
 WITH base AS (
         SELECT c.fixture_id,
            c.team_id,
            c.fpl_player_id,
            c.web_name,
            c.source_consensus_probability,
            c.availability_probability,
            c.tactical_role,
            COALESCE(h.hierarchy_score, 0::numeric) AS hierarchy_score,
            COALESCE(h.squad_status, 'unknown'::text) AS squad_status,
            p.element_type,
            p.minutes,
            LEAST(1::numeric, c.source_consensus_probability * c.availability_probability) AS start_prob,
                CASE
                    WHEN p.element_type = 1 THEN 90::numeric
                    WHEN c.source_consensus_probability >= 0.8 THEN 78::numeric
                    WHEN c.source_consensus_probability >= 0.5 THEN 72::numeric
                    ELSE 68::numeric
                END AS mins_if_start,
                CASE
                    WHEN p.element_type = 1 THEN 0::numeric
                    WHEN COALESCE(h.squad_status, 'unknown'::text) = 'rotation'::text THEN 0.65
                    WHEN COALESCE(h.squad_status, 'unknown'::text) = 'backup'::text THEN 0.45
                    WHEN COALESCE(h.squad_status, 'unknown'::text) = 'first_choice'::text THEN 0.55
                    ELSE 0.20
                END AS sub_prob_if_bench,
                CASE
                    WHEN p.element_type = 1 THEN 0::numeric
                    WHEN p.element_type = 4 THEN 24::numeric
                    WHEN p.element_type = 3 THEN 22::numeric
                    ELSE 18::numeric
                END AS mins_if_sub
           FROM fixture_player_lineup_consensus c
             JOIN fpl_players p ON p.fpl_player_id = c.fpl_player_id
             LEFT JOIN player_squad_hierarchy h ON h.season_id = p.season_id AND h.team_id = c.team_id AND h.fpl_player_id = c.fpl_player_id
        ), raw AS (
         SELECT base.fixture_id,
            base.team_id,
            base.fpl_player_id,
            base.web_name,
            base.source_consensus_probability,
            base.availability_probability,
            base.tactical_role,
            base.hierarchy_score,
            base.squad_status,
            base.element_type,
            base.minutes,
            base.start_prob,
            base.mins_if_start,
            base.sub_prob_if_bench,
            base.mins_if_sub,
            base.start_prob * base.mins_if_start + (1::numeric - base.start_prob) * base.sub_prob_if_bench * base.availability_probability * base.mins_if_sub AS raw_expected_minutes
           FROM base
        ), pass1 AS (
         SELECT raw.fixture_id,
            raw.team_id,
            raw.fpl_player_id,
            raw.web_name,
            raw.source_consensus_probability,
            raw.availability_probability,
            raw.tactical_role,
            raw.hierarchy_score,
            raw.squad_status,
            raw.element_type,
            raw.minutes,
            raw.start_prob,
            raw.mins_if_start,
            raw.sub_prob_if_bench,
            raw.mins_if_sub,
            raw.raw_expected_minutes,
            LEAST(90::numeric, raw.raw_expected_minutes * 990::numeric / NULLIF(sum(raw.raw_expected_minutes) OVER (PARTITION BY raw.fixture_id, raw.team_id), 0::numeric)) AS mins1
           FROM raw
        ), pass2 AS (
         SELECT pass1.fixture_id,
            pass1.team_id,
            pass1.fpl_player_id,
            pass1.web_name,
            pass1.source_consensus_probability,
            pass1.availability_probability,
            pass1.tactical_role,
            pass1.hierarchy_score,
            pass1.squad_status,
            pass1.element_type,
            pass1.minutes,
            pass1.start_prob,
            pass1.mins_if_start,
            pass1.sub_prob_if_bench,
            pass1.mins_if_sub,
            pass1.raw_expected_minutes,
            pass1.mins1,
            sum(pass1.mins1) OVER (PARTITION BY pass1.fixture_id, pass1.team_id) AS sum1,
            sum(
                CASE
                    WHEN pass1.mins1 < 90::numeric THEN pass1.raw_expected_minutes
                    ELSE 0::numeric
                END) OVER (PARTITION BY pass1.fixture_id, pass1.team_id) AS uncapped_weight
           FROM pass1
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    web_name,
    element_type,
    tactical_role,
    squad_status,
    hierarchy_score,
    source_consensus_probability,
    availability_probability,
    start_prob AS prob_starting_xi,
    (1::numeric - start_prob) * sub_prob_if_bench * availability_probability AS prob_sub_appearance,
    mins_if_start AS expected_minutes_if_start,
    mins_if_sub AS expected_minutes_if_sub,
        CASE
            WHEN mins1 >= 90::numeric THEN 90::numeric
            WHEN uncapped_weight > 0::numeric THEN LEAST(90::numeric, mins1 + (990::numeric - sum1) * raw_expected_minutes / uncapped_weight)
            ELSE mins1
        END AS expected_minutes
   FROM pass2;

CREATE VIEW public.fixture_player_expected_minutes_fallback WITH (security_invoker=true) AS
 WITH base AS (
         SELECT f.fixture_id,
            fp.canonical_team_id AS team_id,
            fp.fpl_player_id,
            fp.web_name,
            fp.element_type,
            fp.status,
            COALESCE(fp.chance_of_playing_next_round, fp.chance_of_playing_this_round,
                CASE
                    WHEN fp.status = ANY (ARRAY['i'::text, 'u'::text, 's'::text]) THEN 0
                    ELSE 100
                END)::numeric / 100::numeric AS availability,
            COALESCE(u.appearances, 0::bigint) AS apps,
            COALESCE(u.likely_starts, 0::bigint) AS starts,
            COALESCE(u.sub_appearances, 0::bigint) AS subs,
            COALESCE(u.avg_sub_minutes, 20::numeric) AS avg_sub_minutes,
            COALESCE(h.squad_status, 'unknown'::text) AS squad_status,
            pt.tactical_role
           FROM fixtures f
             JOIN leagues l ON l.league_id = f.league_id
             JOIN fpl_players fp ON fp.season_id = f.season_id AND (fp.canonical_team_id = f.home_team_id OR fp.canonical_team_id = f.away_team_id)
             LEFT JOIN fpl_player_substitution_usage u ON u.season_id = fp.season_id AND u.fpl_player_id = fp.fpl_player_id
             LEFT JOIN player_squad_hierarchy h ON h.season_id = fp.season_id AND h.fpl_player_id = fp.fpl_player_id
             LEFT JOIN player_tactical_profiles pt ON pt.season_id = fp.season_id AND pt.source_player_id = fp.fpl_player_id::text
          WHERE f.season_id = 13 AND l.code = 'E0'::text
        ), p AS (
         SELECT base.fixture_id,
            base.team_id,
            base.fpl_player_id,
            base.web_name,
            base.element_type,
            base.status,
            base.availability,
            base.apps,
            base.starts,
            base.subs,
            base.avg_sub_minutes,
            base.squad_status,
            base.tactical_role,
            LEAST(0.97, GREATEST(0::numeric, base.availability *
                CASE
                    WHEN base.apps > 0 THEN (base.starts::numeric + 1.5) / (base.apps::numeric + 3.0)
                    ELSE
                    CASE base.squad_status
                        WHEN 'first_choice'::text THEN 0.72
                        WHEN 'rotation'::text THEN 0.38
                        WHEN 'backup'::text THEN 0.12
                        ELSE 0.18
                    END
                END)) AS start_prob
           FROM base
        ), r AS (
         SELECT p.fixture_id,
            p.team_id,
            p.fpl_player_id,
            p.web_name,
            p.element_type,
            p.status,
            p.availability,
            p.apps,
            p.starts,
            p.subs,
            p.avg_sub_minutes,
            p.squad_status,
            p.tactical_role,
            p.start_prob,
                CASE
                    WHEN p.element_type = 1 THEN 90
                    WHEN p.start_prob >= 0.7 THEN 78
                    WHEN p.start_prob >= 0.4 THEN 72
                    ELSE 68
                END AS mins_start,
            LEAST(0.75, GREATEST(0::numeric, p.availability * (1::numeric - p.start_prob) *
                CASE p.squad_status
                    WHEN 'rotation'::text THEN 0.7
                    WHEN 'backup'::text THEN 0.5
                    WHEN 'first_choice'::text THEN 0.35
                    ELSE 0.3
                END)) AS sub_prob
           FROM p
        ), raw AS (
         SELECT r.fixture_id,
            r.team_id,
            r.fpl_player_id,
            r.web_name,
            r.element_type,
            r.status,
            r.availability,
            r.apps,
            r.starts,
            r.subs,
            r.avg_sub_minutes,
            r.squad_status,
            r.tactical_role,
            r.start_prob,
            r.mins_start,
            r.sub_prob,
            r.start_prob * r.mins_start::numeric + r.sub_prob * LEAST(40::numeric, GREATEST(5::numeric, r.avg_sub_minutes)) AS raw_minutes
           FROM r
        ), sc AS (
         SELECT raw.fixture_id,
            raw.team_id,
            raw.fpl_player_id,
            raw.web_name,
            raw.element_type,
            raw.status,
            raw.availability,
            raw.apps,
            raw.starts,
            raw.subs,
            raw.avg_sub_minutes,
            raw.squad_status,
            raw.tactical_role,
            raw.start_prob,
            raw.mins_start,
            raw.sub_prob,
            raw.raw_minutes,
            990::numeric / NULLIF(sum(raw.raw_minutes) OVER (PARTITION BY raw.fixture_id, raw.team_id), 0::numeric) AS scale
           FROM raw
        ), cap AS (
         SELECT sc.fixture_id,
            sc.team_id,
            sc.fpl_player_id,
            sc.web_name,
            sc.element_type,
            sc.status,
            sc.availability,
            sc.apps,
            sc.starts,
            sc.subs,
            sc.avg_sub_minutes,
            sc.squad_status,
            sc.tactical_role,
            sc.start_prob,
            sc.mins_start,
            sc.sub_prob,
            sc.raw_minutes,
            sc.scale,
            LEAST(90::numeric, sc.raw_minutes * sc.scale) AS capped
           FROM sc
        ), fin AS (
         SELECT cap.fixture_id,
            cap.team_id,
            cap.fpl_player_id,
            cap.web_name,
            cap.element_type,
            cap.status,
            cap.availability,
            cap.apps,
            cap.starts,
            cap.subs,
            cap.avg_sub_minutes,
            cap.squad_status,
            cap.tactical_role,
            cap.start_prob,
            cap.mins_start,
            cap.sub_prob,
            cap.raw_minutes,
            cap.scale,
            cap.capped,
            LEAST(90::numeric, cap.capped + (990::numeric - sum(cap.capped) OVER (PARTITION BY cap.fixture_id, cap.team_id)) * cap.capped / NULLIF(sum(cap.capped) OVER (PARTITION BY cap.fixture_id, cap.team_id), 0::numeric)) AS expected_minutes
           FROM cap
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    web_name,
    element_type,
    tactical_role,
    start_prob AS prob_starting_xi,
    sub_prob AS prob_sub_appearance,
    availability,
    expected_minutes,
    'fallback_history_hierarchy'::text AS minutes_source
   FROM fin;

CREATE VIEW public.fixture_player_expected_minutes_v2 WITH (security_invoker=true) AS
 WITH b AS (
         SELECT c.fixture_id,
            c.team_id,
            c.fpl_player_id,
            c.web_name,
            p.element_type,
            c.tactical_role,
            h.squad_status,
            h.hierarchy_score,
            c.source_consensus_probability,
            c.availability_probability,
                CASE
                    WHEN p.element_type = 1 THEN LEAST(c.source_consensus_probability * c.availability_probability, 0.99)
                    ELSE LEAST(c.source_consensus_probability * c.availability_probability, 0.97)
                END AS start_prob,
            COALESCE(u.appearances, 0::bigint) AS apps,
            COALESCE(u.sub_appearances, 0::bigint) AS hist_subs,
            COALESCE(u.avg_sub_minutes, 20::numeric) AS hist_sub_mins
           FROM fixture_player_lineup_consensus c
             JOIN fpl_players p ON p.fpl_player_id = c.fpl_player_id
             LEFT JOIN player_squad_hierarchy h ON h.season_id = p.season_id AND h.fpl_player_id = p.fpl_player_id
             LEFT JOIN fpl_player_substitution_usage u ON u.season_id = p.season_id AND u.fpl_player_id = c.fpl_player_id
        ), r AS (
         SELECT b.fixture_id,
            b.team_id,
            b.fpl_player_id,
            b.web_name,
            b.element_type,
            b.tactical_role,
            b.squad_status,
            b.hierarchy_score,
            b.source_consensus_probability,
            b.availability_probability,
            b.start_prob,
            b.apps,
            b.hist_subs,
            b.hist_sub_mins,
                CASE
                    WHEN b.element_type = 1 THEN 90
                    WHEN b.start_prob >= 0.8 THEN 80
                    WHEN b.start_prob >= 0.5 THEN 74
                    ELSE 68
                END::numeric AS mins_if_start,
                CASE
                    WHEN b.element_type = 1 THEN 0::numeric
                    ELSE LEAST(0.85, GREATEST(0.03, (b.hist_subs::numeric + 0.5) / (b.apps::numeric + 2.0) *
                    CASE b.squad_status
                        WHEN 'rotation'::text THEN 1.15
                        WHEN 'backup'::text THEN 1.0
                        WHEN 'first_choice'::text THEN 0.65
                        ELSE 0.45
                    END))
                END AS raw_sub_prob,
            LEAST(40::numeric, GREATEST(5::numeric, b.hist_sub_mins)) AS mins_if_sub
           FROM b
        ), raw AS (
         SELECT r.fixture_id,
            r.team_id,
            r.fpl_player_id,
            r.web_name,
            r.element_type,
            r.tactical_role,
            r.squad_status,
            r.hierarchy_score,
            r.source_consensus_probability,
            r.availability_probability,
            r.start_prob,
            r.apps,
            r.hist_subs,
            r.hist_sub_mins,
            r.mins_if_start,
            r.raw_sub_prob,
            r.mins_if_sub,
            r.start_prob * r.mins_if_start + (1::numeric - r.start_prob) * r.raw_sub_prob * r.availability_probability * r.mins_if_sub AS raw_minutes
           FROM r
        ), s AS (
         SELECT raw.fixture_id,
            raw.team_id,
            raw.fpl_player_id,
            raw.web_name,
            raw.element_type,
            raw.tactical_role,
            raw.squad_status,
            raw.hierarchy_score,
            raw.source_consensus_probability,
            raw.availability_probability,
            raw.start_prob,
            raw.apps,
            raw.hist_subs,
            raw.hist_sub_mins,
            raw.mins_if_start,
            raw.raw_sub_prob,
            raw.mins_if_sub,
            raw.raw_minutes,
            sum(raw.raw_minutes) OVER (PARTITION BY raw.fixture_id, raw.team_id) AS team_raw_minutes
           FROM raw
        ), c AS (
         SELECT s.fixture_id,
            s.team_id,
            s.fpl_player_id,
            s.web_name,
            s.element_type,
            s.tactical_role,
            s.squad_status,
            s.hierarchy_score,
            s.source_consensus_probability,
            s.availability_probability,
            s.start_prob,
            s.apps,
            s.hist_subs,
            s.hist_sub_mins,
            s.mins_if_start,
            s.raw_sub_prob,
            s.mins_if_sub,
            s.raw_minutes,
            s.team_raw_minutes,
            LEAST(90::numeric, s.raw_minutes * 990::numeric / NULLIF(s.team_raw_minutes, 0::numeric)) AS capped_minutes
           FROM s
        ), z AS (
         SELECT c.fixture_id,
            c.team_id,
            c.fpl_player_id,
            c.web_name,
            c.element_type,
            c.tactical_role,
            c.squad_status,
            c.hierarchy_score,
            c.source_consensus_probability,
            c.availability_probability,
            c.start_prob,
            c.apps,
            c.hist_subs,
            c.hist_sub_mins,
            c.mins_if_start,
            c.raw_sub_prob,
            c.mins_if_sub,
            c.raw_minutes,
            c.team_raw_minutes,
            c.capped_minutes,
            990::numeric - sum(c.capped_minutes) OVER (PARTITION BY c.fixture_id, c.team_id) AS residual_minutes,
            sum(
                CASE
                    WHEN c.capped_minutes < 90::numeric THEN 90::numeric - c.capped_minutes
                    ELSE 0::numeric
                END) OVER (PARTITION BY c.fixture_id, c.team_id) AS spare_capacity
           FROM c
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    web_name,
    element_type,
    tactical_role,
    COALESCE(squad_status, 'unknown'::text) AS squad_status,
    hierarchy_score,
    source_consensus_probability,
    availability_probability,
    start_prob AS prob_starting_xi,
    (1::numeric - start_prob) * raw_sub_prob * availability_probability AS prob_sub_appearance,
    mins_if_start,
    mins_if_sub,
    LEAST(90::numeric, capped_minutes +
        CASE
            WHEN spare_capacity > 0::numeric THEN residual_minutes * ((90::numeric - capped_minutes) / spare_capacity)
            ELSE 0::numeric
        END) AS expected_minutes,
    hist_subs,
    hist_sub_mins
   FROM z;

CREATE VIEW public.fpl_fallback_start_probability_v6 WITH (security_invoker=true) AS
 WITH base AS (
         SELECT f.fixture_id,
            fp.canonical_team_id AS team_id,
            fp.fpl_player_id,
            COALESCE(u.appearances, 0::bigint) AS apps,
            COALESCE(u.likely_starts, 0::bigint) AS starts,
            COALESCE(u.sub_appearances, 0::bigint) AS subs,
            COALESCE(fp.chance_of_playing_next_round, fp.chance_of_playing_this_round,
                CASE
                    WHEN fp.status = ANY (ARRAY['i'::text, 'u'::text, 's'::text]) THEN 0
                    ELSE 100
                END)::numeric / 100::numeric AS availability,
            COALESCE(h.squad_status, 'unknown'::text) AS squad_status
           FROM fixtures f
             JOIN leagues l ON l.league_id = f.league_id
             JOIN fpl_players fp ON fp.season_id = f.season_id AND (fp.canonical_team_id = f.home_team_id OR fp.canonical_team_id = f.away_team_id)
             LEFT JOIN fpl_player_substitution_usage u ON u.season_id = fp.season_id AND u.fpl_player_id = fp.fpl_player_id
             LEFT JOIN player_squad_hierarchy h ON h.season_id = fp.season_id AND h.fpl_player_id = fp.fpl_player_id
          WHERE f.season_id = 13 AND l.code = 'E0'::text
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    LEAST(0.98, availability *
        CASE
            WHEN apps >= 4 AND starts = apps THEN 0.96
            WHEN apps = 3 AND starts = 3 THEN 0.94
            WHEN apps >= 3 AND starts >= (apps - 1) THEN 0.84
            WHEN apps > 0 THEN GREATEST(0.05, LEAST(0.90, (starts::numeric + 0.5) / (apps::numeric + 1.0)))
            ELSE
            CASE squad_status
                WHEN 'first_choice'::text THEN 0.72
                WHEN 'rotation'::text THEN 0.38
                WHEN 'backup'::text THEN 0.12
                ELSE 0.18
            END
        END) AS start_probability,
    availability,
    apps,
    starts,
    subs,
        CASE
            WHEN apps >= 3 AND starts = apps THEN 'nailed_history'::text
            WHEN apps >= 3 AND starts >= (apps - 1) THEN 'strong_history'::text
            ELSE 'history_hierarchy'::text
        END AS probability_source
   FROM base;

CREATE VIEW public.fpl_optimizer_candidate_feed_v2 WITH (security_invoker=true) AS
 SELECT p.fixture_id,
    f.matchweek,
    p.fpl_player_id,
    p.web_name,
    p.team_id,
    t.canonical_name AS team_name,
    p.fpl_position,
    fp.now_cost,
    fp.now_cost::numeric / 10::numeric AS price_m,
    p.expected_minutes,
    p.start_probability,
    p.sub_appearance_probability,
    p.expected_fpl_points,
    p.lineup_confidence,
    p.model_version,
    p.generated_at,
    p.team_id = f.home_team_id AS is_home,
    COALESCE(opp.canonical_name, 'Unknown'::text) AS opponent_team_name
   FROM fpl_projection_frontend_feed_v6 p
     JOIN fixtures f ON f.fixture_id = p.fixture_id
     LEFT JOIN fpl_players fp ON fp.fpl_player_id = p.fpl_player_id AND fp.season_id = f.season_id
     LEFT JOIN teams t ON t.team_id = p.team_id
     LEFT JOIN teams opp ON opp.team_id =
        CASE
            WHEN p.team_id = f.home_team_id THEN f.away_team_id
            ELSE f.home_team_id
        END
  WHERE f.season_id = 13;

CREATE VIEW public.fpl_projection_data_health WITH (security_invoker=true) AS
 SELECT fixture_id,
    kickoff_date,
    has_team_xg AS team_forecast_ready,
    lineup_sources,
    lineup_player_rows,
    projection_rows,
        CASE
            WHEN has_team_xg AND projection_rows > 0 THEN 'ready'::text
            WHEN has_team_xg AND lineup_sources = 0 THEN 'awaiting_player_projection'::text
            ELSE 'incomplete'::text
        END AS projection_status
   FROM fpl_projection_fixture_readiness r;

CREATE VIEW public.fpl_season_player_projection_feed WITH (security_invoker=true) AS
 SELECT pr.fixture_id,
    f.matchweek,
    f.kickoff_date,
    COALESCE(fp.canonical_team_id, fp.fpl_team_id::bigint) AS team_id,
    fp.web_name,
    pr.fpl_player_id,
    fp.element_type AS fpl_position,
    tc.tactical_role,
    pr.expected_minutes,
    pr.start_probability,
    pr.sub_appearance_probability,
    NULL::numeric AS shrunk_xg90,
    NULL::numeric AS shrunk_xa90,
    pr.expected_goals,
    pr.expected_assists,
    pr.clean_sheet_probability,
    pr.defensive_contribution_probability,
    pr.expected_bonus AS experimental_expected_bonus
   FROM fpl_player_projections pr
     JOIN fixtures f ON f.fixture_id = pr.fixture_id
     JOIN fpl_players fp ON fp.season_id = pr.season_id AND fp.fpl_player_id = pr.fpl_player_id
     LEFT JOIN fixture_player_tactical_consensus tc ON tc.fixture_id = pr.fixture_id AND tc.fpl_player_id = pr.fpl_player_id
  WHERE pr.season_id = 13 AND pr.model_version = 'leaguewide_v6'::text;

CREATE VIEW public.team_home_away_adjustment_v1 AS
 WITH base AS (
         SELECT team_home_away_adjustment_experimental_v1.team_id,
            team_home_away_adjustment_experimental_v1.team_name,
            team_home_away_adjustment_experimental_v1.overall_gf,
            team_home_away_adjustment_experimental_v1.home_gf,
            team_home_away_adjustment_experimental_v1.away_gf,
            team_home_away_adjustment_experimental_v1.overall_ga,
            team_home_away_adjustment_experimental_v1.home_ga,
            team_home_away_adjustment_experimental_v1.away_ga,
            team_home_away_adjustment_experimental_v1.home_matches,
            team_home_away_adjustment_experimental_v1.away_matches,
            team_home_away_adjustment_experimental_v1.home_weight,
            team_home_away_adjustment_experimental_v1.away_weight,
            team_home_away_adjustment_experimental_v1.home_attack_dev,
            team_home_away_adjustment_experimental_v1.away_attack_dev,
            team_home_away_adjustment_experimental_v1.home_defence_dev,
            team_home_away_adjustment_experimental_v1.away_defence_dev,
            team_home_away_adjustment_experimental_v1.half_life_days,
            team_home_away_adjustment_experimental_v1.shrink_matches,
            team_home_away_adjustment_experimental_v1.as_of_date
           FROM team_home_away_adjustment_experimental_v1
        ), means AS (
         SELECT sum(base.home_attack_dev * base.home_weight) / NULLIF(sum(base.home_weight), 0::double precision) AS mha,
            sum(base.away_attack_dev * base.away_weight) / NULLIF(sum(base.away_weight), 0::double precision) AS maa,
            sum(base.home_defence_dev * base.home_weight) / NULLIF(sum(base.home_weight), 0::double precision) AS mhd,
            sum(base.away_defence_dev * base.away_weight) / NULLIF(sum(base.away_weight), 0::double precision) AS mad
           FROM base
        )
 SELECT b.team_id,
    b.team_name,
    b.overall_gf,
    b.home_gf,
    b.away_gf,
    b.overall_ga,
    b.home_ga,
    b.away_ga,
    b.home_matches,
    b.away_matches,
    b.home_weight,
    b.away_weight,
    b.home_attack_dev,
    b.away_attack_dev,
    b.home_defence_dev,
    b.away_defence_dev,
    b.half_life_days,
    b.shrink_matches,
    b.as_of_date,
    b.home_attack_dev - m.mha AS centered_home_attack_dev,
    b.away_attack_dev - m.maa AS centered_away_attack_dev,
    b.home_defence_dev - m.mhd AS centered_home_defence_dev,
    b.away_defence_dev - m.mad AS centered_away_defence_dev
   FROM base b
     CROSS JOIN means m;

CREATE VIEW public.fixture_player_expected_minutes_v3 WITH (security_invoker=true) AS
 WITH b AS (
         SELECT v.fixture_id,
            v.team_id,
            v.fpl_player_id,
            v.web_name,
            v.element_type,
            v.tactical_role,
            v.squad_status,
            v.hierarchy_score,
            v.source_consensus_probability,
            v.availability_probability,
            v.prob_starting_xi,
            v.prob_sub_appearance,
            v.mins_if_start,
            v.mins_if_sub,
            v.expected_minutes,
            v.hist_subs,
            v.hist_sub_mins,
            sum(v.prob_sub_appearance) OVER (PARTITION BY v.fixture_id, v.team_id) AS team_sub_sum
           FROM fixture_player_expected_minutes_v2 v
        ), n AS (
         SELECT b.fixture_id,
            b.team_id,
            b.fpl_player_id,
            b.web_name,
            b.element_type,
            b.tactical_role,
            b.squad_status,
            b.hierarchy_score,
            b.source_consensus_probability,
            b.availability_probability,
            b.prob_starting_xi,
            b.prob_sub_appearance,
            b.mins_if_start,
            b.mins_if_sub,
            b.expected_minutes,
            b.hist_subs,
            b.hist_sub_mins,
            b.team_sub_sum,
                CASE
                    WHEN b.team_sub_sum > 0::numeric THEN b.prob_sub_appearance * (4.25 / b.team_sub_sum)
                    ELSE 0::numeric
                END AS norm_sub_prob
           FROM b
        ), r AS (
         SELECT n.fixture_id,
            n.team_id,
            n.fpl_player_id,
            n.web_name,
            n.element_type,
            n.tactical_role,
            n.squad_status,
            n.hierarchy_score,
            n.source_consensus_probability,
            n.availability_probability,
            n.prob_starting_xi,
            n.prob_sub_appearance,
            n.mins_if_start,
            n.mins_if_sub,
            n.expected_minutes,
            n.hist_subs,
            n.hist_sub_mins,
            n.team_sub_sum,
            n.norm_sub_prob,
            n.prob_starting_xi * n.mins_if_start + n.norm_sub_prob * n.mins_if_sub AS raw_minutes
           FROM n
        ), s AS (
         SELECT r.fixture_id,
            r.team_id,
            r.fpl_player_id,
            r.web_name,
            r.element_type,
            r.tactical_role,
            r.squad_status,
            r.hierarchy_score,
            r.source_consensus_probability,
            r.availability_probability,
            r.prob_starting_xi,
            r.prob_sub_appearance,
            r.mins_if_start,
            r.mins_if_sub,
            r.expected_minutes,
            r.hist_subs,
            r.hist_sub_mins,
            r.team_sub_sum,
            r.norm_sub_prob,
            r.raw_minutes,
            sum(r.raw_minutes) OVER (PARTITION BY r.fixture_id, r.team_id) AS team_raw
           FROM r
        ), c AS (
         SELECT s.fixture_id,
            s.team_id,
            s.fpl_player_id,
            s.web_name,
            s.element_type,
            s.tactical_role,
            s.squad_status,
            s.hierarchy_score,
            s.source_consensus_probability,
            s.availability_probability,
            s.prob_starting_xi,
            s.prob_sub_appearance,
            s.mins_if_start,
            s.mins_if_sub,
            s.expected_minutes,
            s.hist_subs,
            s.hist_sub_mins,
            s.team_sub_sum,
            s.norm_sub_prob,
            s.raw_minutes,
            s.team_raw,
            LEAST(90::numeric, s.raw_minutes * 990::numeric / NULLIF(s.team_raw, 0::numeric)) AS capped_minutes
           FROM s
        ), z AS (
         SELECT c.fixture_id,
            c.team_id,
            c.fpl_player_id,
            c.web_name,
            c.element_type,
            c.tactical_role,
            c.squad_status,
            c.hierarchy_score,
            c.source_consensus_probability,
            c.availability_probability,
            c.prob_starting_xi,
            c.prob_sub_appearance,
            c.mins_if_start,
            c.mins_if_sub,
            c.expected_minutes,
            c.hist_subs,
            c.hist_sub_mins,
            c.team_sub_sum,
            c.norm_sub_prob,
            c.raw_minutes,
            c.team_raw,
            c.capped_minutes,
            990::numeric - sum(c.capped_minutes) OVER (PARTITION BY c.fixture_id, c.team_id) AS residual,
            sum(
                CASE
                    WHEN c.capped_minutes < 90::numeric THEN 90::numeric - c.capped_minutes
                    ELSE 0::numeric
                END) OVER (PARTITION BY c.fixture_id, c.team_id) AS spare
           FROM c
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    web_name,
    element_type,
    tactical_role,
    squad_status,
    hierarchy_score,
    source_consensus_probability,
    availability_probability,
    prob_starting_xi,
    LEAST(1::numeric, norm_sub_prob) AS prob_sub_appearance,
    mins_if_start,
    mins_if_sub,
    LEAST(90::numeric, capped_minutes +
        CASE
            WHEN spare > 0::numeric THEN residual * ((90::numeric - capped_minutes) / spare)
            ELSE 0::numeric
        END) AS expected_minutes,
    hist_subs,
    hist_sub_mins
   FROM z;

CREATE VIEW public.fixture_player_expected_minutes_resolved WITH (security_invoker=true) AS
 SELECT fb.fixture_id,
    fb.team_id,
    fb.fpl_player_id,
    fb.web_name,
    fb.element_type,
    COALESCE(v.expected_minutes, fb.expected_minutes) AS expected_minutes,
    COALESCE(v.prob_starting_xi, fb.prob_starting_xi) AS prob_starting_xi,
    COALESCE(v.prob_sub_appearance, fb.prob_sub_appearance) AS prob_sub_appearance,
    COALESCE(v.availability_probability, fb.availability) AS availability_probability,
    COALESCE(tc.tactical_role, fb.tactical_role) AS tactical_role,
        CASE
            WHEN v.fpl_player_id IS NOT NULL THEN 'lineup_consensus_v3'::text
            ELSE fb.minutes_source
        END AS minutes_source
   FROM fixture_player_expected_minutes_fallback fb
     LEFT JOIN fixture_player_expected_minutes_v3 v ON v.fixture_id = fb.fixture_id AND v.fpl_player_id = fb.fpl_player_id
     LEFT JOIN fixture_player_tactical_consensus tc ON tc.fixture_id = fb.fixture_id AND tc.fpl_player_id = fb.fpl_player_id;

CREATE VIEW public.fixture_player_expected_minutes_resolved_v3 WITH (security_invoker=true) AS
 SELECT r.fixture_id,
    r.team_id,
    r.fpl_player_id,
    r.web_name,
    r.element_type,
        CASE
            WHEN src.fpl_player_id IS NOT NULL THEN r.expected_minutes
            WHEN ss.start_probability_override IS NOT NULL THEN LEAST(90::numeric, GREATEST(0::numeric, ss.start_probability_override *
            CASE
                WHEN r.element_type = 1 THEN 90
                ELSE 80
            END::numeric + r.prob_sub_appearance * 20::numeric))
            ELSE LEAST(90::numeric, GREATEST(0::numeric, p.start_probability *
            CASE
                WHEN r.element_type = 1 THEN 90
                ELSE 80
            END::numeric + r.prob_sub_appearance * 20::numeric))
        END AS expected_minutes,
    COALESCE(src.prob_starting_xi, ss.start_probability_override, p.start_probability, r.prob_starting_xi) AS prob_starting_xi,
    r.prob_sub_appearance,
    COALESCE(ss.availability_probability, p.availability, r.availability_probability) AS availability_probability,
    r.tactical_role,
        CASE
            WHEN src.fpl_player_id IS NOT NULL THEN r.minutes_source
            WHEN ss.start_probability_override IS NOT NULL THEN 'squad_state_override'::text
            WHEN p.probability_source = 'nailed_history'::text THEN 'nailed_history_v6'::text
            WHEN p.probability_source = 'strong_history'::text THEN 'strong_history_v6'::text
            ELSE 'fallback_history_v6'::text
        END AS minutes_source
   FROM fixture_player_expected_minutes_resolved r
     LEFT JOIN fixture_player_expected_minutes_v3 src ON src.fixture_id = r.fixture_id AND src.fpl_player_id = r.fpl_player_id
     LEFT JOIN fpl_fallback_start_probability_v6 p ON p.fixture_id = r.fixture_id AND p.fpl_player_id = r.fpl_player_id
     LEFT JOIN fpl_player_squad_state_current ss ON ss.season_id = 13 AND ss.fpl_player_id = r.fpl_player_id AND ss.team_id = r.team_id;

CREATE VIEW public.fpl_projection_frontend_feed WITH (security_invoker=true) AS
 SELECT pr.fixture_id,
    f.kickoff_date,
    pr.fpl_player_id,
    p.web_name,
    p.canonical_team_id AS team_id,
    p.element_type AS fpl_position,
    m.tactical_role,
    m.minutes_source,
    pr.model_version,
    pr.expected_minutes,
    pr.start_probability,
    pr.sub_appearance_probability,
    pr.expected_goals,
    pr.expected_assists,
    pr.clean_sheet_probability,
    pr.defensive_contribution_probability,
    pr.expected_bonus,
    pr.expected_fpl_points,
    pr.lineup_confidence,
    pr.generated_at
   FROM fpl_player_projections pr
     JOIN fixtures f ON f.fixture_id = pr.fixture_id
     JOIN fpl_players p ON p.season_id = pr.season_id AND p.fpl_player_id = pr.fpl_player_id
     LEFT JOIN fixture_player_expected_minutes_resolved m ON m.fixture_id = pr.fixture_id AND m.fpl_player_id = pr.fpl_player_id
  WHERE pr.model_version = 'leaguewide_v4'::text;

CREATE VIEW public.fpl_optimizer_candidate_feed_v1 WITH (security_invoker=true) AS
 SELECT p.fixture_id,
    f.matchweek,
    p.fpl_player_id,
    p.web_name,
    p.team_id,
    t.canonical_name AS team_name,
    p.fpl_position,
    fp.now_cost,
    fp.now_cost::numeric / 10::numeric AS price_m,
    p.expected_minutes,
    LEAST(1::numeric, GREATEST(0::numeric, p.start_probability)) AS start_probability,
    LEAST(GREATEST(0::numeric, 1::numeric - LEAST(1::numeric, GREATEST(0::numeric, p.start_probability))), GREATEST(0::numeric, p.sub_appearance_probability)) AS sub_appearance_probability,
    p.expected_fpl_points,
    p.lineup_confidence,
    p.model_version,
    p.generated_at
   FROM fpl_projection_frontend_feed p
     JOIN fixtures f ON f.fixture_id = p.fixture_id
     LEFT JOIN fpl_players fp ON fp.fpl_player_id = p.fpl_player_id AND fp.season_id = f.season_id
     LEFT JOIN teams t ON t.team_id = p.team_id
  WHERE f.season_id = 13;

CREATE VIEW public.fpl_projection_v4_leaguewide_inputs WITH (security_invoker=true) AS
 SELECT m.fixture_id,
    m.team_id,
    m.fpl_player_id,
    m.expected_minutes,
    m.prob_starting_xi,
    m.prob_sub_appearance,
    m.availability_probability,
    m.tactical_role AS real_tactical_role,
    p.web_name,
    p.element_type,
    p.minutes AS season_minutes,
    COALESCE(p.expected_goals / NULLIF(p.minutes, 0)::numeric * 90::numeric * ((p.goals_scored::numeric + 6.0) / (NULLIF(p.expected_goals, 0::numeric) + 6.0)), 0::numeric) AS raw_xg90,
    COALESCE(p.expected_assists / NULLIF(p.minutes, 0)::numeric * 90::numeric, 0::numeric) AS raw_xa90
   FROM fixture_player_expected_minutes_resolved_v3 m
     JOIN fpl_players p ON p.fpl_player_id = m.fpl_player_id AND p.season_id = 13
     JOIN fixtures f ON f.fixture_id = m.fixture_id
  WHERE f.season_id = 13 AND f.predicted_home_goals IS NOT NULL AND f.predicted_away_goals IS NOT NULL;

CREATE VIEW public.fpl_set_piece_fixture_exposure_v1 WITH (security_invoker=true) AS
 SELECT r.fixture_id,
    r.team_id,
    r.fpl_player_id,
    h.set_piece_type,
    h.rank,
    r.expected_minutes,
    r.prob_starting_xi
   FROM fixture_player_expected_minutes_resolved_v3 r
     JOIN set_piece_hierarchies h ON h.team_id = r.team_id AND h.source_player_id = r.fpl_player_id::text AND h.season_id = 13;

CREATE VIEW public.fpl_set_piece_fixture_adjustments_v1 WITH (security_invoker=true) AS
 WITH raw AS (
         SELECT fpl_set_piece_fixture_exposure_v1.fixture_id,
            fpl_set_piece_fixture_exposure_v1.team_id,
            fpl_set_piece_fixture_exposure_v1.fpl_player_id,
            max(
                CASE
                    WHEN fpl_set_piece_fixture_exposure_v1.set_piece_type = 'penalty'::text THEN 1.0 / fpl_set_piece_fixture_exposure_v1.rank::numeric * fpl_set_piece_fixture_exposure_v1.prob_starting_xi * fpl_set_piece_fixture_exposure_v1.expected_minutes / 90::numeric
                    ELSE 0::numeric
                END) AS penalty_raw,
            max(
                CASE
                    WHEN fpl_set_piece_fixture_exposure_v1.set_piece_type = 'direct_free_kick'::text THEN 1.0 / fpl_set_piece_fixture_exposure_v1.rank::numeric * fpl_set_piece_fixture_exposure_v1.prob_starting_xi * fpl_set_piece_fixture_exposure_v1.expected_minutes / 90::numeric
                    ELSE 0::numeric
                END) AS fk_raw,
            max(
                CASE
                    WHEN fpl_set_piece_fixture_exposure_v1.set_piece_type = ANY (ARRAY['corner_left'::text, 'corner_right'::text, 'indirect_free_kick'::text]) THEN 1.0 / fpl_set_piece_fixture_exposure_v1.rank::numeric * fpl_set_piece_fixture_exposure_v1.prob_starting_xi * fpl_set_piece_fixture_exposure_v1.expected_minutes / 90::numeric
                    ELSE 0::numeric
                END) AS creation_raw
           FROM fpl_set_piece_fixture_exposure_v1
          GROUP BY fpl_set_piece_fixture_exposure_v1.fixture_id, fpl_set_piece_fixture_exposure_v1.team_id, fpl_set_piece_fixture_exposure_v1.fpl_player_id
        ), n AS (
         SELECT raw.fixture_id,
            raw.team_id,
            raw.fpl_player_id,
            raw.penalty_raw,
            raw.fk_raw,
            raw.creation_raw,
            sum(raw.penalty_raw) OVER (PARTITION BY raw.fixture_id, raw.team_id) AS sp,
            sum(raw.fk_raw) OVER (PARTITION BY raw.fixture_id, raw.team_id) AS sf,
            sum(raw.creation_raw) OVER (PARTITION BY raw.fixture_id, raw.team_id) AS sc
           FROM raw
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    round(
        CASE
            WHEN sp > 1::numeric THEN penalty_raw / sp
            ELSE penalty_raw
        END, 6) AS penalty_exposure,
    round(
        CASE
            WHEN sf > 1::numeric THEN fk_raw / sf
            ELSE fk_raw
        END, 6) AS direct_fk_exposure,
    round(
        CASE
            WHEN sc > 1::numeric THEN creation_raw / sc
            ELSE creation_raw
        END, 6) AS creation_exposure
   FROM n;

CREATE VIEW public.fpl_projection_leaguewide_allocation_v2 WITH (security_invoker=true) AS
 WITH x AS (
         SELECT i.fixture_id,
            i.team_id,
            i.fpl_player_id,
            i.expected_minutes,
            i.prob_starting_xi,
            i.prob_sub_appearance,
            i.availability_probability,
            i.real_tactical_role,
            i.web_name,
            i.element_type,
            i.season_minutes,
            i.raw_xg90,
            i.raw_xa90,
                CASE i.element_type
                    WHEN 2 THEN 0.0673
                    WHEN 3 THEN 0.1650
                    WHEN 4 THEN 0.4474
                    ELSE 0::numeric
                END AS prior_xg90,
                CASE i.element_type
                    WHEN 1 THEN 0.0040
                    WHEN 2 THEN 0.0592
                    WHEN 3 THEN 0.1278
                    WHEN 4 THEN 0.0639
                    ELSE 0::numeric
                END AS prior_xa90,
                CASE
                    WHEN i.element_type = 1 THEN 0::numeric
                    ELSE (i.raw_xg90 * i.season_minutes::numeric +
                    CASE i.element_type
                        WHEN 2 THEN 0.0673
                        WHEN 3 THEN 0.1650
                        WHEN 4 THEN 0.4474
                        ELSE 0::numeric
                    END * 900::numeric) / (i.season_minutes + 900)::numeric
                END AS shrunk_xg90,
            (i.raw_xa90 * i.season_minutes::numeric +
                CASE i.element_type
                    WHEN 1 THEN 0.0040
                    WHEN 2 THEN 0.0592
                    WHEN 3 THEN 0.1278
                    WHEN 4 THEN 0.0639
                    ELSE 0::numeric
                END * 900::numeric) / (i.season_minutes + 900)::numeric AS shrunk_xa90
           FROM fpl_projection_v4_leaguewide_inputs i
        ), b AS (
         SELECT x.fixture_id,
            x.team_id,
            x.fpl_player_id,
            x.expected_minutes,
            x.prob_starting_xi,
            x.prob_sub_appearance,
            x.availability_probability,
            x.real_tactical_role,
            x.web_name,
            x.element_type,
            x.season_minutes,
            x.raw_xg90,
            x.raw_xa90,
            x.prior_xg90,
            x.prior_xa90,
            x.shrunk_xg90,
            x.shrunk_xa90,
                CASE
                    WHEN x.team_id = f.home_team_id THEN f.predicted_home_goals
                    ELSE f.predicted_away_goals
                END::numeric AS team_xg,
            COALESCE(r.goal_weight, 1::numeric) AS goal_weight,
            COALESCE(r.assist_weight, 1::numeric) AS assist_weight,
            s.penalty_exposure,
            s.direct_fk_exposure,
            COALESCE(s.creation_exposure, 0::numeric) AS creation_exposure
           FROM x
             JOIN fixtures f USING (fixture_id)
             LEFT JOIN tactical_role_priors r ON r.tactical_role = x.real_tactical_role
             LEFT JOIN fpl_set_piece_fixture_adjustments_v1 s ON s.fixture_id = x.fixture_id AND s.team_id = x.team_id AND s.fpl_player_id = x.fpl_player_id
        ), q AS (
         SELECT b.fixture_id,
            b.team_id,
            b.fpl_player_id,
            b.expected_minutes,
            b.prob_starting_xi,
            b.prob_sub_appearance,
            b.availability_probability,
            b.real_tactical_role,
            b.web_name,
            b.element_type,
            b.season_minutes,
            b.raw_xg90,
            b.raw_xa90,
            b.prior_xg90,
            b.prior_xa90,
            b.shrunk_xg90,
            b.shrunk_xa90,
            b.team_xg,
            b.goal_weight,
            b.assist_weight,
            b.penalty_exposure,
            b.direct_fk_exposure,
            b.creation_exposure,
            GREATEST(b.shrunk_xg90, 0.001) * sqrt(b.goal_weight) * b.expected_minutes / 90::numeric AS raw_goal_score,
            GREATEST(b.shrunk_xa90, 0.001) * sqrt(b.assist_weight) * b.expected_minutes / 90::numeric AS raw_assist_score
           FROM b
        ), n AS (
         SELECT q.fixture_id,
            q.team_id,
            q.fpl_player_id,
            q.expected_minutes,
            q.prob_starting_xi,
            q.prob_sub_appearance,
            q.availability_probability,
            q.real_tactical_role,
            q.web_name,
            q.element_type,
            q.season_minutes,
            q.raw_xg90,
            q.raw_xa90,
            q.prior_xg90,
            q.prior_xa90,
            q.shrunk_xg90,
            q.shrunk_xa90,
            q.team_xg,
            q.goal_weight,
            q.assist_weight,
            q.penalty_exposure,
            q.direct_fk_exposure,
            q.creation_exposure,
            q.raw_goal_score,
            q.raw_assist_score,
            q.raw_goal_score / NULLIF(sum(q.raw_goal_score) OVER (PARTITION BY q.fixture_id, q.team_id), 0::numeric) AS base_goal_share,
            q.raw_assist_score / NULLIF(sum(q.raw_assist_score) OVER (PARTITION BY q.fixture_id, q.team_id), 0::numeric) AS base_assist_share,
            q.penalty_exposure / NULLIF(sum(q.penalty_exposure) OVER (PARTITION BY q.fixture_id, q.team_id), 0::numeric) AS pen_share_raw,
            q.direct_fk_exposure / NULLIF(sum(q.direct_fk_exposure) OVER (PARTITION BY q.fixture_id, q.team_id), 0::numeric) AS fk_share_raw,
            q.creation_exposure / NULLIF(sum(q.creation_exposure) OVER (PARTITION BY q.fixture_id, q.team_id), 0::numeric) AS sp_assist_share
           FROM q
        ), z AS (
         SELECT n.fixture_id,
            n.team_id,
            n.fpl_player_id,
            n.expected_minutes,
            n.prob_starting_xi,
            n.prob_sub_appearance,
            n.availability_probability,
            n.real_tactical_role,
            n.web_name,
            n.element_type,
            n.season_minutes,
            n.raw_xg90,
            n.raw_xa90,
            n.prior_xg90,
            n.prior_xa90,
            n.shrunk_xg90,
            n.shrunk_xa90,
            n.team_xg,
            n.goal_weight,
            n.assist_weight,
            n.penalty_exposure,
            n.direct_fk_exposure,
            n.creation_exposure,
            n.raw_goal_score,
            n.raw_assist_score,
            n.base_goal_share,
            n.base_assist_share,
            0.865 * n.base_goal_share + 0.12 * COALESCE(n.pen_share_raw, n.base_goal_share) + 0.015 * COALESCE(n.fk_share_raw, n.base_goal_share) AS goal_share,
            n.base_assist_share * 0.88 + COALESCE(n.sp_assist_share, n.base_assist_share) * 0.12 AS assist_share
           FROM n
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    element_type,
    expected_minutes,
    prob_starting_xi,
    prob_sub_appearance,
    availability_probability,
    real_tactical_role,
    shrunk_xg90,
    shrunk_xa90,
    team_xg * goal_share / NULLIF(sum(goal_share) OVER (PARTITION BY fixture_id, team_id), 0::numeric) AS expected_goals,
    team_xg * 0.72 * assist_share / NULLIF(sum(assist_share) OVER (PARTITION BY fixture_id, team_id), 0::numeric) AS expected_assists,
    penalty_exposure,
    direct_fk_exposure
   FROM z;

CREATE VIEW public.fpl_defensive_contribution_projection_leaguewide WITH (security_invoker=true) AS
 WITH h AS (
         SELECT fpl_player_defensive_contribution_usage.season_id,
            fpl_player_defensive_contribution_usage.fpl_player_id,
            fpl_player_defensive_contribution_usage.element_type,
            fpl_player_defensive_contribution_usage.minutes,
                CASE
                    WHEN fpl_player_defensive_contribution_usage.element_type = 2 THEN fpl_player_defensive_contribution_usage.cbi
                    ELSE fpl_player_defensive_contribution_usage.cbi + fpl_player_defensive_contribution_usage.recoveries + fpl_player_defensive_contribution_usage.tackles
                END AS events
           FROM fpl_player_defensive_contribution_usage
          WHERE fpl_player_defensive_contribution_usage.season_id = 13
        ), b AS (
         SELECT a.fixture_id,
            a.team_id,
            a.fpl_player_id,
            a.expected_minutes,
            a.prob_starting_xi,
            a.element_type,
                CASE a.element_type
                    WHEN 2 THEN 7.143
                    WHEN 3 THEN 7.107
                    WHEN 4 THEN 3.681
                    ELSE 0::numeric
                END AS prior90,
                CASE a.element_type
                    WHEN 2 THEN 0.255
                    WHEN 3 THEN 0.125
                    WHEN 4 THEN 0.01
                    ELSE 0::numeric
                END AS base_rate
           FROM fpl_projection_leaguewide_allocation_v2 a
        )
 SELECT b.fixture_id,
    b.team_id,
    b.fpl_player_id,
    b.element_type,
    b.expected_minutes,
    b.prob_starting_xi,
        CASE
            WHEN b.element_type = 1 THEN 0::numeric
            ELSE LEAST(0.9, GREATEST(0::numeric, b.prob_starting_xi * b.base_rate * exp(0.28 * ((COALESCE(h.events, 0::numeric) + b.prior90 * 5::numeric) / (COALESCE(h.minutes, 0::bigint) + 450)::numeric * 90::numeric - b.prior90)) * LEAST(1::numeric, b.expected_minutes / 60::numeric)))
        END AS defensive_contribution_probability,
        CASE
            WHEN b.element_type = 2 THEN 10
            WHEN b.element_type = ANY (ARRAY[3, 4]) THEN 12
            ELSE NULL::integer
        END AS threshold,
    (COALESCE(h.events, 0::numeric) + b.prior90 * 5::numeric) / (COALESCE(h.minutes, 0::bigint) + 450)::numeric * 90::numeric AS shrunk_events90
   FROM b
     LEFT JOIN h ON h.fpl_player_id = b.fpl_player_id AND h.season_id = 13;

CREATE VIEW public.fpl_fixture_bps_projection_v1 WITH (security_invoker=true) AS
 WITH hist AS (
         SELECT p.fpl_player_id,
            p.element_type,
            COALESCE(sum(g.minutes), 0::bigint)::numeric AS mins,
            COALESCE(sum(g.bps), 0::bigint)::numeric AS bps
           FROM fpl_players p
             LEFT JOIN fpl_player_gameweeks g ON g.season_id = 13 AND g.fpl_player_id = p.fpl_player_id
          WHERE p.season_id = 13
          GROUP BY p.fpl_player_id, p.element_type
        ), dc_usage AS (
         SELECT u.fpl_player_id,
            u.minutes AS dc_minutes,
            u.cbi,
            u.recoveries,
                CASE fp.element_type
                    WHEN 1 THEN 1.35
                    WHEN 2 THEN 6.00
                    WHEN 3 THEN 2.20
                    WHEN 4 THEN 1.21
                    ELSE 3.0
                END AS cbi_prior90,
                CASE fp.element_type
                    WHEN 1 THEN 8.62
                    WHEN 2 THEN 3.41
                    WHEN 3 THEN 4.19
                    WHEN 4 THEN 2.41
                    ELSE 4.0
                END AS recoveries_prior90
           FROM fpl_player_defensive_contribution_usage u
             JOIN fpl_players fp ON fp.fpl_player_id = u.fpl_player_id AND fp.season_id = 13
          WHERE u.season_id = 13
        ), base AS (
         SELECT a.fixture_id,
            a.team_id,
            a.fpl_player_id,
            a.element_type,
            a.expected_minutes,
            a.expected_goals,
            a.expected_assists,
            exp(-
                CASE
                    WHEN a.team_id = f.home_team_id THEN f.predicted_away_goals
                    ELSE f.predicted_home_goals
                END)::numeric AS clean_sheet_probability,
            (COALESCE(dc.cbi, 0::numeric) + dc.cbi_prior90 * 5::numeric) / (COALESCE(dc.dc_minutes, 0::bigint) + 450)::numeric * 90::numeric AS shrunk_cbi90,
            (COALESCE(dc.recoveries, 0::numeric) + dc.recoveries_prior90 * 5::numeric) / (COALESCE(dc.dc_minutes, 0::bigint) + 450)::numeric * 90::numeric AS shrunk_recoveries90,
            h.mins,
            h.bps,
                CASE a.element_type
                    WHEN 1 THEN 15.88
                    WHEN 2 THEN 19.27
                    WHEN 3 THEN 27.39
                    WHEN 4 THEN 33.24
                    ELSE 20::numeric
                END AS prior_bps90
           FROM fpl_projection_leaguewide_allocation_v2 a
             JOIN fixtures f ON f.fixture_id = a.fixture_id
             JOIN hist h ON h.fpl_player_id = a.fpl_player_id
             LEFT JOIN dc_usage dc ON dc.fpl_player_id = a.fpl_player_id
        ), score AS (
         SELECT b.fixture_id,
            b.team_id,
            b.fpl_player_id,
            b.element_type,
            b.expected_minutes,
            b.expected_goals,
            b.expected_assists,
            b.clean_sheet_probability,
            (b.shrunk_cbi90 + b.shrunk_recoveries90) * (b.expected_minutes / 90.0) / 3.0 AS dc_bps,
            b.mins,
            b.bps,
            b.prior_bps90,
            (b.bps + b.prior_bps90 * 5::numeric) / (b.mins + 450::numeric) * b.expected_minutes + b.expected_goals *
                CASE b.element_type
                    WHEN 1 THEN 12
                    WHEN 2 THEN 12
                    WHEN 3 THEN 18
                    WHEN 4 THEN 24
                    ELSE 18
                END::numeric + b.expected_assists * 9::numeric + b.clean_sheet_probability * LEAST(1::numeric, b.expected_minutes / 60::numeric) *
                CASE
                    WHEN b.element_type = ANY (ARRAY[1, 2]) THEN 12
                    ELSE 0
                END::numeric + (b.shrunk_cbi90 + b.shrunk_recoveries90) * (b.expected_minutes / 90.0) / 3.0 AS expected_bps_score
           FROM base b
        ), ranked AS (
         SELECT s.fixture_id,
            s.team_id,
            s.fpl_player_id,
            s.element_type,
            s.expected_minutes,
            s.expected_goals,
            s.expected_assists,
            s.clean_sheet_probability,
            s.dc_bps,
            s.mins,
            s.bps,
            s.prior_bps90,
            s.expected_bps_score,
            row_number() OVER (PARTITION BY s.fixture_id ORDER BY s.expected_bps_score DESC) AS bps_rank
           FROM score s
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    element_type,
    expected_minutes,
    expected_bps_score,
    bps_rank,
        CASE
            WHEN bps_rank = 1 THEN 3
            WHEN bps_rank = 2 THEN 2
            WHEN bps_rank = 3 THEN 1
            ELSE 0
        END::numeric AS deterministic_bonus,
    expected_goals,
    expected_assists,
    clean_sheet_probability
   FROM ranked;

CREATE VIEW public.fpl_projection_secondary_scoring WITH (security_invoker=true) AS
 WITH h AS (
         SELECT p.fpl_player_id,
            p.element_type,
            COALESCE(sum(g.minutes), 0::bigint)::numeric AS mins,
            COALESCE(sum(g.saves), 0::bigint)::numeric AS saves,
            COALESCE(sum(g.yellow_cards), 0::bigint)::numeric AS yc,
            COALESCE(sum(g.red_cards), 0::bigint)::numeric AS rc,
            COALESCE(sum(g.own_goals), 0::bigint)::numeric AS og,
            COALESCE(sum(g.penalties_saved), 0::bigint)::numeric AS ps,
            COALESCE(sum(g.penalties_missed), 0::bigint)::numeric AS pm
           FROM fpl_players p
             LEFT JOIN fpl_player_gameweeks g ON g.season_id = 13 AND g.fpl_player_id = p.fpl_player_id
          WHERE p.season_id = 13
          GROUP BY p.fpl_player_id, p.element_type
        ), b AS (
         SELECT a.fixture_id,
            a.team_id,
            a.fpl_player_id,
            a.element_type,
            a.expected_minutes,
            a.penalty_exposure,
            f.home_team_id,
            f.predicted_home_goals,
            f.predicted_away_goals,
            h.mins,
            h.saves,
            h.yc,
            h.rc,
            h.og,
            h.ps,
            h.pm
           FROM fpl_projection_leaguewide_allocation_v2 a
             JOIN fixtures f ON f.fixture_id = a.fixture_id
             JOIN h ON h.fpl_player_id = a.fpl_player_id
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
        CASE
            WHEN element_type = 1 THEN (saves + 2.8846 * 5::numeric) / (mins + 450::numeric) * expected_minutes / 3::numeric
            ELSE 0::numeric
        END AS xpts_saves,
        CASE
            WHEN element_type = ANY (ARRAY[1, 2]) THEN (- (
            CASE
                WHEN team_id = home_team_id THEN predicted_away_goals
                ELSE predicted_home_goals
            END / 2.0::double precision - (1::double precision - exp('-2'::integer::double precision *
            CASE
                WHEN team_id = home_team_id THEN predicted_away_goals
                ELSE predicted_home_goals
            END)) / 4.0::double precision)) * LEAST(1::numeric, expected_minutes / 60::numeric)::double precision
            ELSE 0::double precision
        END AS xpts_goals_conceded,
    (- ((yc + 0.35 * 5::numeric) / (mins + 450::numeric))) * expected_minutes - 3::numeric * ((rc + 0.03 * 5::numeric) / (mins + 450::numeric)) * expected_minutes - 2::numeric * ((og + 0.02 * 5::numeric) / (mins + 450::numeric)) * expected_minutes AS xpts_cards_own_goals,
        CASE
            WHEN element_type = 1 THEN 5::numeric * ((ps + 0.03 * 5::numeric) / (mins + 450::numeric)) * expected_minutes
            ELSE 0::numeric
        END -
        CASE
            WHEN penalty_exposure > 0::numeric THEN 2::numeric * ((pm + 0.02 * 5::numeric) / (mins + 450::numeric)) * expected_minutes
            ELSE 0::numeric
        END AS xpts_penalties
   FROM b;

CREATE VIEW public.fpl_projection_leaguewide_points WITH (security_invoker=true) AS
 SELECT a.fixture_id,
    a.team_id,
    a.fpl_player_id,
    p.web_name,
    a.element_type,
    a.real_tactical_role,
    a.expected_minutes,
    a.prob_starting_xi,
    a.prob_sub_appearance,
    a.expected_goals,
    a.expected_assists,
        CASE
            WHEN a.team_id = f.home_team_id THEN exp(- f.predicted_away_goals)
            ELSE exp(- f.predicted_home_goals)
        END AS clean_sheet_probability,
    COALESCE(dc.defensive_contribution_probability, 0::numeric) AS defensive_contribution_probability,
    0::numeric AS expected_bonus,
    a.prob_starting_xi * 2::numeric + a.prob_sub_appearance AS xpts_appearance,
    a.expected_goals *
        CASE a.element_type
            WHEN 1 THEN 10
            WHEN 2 THEN 6
            WHEN 3 THEN 5
            ELSE 4
        END::numeric AS xpts_goals,
    a.expected_assists * 3::numeric AS xpts_assists,
        CASE
            WHEN a.element_type = ANY (ARRAY[1, 2]) THEN 4
            WHEN a.element_type = 3 THEN 1
            ELSE 0
        END::double precision *
        CASE
            WHEN a.team_id = f.home_team_id THEN exp(- f.predicted_away_goals)
            ELSE exp(- f.predicted_home_goals)
        END * a.prob_starting_xi::double precision AS xpts_clean_sheet,
    COALESCE(dc.defensive_contribution_probability, 0::numeric) * 2::numeric AS xpts_defensive_contribution,
    0::numeric AS xpts_bonus
   FROM fpl_projection_leaguewide_allocation_v2 a
     JOIN fpl_players p ON p.season_id = 13 AND p.fpl_player_id = a.fpl_player_id
     JOIN fixtures f ON f.fixture_id = a.fixture_id
     LEFT JOIN fpl_defensive_contribution_projection_leaguewide dc ON dc.fixture_id = a.fixture_id AND dc.fpl_player_id = a.fpl_player_id;

CREATE VIEW public.fpl_projection_leaguewide_final WITH (security_invoker=true) AS
 SELECT p.fixture_id,
    p.team_id,
    p.fpl_player_id,
    p.web_name,
    p.element_type,
    p.real_tactical_role,
    p.expected_minutes,
    p.prob_starting_xi,
    p.prob_sub_appearance,
    p.expected_goals,
    p.expected_assists,
    p.clean_sheet_probability,
    p.defensive_contribution_probability,
    p.expected_bonus,
    p.xpts_appearance,
    p.xpts_goals,
    p.xpts_assists,
    p.xpts_clean_sheet,
    p.xpts_defensive_contribution,
    p.xpts_bonus,
    s.xpts_saves,
    s.xpts_goals_conceded,
    s.xpts_cards_own_goals,
    s.xpts_penalties,
    (p.xpts_appearance + p.xpts_goals + p.xpts_assists)::double precision + p.xpts_clean_sheet + p.xpts_defensive_contribution::double precision + p.xpts_bonus::double precision + s.xpts_saves::double precision + s.xpts_goals_conceded + s.xpts_cards_own_goals::double precision + s.xpts_penalties::double precision AS expected_fpl_points
   FROM fpl_projection_leaguewide_points p
     JOIN fpl_projection_secondary_scoring s ON s.fixture_id = p.fixture_id AND s.fpl_player_id = p.fpl_player_id;

-- ----------------------------------------------------------------------------
-- TRIGGERS
-- ----------------------------------------------------------------------------

CREATE TRIGGER fixtures_generate_slug BEFORE INSERT ON fixtures FOR EACH ROW EXECUTE FUNCTION generate_fixture_slug();
CREATE TRIGGER fpl_player_gameweeks_season_id_default BEFORE INSERT ON fpl_player_gameweeks FOR EACH ROW EXECUTE FUNCTION set_current_season_id();
CREATE TRIGGER fpl_player_snapshots_season_id_default BEFORE INSERT ON fpl_player_snapshots FOR EACH ROW EXECUTE FUNCTION set_current_season_id();
CREATE TRIGGER fpl_players_code_default BEFORE INSERT OR UPDATE ON fpl_players FOR EACH ROW EXECUTE FUNCTION set_fpl_code_from_payload();
CREATE TRIGGER fpl_players_generate_slug BEFORE INSERT OR UPDATE OF first_name, second_name, web_name ON fpl_players FOR EACH ROW EXECUTE FUNCTION generate_fpl_player_slug();
CREATE TRIGGER fpl_players_season_id_default BEFORE INSERT ON fpl_players FOR EACH ROW EXECUTE FUNCTION set_current_season_id();
CREATE TRIGGER fpl_players_sync_identity AFTER INSERT OR UPDATE ON fpl_players FOR EACH ROW EXECUTE FUNCTION sync_player_identity();
CREATE TRIGGER team_slug_change_history AFTER UPDATE OF slug ON teams FOR EACH ROW EXECUTE FUNCTION record_team_slug_change();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

ALTER TABLE public.admin_bootstrap_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_fpl_player_gameweeks_20260919 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_fpl_player_snapshots_20260919 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_fpl_players_20260919 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_player_availability_events_20260919 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_source_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_metric_dictionary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_metric_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_metric_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_raw_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_reporting_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixture_actual_lineup_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixture_actual_team_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixture_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixture_lineup_prediction_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixture_lineup_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixture_refresh_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formation_code_names ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formation_slot_geometry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpl_fixture_bonus_montecarlo_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpl_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpl_gameweeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpl_hindsight_optimal_squad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpl_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpl_player_gameweek_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpl_player_gameweeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpl_player_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpl_player_return_assumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpl_player_season_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpl_player_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpl_player_squad_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpl_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpl_projection_model_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpl_scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpl_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lineup_prediction_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_odds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_fit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opta_player_match ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opta_slot_breakdown ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_availability_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_lineup_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_match_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_squad_hierarchy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_tactical_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projection_scenario_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projection_scenario_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projection_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_match_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.result_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_best_xi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.set_piece_hierarchies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_match_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tactical_data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tactical_formation_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tactical_formation_slot_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tactical_player_match_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tactical_role_priors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tactical_team_match_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_category_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_finishing_position_projection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_match_tactics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_player_tactical_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_slug_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_strength_forward_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_strength_manual_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_tactical_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_tactical_review_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- POLICIES
-- ----------------------------------------------------------------------------

CREATE POLICY "app_users read own row" ON public.app_users AS PERMISSIVE FOR SELECT TO authenticated
    USING ((auth.uid() = user_id));
CREATE POLICY "Public read access" ON public.countries AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.data_source_competitions AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY finance_metric_dictionary_public_read ON public.finance_metric_dictionary AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY finance_metric_values_public_read ON public.finance_metric_values AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (((validation_status = 'published'::text) AND (EXISTS ( SELECT 1
   FROM finance_periods p
  WHERE ((p.financial_id = finance_metric_values.financial_id) AND (p.validation_status = 'published'::text) AND p.is_current_version)))));
CREATE POLICY finance_periods_public_read ON public.finance_periods AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (((validation_status = 'published'::text) AND is_current_version));
CREATE POLICY "fixture_actual_lineup_players public read" ON public.fixture_actual_lineup_players AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "fixture_actual_team_lineups public read" ON public.fixture_actual_team_lineups AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "fixture_changes are publicly readable" ON public.fixture_changes AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Public read access" ON public.fixture_lineup_prediction_players AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.fixture_lineup_predictions AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.fixture_refresh_runs AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.fixtures AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "formation_code_names is publicly readable" ON public.formation_code_names AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "formation_slot_geometry is publicly readable" ON public.formation_slot_geometry AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "fpl_fixture_bonus_montecarlo_v1 public read" ON public.fpl_fixture_bonus_montecarlo_v1 AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "fpl_fixtures are publicly readable" ON public.fpl_fixtures AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "fpl_hindsight_optimal_squad public read" ON public.fpl_hindsight_optimal_squad AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "fpl_ingestion_runs are publicly readable" ON public.fpl_ingestion_runs AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "fpl_player_gameweek_history is publicly readable" ON public.fpl_player_gameweek_history AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Public read access" ON public.fpl_player_gameweeks AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.fpl_player_projections AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "fpl_player_season_totals are publicly readable" ON public.fpl_player_season_totals AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "fpl_player_snapshots are publicly readable" ON public.fpl_player_snapshots AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "fpl_player_squad_state admin write" ON public.fpl_player_squad_state AS PERMISSIVE FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());
CREATE POLICY "fpl_player_squad_state public read" ON public.fpl_player_squad_state AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Public read access" ON public.fpl_players AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.fpl_scoring_rules AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.fpl_teams AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.leagues AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.lineup_prediction_sources AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.match_import_runs AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "match_odds are publicly readable" ON public.match_odds AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Public read access" ON public.matches AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.model_fit_runs AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "opta_player_match is publicly readable" ON public.opta_player_match AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "opta_slot_breakdown is publicly readable" ON public.opta_slot_breakdown AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "pipeline_runs are publicly readable" ON public.pipeline_runs AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "player_identity is publicly readable" ON public.player_identity AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Public read access" ON public.player_squad_hierarchy AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.player_tactical_profiles AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.point_deductions AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Public read access" ON public.raw_match_files AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "season_best_xi is publicly readable" ON public.season_best_xi AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Public read access" ON public.seasons AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.set_piece_hierarchies AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "set_piece_hierarchies admin write" ON public.set_piece_hierarchies AS PERMISSIVE FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());
CREATE POLICY "set_piece_hierarchies public read" ON public.set_piece_hierarchies AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Public read access" ON public.source_match_rows AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "tactical_data_sources are publicly readable" ON public.tactical_data_sources AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "tactical_formation_mappings are publicly readable" ON public.tactical_formation_mappings AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "tactical_formation_slot_aggregates are publicly readable" ON public.tactical_formation_slot_aggregates AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Public read access" ON public.tactical_role_priors AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.team_aliases AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.team_categories AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.team_category_memberships AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "team_finishing_position_projection admin write" ON public.team_finishing_position_projection AS PERMISSIVE FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());
CREATE POLICY "team_finishing_position_projection public read" ON public.team_finishing_position_projection AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "team_player_tactical_defaults admin write" ON public.team_player_tactical_defaults AS PERMISSIVE FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());
CREATE POLICY "team_player_tactical_defaults public read" ON public.team_player_tactical_defaults AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Public read access" ON public.team_ratings AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "Public read access" ON public.team_slug_history AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "team_strength_manual_override admin write" ON public.team_strength_manual_override AS PERMISSIVE FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());
CREATE POLICY "team_strength_manual_override public read" ON public.team_strength_manual_override AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Public read access" ON public.team_tactical_defaults AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "team_tactical_defaults admin write" ON public.team_tactical_defaults AS PERMISSIVE FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());
CREATE POLICY "team_tactical_review_log admin write" ON public.team_tactical_review_log AS PERMISSIVE FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());
CREATE POLICY "team_tactical_review_log public read" ON public.team_tactical_review_log AS PERMISSIVE FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Public read access" ON public.teams AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);

-- ----------------------------------------------------------------------------
-- TABLE AND VIEW PRIVILEGES
-- ----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.admin_bootstrap_emails FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.admin_bootstrap_emails TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.admin_bootstrap_emails TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.admin_bootstrap_emails TO service_role;
REVOKE ALL ON TABLE public.app_users FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.app_users TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.app_users TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.app_users TO service_role;
REVOKE ALL ON TABLE public.backup_fpl_player_gameweeks_20260919 FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.backup_fpl_player_gameweeks_20260919 TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.backup_fpl_player_gameweeks_20260919 TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.backup_fpl_player_gameweeks_20260919 TO service_role;
REVOKE ALL ON TABLE public.backup_fpl_player_snapshots_20260919 FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.backup_fpl_player_snapshots_20260919 TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.backup_fpl_player_snapshots_20260919 TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.backup_fpl_player_snapshots_20260919 TO service_role;
REVOKE ALL ON TABLE public.backup_fpl_players_20260919 FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.backup_fpl_players_20260919 TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.backup_fpl_players_20260919 TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.backup_fpl_players_20260919 TO service_role;
REVOKE ALL ON TABLE public.backup_player_availability_events_20260919 FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.backup_player_availability_events_20260919 TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.backup_player_availability_events_20260919 TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.backup_player_availability_events_20260919 TO service_role;
REVOKE ALL ON TABLE public.countries FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.countries TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.countries TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.countries TO authenticated;
REVOKE ALL ON TABLE public.data_health FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.data_health TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.data_health TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.data_health TO service_role;
REVOKE ALL ON TABLE public.data_source_competitions FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.data_source_competitions TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.data_source_competitions TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.data_source_competitions TO authenticated;
REVOKE ALL ON TABLE public.finance_derived_metrics FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.finance_derived_metrics TO service_role;
GRANT SELECT ON TABLE public.finance_derived_metrics TO anon;
GRANT SELECT ON TABLE public.finance_derived_metrics TO authenticated;
REVOKE ALL ON TABLE public.finance_filings FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.finance_filings TO service_role;
REVOKE ALL ON TABLE public.finance_ingestion_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.finance_ingestion_runs TO service_role;
REVOKE ALL ON TABLE public.finance_metric_dictionary FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.finance_metric_dictionary TO service_role;
GRANT SELECT ON TABLE public.finance_metric_dictionary TO anon;
GRANT SELECT ON TABLE public.finance_metric_dictionary TO authenticated;
REVOKE ALL ON TABLE public.finance_metric_mappings FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.finance_metric_mappings TO service_role;
REVOKE ALL ON TABLE public.finance_metric_values FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.finance_metric_values TO service_role;
GRANT SELECT ON TABLE public.finance_metric_values TO anon;
GRANT SELECT ON TABLE public.finance_metric_values TO authenticated;
REVOKE ALL ON TABLE public.finance_periods FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.finance_periods TO service_role;
GRANT SELECT ON TABLE public.finance_periods TO anon;
GRANT SELECT ON TABLE public.finance_periods TO authenticated;
REVOKE ALL ON TABLE public.finance_published_periods FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.finance_published_periods TO service_role;
GRANT SELECT ON TABLE public.finance_published_periods TO anon;
GRANT SELECT ON TABLE public.finance_published_periods TO authenticated;
REVOKE ALL ON TABLE public.finance_published_provenance FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.finance_published_provenance TO service_role;
GRANT SELECT ON TABLE public.finance_published_provenance TO anon;
GRANT SELECT ON TABLE public.finance_published_provenance TO authenticated;
REVOKE ALL ON TABLE public.finance_raw_facts FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.finance_raw_facts TO service_role;
REVOKE ALL ON TABLE public.finance_reporting_entities FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.finance_reporting_entities TO service_role;
REVOKE ALL ON TABLE public.fixture_actual_lineup_players FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_actual_lineup_players TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_actual_lineup_players TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_actual_lineup_players TO service_role;
REVOKE ALL ON TABLE public.fixture_actual_team_lineups FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_actual_team_lineups TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_actual_team_lineups TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_actual_team_lineups TO service_role;
REVOKE ALL ON TABLE public.fixture_changes FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_changes TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_changes TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_changes TO authenticated;
REVOKE ALL ON TABLE public.fixture_lineup_prediction_players FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_lineup_prediction_players TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_lineup_prediction_players TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_lineup_prediction_players TO service_role;
REVOKE ALL ON TABLE public.fixture_lineup_predictions FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_lineup_predictions TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_lineup_predictions TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_lineup_predictions TO service_role;
REVOKE ALL ON TABLE public.fixture_player_expected_minutes FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes TO service_role;
REVOKE ALL ON TABLE public.fixture_player_expected_minutes_fallback FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes_fallback TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes_fallback TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes_fallback TO service_role;
REVOKE ALL ON TABLE public.fixture_player_expected_minutes_resolved FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes_resolved TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes_resolved TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes_resolved TO service_role;
REVOKE ALL ON TABLE public.fixture_player_expected_minutes_resolved_v3 FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes_resolved_v3 TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes_resolved_v3 TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes_resolved_v3 TO service_role;
REVOKE ALL ON TABLE public.fixture_player_expected_minutes_v2 FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes_v2 TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes_v2 TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes_v2 TO service_role;
REVOKE ALL ON TABLE public.fixture_player_expected_minutes_v3 FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes_v3 TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes_v3 TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_expected_minutes_v3 TO service_role;
REVOKE ALL ON TABLE public.fixture_player_lineup_consensus FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_lineup_consensus TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_lineup_consensus TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_lineup_consensus TO service_role;
REVOKE ALL ON TABLE public.fixture_player_tactical_consensus FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_tactical_consensus TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_tactical_consensus TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_player_tactical_consensus TO service_role;
REVOKE ALL ON TABLE public.fixture_refresh_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_refresh_runs TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_refresh_runs TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_refresh_runs TO authenticated;
REVOKE ALL ON TABLE public.fixture_team_tactical_consensus FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_team_tactical_consensus TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_team_tactical_consensus TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixture_team_tactical_consensus TO service_role;
REVOKE ALL ON TABLE public.fixtures FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fixtures TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fixtures TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fixtures TO authenticated;
REVOKE ALL ON TABLE public.formation_code_names FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.formation_code_names TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.formation_code_names TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.formation_code_names TO service_role;
REVOKE ALL ON TABLE public.formation_slot_geometry FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.formation_slot_geometry TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.formation_slot_geometry TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.formation_slot_geometry TO service_role;
REVOKE ALL ON TABLE public.fpl_defensive_contribution_projection_leaguewide FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_defensive_contribution_projection_leaguewide TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_defensive_contribution_projection_leaguewide TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_defensive_contribution_projection_leaguewide TO service_role;
REVOKE ALL ON TABLE public.fpl_fallback_start_probability_v6 FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_fallback_start_probability_v6 TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_fallback_start_probability_v6 TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_fallback_start_probability_v6 TO service_role;
REVOKE ALL ON TABLE public.fpl_fixture_bonus_montecarlo_v1 FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fpl_fixture_bonus_montecarlo_v1 TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_fixture_bonus_montecarlo_v1 TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_fixture_bonus_montecarlo_v1 TO authenticated;
REVOKE ALL ON TABLE public.fpl_fixture_bps_projection_v1 FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_fixture_bps_projection_v1 TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_fixture_bps_projection_v1 TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_fixture_bps_projection_v1 TO service_role;
REVOKE ALL ON TABLE public.fpl_fixtures FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_fixtures TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_fixtures TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_fixtures TO service_role;
REVOKE ALL ON TABLE public.fpl_full_season_projection_health_v1 FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_full_season_projection_health_v1 TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_full_season_projection_health_v1 TO service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_full_season_projection_health_v1 TO anon;
REVOKE ALL ON TABLE public.fpl_gameweeks FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_gameweeks TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_gameweeks TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_gameweeks TO service_role;
REVOKE ALL ON TABLE public.fpl_hindsight_optimal_squad FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fpl_hindsight_optimal_squad TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_hindsight_optimal_squad TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_hindsight_optimal_squad TO authenticated;
REVOKE ALL ON TABLE public.fpl_ingestion_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_ingestion_runs TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_ingestion_runs TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_ingestion_runs TO service_role;
REVOKE ALL ON TABLE public.fpl_optimizer_candidate_feed_v1 FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_optimizer_candidate_feed_v1 TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_optimizer_candidate_feed_v1 TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_optimizer_candidate_feed_v1 TO service_role;
REVOKE ALL ON TABLE public.fpl_optimizer_candidate_feed_v2 FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_optimizer_candidate_feed_v2 TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_optimizer_candidate_feed_v2 TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_optimizer_candidate_feed_v2 TO service_role;
REVOKE ALL ON TABLE public.fpl_player_defensive_contribution_usage FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_defensive_contribution_usage TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_defensive_contribution_usage TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_defensive_contribution_usage TO service_role;
REVOKE ALL ON TABLE public.fpl_player_gameweek_history FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fpl_player_gameweek_history TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_gameweek_history TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_gameweek_history TO authenticated;
REVOKE ALL ON TABLE public.fpl_player_gameweeks FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_gameweeks TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_gameweeks TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_gameweeks TO service_role;
REVOKE ALL ON TABLE public.fpl_player_projections FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fpl_player_projections TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_projections TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_projections TO authenticated;
REVOKE ALL ON TABLE public.fpl_player_return_assumptions FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fpl_player_return_assumptions TO service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_player_return_assumptions TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_player_return_assumptions TO authenticated;
REVOKE ALL ON TABLE public.fpl_player_season_totals FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fpl_player_season_totals TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_season_totals TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_season_totals TO authenticated;
REVOKE ALL ON TABLE public.fpl_player_snapshots FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_snapshots TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_snapshots TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_player_snapshots TO service_role;
REVOKE ALL ON TABLE public.fpl_player_squad_state FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fpl_player_squad_state TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_squad_state TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_squad_state TO service_role;
REVOKE ALL ON TABLE public.fpl_player_squad_state_current FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_squad_state_current TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_squad_state_current TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_squad_state_current TO service_role;
REVOKE ALL ON TABLE public.fpl_player_substitution_usage FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_substitution_usage TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_substitution_usage TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_player_substitution_usage TO service_role;
REVOKE ALL ON TABLE public.fpl_players FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_players TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_players TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_players TO service_role;
REVOKE ALL ON TABLE public.fpl_prediction_actual_start_comparison FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_prediction_actual_start_comparison TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_prediction_actual_start_comparison TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_prediction_actual_start_comparison TO service_role;
REVOKE ALL ON TABLE public.fpl_projection_data_health FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_data_health TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_data_health TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_data_health TO service_role;
REVOKE ALL ON TABLE public.fpl_projection_fixture_readiness FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_fixture_readiness TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_fixture_readiness TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_fixture_readiness TO service_role;
REVOKE ALL ON TABLE public.fpl_projection_frontend_feed FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_frontend_feed TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_frontend_feed TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_frontend_feed TO service_role;
REVOKE ALL ON TABLE public.fpl_projection_frontend_feed_v6 FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_frontend_feed_v6 TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_frontend_feed_v6 TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_frontend_feed_v6 TO service_role;
REVOKE ALL ON TABLE public.fpl_projection_leaguewide_allocation_v2 FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_leaguewide_allocation_v2 TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_leaguewide_allocation_v2 TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_leaguewide_allocation_v2 TO service_role;
REVOKE ALL ON TABLE public.fpl_projection_leaguewide_final FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_leaguewide_final TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_leaguewide_final TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_leaguewide_final TO service_role;
REVOKE ALL ON TABLE public.fpl_projection_leaguewide_points FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_leaguewide_points TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_leaguewide_points TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_leaguewide_points TO service_role;
REVOKE ALL ON TABLE public.fpl_projection_model_parameters FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_model_parameters TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_model_parameters TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_model_parameters TO service_role;
REVOKE ALL ON TABLE public.fpl_projection_secondary_scoring FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_secondary_scoring TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_secondary_scoring TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_secondary_scoring TO service_role;
REVOKE ALL ON TABLE public.fpl_projection_v4_leaguewide_inputs FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_v4_leaguewide_inputs TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_v4_leaguewide_inputs TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_projection_v4_leaguewide_inputs TO service_role;
REVOKE ALL ON TABLE public.fpl_scoring_rules FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_scoring_rules TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_scoring_rules TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_scoring_rules TO service_role;
REVOKE ALL ON TABLE public.fpl_season_fixture_feed FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_season_fixture_feed TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_season_fixture_feed TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_season_fixture_feed TO service_role;
REVOKE ALL ON TABLE public.fpl_season_player_projection_feed FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_season_player_projection_feed TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_season_player_projection_feed TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_season_player_projection_feed TO service_role;
REVOKE ALL ON TABLE public.fpl_set_piece_fixture_adjustments_v1 FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_set_piece_fixture_adjustments_v1 TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_set_piece_fixture_adjustments_v1 TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_set_piece_fixture_adjustments_v1 TO service_role;
REVOKE ALL ON TABLE public.fpl_set_piece_fixture_exposure_v1 FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_set_piece_fixture_exposure_v1 TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_set_piece_fixture_exposure_v1 TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_set_piece_fixture_exposure_v1 TO service_role;
REVOKE ALL ON TABLE public.fpl_team_strength_current FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_team_strength_current TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_team_strength_current TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.fpl_team_strength_current TO service_role;
REVOKE ALL ON TABLE public.fpl_teams FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_teams TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_teams TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.fpl_teams TO service_role;
REVOKE ALL ON TABLE public.league_fit_status FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.league_fit_status TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.league_fit_status TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.league_fit_status TO service_role;
REVOKE ALL ON TABLE public.leagues FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leagues TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.leagues TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.leagues TO authenticated;
REVOKE ALL ON TABLE public.lineup_prediction_sources FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.lineup_prediction_sources TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.lineup_prediction_sources TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.lineup_prediction_sources TO service_role;
REVOKE ALL ON TABLE public.match_import_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_import_runs TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.match_import_runs TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.match_import_runs TO authenticated;
REVOKE ALL ON TABLE public.match_odds FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.match_odds TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.match_odds TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.match_odds TO authenticated;
REVOKE ALL ON TABLE public.matches FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.matches TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.matches TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.matches TO authenticated;
REVOKE ALL ON TABLE public.model_fit_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.model_fit_runs TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.model_fit_runs TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.model_fit_runs TO authenticated;
REVOKE ALL ON TABLE public.opta_player_match FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.opta_player_match TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.opta_player_match TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.opta_player_match TO authenticated;
REVOKE ALL ON TABLE public.opta_slot_breakdown FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.opta_slot_breakdown TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.opta_slot_breakdown TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.opta_slot_breakdown TO authenticated;
REVOKE ALL ON TABLE public.pipeline_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pipeline_runs TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.pipeline_runs TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.pipeline_runs TO authenticated;
REVOKE ALL ON TABLE public.player_availability_events FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_availability_events TO service_role;
REVOKE ALL ON TABLE public.player_identity FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_identity TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.player_identity TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.player_identity TO authenticated;
REVOKE ALL ON TABLE public.player_lineup_predictions FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_lineup_predictions TO service_role;
REVOKE ALL ON TABLE public.player_match_roles FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_match_roles TO service_role;
REVOKE ALL ON TABLE public.player_squad_hierarchy FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.player_squad_hierarchy TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.player_squad_hierarchy TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.player_squad_hierarchy TO service_role;
REVOKE ALL ON TABLE public.player_tactical_profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.player_tactical_profiles TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.player_tactical_profiles TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.player_tactical_profiles TO service_role;
REVOKE ALL ON TABLE public.point_deductions FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.point_deductions TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.point_deductions TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.point_deductions TO authenticated;
REVOKE ALL ON TABLE public.projection_scenario_players FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.projection_scenario_players TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.projection_scenario_players TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.projection_scenario_players TO service_role;
REVOKE ALL ON TABLE public.projection_scenario_teams FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.projection_scenario_teams TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.projection_scenario_teams TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.projection_scenario_teams TO service_role;
REVOKE ALL ON TABLE public.projection_scenarios FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.projection_scenarios TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.projection_scenarios TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.projection_scenarios TO service_role;
REVOKE ALL ON TABLE public.raw_match_files FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.raw_match_files TO service_role;
GRANT SELECT ON TABLE public.raw_match_files TO anon;
GRANT SELECT ON TABLE public.raw_match_files TO authenticated;
REVOKE ALL ON TABLE public.result_ingestion_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.result_ingestion_runs TO service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.result_ingestion_runs TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.result_ingestion_runs TO authenticated;
REVOKE ALL ON TABLE public.season_best_xi FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.season_best_xi TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.season_best_xi TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.season_best_xi TO authenticated;
REVOKE ALL ON TABLE public.seasons FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.seasons TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.seasons TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.seasons TO authenticated;
REVOKE ALL ON TABLE public.set_piece_hierarchies FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.set_piece_hierarchies TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.set_piece_hierarchies TO authenticated;
GRANT SELECT ON TABLE public.set_piece_hierarchies TO anon;
REVOKE ALL ON TABLE public.source_match_rows FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.source_match_rows TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.source_match_rows TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.source_match_rows TO authenticated;
REVOKE ALL ON TABLE public.tactical_data_sources FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tactical_data_sources TO service_role;
GRANT SELECT ON TABLE public.tactical_data_sources TO anon;
GRANT SELECT ON TABLE public.tactical_data_sources TO authenticated;
REVOKE ALL ON TABLE public.tactical_formation_mappings FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tactical_formation_mappings TO service_role;
GRANT SELECT ON TABLE public.tactical_formation_mappings TO anon;
GRANT SELECT ON TABLE public.tactical_formation_mappings TO authenticated;
REVOKE ALL ON TABLE public.tactical_formation_slot_aggregates FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tactical_formation_slot_aggregates TO service_role;
GRANT SELECT ON TABLE public.tactical_formation_slot_aggregates TO anon;
GRANT SELECT ON TABLE public.tactical_formation_slot_aggregates TO authenticated;
REVOKE ALL ON TABLE public.tactical_formation_slot_priors FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.tactical_formation_slot_priors TO service_role;
GRANT SELECT ON TABLE public.tactical_formation_slot_priors TO anon;
GRANT SELECT ON TABLE public.tactical_formation_slot_priors TO authenticated;
REVOKE ALL ON TABLE public.tactical_player_match_observations FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tactical_player_match_observations TO service_role;
REVOKE ALL ON TABLE public.tactical_role_priors FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.tactical_role_priors TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.tactical_role_priors TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.tactical_role_priors TO service_role;
REVOKE ALL ON TABLE public.tactical_team_match_observations FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tactical_team_match_observations TO service_role;
REVOKE ALL ON TABLE public.team_aliases FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_aliases TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_aliases TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_aliases TO authenticated;
REVOKE ALL ON TABLE public.team_categories FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_categories TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_categories TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_categories TO authenticated;
REVOKE ALL ON TABLE public.team_category_memberships FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_category_memberships TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_category_memberships TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_category_memberships TO authenticated;
REVOKE ALL ON TABLE public.team_finishing_position_projection FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_finishing_position_projection TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_finishing_position_projection TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_finishing_position_projection TO anon;
REVOKE ALL ON TABLE public.team_home_away_adjustment_experimental_v1 FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.team_home_away_adjustment_experimental_v1 TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.team_home_away_adjustment_experimental_v1 TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.team_home_away_adjustment_experimental_v1 TO service_role;
REVOKE ALL ON TABLE public.team_home_away_adjustment_v1 FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.team_home_away_adjustment_v1 TO service_role; -- migration 20260921132413
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_home_away_adjustment_v1 TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_home_away_adjustment_v1 TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.team_home_away_adjustment_v1 TO service_role;
REVOKE ALL ON TABLE public.team_match_tactics FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_match_tactics TO service_role;
REVOKE ALL ON TABLE public.team_player_tactical_defaults FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_player_tactical_defaults TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_player_tactical_defaults TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_player_tactical_defaults TO service_role;
REVOKE ALL ON TABLE public.team_ratings FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_ratings TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_ratings TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_ratings TO authenticated;
REVOKE ALL ON TABLE public.team_slug_history FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_slug_history TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_slug_history TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.team_slug_history TO service_role;
REVOKE ALL ON TABLE public.team_strength_current FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.team_strength_current TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.team_strength_current TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.team_strength_current TO service_role;
REVOKE ALL ON TABLE public.team_strength_forward_adjustments FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_strength_forward_adjustments TO service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.team_strength_forward_adjustments TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.team_strength_forward_adjustments TO authenticated;
REVOKE ALL ON TABLE public.team_strength_manual_override FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.team_strength_manual_override TO service_role; -- migration 20260921132413
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_strength_manual_override TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_strength_manual_override TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.team_strength_manual_override TO service_role;
REVOKE ALL ON TABLE public.team_tactical_defaults FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_tactical_defaults TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_tactical_defaults TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_tactical_defaults TO service_role;
REVOKE ALL ON TABLE public.team_tactical_review_log FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_tactical_review_log TO authenticated;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.team_tactical_review_log TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.team_tactical_review_log TO service_role;
REVOKE ALL ON TABLE public.teams FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.teams TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.teams TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.teams TO authenticated;

-- ----------------------------------------------------------------------------
-- FUNCTION PRIVILEGES
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION _check_auth_user_token_nulls_impl() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION _check_auth_user_token_nulls_impl() TO service_role;
REVOKE ALL ON FUNCTION _get_data_integrity_report_impl() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION _get_public_read_audit_impl() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION _require_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION _require_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION _require_admin() TO service_role;
REVOKE ALL ON FUNCTION backfill_fixture_predictions() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION backfill_fixture_predictions() TO authenticated;
GRANT EXECUTE ON FUNCTION backfill_fixture_predictions() TO service_role;
REVOKE ALL ON FUNCTION backfill_historic_fixture_predictions(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION backfill_historic_fixture_predictions(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION backfill_historic_fixture_predictions(bigint) TO service_role;
REVOKE ALL ON FUNCTION backfill_match_odds() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION backfill_match_odds() TO service_role;
REVOKE ALL ON FUNCTION check_auth_user_token_nulls() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION check_auth_user_token_nulls() TO authenticated;
GRANT EXECUTE ON FUNCTION check_auth_user_token_nulls() TO service_role;
REVOKE ALL ON FUNCTION check_fpl_history_integrity(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION check_fpl_history_integrity(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION check_fpl_history_integrity(bigint) TO anon;
GRANT EXECUTE ON FUNCTION check_fpl_history_integrity(bigint) TO authenticated;
REVOKE ALL ON FUNCTION fixture_derived_markets(numeric,numeric,numeric) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fixture_derived_markets(numeric,numeric,numeric) TO PUBLIC;
GRANT EXECUTE ON FUNCTION fixture_derived_markets(numeric,numeric,numeric) TO anon;
GRANT EXECUTE ON FUNCTION fixture_derived_markets(numeric,numeric,numeric) TO authenticated;
REVOKE ALL ON FUNCTION fpl_gameweek_for_date(bigint,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fpl_gameweek_for_date(bigint,date) TO anon;
GRANT EXECUTE ON FUNCTION fpl_gameweek_for_date(bigint,date) TO authenticated;
REVOKE ALL ON FUNCTION generate_fixture_slug() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION generate_fixture_slug() TO PUBLIC; -- default privileges (no explicit ACL)
REVOKE ALL ON FUNCTION generate_fpl_player_slug() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION generate_fpl_player_slug() TO PUBLIC; -- default privileges (no explicit ACL)
REVOKE ALL ON FUNCTION get_actual_value_table(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_actual_value_table(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_actual_value_table(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_actual_value_table(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_all_time_top_scorers() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_all_time_top_scorers() TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_all_time_top_scorers() TO anon;
GRANT EXECUTE ON FUNCTION get_all_time_top_scorers() TO authenticated;
REVOKE ALL ON FUNCTION get_best_defence_rating(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_best_defence_rating(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_best_defence_rating(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_best_defence_rating(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_biggest_comebacks() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_biggest_comebacks() TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_biggest_comebacks() TO anon;
GRANT EXECUTE ON FUNCTION get_biggest_comebacks() TO authenticated;
REVOKE ALL ON FUNCTION get_completed_gameweeks(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_completed_gameweeks(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_completed_gameweeks(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_completed_gameweeks(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_cross_league_summary() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_cross_league_summary() TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_cross_league_summary() TO anon;
GRANT EXECUTE ON FUNCTION get_cross_league_summary() TO authenticated;
REVOKE ALL ON FUNCTION get_daily_digest(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_daily_digest(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_daily_digest(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_daily_digest(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_data_integrity_report() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_data_integrity_report() TO authenticated;
GRANT EXECUTE ON FUNCTION get_data_integrity_report() TO service_role;
REVOKE ALL ON FUNCTION get_digest_gameweeks(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_digest_gameweeks(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_digest_gameweeks(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_fpl_default_matchweek(bigint,bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_fpl_default_matchweek(bigint,bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_fpl_default_matchweek(bigint,bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_fpl_default_matchweek(bigint,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION get_fpl_default_matchweek(bigint,bigint) TO service_role;
REVOKE ALL ON FUNCTION get_fpl_fixture_bonus_v4(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_fpl_fixture_bonus_v4(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_fpl_fixture_bonus_v4(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_fpl_fixture_bonus_v4(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION get_fpl_fixture_bonus_v4(bigint) TO service_role;
REVOKE ALL ON FUNCTION get_fpl_market_movers(integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_fpl_market_movers(integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_fpl_market_movers(integer) TO anon;
GRANT EXECUTE ON FUNCTION get_fpl_market_movers(integer) TO authenticated;
REVOKE ALL ON FUNCTION get_fpl_optimizer_candidates_json(integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_fpl_optimizer_candidates_json(integer,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_fpl_optimizer_candidates_json(integer,integer) TO anon;
GRANT EXECUTE ON FUNCTION get_fpl_optimizer_candidates_json(integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_fpl_optimizer_candidates_json(integer,integer) TO service_role;
REVOKE ALL ON FUNCTION get_fpl_optimizer_candidates_scenario_json(bigint,bigint,text,text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_fpl_optimizer_candidates_scenario_json(bigint,bigint,text,text,integer,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_fpl_optimizer_candidates_scenario_json(bigint,bigint,text,text,integer,integer) TO anon;
GRANT EXECUTE ON FUNCTION get_fpl_optimizer_candidates_scenario_json(bigint,bigint,text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_fpl_optimizer_candidates_scenario_json(bigint,bigint,text,text,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION get_fpl_optimizer_candidates(integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_fpl_optimizer_candidates(integer,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_fpl_optimizer_candidates(integer,integer) TO anon;
GRANT EXECUTE ON FUNCTION get_fpl_optimizer_candidates(integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_fpl_optimizer_candidates(integer,integer) TO service_role;
REVOKE ALL ON FUNCTION get_fpl_optimizer_earliest_matchweek() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_fpl_optimizer_earliest_matchweek() TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_fpl_optimizer_earliest_matchweek() TO anon;
GRANT EXECUTE ON FUNCTION get_fpl_optimizer_earliest_matchweek() TO authenticated;
GRANT EXECUTE ON FUNCTION get_fpl_optimizer_earliest_matchweek() TO service_role;
REVOKE ALL ON FUNCTION get_fpl_played_matchweeks(bigint,bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_fpl_played_matchweeks(bigint,bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_fpl_played_matchweeks(bigint,bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_fpl_played_matchweeks(bigint,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION get_fpl_played_matchweeks(bigint,bigint) TO service_role;
REVOKE ALL ON FUNCTION get_fpl_projection_available_matchweeks(bigint,bigint,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_fpl_projection_available_matchweeks(bigint,bigint,text,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_fpl_projection_available_matchweeks(bigint,bigint,text,text) TO service_role;
REVOKE ALL ON FUNCTION get_fpl_projection_snapshot(bigint,bigint,text,text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_fpl_projection_snapshot(bigint,bigint,text,text,integer,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_fpl_projection_snapshot(bigint,bigint,text,text,integer,integer) TO anon;
GRANT EXECUTE ON FUNCTION get_fpl_projection_snapshot(bigint,bigint,text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_fpl_projection_snapshot(bigint,bigint,text,text,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION get_gameweek_digest(bigint,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_gameweek_digest(bigint,integer) TO anon;
GRANT EXECUTE ON FUNCTION get_gameweek_digest(bigint,integer) TO authenticated;
REVOKE ALL ON FUNCTION get_injury_report(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_injury_report(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_injury_report(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_injury_report(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_market_efficiency(text,boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_market_efficiency(text,boolean) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_market_efficiency(text,boolean) TO anon;
GRANT EXECUTE ON FUNCTION get_market_efficiency(text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION get_matchweek_head_to_head(bigint,bigint,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_matchweek_head_to_head(bigint,bigint,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_matchweek_head_to_head(bigint,bigint,integer) TO anon;
GRANT EXECUTE ON FUNCTION get_matchweek_head_to_head(bigint,bigint,integer) TO authenticated;
REVOKE ALL ON FUNCTION get_model_accuracy_summary(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_model_accuracy_summary(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_model_accuracy_summary(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_model_accuracy_summary(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_model_accuracy(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_model_accuracy(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_model_accuracy(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_model_accuracy(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_model_calibration(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_model_calibration(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_model_calibration(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_model_calibration(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_most_common_scoreline(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_most_common_scoreline(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_most_common_scoreline(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_most_common_scoreline(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_overround_trend(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_overround_trend(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_overround_trend(text) TO anon;
GRANT EXECUTE ON FUNCTION get_overround_trend(text) TO authenticated;
REVOKE ALL ON FUNCTION get_player_by_slug(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_player_by_slug(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_player_by_slug(text) TO anon;
GRANT EXECUTE ON FUNCTION get_player_by_slug(text) TO authenticated;
REVOKE ALL ON FUNCTION get_player_career(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_player_career(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_player_career(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_player_career(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_player_gameweek_breakdown(bigint,bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_player_gameweek_breakdown(bigint,bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_player_gameweek_breakdown(bigint,bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_player_gameweek_breakdown(bigint,bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_player_season_gameweeks(bigint,bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_player_season_gameweeks(bigint,bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_player_season_gameweeks(bigint,bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_player_season_gameweeks(bigint,bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_player_seasons(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_player_seasons(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_player_seasons(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_player_seasons(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_price_change_risk(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_price_change_risk(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_price_change_risk(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_price_change_risk(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_public_read_audit() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_public_read_audit() TO authenticated;
GRANT EXECUTE ON FUNCTION get_public_read_audit() TO service_role;
REVOKE ALL ON FUNCTION get_rolling_xi_candidates(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_rolling_xi_candidates(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_rolling_xi_candidates(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_rolling_xi_candidates(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_scout_vs_model() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_scout_vs_model() TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_scout_vs_model() TO anon;
GRANT EXECUTE ON FUNCTION get_scout_vs_model() TO authenticated;
REVOKE ALL ON FUNCTION get_season_player_projections_json(integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_season_player_projections_json(integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_season_player_projections_json(integer) TO anon;
GRANT EXECUTE ON FUNCTION get_season_player_projections_json(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_season_player_projections_json(integer) TO service_role;
REVOKE ALL ON FUNCTION get_set_piece_index(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_set_piece_index(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_set_piece_index(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_set_piece_index(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_set_piece_takers(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_set_piece_takers(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_set_piece_takers(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_set_piece_takers(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_strictest_referees() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_strictest_referees() TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_strictest_referees() TO anon;
GRANT EXECUTE ON FUNCTION get_strictest_referees() TO authenticated;
REVOKE ALL ON FUNCTION get_tactical_role_worklist(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_tactical_role_worklist(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_tactical_role_worklist(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_tactical_role_worklist(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_team_of_the_week(integer,bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_team_of_the_week(integer,bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_team_of_the_week(integer,bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_team_of_the_week(integer,bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_top_actual_fpl_scorer(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_top_actual_fpl_scorer(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_top_actual_fpl_scorer(bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_top_actual_fpl_scorer(bigint) TO authenticated;
REVOKE ALL ON FUNCTION get_totw_vs_model(integer,bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_totw_vs_model(integer,bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_totw_vs_model(integer,bigint) TO anon;
GRANT EXECUTE ON FUNCTION get_totw_vs_model(integer,bigint) TO authenticated;
REVOKE ALL ON FUNCTION handle_new_auth_user() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION import_fpl_gameweeks(bigint,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION import_fpl_gameweeks(bigint,text) TO service_role;
REVOKE ALL ON FUNCTION import_fpl_season(bigint,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION import_fpl_season(bigint,text) TO service_role;
REVOKE ALL ON FUNCTION is_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION is_admin() TO PUBLIC;
GRANT EXECUTE ON FUNCTION is_admin() TO anon;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
REVOKE ALL ON FUNCTION list_scout_players(bigint,integer,bigint,integer,text,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION list_scout_players(bigint,integer,bigint,integer,text,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION list_scout_players(bigint,integer,bigint,integer,text,integer) TO anon;
GRANT EXECUTE ON FUNCTION list_scout_players(bigint,integer,bigint,integer,text,integer) TO authenticated;
REVOKE ALL ON FUNCTION list_scout_teams(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION list_scout_teams(bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION list_scout_teams(bigint) TO anon;
GRANT EXECUTE ON FUNCTION list_scout_teams(bigint) TO authenticated;
REVOKE ALL ON FUNCTION list_scoutable_players() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION list_scoutable_players() TO PUBLIC;
GRANT EXECUTE ON FUNCTION list_scoutable_players() TO anon;
GRANT EXECUTE ON FUNCTION list_scoutable_players() TO authenticated;
REVOKE ALL ON FUNCTION record_team_slug_change() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION record_team_slug_change() TO PUBLIC; -- default privileges (no explicit ACL)
REVOKE ALL ON FUNCTION refresh_fixture_feeds() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION refresh_fpl_bonus_v3_for_fixture(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION refresh_fpl_bonus_v3_for_fixture(bigint) TO service_role;
REVOKE ALL ON FUNCTION refresh_fpl_projection_fixture_v6_impl(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION refresh_fpl_projection_fixture_v6_impl(bigint) TO service_role;
REVOKE ALL ON FUNCTION refresh_fpl_projection_fixture_v6(bigint,boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION refresh_fpl_projection_fixture_v6(bigint,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_fpl_projection_fixture_v6(bigint,boolean) TO service_role;
REVOKE ALL ON FUNCTION refresh_fpl_projections_range(integer,integer,bigint,bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION refresh_fpl_projections_range(integer,integer,bigint,bigint) TO service_role;
REVOKE ALL ON FUNCTION refresh_fpl() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION refresh_fpl() TO service_role;
REVOKE ALL ON FUNCTION safe_numeric(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION safe_numeric(text) TO PUBLIC; -- default privileges (no explicit ACL)
REVOKE ALL ON FUNCTION search_players(text,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION search_players(text,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION search_players(text,integer) TO anon;
GRANT EXECUTE ON FUNCTION search_players(text,integer) TO authenticated;
REVOKE ALL ON FUNCTION set_current_season_id() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION set_current_season_id() TO PUBLIC; -- default privileges (no explicit ACL)
REVOKE ALL ON FUNCTION set_fpl_code_from_payload() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION set_fpl_code_from_payload() TO PUBLIC; -- default privileges (no explicit ACL)
REVOKE ALL ON FUNCTION slugify_player_name(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION slugify_player_name(text) TO PUBLIC; -- default privileges (no explicit ACL)
REVOKE ALL ON FUNCTION slugify(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION slugify(text) TO PUBLIC; -- default privileges (no explicit ACL)
REVOKE ALL ON FUNCTION sync_player_identity() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sync_player_identity() TO PUBLIC; -- default privileges (no explicit ACL)

-- ----------------------------------------------------------------------------
-- SCHEDULED JOBS (pg_cron) -- names and schedules only
-- ----------------------------------------------------------------------------

-- fpl-live-current-6-hourly  23 */6 * * *
-- fpl-refresh-6-hourly  17 */6 * * *
-- ingest-cup-data-daily  15 5 * * *
-- refresh-football-fixtures-daily  15 4 * * *
