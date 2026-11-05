-- ============================================================================
-- Admin "overnight update" email (5 Nov 2026): every day at 07:30
-- Europe/London the admin gets what changed since the previous evening's
-- 19:25 site update, in the same shape (headline, sections, links).
--
--   private.admin_digest(p_from, p_to, p_edition)
--                          the generalised entry point. 'evening' is the
--                          existing end-of-day content
--                          (private.admin_daily_digest(p_day), unchanged; it
--                          covers 00:00 London to send time of p_from's
--                          London date). 'morning' is the overnight content
--                          below, for any window.
--   private.admin_morning_window(p_day)
--                          the overnight window for a London date: from the
--                          previous evening's scheduled send (else 19:25
--                          London the day before) to now (to 07:30 for a past
--                          date).
--   private.admin_overnight_digest(p_from, p_to)
--                          the morning content. "Today" first (games today
--                          and the next FPL deadline), then Site pages
--                          (Cloudflare visits in whole hours of the window
--                          against the same hours a week ago; yesterday's
--                          complete day; Google Analytics and Search for the
--                          latest complete day, labelled "latest", since they
--                          import in the afternoon), X (always shown), People,
--                          Data and pipelines (failures and whether each is
--                          still failing), Football, FPL (overnight price
--                          changes) and Changes shipped. A section with
--                          nothing in the window is left out, except X.
--                          Subject "FixtureShark overnight: Thu 5 Nov".
--
-- Sends: private.admin_digest_sends gets an edition column; one scheduled
-- send per London date AND edition, so morning and evening never block each
-- other. private.admin_digest_send(p_day, p_mode, p_edition default
-- 'evening'). Outcomes log pipeline_runs as admin-morning-digest /
-- admin-morning-digest-preview (evening names unchanged).
--
-- Schedule (pg_cron is UTC, so each runs at 06:xx and 07:xx UTC and acts
-- only when the London hour is 7, right in both GMT and BST):
--   admin-morning-prep-tick    20 6,7 * * *  07:20 UK: X read of posts from
--                              the last 12 hours (first post of each thread,
--                              ~1-2 posts a night, ~$0.05 a month; all X reads
--                              together ~$0.80 a month), and a Cloudflare
--                              import if none has run since 07:00 UK (in BST
--                              the 07:12 UTC import is 08:12 UK, after the
--                              send).
--   admin-morning-digest-tick  30 6,7 * * *  07:30 UK: the send.
-- Both in job_registry, with admin-morning-digest (pipeline_runs) so a
-- missed send shows in job_health and the integrity checks.
--
-- Preview and send-now: public.admin_digest_get(p_day, p_edition) and
-- public.admin_digest_send_now(p_edition) take an optional edition
-- (default 'evening', so /admin/email is unchanged). From the SQL editor:
--   select private.admin_digest_send(current_date, 'preview', 'morning');
--   select private.admin_digest(null, null, 'morning');   -- content only
--
-- First run: an X overnight read and a Cloudflare import now, then a one-off
-- pg_cron job sends a "[Preview]" of today's overnight email once both have
-- reported (or after 10 minutes) and removes itself. Today's 07:30 had
-- already passed when this shipped and the tick only runs at 06:30 and 07:30
-- UTC, so no scheduled morning send can go today: nothing to de-duplicate.
--
-- No secrets or addresses here. Safe to re-run: if not exists, create or
-- replace, on conflict do nothing, guarded cron changes.
-- ============================================================================

-- ======================================================================= sends
alter table private.admin_digest_sends add column if not exists edition text not null default 'evening';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admin_digest_sends_edition_check') then
    alter table private.admin_digest_sends add constraint admin_digest_sends_edition_check check (edition in ('evening', 'morning'));
  end if;
end $$;
create unique index if not exists admin_digest_sends_one_per_day_edition
  on private.admin_digest_sends (day, edition) where mode = 'scheduled';
drop index if exists private.admin_digest_sends_one_per_day;

-- ======================================================================= window
create or replace function private.admin_morning_window(p_day date default (now() at time zone 'Europe/London')::date)
returns table (w_from timestamptz, w_to timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select min(s.queued_at) from private.admin_digest_sends s
                    where s.day = p_day - 1 and s.edition = 'evening' and s.mode = 'scheduled' and s.status <> 'failed'),
                  ((p_day - 1) + time '19:25')::timestamp at time zone 'Europe/London'),
         -- today: to now, even after 07:30 (a later preview covers up to its send)
         case when p_day >= (now() at time zone 'Europe/London')::date then now()
              else least(now(), (p_day + time '07:30')::timestamp at time zone 'Europe/London') end;
$$;
revoke all on function private.admin_morning_window(date) from public, anon, authenticated;

