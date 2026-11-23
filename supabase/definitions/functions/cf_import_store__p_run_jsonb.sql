-- Live definition exported from the database (function cf_import_store(p_run jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.cf_import_store(p_run jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id bigint;
  v_err text := nullif(p_run->>'error', '');
  v_warn text := nullif(array_to_string(array(select jsonb_array_elements_text(coalesce(p_run->'warnings', '[]'::jsonb))), ' | '), '');
  v_nwarn int := jsonb_array_length(coalesce(p_run->'warnings', '[]'::jsonb));
  v_dates date[];
  v_status text;
  v_rows jsonb;
  v_mode text := coalesce(nullif(p_run->>'mode', ''), 'daily');
begin
  select array_agg((d->>'date')::date) into v_dates from jsonb_array_elements(coalesce(p_run->'days', '[]'::jsonb)) d;
  v_status := case when v_err is not null or v_dates is null then 'failed' when v_warn is not null then 'warning' else 'success' end;
  if v_err is null and v_dates is null then v_err := 'no dates fetched'; end if;
  insert into cf.import_runs (started_at, finished_at, mode, site_tag, account_source, start_date, end_date, status, api_requests, warnings, error_message)
  values (coalesce((p_run->>'started_at')::timestamptz, now()), now(), v_mode, p_run->>'site_tag', p_run->>'account_source',
          (p_run->>'start_date')::date, (p_run->>'end_date')::date, v_status, coalesce((p_run->>'api_requests')::int, 0),
          left(v_warn, 4000), left(v_err, 2000))
  returning run_id into v_id;

  if v_status <> 'failed' then
    delete from cf.daily_totals where date = any (v_dates);
    delete from cf.hourly_totals where date = any (v_dates);
    delete from cf.daily_by_page where date = any (v_dates);
    delete from cf.daily_by_referrer where date = any (v_dates);
    delete from cf.daily_by_country where date = any (v_dates);
    insert into cf.daily_totals (date, visits, page_views, sample_interval, is_final, run_id)
    select (x->>'date')::date, coalesce((x->>'visits')::bigint, 0), coalesce((x->>'page_views')::bigint, 0),
           coalesce((x->>'sample_interval')::numeric, 1), coalesce((x->>'is_final')::boolean, false), v_id
      from jsonb_array_elements(p_run->'days') x;
    insert into cf.hourly_totals (hour, date, visits, page_views, run_id)
    select (x->>'hour')::timestamptz, (x->>'date')::date, coalesce((x->>'visits')::bigint, 0), coalesce((x->>'page_views')::bigint, 0), v_id
      from jsonb_array_elements(coalesce(p_run->'hours', '[]'::jsonb)) x
     where (x->>'date')::date = any (v_dates)
    on conflict (hour) do update set visits = cf.hourly_totals.visits + excluded.visits, page_views = cf.hourly_totals.page_views + excluded.page_views;
    insert into cf.daily_by_page (date, path, visits, page_views, run_id)
    select (x->>'date')::date, x->>'path', coalesce((x->>'visits')::bigint, 0), coalesce((x->>'page_views')::bigint, 0), v_id
      from jsonb_array_elements(coalesce(p_run->'pages', '[]'::jsonb)) x where (x->>'date')::date = any (v_dates)
    on conflict (date, dim_key) do update set visits = cf.daily_by_page.visits + excluded.visits, page_views = cf.daily_by_page.page_views + excluded.page_views;
    insert into cf.daily_by_referrer (date, referrer_host, visits, page_views, run_id)
    select (x->>'date')::date, coalesce(x->>'host', ''), coalesce((x->>'visits')::bigint, 0), coalesce((x->>'page_views')::bigint, 0), v_id
      from jsonb_array_elements(coalesce(p_run->'refs', '[]'::jsonb)) x where (x->>'date')::date = any (v_dates)
    on conflict (date, dim_key) do update set visits = cf.daily_by_referrer.visits + excluded.visits, page_views = cf.daily_by_referrer.page_views + excluded.page_views;
    insert into cf.daily_by_country (date, country, visits, page_views, run_id)
    select (x->>'date')::date, x->>'country', coalesce((x->>'visits')::bigint, 0), coalesce((x->>'page_views')::bigint, 0), v_id
      from jsonb_array_elements(coalesce(p_run->'countries', '[]'::jsonb)) x where (x->>'date')::date = any (v_dates)
    on conflict (date, dim_key) do update set visits = cf.daily_by_country.visits + excluded.visits, page_views = cf.daily_by_country.page_views + excluded.page_views;
  end if;

  v_rows := jsonb_build_object(
    'days', coalesce(array_length(v_dates, 1), 0),
    'hours', jsonb_array_length(coalesce(p_run->'hours', '[]'::jsonb)),
    'pages', jsonb_array_length(coalesce(p_run->'pages', '[]'::jsonb)),
    'referrers', jsonb_array_length(coalesce(p_run->'refs', '[]'::jsonb)),
    'countries', jsonb_array_length(coalesce(p_run->'countries', '[]'::jsonb)));
  update cf.import_runs set rows_written = v_rows where run_id = v_id;

  insert into public.pipeline_runs (job_name, started_at, finished_at, status, summary, error_message, rows_inserted)
  values ('cf_import', coalesce((p_run->>'started_at')::timestamptz, now()), now(), v_status,
          format('%s: %s dates (%s to %s), %s page rows, %s referrer rows, %s API requests%s', v_mode,
                 v_rows->>'days', coalesce(p_run->>'start_date', '?'), coalesce(p_run->>'end_date', '?'),
                 v_rows->>'pages', v_rows->>'referrers', coalesce(p_run->>'api_requests', '0'),
                 case when v_nwarn > 0 then format('; %s warnings', v_nwarn) else '' end),
          case when v_status = 'failed' then left(v_err, 500) when v_warn is not null then left(v_warn, 500) end,
          (v_rows->>'pages')::bigint);
  return jsonb_build_object('run_id', v_id, 'status', v_status) || v_rows;
end;
$function$
;
