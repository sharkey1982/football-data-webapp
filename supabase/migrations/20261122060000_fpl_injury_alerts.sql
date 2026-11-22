-- ============================================================================
-- FPL injury alerts (Chris, 22 Nov 2026: "Go with recommendations" on the
-- email plan: lead with injury alerts; approves the 15-minute alerts).
--
-- Every 15 minutes the database reads FPL's bootstrap-static (one request)
-- and compares each player's status, chance of playing and news with the
-- last read (private.fpl_status_state). Each difference is logged in
-- private.fpl_status_changes, and the same fields are refreshed on
-- public.fpl_players so the site shows a new flag within 15 minutes instead
-- of at the next 6-hourly refresh.
--
-- New changes then:
--   1. email: email-weekly runs in mode "alerts" (public.email_alert_batch):
--      one email per confirmed subscriber with the "alerts" topic whose FPL
--      team (picks at the last deadline) or watchlist holds a changed player.
--      At most 6 alert emails per subscriber per 24 hours; changes older
--      than 6 hours are never emailed (e.g. after sending was off).
--   2. X: a new flag (doubtful, injured, suspended, unavailable, or a lower
--      chance) on a player owned by 15%+ of managers queues a factual post
--      in FPL's own words, auto, held for the usual 60 minutes so Chris can
--      stop it; at most 2 a day, inside posting hours and the daily limit.
--
-- The first run only records the current state (nothing to compare with).
-- Safe to re-run: if not exists, create or replace, on conflict.
-- ============================================================================

-- ---------------------------------------------------------------- tables
create table if not exists private.fpl_status_state (
  season_id bigint not null,
  fpl_player_id integer not null,
  status text,
  chance integer,
  news text not null default '',
  news_added timestamptz,
  read_at timestamptz not null default now(),
  primary key (season_id, fpl_player_id)
);
alter table private.fpl_status_state enable row level security;
revoke all on private.fpl_status_state from public, anon, authenticated;

create table if not exists private.fpl_status_changes (
  change_id bigint generated always as identity primary key,
  season_id bigint not null,
  fpl_player_id integer not null,
  old_status text, new_status text,
  old_chance integer, new_chance integer,
  old_news text, new_news text,
  news_added timestamptz,
  seen_at timestamptz not null default now(),
  alerted_at timestamptz,           -- claimed by an alerts send (or skipped as too old)
  posted boolean not null default false
);
create index if not exists fpl_status_changes_open on private.fpl_status_changes (seen_at) where alerted_at is null;
alter table private.fpl_status_changes enable row level security;
revoke all on private.fpl_status_changes from public, anon, authenticated;
comment on table private.fpl_status_changes is 'FPL status/chance/news changes seen by the 15-minute read (private.fpl_status_tick). Feeds injury alert emails and X flag posts. Kept 60 days.';

-- One row per alert email (counts only, for the per-subscriber cap).
create table if not exists private.email_alert_log (
  subscriber_id bigint not null references private.email_subscribers (subscriber_id) on delete cascade,
  sent_at timestamptz not null default now(),
  changes integer not null
);
create index if not exists email_alert_log_sub on private.email_alert_log (subscriber_id, sent_at);
alter table private.email_alert_log enable row level security;
revoke all on private.email_alert_log from public, anon, authenticated;

alter table private.email_sends drop constraint if exists email_sends_kind_check;
alter table private.email_sends add constraint email_sends_kind_check check (kind in ('weekly', 'test', 'alerts'));

comment on table private.email_subscribers is 'FPL email list. topics: fpl (the weekly email, always), alerts (injury alerts for the FPL team and watchlist), football_market (optional section). Optional fpl_entry_id, club_team_id and watchlist (FPL player ids) personalise it. See /privacy.';

-- The owner's own address gets alerts (it is the admin address; he asked for them).
update private.email_subscribers set topics = topics || array['alerts'], updated_at = now()
 where email = private.email_admin_address() and not ('alerts' = any (topics));

