-- ============================================================================
-- Admin "end of day site update" email (Chris, 2 Nov 2026).
--
-- Every day at 20:00 Europe/London the admin gets one email summarising the
-- site's day (00:00 London to send time): traffic, people, X, data and
-- pipelines, football, FPL and changes shipped.
--
--   private.admin_daily_digest(p_day)  the content, as jsonb (subject,
--                                      headline, sections[{key,title,link,
--                                      lines[]}]). A section with nothing to
--                                      report is left out. Preview it with
--                                      select private.admin_daily_digest(current_date);
--   private.admin_digest_send(p_day, p_mode)
--                                      hands it to social-notify (kind
--                                      daily_digest) through pg_net. 'scheduled'
--                                      sends at most once per London date
--                                      (private.admin_digest_sends); 'preview'
--                                      always sends and does not count.
--   private.admin_digest_tick()        pg_cron, minute 0 of 19:00 and 20:00 UTC;
--                                      sends only when the London hour is 20
--                                      (so it is right in both GMT and BST).
--   public.admin_digest_finish(...)    service_role only: social-notify reports
--                                      the outcome; logs pipeline_runs
--                                      (admin-daily-digest, or
--                                      admin-daily-digest-preview).
--   public.admin_digest_get(p_day) / public.admin_digest_send_now()
--                                      is_admin() only: /admin/email preview and
--                                      "Send today's digest now".
--
-- Registered in job_registry so a missed send shows in job_health.
-- No addresses here: the recipient is resolved by social-notify
-- (social_settings.notify_email, else the admin's address).
-- Safe to re-run: if not exists, create or replace, on conflict do nothing.
-- ============================================================================

create table if not exists private.admin_digest_sends (
  send_id bigint generated always as identity primary key,
  day date not null,
  mode text not null check (mode in ('scheduled', 'preview')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  subject text,
  note text,
  queued_at timestamptz not null default now(),
  finished_at timestamptz
);
-- One scheduled send per London date.
create unique index if not exists admin_digest_sends_one_per_day on private.admin_digest_sends (day) where mode = 'scheduled';
alter table private.admin_digest_sends enable row level security;
revoke all on private.admin_digest_sends from public, anon, authenticated;

-- ---------------------------------------------------------------- content
-- "1 visitor", "2 visitors".
create or replace function private.digest_n(p_n numeric, p_word text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_n, 0) || ' ' || p_word || case when coalesce(p_n, 0) = 1 then '' else 's' end;
$$;
revoke all on function private.digest_n(numeric, text) from public, anon, authenticated;

create or replace function private.admin_daily_digest(p_day date default (now() at time zone 'Europe/London')::date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_from timestamptz := (p_day::timestamp) at time zone 'Europe/London';
  v_to   timestamptz := least(now(), ((p_day + 1)::timestamp) at time zone 'Europe/London');
  v_sections jsonb := '[]'::jsonb;
  v_lines text[];
  -- traffic
  t_users bigint; t_views bigint; t_sessions bigint; t_loaded timestamptz; t_final boolean;
  w_users bigint; w_views bigint; v_top text;
  -- people
  p_accounts int; p_signups int; p_confirmed int; p_unsubs int; p_list int; p_lookups int; v_weekly text;
  -- x
  x_pub int; x_list text; x_new int; x_waiting int; x_held int; x_expired int;
  x_metric_posts int; x_imp bigint; x_eng bigint;
  s record;
  -- pipelines
  r_total int; r_ok int; r_warn int; r_fail int; r_running int; r_failing int; v_fail_list text;
  v_integrity record; v_smoke record; v_prev_n int; v_prev_fail int;
  -- football
  f_results int; f_by_league text; f_moved int; f_moved_list text; l_teams int; l_starters int; l_matched int;
  -- fpl
  v_season bigint := public.fpl_current_season_id(); v_up int; v_down int; v_up_list text; v_down_list text;
  g_next record; g_passed record; g_current record;
  -- shipped
  m_count int; m_list text;
  v_headline text[] := '{}';
  hm text := 'HH24:MI';
begin
  -- ============================================================ traffic (GA4)
  select sum(active_users), sum(page_views), sum(sessions), max(fetched_at), bool_and(is_final)
    into t_users, t_views, t_sessions, t_loaded, t_final
    from ga.daily_totals where date = p_day;
  select sum(active_users), sum(page_views) into w_users, w_views from ga.daily_totals where date = p_day - 7;
  if t_loaded is not null then
    select string_agg(format('%s (%s)', page_path, page_views), ', ' order by page_views desc, page_path)
      into v_top
      from (select page_path, sum(page_views) page_views from ga.daily_by_page
             where date = p_day group by 1 having sum(page_views) > 0 order by 2 desc, 1 limit 5) x;
    v_lines := array[
      format('%s, %s, %s%s.', private.digest_n(t_users, 'visitor'), private.digest_n(t_views, 'pageview'),
             private.digest_n(t_sessions, 'session'), case when t_final then '' else ' so far' end),
      format('Same day last week (%s): %s, %s.', to_char(p_day - 7, 'Dy FMDD Mon'),
             private.digest_n(w_users, 'visitor'), private.digest_n(w_views, 'pageview'))];
    if v_top is not null then v_lines := v_lines || ('Top pages: ' || v_top || '.'); end if;
    if not t_final then
      v_lines := v_lines || format('Google Analytics last loaded at %s; later visits arrive with tomorrow''s import.',
                                   to_char(t_loaded at time zone 'Europe/London', hm));
    end if;
    v_sections := v_sections || jsonb_build_object('key', 'traffic', 'title', 'Traffic',
      'link', 'https://fixtureshark.com/admin/traffic', 'lines', to_jsonb(v_lines));
    v_headline := v_headline || (private.digest_n(t_users, 'visitor') || ', ' || private.digest_n(t_views, 'pageview'));
  end if;

  -- ============================================================ people
  select count(*) into p_accounts from public.app_users where created_at >= v_from and created_at < v_to;
  select count(*) filter (where created_at >= v_from and created_at < v_to),
         count(*) filter (where confirmed_at >= v_from and confirmed_at < v_to),
         count(*) filter (where unsubscribed_at >= v_from and unsubscribed_at < v_to),
         count(*) filter (where status = 'confirmed')
    into p_signups, p_confirmed, p_unsubs, p_list
    from private.email_subscribers;
  select count(*) into p_lookups from private.fpl_entry_calls where called_at >= v_from and called_at < v_to;
  select string_agg(format('%s email for GW%s: %s sent, %s failed (%s).', initcap(kind), coalesce(fpl_event_id::text, '?'), sent, failed, status), ' ')
    into v_weekly
    from private.email_sends where started_at >= v_from and started_at < v_to;
  if p_accounts + p_signups + p_confirmed + p_unsubs + p_lookups > 0 or v_weekly is not null then
    v_lines := '{}';
    if p_accounts > 0 then v_lines := v_lines || (private.digest_n(p_accounts, 'new account') || '.'); end if;
    if p_signups + p_confirmed + p_unsubs > 0 then
      v_lines := v_lines || format('FPL email: %s signed up, %s confirmed, %s unsubscribed. List: %s confirmed.',
                                   p_signups, p_confirmed, p_unsubs, p_list);
    end if;
    if v_weekly is not null then v_lines := v_lines || v_weekly; end if;
    if p_lookups > 0 then v_lines := v_lines || format('%s FPL team ID look-ups on the site.', p_lookups); end if;
    v_sections := v_sections || jsonb_build_object('key', 'people', 'title', 'People',
      'link', 'https://fixtureshark.com/admin/email', 'lines', to_jsonb(v_lines));
  end if;

  -- ============================================================ X
  select count(*), string_agg(format('%s: %s', initcap(replace(post_type, '_', ' ')),
                                     left(regexp_replace(text, '\s+', ' ', 'g'), 70) || case when length(text) > 70 then '…' else '' end),
                              E'\n' order by published_at)
    into x_pub, x_list
    from (select * from public.social_post_candidates
           where published_at >= v_from and published_at < v_to order by published_at limit 5) c;
  select count(*) into x_pub from public.social_post_candidates where published_at >= v_from and published_at < v_to;
  select count(*) filter (where publication_status <> 'published' and not coalesce(auto, false)),
         count(*) filter (where approval_status not in ('approved', 'rejected', 'superseded') and coalesce(expires_at, v_to) >= now()),
         count(*) filter (where held)
    into x_new, x_waiting, x_held
    from public.social_post_candidates where created_at >= v_from and created_at < v_to;
  select count(*) into x_expired from public.social_audit_log where action = 'reject' and at >= v_from and at < v_to;
  select count(*), sum(impressions), sum(coalesce(likes, 0) + coalesce(replies, 0) + coalesce(reposts, 0) + coalesce(quotes, 0) + coalesce(bookmarks, 0))
    into x_metric_posts, x_imp, x_eng
    from public.social_post_metrics where captured_at >= v_from and captured_at < v_to;
  select breaker_tripped_at, breaker_reason, auto_publish_enabled, kill_switch into s from public.social_settings where id;
  if x_pub + x_new + x_held + x_expired + x_metric_posts > 0
     or (s.breaker_tripped_at >= v_from and s.breaker_tripped_at < v_to) then
    v_lines := array[private.digest_n(x_pub, 'post') || ' published.'];
    if x_list is not null then v_lines := v_lines || x_list; end if;
    if x_new + x_held + x_expired > 0 then
      v_lines := v_lines || format('Drafts: %s new, %s waiting for your OK, %s held, %s rejected or expired.', x_new, x_waiting, x_held, x_expired);
    end if;
    if x_metric_posts > 0 then
      v_lines := v_lines || format('Weekly metrics fetched: %s impressions, %s engagements across %s posts (lifetime).', x_imp, x_eng, x_metric_posts);
    end if;
    v_lines := v_lines || case
      when s.breaker_tripped_at >= v_from and s.breaker_tripped_at < v_to
        then format('Breaker TRIPPED at %s: %s', to_char(s.breaker_tripped_at at time zone 'Europe/London', hm), coalesce(s.breaker_reason, 'no reason given'))
      when s.breaker_tripped_at is not null then 'Breaker still tripped since ' || to_char(s.breaker_tripped_at at time zone 'Europe/London', 'Dy FMDD Mon HH24:MI') || '.'
      when coalesce(s.kill_switch, false) then 'Breaker not tripped; kill switch is on.'
      when coalesce(s.auto_publish_enabled, false) then 'Breaker not tripped; automatic posting on.'
      else 'Breaker not tripped; automatic posting off.' end;
    v_sections := v_sections || jsonb_build_object('key', 'x', 'title', 'X',
      'link', 'https://fixtureshark.com/admin/social', 'lines', to_jsonb(v_lines));
    v_headline := v_headline || private.digest_n(x_pub, 'X post');
  end if;

  -- ============================================================ data and pipelines
  select count(*), count(*) filter (where status = 'success'), count(*) filter (where status = 'warning'),
         count(*) filter (where status = 'failed'), count(*) filter (where status = 'running')
    into r_total, r_ok, r_warn, r_fail, r_running
    from public.pipeline_runs where started_at >= v_from and started_at < v_to;
  select string_agg(format('%s (%s): %s%s', job_name, n, left(regexp_replace(msg, '\s+', ' ', 'g'), 90),
                           case when later_ok then ' (later run OK)' else '' end), E'\n' order by later_ok, job_name)
    into v_fail_list
    from (select f.job_name, count(*) n,
                 (array_agg(coalesce(nullif(f.error_message, ''), f.summary, 'no detail') order by f.started_at desc))[1] msg,
                 exists (select 1 from public.pipeline_runs o where o.job_name = f.job_name and o.status in ('success', 'warning')
                            and o.started_at > max(f.started_at) and o.started_at < v_to) later_ok
            from public.pipeline_runs f
           where f.started_at >= v_from and f.started_at < v_to and f.status = 'failed'
           group by f.job_name order by 4, 1 limit 5) x;
  -- Jobs whose latest run today failed (a failure followed by a good run is not "still failing").
  select count(*) into r_failing
    from (select distinct on (job_name) status from public.pipeline_runs
           where started_at >= v_from and started_at < v_to and status in ('success', 'warning', 'failed')
           order by job_name, started_at desc) x
   where status = 'failed';
  v_lines := array[format('%s runs: %s OK, %s warnings, %s failed%s.', r_total, r_ok, r_warn, r_fail,
                          case when r_running > 0 then format(', %s still running', r_running) else '' end)];
  if v_fail_list is not null then v_lines := v_lines || ('Failed: ' || v_fail_list); end if;
  select started_at, status, coalesce(substring(summary from '^\d+ integrity checks: \d+ failed, \d+ warnings?'), left(summary, 80)) s
    into v_integrity
    from public.pipeline_runs where job_name = 'model_integrity_checks' and started_at >= v_from and started_at < v_to
   order by started_at desc limit 1;
  if v_integrity.started_at is not null then
    v_lines := v_lines || format('Integrity checks (%s): %s; %s.', to_char(v_integrity.started_at at time zone 'Europe/London', hm),
                                 case v_integrity.status when 'success' then 'passed' when 'warning' then 'passed with warnings' else v_integrity.status end,
                                 v_integrity.s);
  end if;
  select pages_tested, pages_failed, pages_warned, mode, started_at into v_smoke
    from public.smoke_runs where kind = 'production' and started_at >= v_from and started_at < v_to
   order by started_at desc limit 1;
  select count(*), coalesce(sum(pages_failed), 0) into v_prev_n, v_prev_fail
    from public.smoke_runs where kind = 'preview' and started_at >= v_from and started_at < v_to;
  if v_smoke.started_at is not null or v_prev_n > 0 then
    v_lines := v_lines || (concat_ws('; ',
      case when v_smoke.started_at is not null then
        format('Smoke test of the live site (%s): %s pages, %s failed, %s over budget', v_smoke.mode, v_smoke.pages_tested, v_smoke.pages_failed, v_smoke.pages_warned) end,
      case when v_prev_n > 0 then format('%s preview smoke run%s, %s failed pages', v_prev_n, case when v_prev_n = 1 then '' else 's' end, v_prev_fail) end) || '.');
  end if;
  v_sections := v_sections || jsonb_build_object('key', 'pipelines', 'title', 'Data and pipelines',
    'link', 'https://fixtureshark.com/data-health', 'lines', to_jsonb(v_lines));
  v_headline := v_headline || case when r_fail = 0 then 'no failed runs'
                                    else format('%s (%s still failing)', private.digest_n(r_fail, 'failed run'), r_failing) end;

  -- ============================================================ football
  select count(*) into f_results from public.matches where created_at >= v_from and created_at < v_to;
  select string_agg(format('%s %s', name, n), ', ' order by n desc, name) into f_by_league
    from (select l.name, count(*) n from public.matches m join public.leagues l on l.league_id = m.league_id
           where m.created_at >= v_from and m.created_at < v_to group by 1 order by 2 desc, 1 limit 6) x;
  select count(*), string_agg(format('%s v %s: %s → %s', home_team_name, away_team_name,
                                     to_char(was_date, 'Dy FMDD Mon') || coalesce(' ' || to_char(was_time, 'HH24:MI'), ''),
                                     to_char(now_date, 'Dy FMDD Mon') || coalesce(' ' || to_char(now_time, 'HH24:MI'), '')
                                     || case when status = 'postponed' then ' (postponed)' else '' end), E'\n' order by changed_at)
    into f_moved, f_moved_list
    from (select * from public.fixture_changes_net where changed_at >= v_from and changed_at < v_to order by changed_at limit 5) x;
  select count(*) into f_moved from public.fixture_changes_net where changed_at >= v_from and changed_at < v_to;
  select count(*), sum(starters), sum(model_matched) into l_teams, l_starters, l_matched
    from public.social_lineup_checks where kickoff_time >= v_from and kickoff_time < v_to;
  if f_results + f_moved + l_teams > 0 then
    v_lines := '{}';
    if f_results > 0 then v_lines := v_lines || format('%s added: %s.', private.digest_n(f_results, 'result'), f_by_league); end if;
    if f_moved > 0 then v_lines := v_lines || (private.digest_n(f_moved, 'fixture') || ' moved:' || E'\n' || f_moved_list); end if;
    if l_teams > 0 then
      v_lines := v_lines || format('Line-ups: %s teams; our model had %s of %s starters right (%s%%): https://fixtureshark.com/admin/team-sheets',
                                   l_teams, l_matched, l_starters, round(100.0 * l_matched / nullif(l_starters, 0)));
    end if;
    v_sections := v_sections || jsonb_build_object('key', 'football', 'title', 'Football',
      'link', case when f_moved > 0 then 'https://fixtureshark.com/fixtures/changes' else 'https://fixtureshark.com/admin/team-sheets' end,
      'lines', to_jsonb(v_lines));
    if f_results > 0 then v_headline := v_headline || (private.digest_n(f_results, 'result') || ' in'); end if;
  end if;

  -- ============================================================ FPL
  with ch as (
    select p.web_name, ft.short_name, n.price_before, n.price_after, n.ownership
      from public.fpl_price_predictor_nights n
      join public.fpl_players p on p.season_id = n.season_id and p.fpl_player_id = n.fpl_player_id
      left join public.fpl_teams ft on ft.season_id = p.season_id and ft.fpl_team_id = p.fpl_team_id
     where n.season_id = v_season and n.recorded_at >= v_from and n.recorded_at < v_to and n.price_after <> n.price_before)
  select (select count(*) from ch where price_after > price_before),
         (select count(*) from ch where price_after < price_before),
         (select string_agg(format('%s (%s) £%sm, %s%%', web_name, short_name, round(price_after / 10.0, 1), round(ownership, 1)), '; ' order by ownership desc nulls last)
            from (select * from ch where price_after > price_before order by ownership desc nulls last limit 5) u),
         (select string_agg(format('%s (%s) £%sm, %s%%', web_name, short_name, round(price_after / 10.0, 1), round(ownership, 1)), '; ' order by ownership desc nulls last)
            from (select * from ch where price_after < price_before order by ownership desc nulls last limit 5) d)
    into v_up, v_down, v_up_list, v_down_list;
  select fpl_event_id, deadline_time into g_next from public.fpl_gameweeks
   where season_id = v_season and deadline_time > now() order by deadline_time limit 1;
  select fpl_event_id, deadline_time into g_passed from public.fpl_gameweeks
   where season_id = v_season and deadline_time >= v_from and deadline_time < v_to order by deadline_time desc limit 1;
  select fpl_event_id, finished into g_current from public.fpl_gameweeks where season_id = v_season and is_current limit 1;
  if v_up + v_down > 0 or g_next.fpl_event_id is not null or g_passed.fpl_event_id is not null then
    v_lines := '{}';
    if v_up > 0 then v_lines := v_lines || format('Risers (%s): %s.', v_up, v_up_list); end if;
    if v_down > 0 then v_lines := v_lines || format('Fallers (%s): %s.', v_down, v_down_list); end if;
    if v_up + v_down = 0 then v_lines := v_lines || 'No price changes overnight.'::text; end if;
    if g_passed.fpl_event_id is not null then
      v_lines := v_lines || format('GW%s deadline passed at %s.', g_passed.fpl_event_id, to_char(g_passed.deadline_time at time zone 'Europe/London', hm));
    elsif g_current.fpl_event_id is not null and not coalesce(g_current.finished, false) then
      v_lines := v_lines || format('GW%s in progress.', g_current.fpl_event_id);
    end if;
    if g_next.fpl_event_id is not null then
      v_lines := v_lines || format('Next: GW%s deadline %s (UK).', g_next.fpl_event_id,
                                   to_char(g_next.deadline_time at time zone 'Europe/London', 'Dy FMDD Mon HH24:MI'));
    end if;
    v_sections := v_sections || jsonb_build_object('key', 'fpl', 'title', 'FPL',
      'link', 'https://fixtureshark.com/fpl/price-risk', 'lines', to_jsonb(v_lines));
  end if;

  -- ============================================================ changes shipped
  select count(*), string_agg(regexp_replace(filename, '\.sql$', ''), E'\n' order by applied_at)
    into m_count, m_list
    from (select filename, applied_at from public.repo_migrations where applied_at >= v_from and applied_at < v_to order by applied_at limit 8) x;
  select count(*) into m_count from public.repo_migrations where applied_at >= v_from and applied_at < v_to;
  if m_count > 0 then
    v_sections := v_sections || jsonb_build_object('key', 'shipped', 'title', 'Changes shipped',
      'link', 'https://github.com/sharkey1982/football-data-webapp/pulls?q=is%3Apr+is%3Amerged',
      'lines', to_jsonb(array[private.digest_n(m_count, 'database migration') || ' applied:' || E'\n' || m_list]));
  end if;

  return jsonb_build_object(
    'day', p_day,
    'from', v_from,
    'to', v_to,
    'subject', 'FixtureShark today: ' || to_char(p_day, 'Dy FMDD Mon'),
    'headline', array_to_string(v_headline, ' · ') || '.',
    'sections', v_sections);
end;
$$;
revoke all on function private.admin_daily_digest(date) from public, anon, authenticated;

-- ---------------------------------------------------------------- send
-- 'scheduled': at most once per London date (the row is the claim).
-- 'preview': always, does not count. social-notify reports back through
-- public.admin_digest_finish.
create or replace function private.admin_digest_send(p_day date, p_mode text default 'scheduled')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_digest jsonb;
begin
  if p_mode not in ('scheduled', 'preview') then raise exception 'unknown mode %', p_mode; end if;
  v_digest := private.admin_daily_digest(p_day);
  insert into private.admin_digest_sends (day, mode, subject) values (p_day, p_mode, v_digest->>'subject')
  on conflict (day) where mode = 'scheduled' do nothing
  returning send_id into v_id;
  if v_id is null then return jsonb_build_object('status', 'already sent', 'day', p_day); end if;
  perform private.social_notify(jsonb_build_object('kind', 'daily_digest', 'send_id', v_id, 'mode', p_mode, 'day', p_day, 'digest', v_digest));
  return jsonb_build_object('status', 'queued', 'day', p_day, 'send_id', v_id, 'mode', p_mode);
end;
$$;
revoke all on function private.admin_digest_send(date, text) from public, anon, authenticated;

-- pg_cron runs in UTC: minute 0 of 19:00 and 20:00 UTC, and only the run
-- that falls at 20:00 London sends.
create or replace function private.admin_digest_tick()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if extract(hour from now() at time zone 'Europe/London') <> 20 then
    return jsonb_build_object('status', 'not due');
  end if;
  return private.admin_digest_send((now() at time zone 'Europe/London')::date, 'scheduled');
end;
$$;
revoke all on function private.admin_digest_tick() from public, anon, authenticated;

-- social-notify reports the outcome (service_role only).
create or replace function public.admin_digest_finish(p_send_id bigint, p_ok boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r private.admin_digest_sends;
begin
  update private.admin_digest_sends
     set status = case when p_ok then 'sent' else 'failed' end, note = left(p_note, 500), finished_at = now()
   where send_id = p_send_id
  returning * into r;
  if r.send_id is null then return; end if;
  insert into public.pipeline_runs (job_name, started_at, finished_at, status, summary, error_message)
  values (case when r.mode = 'scheduled' then 'admin-daily-digest' else 'admin-daily-digest-preview' end,
          r.queued_at, now(), case when p_ok then 'success' else 'failed' end,
          format('%s (%s)', r.subject, r.mode), case when not p_ok then left(p_note, 500) end);
end;
$$;
revoke all on function public.admin_digest_finish(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_digest_finish(bigint, boolean, text) to service_role;

-- ---------------------------------------------------------------- admin page
create or replace function public.admin_digest_get(p_day date default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return private.admin_daily_digest(coalesce(p_day, (now() at time zone 'Europe/London')::date))
    || jsonb_build_object('sends', coalesce((
         select jsonb_agg(to_jsonb(s) order by s.queued_at desc)
           from (select * from private.admin_digest_sends order by queued_at desc limit 10) s), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_digest_get(date) from public, anon;
grant execute on function public.admin_digest_get(date) to authenticated;

-- "Send today's digest now": a preview to the admin address; the 20:00 send
-- still goes.
create or replace function public.admin_digest_send_now()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return private.admin_digest_send((now() at time zone 'Europe/London')::date, 'preview');
end;
$$;
revoke all on function public.admin_digest_send_now() from public, anon;
grant execute on function public.admin_digest_send_now() to authenticated;

-- ---------------------------------------------------------------- schedule
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'admin-daily-digest-tick') then
    perform cron.schedule('admin-daily-digest-tick', '0 19,20 * * *', 'select private.admin_digest_tick()');
  end if;
end $$;

insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, upstream, notes)
values
  ('admin-daily-digest-tick', 'email', 'supabase_cron', '0 19,20 * * *', interval '26 hours', interval '00:05:00', 'pg_cron', '^admin-daily-digest-tick$', null,
   'Minute 0 of 19:00 and 20:00 UTC: private.admin_digest_tick(); sends the admin end-of-day email only when the London hour is 20'),
  ('admin-daily-digest', 'email', 'edge_function', 'daily 20:00 Europe/London', interval '26 hours', interval '00:15:00', 'pipeline_runs', '^admin-daily-digest$', 'api.resend.com',
   'The admin end-of-day site update email (social-notify kind daily_digest), one per London date (private.admin_digest_sends); logged by public.admin_digest_finish. Stale = a missed send'),
  ('admin-daily-digest-preview', 'email', 'edge_function', 'manual (/admin/email)', null, interval '00:15:00', 'pipeline_runs', '^admin-daily-digest-preview$', 'api.resend.com',
   'Previews of the admin end-of-day email from /admin/email; not scheduled and do not count as the day''s send')
on conflict (job_key) do nothing;
