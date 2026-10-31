-- FPL transfer-record check in the automatic X posts (Chris, 31 Oct 2026).
--
-- GW9 2026/27: N.Jackson got 2,370,904 transfers in, which FPL called a
-- record. Our posts missed it: market watch (Fri 19:25) only gave net
-- figures, and the week's-changes post (Sat 11:25) read the pre-deadline
-- snapshot taken at 10:00 (1,988,403 in), so it understated the final figure
-- by ~380k.
--
-- 1. public.fpl_transfer_record_check(transfers_in, season, gameweek): is this
--    figure above the highest single-gameweek transfers in we hold
--    (fpl_player_gameweek_history, 2021/22 on; max per player-gameweek, never
--    summed, so double gameweeks don't double count) and above this season's
--    high in our deadline snapshots? Returns the previous holder.
-- 2. Market watch: a record line ("already the most..."), a deadline watch
--    ("on course for..." at the last day's pace) or progress ("71% of...") for
--    the gameweek's most-bought player (gross transfers in). Within 280: the
--    bought/sold lists shrink to 2 then 1 names; if still too long, no line.
-- 3. Week's changes: reads a new 'final_call' snapshot (FPL refreshed in the
--    last 3 minutes before the deadline) when it exists, else the
--    pre-deadline one with a "by HH:MM" label. Adds the record line.
-- 4. Final-call snapshot: pg_cron every minute; does nothing unless a deadline
--    is less than 3.5 minutes away. Refreshes FPL and upserts
--    fpl_deadline_player_state kind 'final_call', so the last tick wins.
--
-- Not used: FPL's season-cumulative transfers_in after the deadline. For
-- Jackson it gives 2,141,434 for GW9, not FPL's 2,370,904, so it isn't the
-- figure FPL quotes. element-summary history has the official figure, but
-- only once the gameweek's games are played, too late for these posts.

-- ---- helpers ---------------------------------------------------------------
-- 2370904 -> '2,371k'
create or replace function private.social_kc(n numeric) returns text
language sql immutable set search_path to 'pg_temp' as $$
  select case when abs(n) >= 1000 then to_char(round(abs(n) / 1000), 'FM999,999,999') || 'k' else abs(n)::int::text end;
$$;

-- ---- 1. record check -------------------------------------------------------
create or replace function public.fpl_transfer_record_check(p_transfers_in bigint,
                                                            p_season_id bigint default public.fpl_current_season_id(),
                                                            p_gameweek integer default null)
returns jsonb
language plpgsql stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_start integer; v_since text; v_hist jsonb; v_season jsonb; v_hist_tin bigint; v_season_tin bigint;
begin
  select start_year into v_start from public.seasons where season_id = p_season_id;

  -- One row per fixture in the history table: max per player-gameweek, never sum.
  select jsonb_build_object('web_name', coalesce(t.web_name, 'code ' || g.fpl_code), 'fpl_code', g.fpl_code,
                            'season', se.start_year || '/' || lpad((se.end_year % 100)::text, 2, '0'),
                            'season_id', g.season_id, 'gameweek', g.gameweek, 'transfers_in', g.tin),
         g.tin
    into v_hist, v_hist_tin
    from (select season_id, fpl_code, gameweek, max(transfers_in) tin
            from public.fpl_player_gameweek_history where transfers_in is not null group by 1, 2, 3) g
    join public.seasons se on se.season_id = g.season_id
    left join lateral (select web_name from public.fpl_player_season_totals t
                        where t.season_id = g.season_id and t.fpl_code = g.fpl_code limit 1) t on true
   where v_start is null or se.start_year < v_start
   order by g.tin desc, g.season_id, g.gameweek
   limit 1;

  select min(se.start_year) || '/' || lpad((min(se.end_year) % 100)::text, 2, '0') into v_since
    from public.seasons se
   where exists (select 1 from public.fpl_player_gameweek_history h where h.season_id = se.season_id)
     and (v_start is null or se.start_year < v_start);

  -- This season so far, from our deadline snapshots (any kind; earlier
  -- gameweeks only). Snapshots before the deadline understate the final figure.
  select jsonb_build_object('web_name', pl.web_name, 'fpl_player_id', x.fpl_player_id, 'gameweek', x.fpl_event_id,
                            'transfers_in', x.tin, 'source', 'deadline snapshots'),
         x.tin
    into v_season, v_season_tin
    from (select fpl_event_id, fpl_player_id, max(transfers_in_event) tin
            from public.fpl_deadline_player_state
           where season_id = p_season_id and (p_gameweek is null or fpl_event_id < p_gameweek)
             and transfers_in_event is not null
           group by 1, 2) x
    left join public.fpl_players pl on pl.season_id = p_season_id and pl.fpl_player_id = x.fpl_player_id
   order by x.tin desc, x.fpl_event_id
   limit 1;

  return jsonb_build_object(
    'transfers_in', p_transfers_in,
    'since', v_since,
    'history', v_hist,
    'beats_history', v_hist_tin is not null and p_transfers_in > v_hist_tin,
    'share_of_history', case when v_hist_tin > 0 then round(p_transfers_in::numeric / v_hist_tin, 3) end,
    'season_high', v_season,
    'beats_season_high', v_season_tin is null or p_transfers_in > v_season_tin);
end;
$$;

-- ---- 4. final-call snapshot ------------------------------------------------
alter table public.fpl_deadline_player_state drop constraint if exists fpl_deadline_player_state_snapshot_kind_check;
alter table public.fpl_deadline_player_state add constraint fpl_deadline_player_state_snapshot_kind_check
  check (snapshot_kind = any (array['pre_deadline', 'late', 'manual', 'final_call']));

create or replace function private.fpl_deadline_final_call()
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_season bigint; v_gw integer; v_deadline timestamptz; v_refresh text; v_rows integer; v_fresh timestamptz;
begin
  select season_id, fpl_event_id, deadline_time into v_season, v_gw, v_deadline from public.fpl_gameweeks
   where deadline_time > now() and deadline_time <= now() + interval '3 minutes 30 seconds'
   order by deadline_time limit 1;
  if v_gw is null then return jsonb_build_object('status', 'none'); end if;

  begin
    perform private.refresh_fpl();
    v_refresh := 'ok';
  exception when others then
    v_refresh := 'failed: ' || sqlerrm;
  end;
  -- Only keep a snapshot of data FPL gave us in the last 2 minutes.
  select max(updated_at) into v_fresh from public.fpl_players where season_id = v_season;
  if v_fresh is null or v_fresh < now() - interval '2 minutes' then
    return jsonb_build_object('status', 'skipped', 'reason', 'no fresh FPL data', 'refresh', v_refresh, 'players_updated_at', v_fresh);
  end if;

  insert into public.fpl_deadline_player_state (season_id, fpl_event_id, snapshot_kind, snapshot_at, deadline_time, fpl_player_id, fpl_code,
    fpl_team_id, element_type, status, chance_of_playing_this_round, chance_of_playing_next_round, news, news_added,
    now_cost, selected_by_percent, form, ep_this, ep_next, transfers_in_event, transfers_out_event, total_points, minutes,
    source_updated_at, source_payload)
  select v_season, v_gw, 'final_call', now(), v_deadline, fp.fpl_player_id, fp.fpl_code,
    fp.fpl_team_id, fp.element_type, fp.status, fp.chance_of_playing_this_round, fp.chance_of_playing_next_round, fp.news, fp.news_added,
    fp.now_cost, fp.selected_by_percent,
    public.safe_numeric(fp.source_payload->>'form'),
    public.safe_numeric(fp.source_payload->>'ep_this'),
    public.safe_numeric(fp.source_payload->>'ep_next'),
    public.safe_numeric(fp.source_payload->>'transfers_in_event')::bigint,
    public.safe_numeric(fp.source_payload->>'transfers_out_event')::bigint,
    fp.total_points, fp.minutes, fp.updated_at, fp.source_payload
  from public.fpl_players fp
  where fp.season_id = v_season
  on conflict (season_id, fpl_event_id, snapshot_kind, fpl_player_id) do update set
    snapshot_at = excluded.snapshot_at, deadline_time = excluded.deadline_time, fpl_code = excluded.fpl_code,
    fpl_team_id = excluded.fpl_team_id, element_type = excluded.element_type, status = excluded.status,
    chance_of_playing_this_round = excluded.chance_of_playing_this_round,
    chance_of_playing_next_round = excluded.chance_of_playing_next_round, news = excluded.news, news_added = excluded.news_added,
    now_cost = excluded.now_cost, selected_by_percent = excluded.selected_by_percent, form = excluded.form,
    ep_this = excluded.ep_this, ep_next = excluded.ep_next, transfers_in_event = excluded.transfers_in_event,
    transfers_out_event = excluded.transfers_out_event, total_points = excluded.total_points, minutes = excluded.minutes,
    source_updated_at = excluded.source_updated_at, source_payload = excluded.source_payload;
  get diagnostics v_rows = row_count;
  return jsonb_build_object('status', 'ok', 'event', v_gw, 'rows', v_rows, 'refresh', v_refresh);
end;
$$;
revoke all on function private.fpl_deadline_final_call() from public;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'fpl-deadline-final-call') then
    perform cron.unschedule('fpl-deadline-final-call');
  end if;
  perform cron.schedule('fpl-deadline-final-call', '* * * * *', 'select private.fpl_deadline_final_call();');
