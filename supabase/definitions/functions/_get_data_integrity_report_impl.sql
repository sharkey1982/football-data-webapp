-- Live definition exported from the database (function _get_data_integrity_report_impl()).
-- Do not edit here: change it with a migration; the next export will reflect it.

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