-- ===================================================================== content
create or replace function private.admin_overnight_digest(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_from timestamptz := p_from;
  v_to timestamptz := least(now(), p_to);
  v_day date := (v_to at time zone 'Europe/London')::date;        -- the morning's London date
  v_yday date := v_day - 1;
  v_sections jsonb := '[]'::jsonb;
  v_lines text[];
  v_head text[] := '{}';
  hm text := 'HH24:MI';
  v_window text;
  -- today
  t_games int; t_by_league text; t_pl int; t_first time; g_next record; g_passed record; v_season bigint := public.fpl_current_season_id();
  -- site pages
  c_last timestamptz; c_h0 timestamptz; c_h1 timestamptz; c_first date;
  c_visits bigint; c_views bigint; cw_visits bigint; cw_views bigint;
  y_visits bigint; y_views bigint; y_final boolean; yw_visits bigint; yw_views bigint; y_top text;
  ga_day date; ga_users bigint; ga_views bigint;
  q_day date; q_imp bigint; q_clicks bigint; q_pos numeric;
  -- x
  s record; x_pub int; x_list text; x_queue text; x_waiting int; x_dropped text;
  m_posts int; m_read int; m_imp bigint; m_likes bigint; m_at timestamptz; o_reads int;
  -- people
  p_accounts int; p_signups int; p_confirmed int; p_unsubs int; p_list int; p_lookups int; p_weekly text;
  -- pipelines
  r_total int; r_ok int; r_warn int; r_fail int; r_running int; r_failing int; r_list text;
  -- football
  f_results int; f_by_league text; f_moved int; f_moved_list text; l_teams int; l_starters int; l_matched int;
  -- fpl
  v_up int; v_down int; v_up_list text; v_down_list text; v_price_at timestamptz;
  -- shipped
  m_count int; m_list text;
begin
  v_window := format('%s %s to %s %s', to_char(v_from at time zone 'Europe/London', 'Dy'), to_char(v_from at time zone 'Europe/London', hm),
                     to_char(v_to at time zone 'Europe/London', 'Dy'), to_char(v_to at time zone 'Europe/London', hm));

  -- ============================================================ today
  select count(*), count(*) filter (where f.league_id = 1), min(f.kickoff_time)
    into t_games, t_pl, t_first
    from public.fixtures f where f.kickoff_date = v_day and f.status not in ('postponed');
  select string_agg(format('%s %s', name, n), ', ' order by n desc, name) into t_by_league
    from (select l.name, count(*) n from public.fixtures f join public.leagues l on l.league_id = f.league_id
           where f.kickoff_date = v_day and f.status not in ('postponed') group by 1 order by 2 desc, 1 limit 4) x;
  select fpl_event_id, deadline_time into g_next from public.fpl_gameweeks
   where season_id = v_season and deadline_time > now() order by deadline_time limit 1;
  v_lines := array[concat_ws(' ',
    case when t_games = 0 then 'No games today in the competitions we hold.'
         else format('%s today%s: %s.', private.digest_n(t_games, 'game'),
                     coalesce(', first at ' || to_char(t_first, hm), ''), t_by_league) end,
    case when g_next.fpl_event_id is not null then
      format('Next FPL deadline: GW%s, %s (UK)%s.', g_next.fpl_event_id,
             to_char(g_next.deadline_time at time zone 'Europe/London', 'Dy FMDD Mon HH24:MI'),
             case when (g_next.deadline_time at time zone 'Europe/London')::date = v_day then ', TODAY' else '' end) end)];
  v_sections := v_sections || jsonb_build_object('key', 'today', 'title', 'Today',
    'link', 'https://fixtureshark.com/today', 'lines', to_jsonb(v_lines));

  -- ============================================================ site pages
  -- Cloudflare: whole UTC hours of the window that the latest import covers
  -- (cf-import 01:12 and 07:12 UTC, plus 07:20 UK in BST).
  select max(finished_at) into c_last from cf.import_runs where status in ('success', 'warning');
  select min(date) into c_first from cf.daily_totals;
  c_h0 := date_trunc('hour', v_from);
  c_h1 := date_trunc('hour', least(v_to, coalesce(c_last, v_from)));
  v_lines := '{}';
  if c_last is not null and c_h1 > c_h0 then
    select coalesce(sum(visits), 0), coalesce(sum(page_views), 0) into c_visits, c_views
      from cf.hourly_totals where hour >= c_h0 and hour < c_h1;
    if c_first <= ((c_h0 - interval '7 days') at time zone 'Europe/London')::date then
      select coalesce(sum(visits), 0), coalesce(sum(page_views), 0) into cw_visits, cw_views
        from cf.hourly_totals where hour >= c_h0 - interval '7 days' and hour < c_h1 - interval '7 days';
    end if;
    v_lines := v_lines || format('Overnight, %s to %s: %s, %s (Cloudflare, every visitor)%s.',
      to_char(c_h0 at time zone 'Europe/London', hm), to_char(c_h1 at time zone 'Europe/London', hm),
      private.digest_n(c_visits, 'visit'), private.digest_n(c_views, 'pageview'),
      case when cw_visits is null then '; no figures for the same hours last week'
           else format('; same hours last week %s, %s%s', private.digest_n(cw_visits, 'visit'), private.digest_n(cw_views, 'pageview'),
                       coalesce(' (visits ' || private.digest_pct(c_visits, cw_visits) || ')', '')) end);
    if c_h1 < date_trunc('hour', v_to) then
      v_lines := v_lines || format('Cloudflare last imported at %s, so visits after %s are not counted yet.',
        to_char(c_last at time zone 'Europe/London', hm), to_char(c_h1 at time zone 'Europe/London', hm));
    end if;
  else
    v_lines := v_lines || ('Cloudflare: no import covers the overnight hours yet'
      || coalesce(' (last import ' || to_char(c_last at time zone 'Europe/London', 'Dy HH24:MI') || ')', '') || '.');
  end if;
  -- Yesterday's complete day (the evening email had it only "so far").
  select visits, page_views, is_final into y_visits, y_views, y_final from cf.daily_totals where date = v_yday;
  select visits, page_views into yw_visits, yw_views from cf.daily_totals where date = v_yday - 7;
  if y_visits is not null then
    select string_agg(format('%s · %s', path, private.digest_int(page_views)), E'\n' order by page_views desc, path) into y_top
      from (select path, page_views from cf.daily_by_page where date = v_yday and page_views > 0 order by page_views desc, path limit 5) x;
    v_lines := v_lines || (format('Yesterday, %s%s: %s, %s; %s: %s, %s%s.', to_char(v_yday, 'Dy FMDD Mon'),
        case when y_final then ' (complete)' else ' (not final yet)' end,
        private.digest_n(y_visits, 'visit'), private.digest_n(y_views, 'pageview'), to_char(v_yday - 7, 'Dy FMDD Mon'),
        private.digest_n(yw_visits, 'visit'), private.digest_n(yw_views, 'pageview'),
        coalesce(' (visits ' || private.digest_pct(y_visits, yw_visits) || ')', ''))
      || coalesce(E'\n' || 'Top pages yesterday (pageviews):' || E'\n' || y_top, ''));
  end if;
  -- Google Analytics and Search import in the afternoon: latest complete day.
  select max(date) into ga_day from ga.daily_totals where is_final;
  if ga_day is not null then
    select sum(active_users), sum(page_views) into ga_users, ga_views from ga.daily_totals where date = ga_day;
    v_lines := v_lines || format('Google Analytics, latest complete day (%s): %s, %s (consenting visitors only).',
      to_char(ga_day, 'Dy FMDD Mon'), private.digest_n(ga_users, 'visitor'), private.digest_n(ga_views, 'pageview'));
  end if;
  select max(date) into q_day from gsc.daily_totals where search_type = 'web' and is_final;
  if q_day is not null then
    select sum(impressions), sum(clicks), sum(position * impressions) / nullif(sum(impressions), 0)
      into q_imp, q_clicks, q_pos from gsc.daily_totals where search_type = 'web' and date = q_day;
    v_lines := v_lines || format('Google Search, latest complete day (%s): %s, %s%s.', to_char(q_day, 'Dy FMDD Mon'),
      private.digest_n(q_imp, 'impression'), private.digest_n(q_clicks, 'click'),
      case when q_imp > 0 then ', average position ' || round(q_pos, 1) else '' end);
  end if;
  v_sections := v_sections || jsonb_build_object('key', 'traffic', 'title', 'Site pages',
    'link', 'https://fixtureshark.com/admin/traffic', 'lines', to_jsonb(v_lines));
  v_head := v_head || case when c_visits is not null then private.digest_n(c_visits, 'visit') else 'no overnight visit figures yet' end;

  -- ============================================================ X (always shown)
  select max_posts_per_day, max_posts_per_month, breaker_tripped_at, breaker_reason, auto_publish_enabled, kill_switch
    into s from public.social_settings where id;
  -- Posts that went out overnight, each with its latest read.
  with p as (select candidate_id, post_type, published_at, text, x_post_id from public.social_post_candidates
              where published_at >= v_from and published_at < v_to),
  l as (select distinct on (m.candidate_id) m.candidate_id, m.captured_at, coalesce(m.impressions, 0) imp, coalesce(m.likes, 0) likes
          from public.social_post_metrics m join p using (candidate_id)
         where m.position = 1 and m.captured_at < v_to order by m.candidate_id, m.captured_at desc)
  select count(*),
         string_agg(format('%s · %s · %s', to_char(p.published_at at time zone 'Europe/London', 'Dy HH24:MI'), private.digest_post_label(p.post_type),
                           private.digest_clip(p.text, 80))
                    || case when l.captured_at is not null
                            then format(E'\n' || '%s impressions, %s (read %s)', private.digest_int(l.imp), private.digest_n(l.likes, 'like'),
                                        to_char(l.captured_at at time zone 'Europe/London', hm))
                            else E'\n' || 'no figures read yet' end
                    || coalesce(E'\n' || 'https://x.com/FixtureSharkHQ/status/' || p.x_post_id, ''), E'\n' order by p.published_at)
    into x_pub, x_list
    from p left join l using (candidate_id);
  -- 7-day totals from each post's latest read.
  with p as (select candidate_id from public.social_post_candidates
              where publication_status = 'published' and published_at >= v_to - interval '7 days' and published_at < v_to),
  l as (select distinct on (m.candidate_id) m.candidate_id, m.captured_at, coalesce(m.impressions, 0) imp, coalesce(m.likes, 0) likes
          from public.social_post_metrics m join p using (candidate_id)
         where m.position = 1 and m.captured_at < v_to order by m.candidate_id, m.captured_at desc)
  select (select count(*) from p), count(*), sum(imp), sum(likes), max(captured_at)
    into m_posts, m_read, m_imp, m_likes, m_at from l;
  select count(*) into o_reads from public.social_metrics_runs
   where triggered_by like '%-overnight' and started_at >= v_from and started_at < v_to and finished_at is not null and error is null;
  -- Queued for the rest of today.
  select string_agg(format('%s · %s · %s', to_char(coalesce(hold_until, scheduled_for) at time zone 'Europe/London', hm),
                           private.digest_post_label(post_type), private.digest_clip(text, 60)), E'\n' order by coalesce(hold_until, scheduled_for))
    into x_queue
    from (select * from public.social_post_candidates
           where approval_status = 'approved' and publication_status = 'unpublished' and not coalesce(held, false)
             and coalesce(hold_until, scheduled_for) > now()
             and coalesce(hold_until, scheduled_for) < ((v_day + 1)::timestamp at time zone 'Europe/London')
           order by coalesce(hold_until, scheduled_for) limit 6) c;
  select count(*) into x_waiting from public.social_post_candidates
   where approval_status not in ('approved', 'rejected', 'superseded') and publication_status <> 'published'
     and coalesce(expires_at, now()) >= now() and not coalesce(auto, false);
  select string_agg(line, E'\n' order by at) into x_dropped
    from (select * from (
      select a.at, format('#%s %s: rejected (%s)', c.candidate_id, private.digest_post_label(c.post_type),
                          coalesce(nullif(a.detail->>'reason', ''), c.rejected_reason, 'no reason given')) line
        from public.social_audit_log a join public.social_post_candidates c using (candidate_id)
       where a.action = 'reject' and a.at >= v_from and a.at < v_to
      union all
      select c.expires_at, format('#%s %s: expired unposted at %s', c.candidate_id, private.digest_post_label(c.post_type),
                                  to_char(c.expires_at at time zone 'Europe/London', hm))
        from public.social_post_candidates c
       where c.expires_at >= v_from and c.expires_at < v_to and c.publication_status <> 'published'
         and c.approval_status not in ('rejected', 'superseded')) y
     order by at limit 6) x;

  v_lines := array[case when x_pub = 0 then 'No posts overnight.'
                        else format('%s overnight:', private.digest_n(x_pub, 'post')) || E'\n' || x_list end];
  if m_read > 0 then
    v_lines := v_lines || format('Last 7 days: %s, %s impressions, %s likes (first post of each thread, latest read per post; newest read %s%s).',
      private.digest_n(m_posts, 'post'), private.digest_int(m_imp), private.digest_int(m_likes),
      to_char(m_at at time zone 'Europe/London', 'Dy HH24:MI'),
      case when o_reads > 0 then '' else '; figures as of last evening' end);
  elsif m_posts > 0 then
    v_lines := v_lines || format('Last 7 days: %s, no figures read from X yet.', private.digest_n(m_posts, 'post'));
  end if;
  v_lines := v_lines || coalesce('Queued for today:' || E'\n' || x_queue, 'Nothing queued for today yet (automatic posts are drafted during the day).');
  if x_waiting > 0 then v_lines := v_lines || (private.digest_n(x_waiting, 'draft') || ' waiting for your OK.'); end if;
  if x_dropped is not null then v_lines := v_lines || ('Not posted overnight:' || E'\n' || x_dropped); end if;
  v_lines := v_lines || case
    when s.breaker_tripped_at >= v_from and s.breaker_tripped_at < v_to
      then format('Breaker TRIPPED at %s: %s', to_char(s.breaker_tripped_at at time zone 'Europe/London', 'Dy HH24:MI'), coalesce(s.breaker_reason, 'no reason given'))
    when s.breaker_tripped_at is not null then 'Breaker still tripped since ' || to_char(s.breaker_tripped_at at time zone 'Europe/London', 'Dy FMDD Mon HH24:MI') || '.'
    when coalesce(s.kill_switch, false) then 'Breaker not tripped; kill switch is on.'
    when coalesce(s.auto_publish_enabled, false) then 'Breaker not tripped; automatic posting on.'
    else 'Breaker not tripped; automatic posting off.' end;
  v_sections := v_sections || jsonb_build_object('key', 'x', 'title', 'X',
    'link', 'https://fixtureshark.com/admin/social', 'lines', to_jsonb(v_lines));
  v_head := v_head || private.digest_n(x_pub, 'X post');

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
    into p_weekly from private.email_sends where started_at >= v_from and started_at < v_to;
  if p_accounts + p_signups + p_confirmed + p_unsubs + p_lookups > 0 or p_weekly is not null then
    v_lines := '{}';
    if p_accounts > 0 then v_lines := v_lines || (private.digest_n(p_accounts, 'new account') || '.'); end if;
    if p_signups + p_confirmed + p_unsubs > 0 then
      v_lines := v_lines || format('FPL email: %s signed up, %s confirmed, %s unsubscribed. List: %s confirmed.', p_signups, p_confirmed, p_unsubs, p_list);
    end if;
    if p_weekly is not null then v_lines := v_lines || p_weekly; end if;
    if p_lookups > 0 then v_lines := v_lines || format('%s FPL team ID look-ups on the site.', p_lookups); end if;
    v_sections := v_sections || jsonb_build_object('key', 'people', 'title', 'People',
      'link', 'https://fixtureshark.com/admin/email', 'lines', to_jsonb(v_lines));
    if p_accounts + p_signups > 0 then v_head := v_head || private.digest_n(p_accounts + p_signups, 'sign-up'); end if;
  end if;

  -- ============================================================ data and pipelines
  select count(*), count(*) filter (where status = 'success'), count(*) filter (where status = 'warning'),
         count(*) filter (where status = 'failed'), count(*) filter (where status = 'running')
    into r_total, r_ok, r_warn, r_fail, r_running
    from public.pipeline_runs where started_at >= v_from and started_at < v_to;
  -- Each job that failed overnight, and whether its latest run (up to now) still fails.
  with f as (select job_name, count(*) n, max(started_at) last_fail,
                    (array_agg(coalesce(nullif(error_message, ''), summary, 'no detail') order by started_at desc))[1] msg
               from public.pipeline_runs where started_at >= v_from and started_at < v_to and status = 'failed' group by 1),
  j as (select f.*, (select o.started_at from public.pipeline_runs o where o.job_name = f.job_name and o.status in ('success', 'warning')
                       and o.started_at > f.last_fail order by o.started_at limit 1) ok_at from f)
  select count(*) filter (where ok_at is null),
         string_agg(format('%s (%s): %s%s', job_name, n, left(regexp_replace(msg, '\s+', ' ', 'g'), 90),
                           case when ok_at is null then ' (STILL FAILING)' else ' (OK again from ' || to_char(ok_at at time zone 'Europe/London', hm) || ')' end),
                    E'\n' order by ok_at nulls first, job_name)
    into r_failing, r_list from j;
  if r_total > 0 then
    v_lines := array[format('%s runs overnight: %s OK, %s warnings, %s failed%s.', r_total, r_ok, r_warn, r_fail,
                            case when r_running > 0 then format(', %s still running', r_running) else '' end)];
    if r_list is not null then v_lines := v_lines || ('Failed:' || E'\n' || r_list); end if;
    v_sections := v_sections || jsonb_build_object('key', 'pipelines', 'title', 'Data and pipelines',
      'link', 'https://fixtureshark.com/data-health', 'lines', to_jsonb(v_lines));
  end if;
  v_head := v_head || case when r_fail = 0 then 'no failed runs'
                           else format('%s (%s still failing)', private.digest_n(r_fail, 'failed run'), coalesce(r_failing, 0)) end;

  -- ============================================================ football
  select count(*) into f_results from public.matches where created_at >= v_from and created_at < v_to;
  select string_agg(format('%s %s', name, n), ', ' order by n desc, name) into f_by_league
    from (select l.name, count(*) n from public.matches m join public.leagues l on l.league_id = m.league_id
           where m.created_at >= v_from and m.created_at < v_to group by 1 order by 2 desc, 1 limit 6) x;
  select string_agg(format('%s v %s: %s → %s', home_team_name, away_team_name,
                           to_char(was_date, 'Dy FMDD Mon') || coalesce(' ' || to_char(was_time, 'HH24:MI'), ''),
                           to_char(now_date, 'Dy FMDD Mon') || coalesce(' ' || to_char(now_time, 'HH24:MI'), '')
                           || case when status = 'postponed' then ' (postponed)' else '' end), E'\n' order by changed_at)
    into f_moved_list
    from (select * from public.fixture_changes_net where changed_at >= v_from and changed_at < v_to order by changed_at limit 5) x;
  select count(*) into f_moved from public.fixture_changes_net where changed_at >= v_from and changed_at < v_to;
  select count(*), sum(starters), sum(model_matched) into l_teams, l_starters, l_matched
    from public.social_lineup_checks where kickoff_time >= v_from and kickoff_time < v_to;
  if f_results + f_moved + l_teams > 0 then
    v_lines := '{}';
    if f_results > 0 then v_lines := v_lines || format('%s added: %s.', private.digest_n(f_results, 'result'), f_by_league); end if;
    if f_moved > 0 then v_lines := v_lines || (private.digest_n(f_moved, 'fixture') || ' moved:' || E'\n' || f_moved_list
                                            || case when f_moved > 5 then E'\n' || format('and %s more', f_moved - 5) else '' end); end if;
    if l_teams > 0 then
      v_lines := v_lines || format('Line-ups: %s teams; our model had %s of %s starters right (%s%%): https://fixtureshark.com/admin/team-sheets',
                                   l_teams, l_matched, l_starters, round(100.0 * l_matched / nullif(l_starters, 0)));
    end if;
    v_sections := v_sections || jsonb_build_object('key', 'football', 'title', 'Football',
      'link', case when f_moved > 0 then 'https://fixtureshark.com/fixtures/changes' else 'https://fixtureshark.com/results' end,
      'lines', to_jsonb(v_lines));
    if f_results > 0 then v_head := v_head || (private.digest_n(f_results, 'result') || ' in'); end if;
    if f_moved > 0 then v_head := v_head || (private.digest_n(f_moved, 'fixture') || ' moved'); end if;
  end if;

  -- ============================================================ FPL
  -- Price changes land about 01:30-02:30 UK and are recorded by the next
  -- FPL refresh (about 06:xx UK).
  with ch as (
    select p.web_name, ft.short_name, n.price_before, n.price_after, n.ownership, n.recorded_at
      from public.fpl_price_predictor_nights n
      join public.fpl_players p on p.season_id = n.season_id and p.fpl_player_id = n.fpl_player_id
      left join public.fpl_teams ft on ft.season_id = p.season_id and ft.fpl_team_id = p.fpl_team_id
     where n.season_id = v_season and n.recorded_at >= v_from and n.recorded_at < v_to and n.price_after <> n.price_before)
  select (select count(*) from ch where price_after > price_before),
         (select count(*) from ch where price_after < price_before),
         (select string_agg(format('%s (%s) £%sm, %s%%', web_name, short_name, round(price_after / 10.0, 1), round(ownership, 1)), '; ' order by ownership desc nulls last)
            from (select * from ch where price_after > price_before order by ownership desc nulls last limit 8) u),
         (select string_agg(format('%s (%s) £%sm, %s%%', web_name, short_name, round(price_after / 10.0, 1), round(ownership, 1)), '; ' order by ownership desc nulls last)
            from (select * from ch where price_after < price_before order by ownership desc nulls last limit 8) d),
         (select max(recorded_at) from ch)
    into v_up, v_down, v_up_list, v_down_list, v_price_at;
  select fpl_event_id, deadline_time into g_passed from public.fpl_gameweeks
   where season_id = v_season and deadline_time >= v_from and deadline_time < v_to order by deadline_time desc limit 1;
  if v_up + v_down > 0 or g_passed.fpl_event_id is not null then
    v_lines := '{}';
    if v_up > 0 then v_lines := v_lines || format('Risers (%s): %s.', v_up, v_up_list); end if;
    if v_down > 0 then v_lines := v_lines || format('Fallers (%s): %s.', v_down, v_down_list); end if;
    if v_up + v_down > 0 then
      v_lines := v_lines || format('Recorded at %s (UK); ownership is the share of FPL managers.', to_char(v_price_at at time zone 'Europe/London', hm));
    end if;
    if g_passed.fpl_event_id is not null then
      v_lines := v_lines || format('GW%s deadline passed at %s.', g_passed.fpl_event_id, to_char(g_passed.deadline_time at time zone 'Europe/London', 'Dy HH24:MI'));
    end if;
    v_sections := v_sections || jsonb_build_object('key', 'fpl', 'title', 'FPL',
      'link', 'https://fixtureshark.com/fpl/price-risk', 'lines', to_jsonb(v_lines));
  end if;
  v_head := v_head || case when v_up + v_down = 0 then 'no FPL price changes'
                           else format('%s (%s up, %s down)', private.digest_n(v_up + v_down, 'FPL price change'), v_up, v_down) end;

  -- ============================================================ changes shipped
  -- PRs merged in the window are added by social-notify (GitHub's API).
  select string_agg(regexp_replace(filename, '\.sql$', ''), E'\n' order by applied_at) into m_list
    from (select filename, applied_at from public.repo_migrations where applied_at >= v_from and applied_at < v_to order by applied_at limit 8) x;
  select count(*) into m_count from public.repo_migrations where applied_at >= v_from and applied_at < v_to;
  if m_count > 0 then
    v_sections := v_sections || jsonb_build_object('key', 'shipped', 'title', 'Changes shipped',
      'link', 'https://github.com/sharkey1982/football-data-webapp/pulls?q=is%3Apr+is%3Amerged',
      'lines', to_jsonb(array[private.digest_n(m_count, 'database migration') || ' applied:' || E'\n' || m_list]));
  end if;

  return jsonb_build_object(
    'edition', 'morning',
    'day', v_day,
    'from', v_from,
    'to', v_to,
    'window', v_window,
    'subject', 'FixtureShark overnight: ' || to_char(v_day, 'Dy FMDD Mon'),
    'headline', 'Overnight (' || v_window || '): ' || array_to_string(v_head, ' · ') || '.',
    'sections', v_sections);
end;
$$;
revoke all on function private.admin_overnight_digest(timestamptz, timestamptz) from public, anon, authenticated;

-- The generalised entry point. 'evening' keeps the end-of-day content and
-- window (00:00 London of p_from's date to send time); 'morning' takes any
-- window, null = the overnight window for today.
create or replace function private.admin_digest(p_from timestamptz, p_to timestamptz, p_edition text default 'evening')
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_from timestamptz := p_from; v_to timestamptz := p_to;
begin
  if p_edition = 'evening' then
    return private.admin_daily_digest(coalesce((p_from at time zone 'Europe/London')::date, (now() at time zone 'Europe/London')::date))
           || jsonb_build_object('edition', 'evening');
  elsif p_edition = 'morning' then
    if v_from is null or v_to is null then
      select coalesce(v_from, w.w_from), coalesce(v_to, w.w_to) into v_from, v_to
        from private.admin_morning_window((now() at time zone 'Europe/London')::date) w;
    end if;
    return private.admin_overnight_digest(v_from, v_to);
  end if;
  raise exception 'unknown edition %', p_edition;
end;
$$;
revoke all on function private.admin_digest(timestamptz, timestamptz, text) from public, anon, authenticated;

-- The content for one London date and edition.
create or replace function private.admin_digest_for_day(p_day date, p_edition text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_from timestamptz; v_to timestamptz;
begin
  if p_edition = 'morning' then
    select w.w_from, w.w_to into v_from, v_to from private.admin_morning_window(p_day) w;
    return private.admin_digest(v_from, v_to, 'morning');
  end if;
  return private.admin_digest((p_day::timestamp) at time zone 'Europe/London', ((p_day + 1)::timestamp) at time zone 'Europe/London', 'evening');
end;
$$;
revoke all on function private.admin_digest_for_day(date, text) from public, anon, authenticated;

-- ======================================================================= send
-- 'scheduled': at most once per London date and edition (the row is the
-- claim). 'preview': always, does not count.
drop function if exists private.admin_digest_send(date, text);
create or replace function private.admin_digest_send(p_day date, p_mode text default 'scheduled', p_edition text default 'evening')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_digest jsonb;
begin
  if p_mode not in ('scheduled', 'preview') then raise exception 'unknown mode %', p_mode; end if;
  if p_edition not in ('evening', 'morning') then raise exception 'unknown edition %', p_edition; end if;
  v_digest := private.admin_digest_for_day(p_day, p_edition);
  insert into private.admin_digest_sends (day, mode, edition, subject) values (p_day, p_mode, p_edition, v_digest->>'subject')
  on conflict (day, edition) where mode = 'scheduled' do nothing
  returning send_id into v_id;
  if v_id is null then return jsonb_build_object('status', 'already sent', 'day', p_day, 'edition', p_edition); end if;
  perform private.social_notify(jsonb_build_object('kind', 'daily_digest', 'send_id', v_id, 'mode', p_mode, 'edition', p_edition,
                                                   'day', p_day, 'digest', v_digest));
  return jsonb_build_object('status', 'queued', 'day', p_day, 'send_id', v_id, 'mode', p_mode, 'edition', p_edition);
end;
$$;
revoke all on function private.admin_digest_send(date, text, text) from public, anon, authenticated;

-- social-notify reports the outcome (service_role only). Morning sends log
-- their own job names so a missed morning send shows on its own.
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
  values (case when r.edition = 'morning' then 'admin-morning-digest' else 'admin-daily-digest' end
          || case when r.mode = 'scheduled' then '' else '-preview' end,
          r.queued_at, now(), case when p_ok then 'success' else 'failed' end,
          format('%s (%s)', r.subject, r.mode), case when not p_ok then left(p_note, 500) end);
end;
$$;
revoke all on function public.admin_digest_finish(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_digest_finish(bigint, boolean, text) to service_role;

-- ================================================================= admin page
-- Optional edition; /admin/email calls these without it (evening).
drop function if exists public.admin_digest_get(date);
create or replace function public.admin_digest_get(p_day date default null, p_edition text default 'evening')
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_edition not in ('evening', 'morning') then raise exception 'unknown edition %', p_edition; end if;
  return private.admin_digest_for_day(coalesce(p_day, (now() at time zone 'Europe/London')::date), p_edition)
    || jsonb_build_object('sends', coalesce((
         select jsonb_agg(to_jsonb(s) order by s.queued_at desc)
           from (select * from private.admin_digest_sends order by queued_at desc limit 10) s), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_digest_get(date, text) from public, anon;
grant execute on function public.admin_digest_get(date, text) to authenticated;

drop function if exists public.admin_digest_send_now();
create or replace function public.admin_digest_send_now(p_edition text default 'evening')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return private.admin_digest_send((now() at time zone 'Europe/London')::date, 'preview', p_edition);
end;
$$;
revoke all on function public.admin_digest_send_now(text) from public, anon;
grant execute on function public.admin_digest_send_now(text) to authenticated;

-- =================================================================== schedule
-- X read scope 'overnight' (x-metrics: posts from the last 12 hours, first
-- post of each thread).
create or replace function private.social_metrics_call(p_scope text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_scope not in ('daily', 'weekly', 'overnight') then raise exception 'unknown scope %', p_scope; end if;
  perform net.http_post(
    url := 'https://ppzfmpbnojyjeblelsuz.supabase.co/functions/v1/x-metrics',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-social-token', (select token from private.social_worker)),
    body := jsonb_build_object('triggered_by', 'schedule', 'scope', p_scope), timeout_milliseconds := 60000);
end;
$$;
revoke all on function private.social_metrics_call(text) from public, anon, authenticated;

-- 07:20 UK: fresh X figures for overnight posts, and Cloudflare up to now
-- when the 07:12 UTC import has not run yet in UK time (BST).
create or replace function private.admin_morning_prep_tick()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cf boolean;
begin
  if extract(hour from now() at time zone 'Europe/London') <> 7 then return jsonb_build_object('status', 'not due'); end if;
  perform private.social_metrics_call('overnight');
  v_cf := not exists (select 1 from cf.import_runs
                       where started_at >= ((now() at time zone 'Europe/London')::date + time '07:00')::timestamp at time zone 'Europe/London');
  if v_cf then perform private.cf_import_call('auto'); end if;
  return jsonb_build_object('status', 'called', 'x', true, 'cloudflare', v_cf);
end;
$$;
revoke all on function private.admin_morning_prep_tick() from public, anon, authenticated;

create or replace function private.admin_morning_digest_tick()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if extract(hour from now() at time zone 'Europe/London') <> 7 then return jsonb_build_object('status', 'not due'); end if;
  return private.admin_digest_send((now() at time zone 'Europe/London')::date, 'scheduled', 'morning');
end;
$$;
revoke all on function private.admin_morning_digest_tick() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'admin-morning-prep-tick') then
    perform cron.schedule('admin-morning-prep-tick', '20 6,7 * * *', 'select private.admin_morning_prep_tick()');
  end if;
  if not exists (select 1 from cron.job where jobname = 'admin-morning-digest-tick') then
    perform cron.schedule('admin-morning-digest-tick', '30 6,7 * * *', 'select private.admin_morning_digest_tick()');
  end if;
end $$;

insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, upstream, notes)
values
  ('admin-morning-prep-tick', 'email', 'supabase_cron', '20 6,7 * * *', interval '26 hours', interval '00:05:00', 'pg_cron', '^admin-morning-prep-tick$', 'api.x.com',
   'Minute 20 of 06:00 and 07:00 UTC: private.admin_morning_prep_tick(); at 07:20 UK reads X figures for posts from the last 12 hours (~$0.05 a month) and runs a Cloudflare import if none since 07:00 UK, before the overnight email'),
  ('admin-morning-digest-tick', 'email', 'supabase_cron', '30 6,7 * * *', interval '26 hours', interval '00:05:00', 'pg_cron', '^admin-morning-digest-tick$', null,
   'Minute 30 of 06:00 and 07:00 UTC: private.admin_morning_digest_tick(); sends the admin overnight email only when the London hour is 7 (07:30 UK)'),
  ('admin-morning-digest', 'email', 'edge_function', 'daily 07:30 Europe/London', interval '26 hours', interval '00:15:00', 'pipeline_runs', '^admin-morning-digest$', 'api.resend.com',
   'The admin overnight update email (social-notify kind daily_digest, edition morning), one per London date (private.admin_digest_sends); logged by public.admin_digest_finish. Stale = a missed send'),
  ('admin-morning-digest-preview', 'email', 'edge_function', 'manual', null, interval '00:15:00', 'pipeline_runs', '^admin-morning-digest-preview$', 'api.resend.com',
   'Previews of the admin overnight email (select private.admin_digest_send(current_date, ''preview'', ''morning'')); not scheduled and do not count')
on conflict (job_key) do nothing;

-- ================================================================= first run
-- Fresh X figures for overnight posts and a Cloudflare import now, then a
-- "[Preview]" of today's overnight email once both have reported (or after
-- 10 minutes); the job then removes itself.
select private.social_metrics_call('overnight');
select private.cf_import_call('auto');

create or replace function private.admin_morning_preview_once(p_since timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not ((exists (select 1 from cf.import_runs where started_at >= p_since - interval '1 minute')
           and exists (select 1 from public.social_metrics_runs where started_at >= p_since - interval '1 minute' and finished_at is not null))
          or now() >= p_since + interval '10 minutes') then
    return jsonb_build_object('status', 'waiting');
  end if;
  perform cron.unschedule('admin-morning-preview-once');
  return private.admin_digest_send((now() at time zone 'Europe/London')::date, 'preview', 'morning');
end;
$$;
revoke all on function private.admin_morning_preview_once(timestamptz) from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'admin-morning-preview-once')
     and not exists (select 1 from private.admin_digest_sends where edition = 'morning') then
    perform cron.schedule('admin-morning-preview-once', '* * * * *', format('select private.admin_morning_preview_once(%L)', now()));
  end if;
end $$;