end $$;

-- ---- 2. market watch -------------------------------------------------------
-- The record line for the market watch post, or null. p_at is the snapshot time.
create or replace function private.social_transfer_record_line(p_season bigint, p_day date, p_at timestamptz)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_gw integer; v_deadline timestamptz; v_last_deadline timestamptz;
  v_pid integer; v_name text; v_tin bigint; v_ts timestamptz;
  v_prev_tin bigint; v_prev_ts timestamptz;
  v_rec jsonb; h jsonb; v_rec_tin bigint; v_hours numeric; v_rate numeric; v_proj numeric; v_line text; v_kind text;
begin
  select fpl_event_id, deadline_time into v_gw, v_deadline from public.fpl_gameweeks
   where season_id = p_season and deadline_time > p_at order by deadline_time limit 1;
  if v_gw is null then return null; end if;
  select max(deadline_time) into v_last_deadline from public.fpl_gameweeks where season_id = p_season and deadline_time <= p_at;

  select s.fpl_player_id, pl.web_name, s.transfers_in_event, s.captured_at into v_pid, v_name, v_tin, v_ts
    from public.fpl_player_snapshots s
    join public.fpl_players pl on pl.season_id = s.season_id and pl.fpl_player_id = s.fpl_player_id
   where s.season_id = p_season and s.snapshot_date = p_day and s.transfers_in_event is not null
   order by s.transfers_in_event desc, s.fpl_player_id limit 1;
  if v_pid is null then return null; end if;

  v_rec := public.fpl_transfer_record_check(v_tin, p_season, v_gw);
  h := v_rec->'history';
  if h is null then return null; end if;
  v_rec_tin := (h->>'transfers_in')::bigint;
  v_hours := extract(epoch from v_deadline - v_ts) / 3600;

  -- Pace since the previous day's snapshot, in the same transfer window only.
  select s.transfers_in_event, s.captured_at into v_prev_tin, v_prev_ts from public.fpl_player_snapshots s
   where s.season_id = p_season and s.fpl_player_id = v_pid and s.snapshot_date = p_day - 1
     and s.captured_at > coalesce(v_last_deadline, '-infinity'::timestamptz);
  if v_prev_ts is not null and v_ts > v_prev_ts + interval '6 hours' then
    v_rate := greatest(v_tin - v_prev_tin, 0) / (extract(epoch from v_ts - v_prev_ts) / 3600);
    v_proj := v_tin + v_rate * v_hours;
  end if;

  if (v_rec->>'beats_history')::boolean then
    v_kind := 'record';
    v_line := format('%s: %s in so far, already the most in a gameweek in our records (since %s; previous %s %s, GW%s %s)',
                     v_name, private.social_kc(v_tin), v_rec->>'since', h->>'web_name', private.social_kc(v_rec_tin), h->>'gameweek', h->>'season');
  elsif v_hours <= 48 and v_proj >= v_rec_tin and v_tin >= 0.5 * v_rec_tin then
    v_kind := 'on_course';
    v_line := format('%s: %s in so far, on course for the most in a gameweek in our records at the last day''s pace (since %s; %s %s, GW%s %s)',
                     v_name, private.social_kc(v_tin), v_rec->>'since', h->>'web_name', private.social_kc(v_rec_tin), h->>'gameweek', h->>'season');
  elsif v_hours <= 48 and v_tin >= 0.6 * v_rec_tin then
    v_kind := 'progress';
    v_line := format('%s: %s in so far, %s%% of the most in a gameweek in our records (since %s; %s %s, GW%s %s), %sh to the deadline',
                     v_name, private.social_kc(v_tin), floor(100.0 * v_tin / v_rec_tin)::int, v_rec->>'since', h->>'web_name',
                     private.social_kc(v_rec_tin), h->>'gameweek', h->>'season', round(v_hours)::int);
  end if;

  return jsonb_build_object('kind', v_kind, 'line', v_line, 'gw', v_gw, 'deadline', v_deadline, 'fpl_player_id', v_pid,
                            'web_name', v_name, 'transfers_in', v_tin, 'snapshot_at', v_ts,
                            'pace_per_hour', round(v_rate), 'projected_at_deadline', round(v_proj), 'check', v_rec);