-- ---------------------------------------------------------------- sign-up and manage
-- email_signup gains p_alerts (default on) and p_watch; the old signature
-- is dropped so supabase-js named calls stay unambiguous.
drop function if exists public.email_signup(text, boolean, text, bigint, bigint);
create or replace function public.email_signup(p_email text, p_football boolean, p_ip text,
                                               p_fpl_id bigint default null, p_club bigint default null,
                                               p_alerts boolean default true, p_watch integer[] default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fpl bigint := case when p_fpl_id between 1 and 99999999 then p_fpl_id end;
  v_club bigint := (select team_id from public.teams where team_id = p_club);
  v_watch integer[] := coalesce((select array_agg(distinct p.fpl_player_id::int)
                                   from public.fpl_players p
                                  where p.season_id = public.fpl_current_season_id() and p.fpl_player_id = any (p_watch[1:20])), '{}');
  e text := lower(trim(coalesce(p_email, '')));
  v_salt text := (select salt from private.email_settings where id);
  v_ip text; v_eh text; n_ip_h integer; n_ip_d integer; n_em integer; n_all integer;
  s private.email_subscribers;
  v_topics text[] := array['fpl'] || case when coalesce(p_alerts, true) then array['alerts'] else '{}'::text[] end
                                  || case when p_football then array['football_market'] else '{}'::text[] end;
  v_tok text;
begin
  if length(e) > 254 or e !~ '^[^@\s<>,;"]+@[^@\s<>,;"]+\.[a-z]{2,}$' then
    return jsonb_build_object('action', 'invalid');
  end if;
  v_ip := case when coalesce(p_ip, '') <> '' then private.email_hash(v_salt || ':ip:' || p_ip) end;
  v_eh := private.email_hash(v_salt || ':em:' || e);

  select count(*) filter (where created_at > now() - interval '1 hour'), count(*) into n_ip_h, n_ip_d
    from private.email_signup_attempts where v_ip is not null and ip_hash = v_ip and created_at > now() - interval '24 hours';
  select count(*) into n_em from private.email_signup_attempts
   where email_hash = v_eh and created_at > now() - interval '24 hours' and outcome like 'sent%';
  select count(*) into n_all from private.email_signup_attempts
   where created_at > now() - interval '24 hours' and outcome like 'sent%';

  if n_ip_h >= 5 or n_ip_d >= 20 or n_em >= 3 or n_all >= 40 then
    insert into private.email_signup_attempts (ip_hash, email_hash, outcome)
    values (v_ip, v_eh, case when n_em >= 3 then 'rate_email' when n_all >= 40 then 'rate_global' else 'rate_ip' end);
    return jsonb_build_object('action', 'none', 'reason', 'rate limited');
  end if;

  select * into s from private.email_subscribers where email = e for update;
  if s.subscriber_id is not null and s.status = 'confirmed' then
    insert into private.email_signup_attempts (ip_hash, email_hash, outcome) values (v_ip, v_eh, 'sent_already');
    return jsonb_build_object('action', 'already', 'email', e,
                              'token', private.email_new_token(s.subscriber_id, 'manage', null));
  end if;

  if s.subscriber_id is null then
    insert into private.email_subscribers (email, status, topics, fpl_entry_id, club_team_id, watchlist, consent_version, confirm_sent_at)
    values (e, 'pending', v_topics, v_fpl, v_club, v_watch, 'fpl-weekly-v2', now())
    returning * into s;
  else
    update private.email_subscribers
       set status = 'pending', topics = v_topics, fpl_entry_id = v_fpl, club_team_id = v_club, watchlist = v_watch,
           consent_version = 'fpl-weekly-v2', confirm_sent_at = now(),
           confirmed_at = null, unsubscribed_at = null, updated_at = now()
     where subscriber_id = s.subscriber_id;
    delete from private.email_tokens where subscriber_id = s.subscriber_id and purpose = 'confirm';
  end if;
  v_tok := private.email_new_token(s.subscriber_id, 'confirm', interval '7 days');
  insert into private.email_signup_attempts (ip_hash, email_hash, outcome) values (v_ip, v_eh, 'sent_confirm');
  return jsonb_build_object('action', 'confirm', 'email', e, 'token', v_tok, 'football', coalesce(p_football, false),
                            'alerts', 'alerts' = any (v_topics), 'fpl_id', v_fpl);
end;
$$;
revoke all on function public.email_signup(text, boolean, text, bigint, bigint, boolean, integer[]) from public, anon, authenticated;
grant execute on function public.email_signup(text, boolean, text, bigint, bigint, boolean, integer[]) to service_role;

-- email_manage: adds the "alerts" key (boolean) to what can be read and changed.
create or replace function public.email_manage(p_token text, p_changes jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint := private.email_token_owner(p_token, array['manage']); s private.email_subscribers; v_fpl bigint; v_club bigint;
begin
  if v_id is null then return jsonb_build_object('state', 'invalid'); end if;
  select * into s from private.email_subscribers where subscriber_id = v_id for update;
  if s.status <> 'confirmed' then return jsonb_build_object('state', s.status); end if;
  if p_changes is not null and jsonb_typeof(p_changes) = 'object' then
    if p_changes ? 'football' and jsonb_typeof(p_changes->'football') = 'boolean' then
      s.topics := array_remove(s.topics, 'football_market')
                  || case when (p_changes->>'football')::boolean then array['football_market'] else '{}'::text[] end;
    end if;
    if p_changes ? 'alerts' and jsonb_typeof(p_changes->'alerts') = 'boolean' then
      s.topics := array_remove(s.topics, 'alerts')
                  || case when (p_changes->>'alerts')::boolean then array['alerts'] else '{}'::text[] end;
    end if;
    if p_changes ? 'fpl_id' then
      v_fpl := case when jsonb_typeof(p_changes->'fpl_id') = 'number' and (p_changes->>'fpl_id')::numeric between 1 and 99999999
                    then (p_changes->>'fpl_id')::numeric::bigint end;
      s.fpl_entry_id := v_fpl;
    end if;
    if p_changes ? 'watchlist' then
      s.watchlist := coalesce((select array_agg(x.id order by x.ord)
                                 from (select distinct on (e::int) e::int id, ord
                                         from jsonb_array_elements_text(case when jsonb_typeof(p_changes->'watchlist') = 'array'
                                                                             then p_changes->'watchlist' else '[]' end) with ordinality t(e, ord)
                                        where e ~ '^\d{1,6}$'
                                        order by e::int, ord) x
                                 join public.fpl_players p on p.season_id = public.fpl_current_season_id() and p.fpl_player_id = x.id
                                where x.ord <= 20), '{}');
    end if;
    if p_changes ? 'club_id' then
      v_club := case when jsonb_typeof(p_changes->'club_id') = 'number'
                     then (select team_id from public.teams where team_id = (p_changes->>'club_id')::numeric::bigint) end;
      s.club_team_id := v_club;
    end if;
    update private.email_subscribers
       set topics = s.topics, fpl_entry_id = s.fpl_entry_id, club_team_id = s.club_team_id, watchlist = s.watchlist, updated_at = now()
     where subscriber_id = v_id;
  end if;
  return jsonb_build_object('state', 'ok', 'football', 'football_market' = any (s.topics), 'alerts', 'alerts' = any (s.topics),
                            'fpl_id', s.fpl_entry_id,
                            'club', (select jsonb_build_object('id', t.team_id, 'name', coalesce(t.display_name, t.canonical_name))
                                       from public.teams t where t.team_id = s.club_team_id),
                            'watchlist', (select coalesce(jsonb_agg(jsonb_build_object('id', p.fpl_player_id, 'name', p.web_name, 'team', ft.short_name,
                                                                                        'pos', case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' end,
                                                                                        'price', round(p.now_cost / 10.0, 1))
                                                                     order by array_position(s.watchlist, p.fpl_player_id::int)), '[]')
                                            from public.fpl_players p
                                            left join public.fpl_teams ft on ft.season_id = p.season_id and ft.fpl_team_id = p.fpl_team_id
                                           where p.season_id = public.fpl_current_season_id() and p.fpl_player_id = any (s.watchlist)));
end;
$$;

-- ---------------------------------------------------------------- the 15-minute read
create or replace function private.fpl_status_tick()
returns jsonb language plpgsql security definer set search_path = public, pg_temp set statement_timeout = '60s' as $$
declare
  v_season bigint := public.fpl_current_season_id();
  st integer; body text; j jsonb; v_seeded boolean; n_changes integer := 0; n_updated integer := 0; n_posts integer := 0;
  r record; v_text text; v_key text; v_hold integer;
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

  -- Changes nobody was emailed within 6 hours are closed off.
  update private.fpl_status_changes set alerted_at = now() where alerted_at is null and seen_at < now() - interval '6 hours';
  delete from private.fpl_status_changes where seen_at < now() - interval '60 days';
  delete from private.email_alert_log where sent_at < now() - interval '30 days';

  if exists (select 1 from private.fpl_status_changes where alerted_at is null)
     and exists (select 1 from private.email_subscribers where status = 'confirmed' and 'alerts' = any (topics)) then
    perform private.email_invoke(jsonb_build_object('mode', 'alerts'));
  end if;

  return jsonb_build_object('status', case when v_seeded then 'ok' else 'seeded' end, 'changes', n_changes,
                            'players_updated', n_updated, 'x_posts', n_posts);
end;
$$;
revoke all on function private.fpl_status_tick() from public, anon, authenticated;

-- ---------------------------------------------------------------- the alerts send
-- Claims the open changes and returns, per subscriber with the alerts
-- topic, the changes to players in their FPL team (picks at the last
-- deadline) or watchlist, with a fresh manage token. Changes are claimed
-- even when nobody watches them, so each is considered once.
create or replace function public.email_alert_batch()
returns table (subscriber_id bigint, email text, token text, changes jsonb)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v_season bigint := public.fpl_current_season_id(); v_pick_gw integer; v_ids bigint[];
begin
  with c as (
    update private.fpl_status_changes set alerted_at = now()
     where alerted_at is null and seen_at > now() - interval '6 hours'
    returning change_id)
  select array_agg(change_id) into v_ids from c;
  if v_ids is null then return; end if;
  select fpl_event_id into v_pick_gw from public.fpl_gameweeks
   where season_id = v_season and deadline_time < now() order by deadline_time desc limit 1;

  return query
  with subs as (
    select s.subscriber_id, s.email,
           s.watchlist || coalesce(case when s.fpl_entry_id is not null then private.email_fpl_picks_for(s.fpl_entry_id, v_season, v_pick_gw) end, '{}') watch,
           s.fpl_entry_id
      from private.email_subscribers s
     where s.status = 'confirmed' and 'alerts' = any (s.topics)
       and (select count(*) from private.email_alert_log l where l.subscriber_id = s.subscriber_id and l.sent_at > now() - interval '24 hours') < 6
  ),
  hits as (
    select su.subscriber_id, su.email,
           jsonb_agg(jsonb_build_object(
             'id', c.fpl_player_id, 'name', p.web_name, 'team', ft.short_name, 'slug', p.slug,
             'pos', case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' end,
             'price', round(p.now_cost / 10.0, 1), 'own', p.selected_by_percent,
             'old_status', c.old_status, 'new_status', c.new_status, 'old_chance', c.old_chance, 'new_chance', c.new_chance,
             'old_news', c.old_news, 'new_news', c.new_news, 'seen_at', c.seen_at,
             'source', case when c.fpl_player_id = any (s0.watchlist) then 'watchlist' else 'team' end)
             order by (c.new_status <> 'a') desc, p.selected_by_percent desc nulls last) changes
      from subs su
      join private.email_subscribers s0 on s0.subscriber_id = su.subscriber_id
      join private.fpl_status_changes c on c.change_id = any (v_ids) and c.fpl_player_id = any (su.watch)
      join public.fpl_players p on p.season_id = c.season_id and p.fpl_player_id = c.fpl_player_id
      left join public.fpl_teams ft on ft.season_id = p.season_id and ft.fpl_team_id = p.fpl_team_id
     group by su.subscriber_id, su.email
  )
  select h.subscriber_id, h.email, private.email_new_token(h.subscriber_id, 'manage', null), h.changes from hits h;
end;
$$;
revoke all on function public.email_alert_batch() from public, anon, authenticated;
grant execute on function public.email_alert_batch() to service_role;

-- Records one alert email per subscriber (the cap) and opens/closes the send log.
create or replace function public.email_alert_sent(p_subscribers bigint[], p_counts integer[])
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into private.email_alert_log (subscriber_id, changes)
  select s, c from unnest(p_subscribers, p_counts) as u(s, c) where s is not null;
$$;
revoke all on function public.email_alert_sent(bigint[], integer[]) from public, anon, authenticated;
grant execute on function public.email_alert_sent(bigint[], integer[]) to service_role;

create or replace function public.email_begin_alerts(p_subject text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_send bigint; v_run bigint;
begin
  insert into private.email_sends (kind, subject) values ('alerts', p_subject) returning send_id into v_send;
  insert into public.pipeline_runs (job_name, started_at, status, summary)
  values ('email-alerts', now(), 'running', 'injury alerts send started') returning run_id into v_run;
  update private.email_sends set pipeline_run_id = v_run where send_id = v_send;
  return jsonb_build_object('send_id', v_send);
end;
$$;
revoke all on function public.email_begin_alerts(text) from public, anon, authenticated;
grant execute on function public.email_begin_alerts(text) to service_role;

-- ---------------------------------------------------------------- admin: counts
create or replace function public.get_email_alerts_admin()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  return jsonb_build_object(
    'subscribers_with_alerts', (select count(*) from private.email_subscribers where status = 'confirmed' and 'alerts' = any (topics)),
    'changes_24h', (select count(*) from private.fpl_status_changes where seen_at > now() - interval '24 hours'),
    'alert_emails_24h', (select count(*) from private.email_alert_log where sent_at > now() - interval '24 hours'),
    'last_read', (select max(read_at) from private.fpl_status_state));
end;
$$;
revoke all on function public.get_email_alerts_admin() from public, anon;
grant execute on function public.get_email_alerts_admin() to authenticated;

-- ---------------------------------------------------------------- schedule
select cron.unschedule(jobid) from cron.job where jobname = 'fpl-status-tick';
select cron.schedule('fpl-status-tick', '*/15 * * * *', 'select private.fpl_status_tick()');
