-- ============================================================================
-- Injury alerts: from every 15 minutes to once before each deadline
-- (Chris, 22 Nov 2026 07:50: "Injury alerts every 15 minutes is unnecessary.
-- Once per week as part of a weekly email is fine and any last minute injury
-- news at least 6 hours before the deadline").
--
-- Now:
--   * The weekly email (unchanged) already lists flagged players in "Your team".
--   * Late injury news: 6 hours before each deadline, one email per subscriber
--     with the alerts topic, only if FPL changed the status, chance or news of
--     a player in their team or watchlist since the weekly email went out
--     (the net change per player: first "before", last "now"). Nothing to
--     report, no email. Once per gameweek (email_sends issue_key
--     fpl-late:<season>:<gw>).
--   * The 15-minute read of FPL stays: it keeps the site's flags fresh and
--     queues the X flag posts. It no longer sends emails as it goes.
-- Safe to re-run: create or replace.
-- ============================================================================

create or replace function private.fpl_status_tick()
returns jsonb language plpgsql security definer set search_path = public, pg_temp set statement_timeout = '60s' as $$
declare
  v_season bigint := public.fpl_current_season_id();
  st integer; body text; j jsonb; v_seeded boolean; n_changes integer := 0; n_updated integer := 0; n_posts integer := 0;
  r record; v_text text; v_key text; v_hold integer; v_gw integer;
begin
  if not pg_try_advisory_xact_lock(hashtext('fpl_status_tick')) then return jsonb_build_object('status', 'busy'); end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');
  select status, content into st, body from extensions.http_get('https://fantasy.premierleague.com/api/bootstrap-static/');
  if st is distinct from 200 then return jsonb_build_object('status', 'fpl http ' || coalesce(st::text, 'none')); end if;
  j := body::jsonb;
  if jsonb_array_length(coalesce(j->'elements', '[]')) < 300 then return jsonb_build_object('status', 'fpl feed too short'); end if;

  create temp table if not exists _fpl_now (id integer primary key, status text, chance integer, news text, news_added timestamptz) on commit drop;
  truncate _fpl_now;
  insert into _fpl_now
  select (x->>'id')::int, x->>'status', (x->>'chance_of_playing_next_round')::int, coalesce(x->>'news', ''), (x->>'news_added')::timestamptz
    from jsonb_array_elements(j->'elements') x;

  v_seeded := exists (select 1 from private.fpl_status_state where season_id = v_season);
  if v_seeded then
    insert into private.fpl_status_changes (season_id, fpl_player_id, old_status, new_status, old_chance, new_chance, old_news, new_news, news_added)
    select v_season, n.id, s.status, n.status, s.chance, n.chance, s.news, n.news, n.news_added
      from _fpl_now n join private.fpl_status_state s on s.season_id = v_season and s.fpl_player_id = n.id
     where s.status is distinct from n.status or s.chance is distinct from n.chance or s.news is distinct from n.news;
    get diagnostics n_changes = row_count;
  end if;

  insert into private.fpl_status_state (season_id, fpl_player_id, status, chance, news, news_added, read_at)
  select v_season, id, status, chance, news, news_added, now() from _fpl_now
  on conflict (season_id, fpl_player_id) do update
     set status = excluded.status, chance = excluded.chance, news = excluded.news, news_added = excluded.news_added, read_at = now();

  -- The site shows the new flag now rather than at the next 6-hourly refresh.
  update public.fpl_players p
     set status = n.status, chance_of_playing_next_round = n.chance, news = n.news, news_added = n.news_added
    from _fpl_now n
   where p.season_id = v_season and p.fpl_player_id = n.id
     and (p.status is distinct from n.status or p.chance_of_playing_next_round is distinct from n.chance or p.news is distinct from n.news);
  get diagnostics n_updated = row_count;

  -- X: a new flag on a player owned by 15%+ (FPL's own words; no claim beyond them).
  v_hold := coalesce((select hold_minutes from public.social_settings), 60);
  for r in
    select c.change_id, c.fpl_player_id, c.new_status, c.new_chance, c.new_news, c.news_added, p.web_name, ft.name team_name, p.selected_by_percent own,
           p.element_type, round(p.now_cost / 10.0, 1) price
      from private.fpl_status_changes c
      join public.fpl_players p on p.season_id = c.season_id and p.fpl_player_id = c.fpl_player_id
      left join public.fpl_teams ft on ft.season_id = p.season_id and ft.fpl_team_id = p.fpl_team_id
     where c.season_id = v_season and not c.posted and c.seen_at > now() - interval '30 minutes'
       and c.new_status in ('d', 'i', 's', 'u') and coalesce(c.new_news, '') <> ''
       and (c.old_status = 'a' or coalesce(c.new_chance, 0) < coalesce(c.old_chance, 100))
       and p.selected_by_percent >= 15
     order by p.selected_by_percent desc
  loop
    exit when (select count(*) from public.social_post_candidates
                where dedupe_key like 'fpl-flag:%' and created_at > now() - interval '24 hours') >= 2;
    v_text := format(E'FPL flag: %s (%s, %s%% owned) is now listed as "%s".\n\nAdded by FPL at %s UK time.',
                     r.web_name, coalesce(r.team_name, 'unknown club'), trim(to_char(r.own, 'FM990.0')), r.new_news,
                     to_char(coalesce(r.news_added, now()) at time zone 'Europe/London', 'HH24:MI on Dy DD Mon'));
    v_key := format('fpl-flag:%s:%s:%s:%s', r.fpl_player_id, r.new_status, coalesce(r.new_chance::text, 'x'), (now() at time zone 'Europe/London')::date);
    insert into public.social_post_candidates
      (post_type, text, generated_text, source_data, snapshot_at, dedupe_key, expires_at,
       validation_status, validation_errors, approval_status, approved_at, auto, hold_until)
    select 'fact', v_text, v_text,
           jsonb_build_object('kind', 'fpl_flag', 'season_id', v_season, 'fpl_player_id', r.fpl_player_id, 'status', r.new_status,
                              'chance', r.new_chance, 'news', r.new_news, 'own', r.own, 'price', r.price, 'change_id', r.change_id),
           now(), v_key, now() + interval '12 hours', 'passed', '[]', 'approved', now(), true, now() + make_interval(mins => v_hold)
     where not exists (select 1 from public.social_post_candidates x where x.dedupe_key = v_key);
    if found then n_posts := n_posts + 1; end if;
    update private.fpl_status_changes set posted = true where change_id = r.change_id;
  end loop;

  delete from private.fpl_status_changes where seen_at < now() - interval '60 days';
  delete from private.email_alert_log where sent_at < now() - interval '30 days';

  -- Late injury news: once per gameweek, from 6 hours before the deadline
  -- (until 2 hours before). public.email_alert_batch opens the send once
  -- (issue_key fpl-late:<season>:<gw>), so later ticks do nothing.
  select g.fpl_event_id into v_gw from public.fpl_gameweeks g
   where g.season_id = v_season and now() >= g.deadline_time - interval '6 hours' and now() < g.deadline_time - interval '2 hours'
   order by g.deadline_time limit 1;
  if v_gw is not null
     and not exists (select 1 from private.email_sends where issue_key = format('fpl-late:%s:%s', v_season, v_gw))
     and exists (select 1 from private.email_subscribers where status = 'confirmed' and 'alerts' = any (topics)) then
    perform private.email_invoke(jsonb_build_object('mode', 'alerts'));
  end if;

  return jsonb_build_object('status', case when v_seeded then 'ok' else 'seeded' end, 'changes', n_changes,
                            'players_updated', n_updated, 'x_posts', n_posts);
end;
$$;

drop function if exists public.email_alert_batch();
create or replace function public.email_alert_batch()
returns table (send_id bigint, gw integer, deadline timestamptz, subscriber_id bigint, email text, token text, changes jsonb)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_season bigint := public.fpl_current_season_id(); v_gw integer; v_deadline timestamptz; v_since timestamptz;
  v_pick_gw integer; v_send bigint; v_key text; n integer;
begin
  select g.fpl_event_id, g.deadline_time into v_gw, v_deadline from public.fpl_gameweeks g
   where g.season_id = v_season and now() >= g.deadline_time - interval '6 hours' and now() < g.deadline_time - interval '2 hours'
   order by g.deadline_time limit 1;
  if v_gw is null then return; end if;
  v_key := format('fpl-late:%s:%s', v_season, v_gw);
  insert into private.email_sends (kind, issue_key, season_id, fpl_event_id, subject)
  values ('alerts', v_key, v_season, v_gw, format('Late FPL news before the GW%s deadline', v_gw))
  on conflict (issue_key) do nothing
  returning private.email_sends.send_id into v_send;
  if v_send is null then return; end if;   -- already sent (or being sent) for this gameweek

  -- Since the weekly email for this gameweek went out (or 36 hours before the deadline).
  v_since := coalesce((select started_at from private.email_sends where issue_key = format('fpl-weekly:%s:%s', v_season, v_gw)),
                      v_deadline - interval '36 hours');
  select fpl_event_id into v_pick_gw from public.fpl_gameweeks
   where season_id = v_season and deadline_time < now() order by deadline_time desc limit 1;

  create temp table if not exists _late (fpl_player_id integer primary key, old_status text, new_status text,
                                         old_chance integer, new_chance integer, old_news text, new_news text, seen_at timestamptz) on commit drop;
  truncate _late;
  insert into _late
  select distinct on (c.fpl_player_id) c.fpl_player_id,
         first_value(c.old_status) over w, c.new_status, first_value(c.old_chance) over w, c.new_chance,
         first_value(c.old_news) over w, c.new_news, c.seen_at
    from private.fpl_status_changes c
   where c.season_id = v_season and c.seen_at >= v_since
  window w as (partition by c.fpl_player_id order by c.seen_at rows between unbounded preceding and unbounded following)
   order by c.fpl_player_id, c.seen_at desc;
  -- Net change only: a flag added and lifted again since the weekly email is no news.
  delete from _late l where l.old_status is not distinct from l.new_status and l.old_chance is not distinct from l.new_chance
                        and coalesce(l.old_news, '') = coalesce(l.new_news, '');

  return query
  with subs as (
    select s.subscriber_id, s.email, s.watchlist,
           s.watchlist || coalesce(case when s.fpl_entry_id is not null then private.email_fpl_picks_for(s.fpl_entry_id, v_season, v_pick_gw) end, '{}') watch
      from private.email_subscribers s
     where s.status = 'confirmed' and 'alerts' = any (s.topics)
  ),
  hits as (
    select su.subscriber_id, su.email,
           jsonb_agg(jsonb_build_object(
             'id', l.fpl_player_id, 'name', p.web_name, 'team', ft.short_name, 'slug', p.slug,
             'pos', case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' end,
             'price', round(p.now_cost / 10.0, 1), 'own', p.selected_by_percent,
             'old_status', l.old_status, 'new_status', l.new_status, 'old_chance', l.old_chance, 'new_chance', l.new_chance,
             'old_news', l.old_news, 'new_news', l.new_news, 'seen_at', l.seen_at,
             'source', case when l.fpl_player_id = any (su.watchlist) then 'watchlist' else 'team' end)
             order by (l.new_status <> 'a') desc, p.selected_by_percent desc nulls last) changes
      from subs su
      join _late l on l.fpl_player_id = any (su.watch)
      join public.fpl_players p on p.season_id = v_season and p.fpl_player_id = l.fpl_player_id
      left join public.fpl_teams ft on ft.season_id = p.season_id and ft.fpl_team_id = p.fpl_team_id
     group by su.subscriber_id, su.email
  )
  select v_send, v_gw, v_deadline, h.subscriber_id, h.email, private.email_new_token(h.subscriber_id, 'manage', null), h.changes from hits h;

  get diagnostics n = row_count;
  if n = 0 then
    update private.email_sends set status = 'skipped', finished_at = now(), recipients = 0, note = 'no late news for any subscriber'
     where private.email_sends.send_id = v_send;
  end if;
end;
$$;
revoke all on function public.email_alert_batch() from public, anon, authenticated;
grant execute on function public.email_alert_batch() to service_role;

comment on table private.email_subscribers is 'FPL email list. topics: fpl (the weekly email, always), alerts (late injury news 6 hours before each deadline for the FPL team and watchlist), football_market (optional section). Optional fpl_entry_id, club_team_id and watchlist (FPL player ids) personalise it. See /privacy.';