end;
$$;
revoke all on function private.social_transfer_record_line(bigint, date, timestamptz) from public;

create or replace function private.social_detect_market(p_run_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_season bigint := public.fpl_current_season_id();
  v_now timestamp := now() at time zone 'Europe/London';
  v_today date := (now() at time zone 'Europe/London')::date;
  v_ts timestamptz; v_key text; v_in text; v_out text; v_rows jsonb; v_text text; v_id bigint; v_sum bigint;
  v_in2 text; v_out2 text; v_in1 text; v_out1 text; v_watch jsonb; v_line text; v_try text; n integer;
begin
  if extract(hour from v_now) < 19 or extract(hour from v_now) >= 21 then
    return jsonb_build_object('status', 'none', 'reason', 'market watch is made in the evening');
  end if;
  v_key := format('fpl_market:%s:%s', v_season, v_today);
  if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
    return jsonb_build_object('status', 'none', 'reason', 'already made today');
  end if;
  if exists (select 1 from public.fpl_gameweeks where season_id = v_season and deadline_time between now() - interval '24 hours' and now()) then
    return jsonb_build_object('status', 'none', 'reason', 'transfers have just reset after the deadline');
  end if;
  if exists (select 1 from public.fpl_fixtures where season_id = v_season
               and (kickoff_time at time zone 'Europe/London')::date = v_today) then
    return jsonb_build_object('status', 'none', 'reason', 'Premier League match day');
  end if;
  -- Today's snapshot row is rewritten at every FPL refresh (6-hourly): use it once it is recent.
  select max(captured_at) into v_ts from public.fpl_player_snapshots where season_id = v_season and snapshot_date = v_today;
  if v_ts is null or v_ts < now() - interval '4 hours' then
    return jsonb_build_object('status', 'rejected', 'checks', jsonb_build_array(private.social_check('FPL snapshot from the last 4 hours', false, jsonb_build_object('captured_at', v_ts))));
  end if;

  with t as (select s.fpl_player_id, pl.web_name, coalesce(s.transfers_in_event, 0) - coalesce(s.transfers_out_event, 0) net,
                    coalesce(s.selected_by_percent, 0)::numeric own
               from public.fpl_player_snapshots s join public.fpl_players pl on pl.season_id = s.season_id and pl.fpl_player_id = s.fpl_player_id
              where s.season_id = v_season and s.snapshot_date = v_today),
  i as (select *, row_number() over (order by net desc, fpl_player_id) rn from t where net > 0 order by net desc, fpl_player_id limit 3),
  o as (select *, row_number() over (order by net, fpl_player_id) rn from t where net < 0 order by net, fpl_player_id limit 3)
  select (select string_agg(format('%s +%s', web_name, private.social_k(net)), ', ' order by rn) from i),
         (select string_agg(format('%s −%s', web_name, private.social_k(net)), ', ' order by rn) from o),
         (select string_agg(format('%s +%s', web_name, private.social_k(net)), ', ' order by rn) from i where rn <= 2),
         (select string_agg(format('%s −%s', web_name, private.social_k(net)), ', ' order by rn) from o where rn <= 2),
         (select string_agg(format('%s +%s', web_name, private.social_k(net)), ', ' order by rn) from i where rn = 1),
         (select string_agg(format('%s −%s', web_name, private.social_k(net)), ', ' order by rn) from o where rn = 1),
         (select jsonb_build_object('in', (select jsonb_agg(to_jsonb(i) - 'rn') from i), 'out', (select jsonb_agg(to_jsonb(o) - 'rn') from o))),
         (select coalesce(sum(abs(net)), 0) from (select net from i union all select net from o) x)
    into v_in, v_out, v_in2, v_out2, v_in1, v_out1, v_rows, v_sum;
  if v_in is null or v_out is null or v_sum < 30000 then
    return jsonb_build_object('status', 'none', 'reason', 'too few transfers yet', 'moved', v_sum);
  end if;

  v_text := format(E'FPL market watch, %s\nMost bought this gameweek: %s\nMost sold: %s', to_char(v_today, 'Dy FMDD Mon'), v_in, v_out);

  -- Record watch (gross transfers in of the most-bought player). Shorter lists
  -- before dropping it; never over 280.
  v_watch := private.social_transfer_record_line(v_season, v_today, v_ts);
  v_line := v_watch->>'line';
  if v_line is not null then
    v_line := null;
    for n in reverse 3..1 loop
      v_try := format(E'FPL market watch, %s\nMost bought this gameweek: %s\nMost sold: %s\n%s', to_char(v_today, 'Dy FMDD Mon'),
                      case n when 3 then v_in when 2 then v_in2 else v_in1 end,
                      case n when 3 then v_out when 2 then v_out2 else v_out1 end, v_watch->>'line');
      if public.social_weighted_length(v_try) <= 280 then
        v_text := v_try; v_line := v_watch->>'line'; exit;
      end if;
    end loop;
  end if;

  insert into public.social_post_candidates (post_type, text, generated_text, source_data, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validation_errors, detector_run_id)
  values ('fpl_market', v_text, v_text,
          jsonb_build_object('season_id', v_season, 'date', v_today, 'transfers', v_rows,
                             'record_watch', v_watch, 'record_line_posted', v_line is not null,
                             'post_after', (v_today::timestamp + interval '20 hours') at time zone 'Europe/London'),
          v_ts, v_key, (v_today::timestamp + interval '22 hours 30 minutes') at time zone 'Europe/London', 'passed', '[]', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'fpl_market', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id);
end;
$function$;

-- ---- 3. week's changes -----------------------------------------------------
-- Text and data only (no insert), so it can be checked on a past gameweek.
create or replace function private.social_week_changes_text(p_season bigint, p_gw integer, p_deadline timestamptz)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_kind_a text; v_kind_b text; v_n_a integer; v_n_b integer; v_asof timestamptz; v_label text := '';
  v_up integer; v_down integer; v_up_names text; v_down_names text; v_in text; v_out text; v_own text; v_ruled text; v_prices text;
  v_top_name text; v_top_tin bigint; v_rec jsonb; h jsonb; v_rec_line text;
  v_head text; v_lines text[]; v_text text;
begin
  -- Prefer the final-call snapshot (last minutes before the deadline).
  select case when count(*) filter (where snapshot_kind = 'final_call') >= 500 then 'final_call' else 'pre_deadline' end
    into v_kind_a from public.fpl_deadline_player_state where season_id = p_season and fpl_event_id = p_gw;
  select case when count(*) filter (where snapshot_kind = 'final_call') >= 500 then 'final_call' else 'pre_deadline' end
    into v_kind_b from public.fpl_deadline_player_state where season_id = p_season and fpl_event_id = p_gw - 1;
  select count(*), max(snapshot_at) into v_n_a, v_asof from public.fpl_deadline_player_state
   where season_id = p_season and fpl_event_id = p_gw and snapshot_kind = v_kind_a;
  select count(*) into v_n_b from public.fpl_deadline_player_state
   where season_id = p_season and fpl_event_id = p_gw - 1 and snapshot_kind = v_kind_b;
  if v_n_a < 500 or v_n_b < 500 then
    return jsonb_build_object('status', 'rejected', 'checks', jsonb_build_array(private.social_check('both pre-deadline snapshots exist', false,
                              jsonb_build_object('this', v_n_a, 'last', v_n_b))));
  end if;
  if v_asof < p_deadline - interval '10 minutes' then
    v_label := ' by ' || to_char(v_asof at time zone 'Europe/London', 'HH24:MI');
  end if;

  create temporary table if not exists _wc (fpl_player_id int, web_name text, own numeric, own_before numeric, cost int, cost_before int,
                                            net bigint, tin bigint, status text, status_before text) on commit drop;
  truncate _wc;
  insert into _wc
  select a.fpl_player_id, pl.web_name, coalesce(a.selected_by_percent, 0), coalesce(b.selected_by_percent, 0), a.now_cost, b.now_cost,
         coalesce(a.transfers_in_event, 0) - coalesce(a.transfers_out_event, 0), coalesce(a.transfers_in_event, 0), a.status, b.status
    from (select distinct on (fpl_player_id) * from public.fpl_deadline_player_state
           where season_id = p_season and fpl_event_id = p_gw and snapshot_kind = v_kind_a order by fpl_player_id, snapshot_at desc) a
    join (select distinct on (fpl_player_id) * from public.fpl_deadline_player_state
           where season_id = p_season and fpl_event_id = p_gw - 1 and snapshot_kind = v_kind_b order by fpl_player_id, snapshot_at desc) b
      using (fpl_player_id)
    join public.fpl_players pl on pl.season_id = p_season and pl.fpl_player_id = a.fpl_player_id;

  select count(*) filter (where cost > cost_before), count(*) filter (where cost < cost_before) into v_up, v_down from _wc;
  select string_agg(web_name, ', ' order by own desc) into v_up_names from (select * from _wc where cost > cost_before order by own desc limit 3) x;
  select string_agg(web_name, ', ' order by own desc) into v_down_names from (select * from _wc where cost < cost_before order by own desc limit 2) x;
  select format('Most bought%s: %s +%s (now %s%%)', v_label, web_name, private.social_k(net), private.social_fmt(own, 1)) into v_in
    from _wc where net > 0 order by net desc limit 1;
  select format('Most sold%s: %s −%s (now %s%%)', v_label, web_name, private.social_k(net), private.social_fmt(own, 1)) into v_out
    from _wc where net < 0 order by net limit 1;
  select format('Ownership up most: %s %s%% → %s%%', web_name, private.social_fmt(own_before, 1), private.social_fmt(own, 1)) into v_own
    from _wc where own > own_before order by own - own_before desc limit 1;
  select 'Ruled out: ' || string_agg(web_name, ', ' order by own desc) into v_ruled
    from (select * from _wc where status in ('i', 's', 'n', 'u') and status_before in ('a', 'd') and own_before >= 1 order by own_before desc limit 4) x;
  if v_up + v_down > 0 then
    v_prices := format('Prices: %s rise%s, %s fall%s%s', v_up, case when v_up = 1 then '' else 's' end, v_down, case when v_down = 1 then '' else 's' end,
         case when v_up_names is not null or v_down_names is not null then
              '. Most-owned: ' || concat_ws('; ', v_up_names || ' up', v_down_names || ' down') end);
  end if;

  -- Record line: gross transfers in of the most-bought player.
  select web_name, tin into v_top_name, v_top_tin from _wc order by tin desc, fpl_player_id limit 1;
  if v_top_tin is not null then
    v_rec := public.fpl_transfer_record_check(v_top_tin, p_season, p_gw);
    h := v_rec->'history';
    if (v_rec->>'beats_history')::boolean then
      v_rec_line := format('%s: %s in%s, the most in a gameweek in our records (since %s; previous %s %s, GW%s %s)',
                           v_top_name, private.social_kc(v_top_tin), v_label, v_rec->>'since', h->>'web_name',
                           private.social_kc((h->>'transfers_in')::bigint), h->>'gameweek', h->>'season');
    end if;
  end if;

  v_head := format('FPL GW%s: what changed since the last deadline', p_gw);
  v_lines := array_remove(array[v_prices, v_in, v_rec_line, v_out, v_own, v_ruled], null);
  if coalesce(array_length(v_lines, 1), 0) - (v_rec_line is not null)::int < 2 then
    return jsonb_build_object('status', 'none', 'reason', 'nothing to report');
  end if;
  v_text := v_head || E'\n' || array_to_string(v_lines, E'\n');
  -- Too long: drop the ownership line, then the ruled-out line, then (to keep
  -- a record) the prices line; last of all the record line itself.
  if public.social_weighted_length(v_text) > 280 and v_own is not null then
    v_lines := array_remove(v_lines, v_own); v_text := v_head || E'\n' || array_to_string(v_lines, E'\n');
  end if;
  if public.social_weighted_length(v_text) > 280 and v_ruled is not null then
    v_lines := array_remove(v_lines, v_ruled); v_text := v_head || E'\n' || array_to_string(v_lines, E'\n');
  end if;
  if public.social_weighted_length(v_text) > 280 and v_rec_line is not null and v_prices is not null then
    v_lines := array_remove(v_lines, v_prices); v_text := v_head || E'\n' || array_to_string(v_lines, E'\n');
  end if;
  if public.social_weighted_length(v_text) > 280 and v_rec_line is not null then
    v_lines := array_remove(array[v_prices, v_in, v_out], null); v_rec_line := null;
    v_text := v_head || E'\n' || array_to_string(v_lines, E'\n');
  end if;

  return jsonb_build_object('status', 'ok', 'text', v_text,
                            'summary', jsonb_build_object('rises', v_up, 'falls', v_down),
                            'transfers_snapshot', jsonb_build_object('kind', v_kind_a, 'at', v_asof, 'previous_kind', v_kind_b),
                            'record', v_rec, 'record_line_posted', v_rec_line is not null);
end;
$$;
revoke all on function private.social_week_changes_text(bigint, integer, timestamptz) from public;

create or replace function private.social_detect_week_changes(p_run_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_season bigint := public.fpl_current_season_id();
  v_gw integer; v_deadline timestamptz; v_key text; v_r jsonb; v_text text; v_id bigint;
begin
  select fpl_event_id, deadline_time into v_gw, v_deadline from public.fpl_gameweeks
   where season_id = v_season and deadline_time <= now() and deadline_time > now() - interval '12 hours' order by deadline_time desc limit 1;
  if v_gw is null then return jsonb_build_object('status', 'none', 'reason', 'no deadline in the last 12 hours'); end if;
  v_key := format('fpl_week_changes:%s:%s', v_season, v_gw);
  if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
    return jsonb_build_object('status', 'none', 'reason', 'already made for this deadline');
  end if;

  v_r := private.social_week_changes_text(v_season, v_gw, v_deadline);
  if v_r->>'status' <> 'ok' then return v_r; end if;
  v_text := v_r->>'text';

  insert into public.social_post_candidates (post_type, text, generated_text, source_data, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validation_errors, detector_run_id)
  values ('fpl_week_changes', v_text, v_text,
          jsonb_build_object('season_id', v_season, 'gw', v_gw, 'deadline', v_deadline, 'summary', v_r->'summary',
                             'transfers_snapshot', v_r->'transfers_snapshot', 'record', v_r->'record',
                             'record_line_posted', v_r->'record_line_posted',
                             'post_after', v_deadline + interval '1 hour'),
          v_deadline, v_key, v_deadline + interval '12 hours', 'passed', '[]', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'fpl_week_changes', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id, 'gw', v_gw);
end;
$function$;

-- ---- self-test (rolls the whole file back if any of it fails) -------------
do $$
declare v_season bigint := public.fpl_current_season_id(); v_deadline timestamptz; r jsonb;
begin
  r := public.fpl_transfer_record_check(2370904, v_season, 9);
  if not (r->>'beats_history')::boolean or r#>>'{history,web_name}' is null then raise exception 'record check: %', r; end if;
  raise notice 'record check, 2,370,904: %', r;
  r := public.fpl_transfer_record_check(1988403, v_season, 9);
  if (r->>'beats_history')::boolean then raise exception 'record check, 1,988,403: %', r; end if;

  r := private.social_transfer_record_line(v_season, date '2026-10-30', timestamptz '2026-10-30 21:47:01+00');
  raise notice 'market record line, 30 Oct: %', r->>'line';
  if r is null or r->>'web_name' is null then raise exception 'market record line: %', r; end if;

  select deadline_time into v_deadline from public.fpl_gameweeks where season_id = v_season and fpl_event_id = 9;
  r := private.social_week_changes_text(v_season, 9, v_deadline);
  raise notice 'week changes GW9: %', r;
  if r->>'status' <> 'ok' or public.social_weighted_length(r->>'text') > 280 then raise exception 'week changes text: %', r; end if;
end $$;
