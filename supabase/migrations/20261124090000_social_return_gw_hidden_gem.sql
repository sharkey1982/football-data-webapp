-- ============================================================================
-- Chris, 24 Nov 2026:
--   "On the injury / suspension posts - where you have return date it would
--    be useful to translate that into GW#."
--   "Mid week should be a good time to post items about hidden gems ...
--    under owned who are scoring well and about to enter a good run of
--    fixtures. It can pair well with a similar priced player who is either
--    becoming unavailable, reducing playing time or entering a hard run of
--    fixtures. When it's replacing a player who is becoming unavailable the
--    hook line could be 'player(s) you don't own but should'."
--
-- 1. private.fpl_return_gw / fpl_return_phrase: FPL's "Expected back 20 Dec"
--    or "Suspended until 13 Dec" becomes the gameweek of the player's club's
--    first game on or after that date ("That's GW16: he misses GW12-15").
--    Added to the X flag posts (private.fpl_status_tick) and to the hidden
--    gem post below.
--
-- 2. Hidden gem (one draft per gameweek, in social_gw_insights_tick):
--      gem    under 10% owned now, fit, 18+ points in the last four
--             gameweeks and top 10 of his position for them, top 5 of his
--             position on our projection over the next five, and at least
--             a 75% start chance (our model) over the next two.
--      pair   same position, 10%+ owned, priced from £2.0m above the gem to
--             £0.5m below, and one of (in this order of preference):
--               out      flagged by FPL with 50% or less (hook: "Players
--                        you don't own but should")
--               minutes  fit but under 50% to start over the next two on
--                        our model
--               hard     fit, outside the top 20 of his position on our
--                        projection over the next five, and an average FPL
--                        difficulty of 3.4+ over them
--             The most-owned pair of the best kind wins. No pair: the gem
--             alone ("Under the radar").
--    Timing: midweek. When the next deadline falls Friday to Sunday, drafted
--    from Tuesday; in a short week (midweek deadline), from 12 hours after
--    the last game. Never later than 24 hours before the deadline. Drafts
--    need Chris's approval and expire 6 hours before the deadline.
--
-- Also: social_gw_insight_insert now allows one draft per kind per gameweek
-- (before, a later hour could draft a second bandwagon for another player),
-- and social_gw_insights_tick(true) is a dry run that returns the texts
-- without writing anything (and ignores the time windows).
-- Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------- return gameweek
create or replace function private.fpl_return_gw(p_season bigint, p_team integer, p_news text, p_ref timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  m text[]; v_ref date := (p_ref at time zone 'Europe/London')::date; d date; v_gw integer; v_next integer;
begin
  m := regexp_match(coalesce(p_news, ''), '(?:Expected back|until) (\d{1,2} [A-Z][a-z]{2})');
  if m is null then return null; end if;
  begin
    d := to_date(m[1] || ' ' || extract(year from v_ref)::int, 'DD Mon YYYY');
  exception when others then return null;
  end;
  if d < v_ref - 7 then d := (d + interval '1 year')::date; end if;
  select min(f.fpl_event_id) into v_gw from public.fpl_fixtures f
   where f.season_id = p_season and (f.fpl_home_team_id = p_team or f.fpl_away_team_id = p_team)
     and f.fpl_event_id is not null and (f.kickoff_time at time zone 'Europe/London')::date >= d;
  select min(fpl_event_id) into v_next from public.fpl_gameweeks where season_id = p_season and deadline_time > p_ref;
  if v_gw is null or v_next is null then return null; end if;
  return jsonb_build_object('date', d, 'gw', v_gw, 'next_gw', v_next,
                            'misses_from', case when v_gw > v_next then v_next end,
                            'misses_to', case when v_gw > v_next then v_gw - 1 end);
end;
$$;

-- "That's GW16: he misses GW12-15." / "That's GW12, in time for the next deadline."
create or replace function private.fpl_return_phrase(p_season bigint, p_team integer, p_news text, p_ref timestamptz default now())
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case
           when r is null then null
           when (r->>'misses_from') is null then format('That''s GW%s, in time for the next deadline.', r->>'gw')
           when (r->>'misses_from') = (r->>'misses_to') then format('That''s GW%s: he misses GW%s.', r->>'gw', r->>'misses_from')
           else format('That''s GW%s: he misses GW%s-%s.', r->>'gw', r->>'misses_from', r->>'misses_to')
         end
    from (select private.fpl_return_gw(p_season, p_team, p_news, p_ref) r) x;
$$;

revoke all on function private.fpl_return_gw(bigint, integer, text, timestamptz) from public, anon, authenticated;
revoke all on function private.fpl_return_phrase(bigint, integer, text, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------- flag posts with the return gameweek
create or replace function private.fpl_status_tick()
returns jsonb language plpgsql security definer set search_path = public, pg_temp set statement_timeout = '60s' as $$
declare
  v_season bigint := public.fpl_current_season_id();
  st integer; body text; j jsonb; v_seeded boolean; n_changes integer := 0; n_updated integer := 0; n_posts integer := 0;
  r record; v_text text; v_key text; v_hold integer; v_gw integer; v_back text;
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

  -- X: a new flag on a player owned by 15%+ (FPL's own words, plus the
  -- gameweek a return date falls in).
  v_hold := coalesce((select hold_minutes from public.social_settings), 60);
  for r in
    select c.change_id, c.fpl_player_id, c.new_status, c.new_chance, c.new_news, c.news_added, p.web_name, ft.name team_name, p.selected_by_percent own,
           p.element_type, round(p.now_cost / 10.0, 1) price, p.fpl_team_id
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
    v_back := private.fpl_return_phrase(v_season, r.fpl_team_id, r.new_news);
    v_text := format(E'FPL flag: %s (%s, %s%% owned) is now listed as "%s".%s\n\nAdded by FPL at %s UK time.',
                     r.web_name, coalesce(r.team_name, 'unknown club'), trim(to_char(r.own, 'FM990.0')), r.new_news,
                     coalesce(' ' || v_back, ''),
                     to_char(coalesce(r.news_added, now()) at time zone 'Europe/London', 'HH24:MI on Dy DD Mon'));
    v_key := format('fpl-flag:%s:%s:%s:%s', r.fpl_player_id, r.new_status, coalesce(r.new_chance::text, 'x'), (now() at time zone 'Europe/London')::date);
    insert into public.social_post_candidates
      (post_type, text, generated_text, source_data, snapshot_at, dedupe_key, expires_at,
       validation_status, validation_errors, approval_status, approved_at, auto, hold_until)
    select 'fact', v_text, v_text,
           jsonb_build_object('kind', 'fpl_flag', 'season_id', v_season, 'fpl_player_id', r.fpl_player_id, 'status', r.new_status,
                              'chance', r.new_chance, 'news', r.new_news, 'own', r.own, 'price', r.price, 'change_id', r.change_id,
                              'return', private.fpl_return_gw(v_season, r.fpl_team_id, r.new_news)),
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
revoke all on function private.fpl_status_tick() from public, anon, authenticated;

-- ---------------------------------------------------------------- one draft per kind per gameweek
drop function if exists private.social_gw_insight_insert(text, text, text, timestamptz, integer, integer);
-- p_expires is when the draft expires. Keys are gwi:<kind>:<season>:<gw>:<player>.
create or replace function private.social_gw_insight_insert(p_kind text, p_key text, p_text text, p_expires timestamptz, p_pid integer, p_gw integer,
                                                            p_extra jsonb default '{}')
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if length(p_text) > 280 then return false; end if;
  if exists (select 1 from public.social_post_candidates x where x.dedupe_key like regexp_replace(p_key, ':[^:]*$', '') || ':%') then
    return false;
  end if;
  insert into public.social_post_candidates
    (post_type, text, generated_text, source_data, snapshot_at, dedupe_key, expires_at, validation_status, validation_errors, approval_status, auto)
  values ('fact', p_text, p_text,
          jsonb_build_object('kind', 'gw_insight_' || p_kind, 'fpl_player_id', p_pid, 'gw', p_gw) || coalesce(p_extra, '{}'),
          now(), p_key, p_expires, 'passed', '[]', 'pending', false);
  return true;
end;
$$;
revoke all on function private.social_gw_insight_insert(text, text, text, timestamptz, integer, integer, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- the insight tick, with the hidden gem
drop function if exists private.social_gw_insights_tick();
create or replace function private.social_gw_insights_tick(p_dry boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp set statement_timeout = '90s' as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_prev integer; v_prev_deadline timestamptz; v_next integer; v_next_deadline timestamptz;
  v_last_ko timestamptz; v_proj_at timestamptz; st integer; body text; j jsonb;
  r record; v_text text; v_key text; made jsonb := '[]'; texts jsonb := '[]';
  v_main boolean; v_gem boolean; v_gem_from timestamptz; v_dow integer; v_cands text[]; v_c text; v_back text;
  pos_name text[] := array['goalkeepers', 'defenders', 'midfielders', 'forwards'];
  pos_one text[] := array['goalkeeper', 'defender', 'midfielder', 'forward'];
begin
  select fpl_event_id, deadline_time into v_prev, v_prev_deadline from public.fpl_gameweeks
   where season_id = v_season and deadline_time < now() order by deadline_time desc limit 1;
  select fpl_event_id, deadline_time into v_next, v_next_deadline from public.fpl_gameweeks
   where season_id = v_season and deadline_time > now() order by deadline_time limit 1;
  if v_prev is null or v_next is null then return jsonb_build_object('status', 'no gameweeks'); end if;
  -- GW11's three were written by hand on 23 Nov; the automatic ones start
  -- after GW12. The hidden gem starts after GW11 (this week).
  if v_prev < 11 and not p_dry then return jsonb_build_object('status', 'waiting', 'reason', 'starts after GW11'); end if;
  select max(kickoff_time) into v_last_ko from public.fpl_fixtures where season_id = v_season and fpl_event_id = v_prev;
  if (v_last_ko is null or now() < v_last_ko + interval '150 minutes') and not p_dry then
    return jsonb_build_object('status', 'waiting', 'reason', format('GW%s not finished', v_prev));
  end if;

  -- Windows. The first three: until 30 hours before the next deadline.
  -- The hidden gem: midweek (see the header), until 24 hours before.
  v_main := now() <= v_next_deadline - interval '30 hours' and v_prev >= 12;
  v_dow := extract(isodow from v_next_deadline at time zone 'Europe/London')::int;
  if v_dow >= 5 then
    -- Tuesday 00:00 UK time of the week the deadline falls in.
    v_gem_from := (date_trunc('week', v_next_deadline at time zone 'Europe/London') + interval '1 day') at time zone 'Europe/London';
  else
    v_gem_from := v_last_ko + interval '12 hours';
  end if;
  v_gem := now() >= v_gem_from and now() <= v_next_deadline - interval '24 hours';
  if p_dry then v_main := true; v_gem := true; end if;
  if not v_main and not v_gem then
    return jsonb_build_object('status', 'waiting', 'reason', 'outside the posting windows', 'gem_from', v_gem_from);
  end if;
  if not p_dry
     and (not v_main or (select count(distinct split_part(dedupe_key, ':', 2)) from public.social_post_candidates
                          where dedupe_key like format('gwi:%%:%s:%s:%%', v_season, v_prev)
                            and split_part(dedupe_key, ':', 2) in ('bandwagon', 'knee_jerk', 'hold_nerve')) >= 3)
     and (not v_gem or exists (select 1 from public.social_post_candidates where dedupe_key like format('gwi:gem:%s:%s:%%', v_season, v_prev))) then
    return jsonb_build_object('status', 'done', 'gw', v_prev);
  end if;
  select max(generated_at) into v_proj_at from public.fpl_player_projections where season_id = v_season and model_version = 'leaguewide_v6';
  if v_proj_at is null or (v_proj_at < now() - interval '36 hours' and not p_dry) then
    return jsonb_build_object('status', 'waiting', 'reason', 'projections older than 36 hours');
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');
  select status, content into st, body from extensions.http_get('https://fantasy.premierleague.com/api/bootstrap-static/');
  if st is distinct from 200 then return jsonb_build_object('status', 'fpl http ' || coalesce(st::text, 'none')); end if;
  j := body::jsonb;

  create temp table if not exists _gwi (
    pid integer primary key, name text, team integer, pos integer, status text, total integer, tin integer, tout integer,
    own_dl numeric, pts integer, opp text, rank_all integer, x2 numeric, x5 numeric, rk2_pos integer, rk5_pos integer, rk5_all integer,
    blanks integer, blank_pts text, blank_xg numeric, team_name text,
    own_now numeric, price numeric, chance integer, news text, short text, p4 integer, rk4_pos integer, sp2 numeric, fdr5 numeric) on commit drop;
  truncate _gwi;
  insert into _gwi (pid, name, team, pos, status, total, tin, tout, own_now, price, chance, news)
  select (x->>'id')::int, x->>'web_name', (x->>'team')::int, (x->>'element_type')::int, x->>'status', (x->>'total_points')::int,
         (x->>'transfers_in_event')::int, (x->>'transfers_out_event')::int,
         (x->>'selected_by_percent')::numeric, round((x->>'now_cost')::numeric / 10, 1), (x->>'chance_of_playing_next_round')::int, coalesce(x->>'news', '')
    from jsonb_array_elements(j->'elements') x;

  update _gwi g set own_dl = s.selected_by_percent
    from (select distinct on (fpl_player_id) fpl_player_id, selected_by_percent from public.fpl_player_snapshots
           where season_id = v_season and captured_at <= v_prev_deadline order by fpl_player_id, captured_at desc) s
   where s.fpl_player_id = g.pid;
  update _gwi g set pts = q.pts, opp = q.opp
    from (select pg.fpl_player_id, sum(pg.total_points)::int pts,
                 string_agg(ft.name || case when pg.was_home then ' (H)' else ' (A)' end, ' and ') opp
            from public.fpl_player_gameweeks pg left join public.fpl_teams ft on ft.season_id = pg.season_id and ft.fpl_team_id = pg.opponent_fpl_team_id
           where pg.season_id = v_season and pg.fpl_event_id = v_prev group by 1) q
   where q.fpl_player_id = g.pid;
  update _gwi g set p4 = q.p4
    from (select fpl_player_id, sum(total_points)::int p4 from public.fpl_player_gameweeks
           where season_id = v_season and fpl_event_id between v_prev - 3 and v_prev group by 1) q
   where q.fpl_player_id = g.pid;
  update _gwi g set rank_all = q.rk from (select pid, rank() over (order by total desc) rk from _gwi) q where q.pid = g.pid;
  update _gwi g set team_name = ft.name, short = ft.short_name from public.fpl_teams ft where ft.season_id = v_season and ft.fpl_team_id = g.team;

  -- Projections over the next two and five gameweeks, latest production run.
  update _gwi g set x2 = q.x2, x5 = q.x5, sp2 = q.sp2
    from (select pp.fpl_player_id,
                 sum(pp.expected_fpl_points) filter (where fx.matchweek between v_next and v_next + 1) x2,
                 sum(pp.expected_fpl_points) filter (where fx.matchweek between v_next and v_next + 4) x5,
                 avg(pp.start_probability) filter (where fx.matchweek between v_next and v_next + 1) sp2
            from public.fpl_player_projections pp join public.fixtures fx on fx.fixture_id = pp.fixture_id
           where pp.season_id = v_season and pp.model_version = 'leaguewide_v6' and pp.generated_at > v_proj_at - interval '3 hours'
             and fx.matchweek between v_next and v_next + 4
           group by 1) q
   where q.fpl_player_id = g.pid;
  update _gwi g set rk2_pos = q.a, rk5_pos = q.b, rk5_all = q.c, rk4_pos = q.d
    from (select pid, rank() over (partition by pos order by x2 desc nulls last) a, rank() over (partition by pos order by x5 desc nulls last) b,
                 rank() over (order by x5 desc nulls last) c, rank() over (partition by pos order by p4 desc nulls last) d from _gwi) q
   where q.pid = g.pid;
  -- FPL's own difficulty over the next five.
  update _gwi g set fdr5 = q.d
    from (select t.team, avg(t.diff) d from (
            select f.fpl_home_team_id team, f.team_h_difficulty diff from public.fpl_fixtures f
             where f.season_id = v_season and f.fpl_event_id between v_next and v_next + 4
            union all
            select f.fpl_away_team_id, f.team_a_difficulty from public.fpl_fixtures f
             where f.season_id = v_season and f.fpl_event_id between v_next and v_next + 4) t group by 1) q
   where q.team = g.team;

  -- Blank run: consecutive gameweeks up to the last with 2 points or fewer.
  update _gwi g set blanks = q.n, blank_pts = q.pts, blank_xg = q.xg
    from (select fpl_player_id, count(*)::int n, string_agg(p::text, ', ' order by ev) pts, round(sum(xg), 2) xg
            from (select pg.fpl_player_id, pg.fpl_event_id ev, sum(pg.total_points) p, sum(pg.expected_goals) xg,
                         max(case when sum(pg.total_points) > 2 then pg.fpl_event_id end) over (partition by pg.fpl_player_id) last_return
                    from public.fpl_player_gameweeks pg where pg.season_id = v_season and pg.fpl_event_id <= v_prev
                   group by pg.fpl_player_id, pg.fpl_event_id) b
           where ev > coalesce(last_return, 0)
           group by fpl_player_id) q
   where q.fpl_player_id = g.pid;

  if v_main then
    -- 1. Bandwagon.
    select * into r from _gwi where tin >= 50000 and pts >= 10 and own_dl < 15 and rk5_pos > 5 and x5 is not null
     order by tin desc limit 1;
    if found then
      v_key := format('gwi:bandwagon:%s:%s:%s', v_season, v_prev, r.pid);
      v_text := format(E'%s was FPL''s %s-highest scorer (%s pts) yet only %s%% owned at the GW%s deadline. After %s points v %s, %s managers have bought him.\n\n%s next: %s.\n\nOur model ranks him %s among %s over that run.',
        r.name, private.fs_ordinal(r.rank_all), r.total, trim(to_char(r.own_dl, 'FM990.0')), v_prev, r.pts, r.opp, to_char(r.tin, 'FM999,999,999'),
        r.team_name, private.social_next_fixtures(v_season, r.team, v_next, 5), private.fs_ordinal(r.rk5_pos), pos_name[r.pos]);
      texts := texts || jsonb_build_object('kind', 'bandwagon', 'text', v_text, 'length', length(v_text));
      if not p_dry and private.social_gw_insight_insert('bandwagon', v_key, v_text, v_next_deadline - interval '24 hours', r.pid, v_prev) then
        made := made || to_jsonb('bandwagon ' || r.name);
      end if;
    end if;

    -- 2. Knee-jerk sale.
    select * into r from _gwi where tout >= 40000 and pts <= 2 and own_dl >= 15 and status = 'a' and rk2_pos <= 5 and x2 is not null
       and coalesce(blanks, 0) < 3  -- a longer blank run is the hold-your-nerve post
     order by tout desc limit 1;
    if found then
      v_key := format('gwi:knee_jerk:%s:%s:%s', v_season, v_prev, r.pid);
      v_text := format(E'%s managers have sold %s since the deadline after %s points v %s.\n\n%s''s next two: %s.\n\nOur model has him the %s-best of the %s for GW%s-%s (%s points).',
        to_char(r.tout, 'FM999,999,999'), r.name, r.pts, r.opp, r.team_name, private.social_next_fixtures(v_season, r.team, v_next, 2),
        private.fs_ordinal(r.rk2_pos), pos_name[r.pos], v_next, v_next + 1, trim(to_char(r.x2, 'FM990.0')));
      texts := texts || jsonb_build_object('kind', 'knee_jerk', 'text', v_text, 'length', length(v_text));
      if not p_dry and private.social_gw_insight_insert('knee_jerk', v_key, v_text, v_next_deadline - interval '24 hours', r.pid, v_prev) then
        made := made || to_jsonb('knee_jerk ' || r.name);
      end if;
    end if;

    -- 3. Hold your nerve.
    select * into r from _gwi where own_dl >= 30 and blanks >= 3 and status = 'a' and rk5_all <= 3 and x5 is not null
     order by own_dl desc limit 1;
    if found then
      v_key := format('gwi:hold_nerve:%s:%s:%s', v_season, v_prev, r.pid);
      v_text := format(E'%s: %s blanks in a row (%s) from %s xG, and %s managers have sold him since the deadline.\n\nNext five: %s.\n\nOur model has him %s in the game over those five: %s pts.',
        r.name, r.blanks, r.blank_pts, trim(to_char(r.blank_xg, 'FM990.00')), to_char(r.tout, 'FM999,999,999'),
        private.social_next_fixtures(v_season, r.team, v_next, 5), private.fs_ordinal(r.rk5_all), trim(to_char(r.x5, 'FM990.0')));
      texts := texts || jsonb_build_object('kind', 'hold_nerve', 'text', v_text, 'length', length(v_text));
      if not p_dry and private.social_gw_insight_insert('hold_nerve', v_key, v_text, v_next_deadline - interval '24 hours', r.pid, v_prev) then
        made := made || to_jsonb('hold_nerve ' || r.name);
      end if;
    end if;
  end if;

  -- 4. Hidden gem, with a similar-priced player to move off where there is one.
  if v_gem then
    select gm.pid, gm.name, gm.short, gm.team, gm.pos, gm.price, gm.own_now, gm.p4, gm.rk4_pos, gm.rk5_pos, gm.x5,
           pr.pid pr_pid, pr.name pr_name, pr.team pr_team, pr.own_now pr_own, pr.news pr_news, pr.sp2 pr_sp2, pr.kind pr_kind
      into r
      from _gwi gm
      left join lateral (
        select p.*, k.kind, k.prio from _gwi p
          cross join lateral (select case
                   when p.status <> 'a' and coalesce(p.chance, 0) <= 50 and p.news <> '' then 'out'
                   when p.status = 'a' and p.sp2 < 0.5 then 'minutes'
                   when p.status = 'a' and p.rk5_pos > 20 and p.fdr5 >= 3.4 then 'hard' end kind,
                 case when p.status <> 'a' then 1 when p.sp2 < 0.5 then 2 else 3 end prio) k
         where p.pos = gm.pos and p.pid <> gm.pid and p.own_now >= 10 and k.kind is not null
           and gm.price between p.price - 2.0 and p.price + 0.5
         order by k.prio, p.own_now desc limit 1) pr on true
     where gm.own_now < 10 and gm.status = 'a' and coalesce(gm.chance, 100) = 100
       and gm.p4 >= 18 and gm.rk4_pos <= 10 and gm.rk5_pos <= 5 and gm.sp2 >= 0.75 and gm.x5 is not null
     order by (pr.pid is null), pr.prio, pr.own_now desc, gm.x5 desc
     limit 1;
    if found then
      v_key := format('gwi:gem:%s:%s:%s', v_season, v_prev, r.pid);
      v_cands := array[]::text[];
      if r.pr_kind = 'out' then
        v_back := private.fpl_return_phrase(v_season, r.pr_team, r.pr_news);
        foreach v_c in array array[
          format(E'Players you don''t own but should\n\n%s (%s%% owned): "%s".%s\n\n%s (%s, £%sm) is %s%% owned with %s pts in the last 4 GWs, %s among %s. Next five: %s.\n\nOur model ranks him %s over that run.',
            r.pr_name, trim(to_char(r.pr_own, 'FM990.0')), r.pr_news, coalesce(' ' || v_back, ''),
            r.name, r.short, trim(to_char(r.price, 'FM990.0')), trim(to_char(r.own_now, 'FM990.0')), r.p4, private.fs_ordinal(r.rk4_pos), pos_name[r.pos],
            private.social_next_fixtures(v_season, r.team, v_next, 5), private.fs_ordinal(r.rk5_pos) || ' among ' || pos_name[r.pos]),
          format(E'Players you don''t own but should\n\n%s (%s%% owned): "%s".%s\n\n%s (%s, £%sm): %s%% owned, %s pts in the last 4 GWs. Next five: %s. Our model has him %s among %s.',
            r.pr_name, trim(to_char(r.pr_own, 'FM990.0')), r.pr_news, coalesce(' ' || v_back, ''),
            r.name, r.short, trim(to_char(r.price, 'FM990.0')), trim(to_char(r.own_now, 'FM990.0')), r.p4,
            private.social_next_fixtures(v_season, r.team, v_next, 5), private.fs_ordinal(r.rk5_pos), pos_name[r.pos]),
          format(E'Players you don''t own but should\n\n%s (%s%% owned): "%s".\n\n%s (%s, £%sm): %s%% owned, %s pts in the last 4 GWs. Next five: %s. Our model has him %s among %s.',
            r.pr_name, trim(to_char(r.pr_own, 'FM990.0')), r.pr_news,
            r.name, r.short, trim(to_char(r.price, 'FM990.0')), trim(to_char(r.own_now, 'FM990.0')), r.p4,
            private.social_next_fixtures(v_season, r.team, v_next, 5), private.fs_ordinal(r.rk5_pos), pos_name[r.pos])]
        loop v_cands := v_cands || v_c; end loop;
      else
        foreach v_c in array array[
          format(E'Under the radar: %s (%s, £%sm) is %s%% owned with %s pts in the last 4 GWs, %s among %s.\n\nNext five: %s. Our model ranks him %s among %s over that run.%s',
            r.name, r.short, trim(to_char(r.price, 'FM990.0')), trim(to_char(r.own_now, 'FM990.0')), r.p4, private.fs_ordinal(r.rk4_pos), pos_name[r.pos],
            private.social_next_fixtures(v_season, r.team, v_next, 5), private.fs_ordinal(r.rk5_pos), pos_name[r.pos],
            case r.pr_kind
              when 'minutes' then format(E'\n\nSimilar price: %s (%s%% owned) is %s%% to start GW%s on our model.',
                                         r.pr_name, trim(to_char(r.pr_own, 'FM990.0')), round(r.pr_sp2 * 100)::int, v_next)
              when 'hard' then format(E'\n\nSimilar price: %s (%s%% owned) has %s next.',
                                      r.pr_name, trim(to_char(r.pr_own, 'FM990.0')), private.social_next_fixtures(v_season, r.pr_team, v_next, 3))
              else '' end),
          format(E'Under the radar: %s (%s, £%sm), %s%% owned, %s pts in the last 4 GWs.\n\nNext five: %s. Our model: %s among %s.%s',
            r.name, r.short, trim(to_char(r.price, 'FM990.0')), trim(to_char(r.own_now, 'FM990.0')), r.p4,
            private.social_next_fixtures(v_season, r.team, v_next, 5), private.fs_ordinal(r.rk5_pos), pos_name[r.pos],
            case r.pr_kind
              when 'minutes' then format(E'\n\nSimilar price: %s (%s%% owned) is %s%% to start GW%s on our model.',
                                         r.pr_name, trim(to_char(r.pr_own, 'FM990.0')), round(r.pr_sp2 * 100)::int, v_next)
              when 'hard' then format(E'\n\nSimilar price: %s (%s%% owned) has %s next.',
                                      r.pr_name, trim(to_char(r.pr_own, 'FM990.0')), private.social_next_fixtures(v_season, r.pr_team, v_next, 3))
              else '' end)]
        loop v_cands := v_cands || v_c; end loop;
      end if;
      v_text := null;
      foreach v_c in array v_cands loop
        if v_c is not null and length(v_c) <= 280 then v_text := v_c; exit; end if;
      end loop;
      texts := texts || jsonb_build_object('kind', 'gem', 'pair', r.pr_name, 'pair_kind', r.pr_kind, 'text', coalesce(v_text, v_cands[array_length(v_cands, 1)]),
                                           'length', length(coalesce(v_text, v_cands[array_length(v_cands, 1)])), 'fits', v_text is not null);
      if v_text is not null and not p_dry
         and private.social_gw_insight_insert('gem', v_key, v_text, v_next_deadline - interval '6 hours', r.pid, v_prev,
                                              jsonb_build_object('pair_fpl_player_id', r.pr_pid, 'pair_kind', r.pr_kind)) then
        made := made || to_jsonb('gem ' || r.name || coalesce(' / ' || r.pr_name, ''));
      end if;
    end if;
  end if;

  if p_dry then return jsonb_build_object('status', 'dry run', 'gw', v_prev, 'next', v_next, 'gem_from', v_gem_from, 'texts', texts); end if;
  return jsonb_build_object('status', 'ok', 'gw', v_prev, 'drafted', made);
end;
$$;
revoke all on function private.social_gw_insights_tick(boolean) from public, anon, authenticated;

-- The cron command (select private.social_gw_insights_tick()) resolves to the new function's default.
