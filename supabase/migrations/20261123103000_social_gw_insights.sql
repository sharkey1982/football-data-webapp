-- ============================================================================
-- Post-gameweek insight posts (Chris, 23 Nov 2026: purely factual posts are
-- "not a complete waste of time" but want insight; "Yes that seems fine" to:
-- bandwagon, knee-jerk sale, hold your nerve). After every game of a
-- gameweek has been played and until 30 hours before the next deadline, an
-- hourly check compares where FPL transfers are going with FixtureShark's
-- projections and the fixtures, and drafts at most one post of each kind per
-- gameweek, only when the crowd and the projection really disagree:
--
--   bandwagon   bought by 50,000+ since the deadline after a 10+ point week,
--               under 15% owned at the deadline, and outside the top 5 of
--               his position on our projection over the next five.
--   knee_jerk   sold by 40,000+ after 2 points or fewer (not a 3+ blank run), 15%+ owned at the
--               deadline, fit, and top 5 of his position on our projection
--               for the next two.
--   hold_nerve  30%+ owned, three or more blanks in a row (2 points or fewer
--               each), fit, and top 3 in the game on our projection over the
--               next five.
--
-- The projection is whatever production publishes (fpl_player_projections,
-- leaguewide_v6, latest run), so it follows the start-chance model in use.
-- Posts are drafts for Chris to approve (approval_status pending, auto off).
-- Live transfer counts from FPL (one bootstrap-static read an hour, only in
-- the window). Safe to re-run.
-- ============================================================================

create or replace function private.fs_ordinal(n integer)
returns text language sql immutable as $$
  select n::text || case when n % 100 between 11 and 13 then 'th'
                         when n % 10 = 1 then 'st' when n % 10 = 2 then 'nd' when n % 10 = 3 then 'rd' else 'th' end;
$$;

create or replace function private.social_gw_insights_tick()
returns jsonb language plpgsql security definer set search_path = public, pg_temp set statement_timeout = '90s' as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_prev integer; v_prev_deadline timestamptz; v_next integer; v_next_deadline timestamptz;
  v_last_ko timestamptz; v_proj_at timestamptz; st integer; body text; j jsonb;
  r record; v_text text; v_key text; made jsonb := '[]';
  pos_name text[] := array['goalkeepers', 'defenders', 'midfielders', 'forwards'];
begin
  select fpl_event_id, deadline_time into v_prev, v_prev_deadline from public.fpl_gameweeks
   where season_id = v_season and deadline_time < now() order by deadline_time desc limit 1;
  select fpl_event_id, deadline_time into v_next, v_next_deadline from public.fpl_gameweeks
   where season_id = v_season and deadline_time > now() order by deadline_time limit 1;
  if v_prev is null or v_next is null then return jsonb_build_object('status', 'no gameweeks'); end if;
  -- GW11's three were written by hand on 23 Nov; the automatic ones start after GW12.
  if v_prev < 12 then return jsonb_build_object('status', 'waiting', 'reason', 'starts after GW12'); end if;
  select max(kickoff_time) into v_last_ko from public.fpl_fixtures where season_id = v_season and fpl_event_id = v_prev;
  if v_last_ko is null or now() < v_last_ko + interval '150 minutes' then
    return jsonb_build_object('status', 'waiting', 'reason', format('GW%s not finished', v_prev));
  end if;
  if now() > v_next_deadline - interval '30 hours' then
    return jsonb_build_object('status', 'waiting', 'reason', 'too close to the next deadline');
  end if;
  if (select count(*) from public.social_post_candidates where dedupe_key like format('gwi:%%:%s:%s:%%', v_season, v_prev)) >= 3 then
    return jsonb_build_object('status', 'done', 'gw', v_prev);
  end if;
  select max(generated_at) into v_proj_at from public.fpl_player_projections where season_id = v_season and model_version = 'leaguewide_v6';
  if v_proj_at is null or v_proj_at < now() - interval '36 hours' then
    return jsonb_build_object('status', 'waiting', 'reason', 'projections older than 36 hours');
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');
  select status, content into st, body from extensions.http_get('https://fantasy.premierleague.com/api/bootstrap-static/');
  if st is distinct from 200 then return jsonb_build_object('status', 'fpl http ' || coalesce(st::text, 'none')); end if;
  j := body::jsonb;

  create temp table if not exists _gwi (
    pid integer primary key, name text, team integer, pos integer, status text, total integer, tin integer, tout integer,
    own_dl numeric, pts integer, opp text, rank_all integer, x2 numeric, x5 numeric, rk2_pos integer, rk5_pos integer, rk5_all integer,
    blanks integer, blank_pts text, blank_xg numeric, team_name text) on commit drop;
  truncate _gwi;
  insert into _gwi (pid, name, team, pos, status, total, tin, tout)
  select (x->>'id')::int, x->>'web_name', (x->>'team')::int, (x->>'element_type')::int, x->>'status', (x->>'total_points')::int,
         (x->>'transfers_in_event')::int, (x->>'transfers_out_event')::int
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
  update _gwi g set rank_all = q.rk from (select pid, rank() over (order by total desc) rk from _gwi) q where q.pid = g.pid;
  update _gwi g set team_name = ft.name from public.fpl_teams ft where ft.season_id = v_season and ft.fpl_team_id = g.team;

  -- Projections over the next two and five gameweeks, latest production run.
  update _gwi g set x2 = q.x2, x5 = q.x5
    from (select pp.fpl_player_id,
                 sum(pp.expected_fpl_points) filter (where fx.matchweek between v_next and v_next + 1) x2,
                 sum(pp.expected_fpl_points) filter (where fx.matchweek between v_next and v_next + 4) x5
            from public.fpl_player_projections pp join public.fixtures fx on fx.fixture_id = pp.fixture_id
           where pp.season_id = v_season and pp.model_version = 'leaguewide_v6' and pp.generated_at > v_proj_at - interval '3 hours'
             and fx.matchweek between v_next and v_next + 4
           group by 1) q
   where q.fpl_player_id = g.pid;
  update _gwi g set rk2_pos = q.a, rk5_pos = q.b, rk5_all = q.c
    from (select pid, rank() over (partition by pos order by x2 desc nulls last) a, rank() over (partition by pos order by x5 desc nulls last) b,
                 rank() over (order by x5 desc nulls last) c from _gwi) q
   where q.pid = g.pid;

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

  -- 1. Bandwagon.
  select * into r from _gwi where tin >= 50000 and pts >= 10 and own_dl < 15 and rk5_pos > 5 and x5 is not null
   order by tin desc limit 1;
  if found then
    v_key := format('gwi:bandwagon:%s:%s:%s', v_season, v_prev, r.pid);
    v_text := format(E'%s was FPL''s %s-highest scorer (%s pts) yet only %s%% owned at the GW%s deadline. After %s points v %s, %s managers have bought him.\n\n%s next: %s.\n\nOur model ranks him %s among %s over that run.',
      r.name, private.fs_ordinal(r.rank_all), r.total, trim(to_char(r.own_dl, 'FM990.0')), v_prev, r.pts, r.opp, to_char(r.tin, 'FM999,999,999'),
      r.team_name, private.social_next_fixtures(v_season, r.team, v_next, 5), private.fs_ordinal(r.rk5_pos), pos_name[r.pos]);
    perform private.social_gw_insight_insert('bandwagon', v_key, v_text, v_next_deadline, r.pid, v_prev);
    made := made || to_jsonb('bandwagon ' || r.name);
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
    perform private.social_gw_insight_insert('knee_jerk', v_key, v_text, v_next_deadline, r.pid, v_prev);
    made := made || to_jsonb('knee_jerk ' || r.name);
  end if;

  -- 3. Hold your nerve.
  select * into r from _gwi where own_dl >= 30 and blanks >= 3 and status = 'a' and rk5_all <= 3 and x5 is not null
   order by own_dl desc limit 1;
  if found then
    v_key := format('gwi:hold_nerve:%s:%s:%s', v_season, v_prev, r.pid);
    v_text := format(E'%s: %s blanks in a row (%s) from %s xG, and %s managers have sold him since the deadline.\n\nNext five: %s.\n\nOur model has him %s in the game over those five: %s pts.',
      r.name, r.blanks, r.blank_pts, trim(to_char(r.blank_xg, 'FM990.00')), to_char(r.tout, 'FM999,999,999'),
      private.social_next_fixtures(v_season, r.team, v_next, 5), private.fs_ordinal(r.rk5_all), trim(to_char(r.x5, 'FM990.0')));
    perform private.social_gw_insight_insert('hold_nerve', v_key, v_text, v_next_deadline, r.pid, v_prev);
    made := made || to_jsonb('hold_nerve ' || r.name);
  end if;

  return jsonb_build_object('status', 'ok', 'gw', v_prev, 'drafted', made);
end;
$$;

-- "EVE (A), SUN (H), CHE (A)" for a team's next n gameweeks (FPL ids).
create or replace function private.social_next_fixtures(p_season bigint, p_team integer, p_from integer, p_n integer)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select string_agg(case when f.fpl_home_team_id = p_team then a.short_name || ' (H)' else h.short_name || ' (A)' end, ', '
                    order by f.fpl_event_id, f.kickoff_time)
    from public.fpl_fixtures f
    join public.fpl_teams h on h.season_id = f.season_id and h.fpl_team_id = f.fpl_home_team_id
    join public.fpl_teams a on a.season_id = f.season_id and a.fpl_team_id = f.fpl_away_team_id
   where f.season_id = p_season and (f.fpl_home_team_id = p_team or f.fpl_away_team_id = p_team)
     and f.fpl_event_id between p_from and p_from + p_n - 1;
$$;

create or replace function private.social_gw_insight_insert(p_kind text, p_key text, p_text text, p_expires timestamptz, p_pid integer, p_gw integer)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.social_post_candidates
    (post_type, text, generated_text, source_data, snapshot_at, dedupe_key, expires_at, validation_status, validation_errors, approval_status, auto)
  select 'fact', p_text, p_text,
         jsonb_build_object('kind', 'gw_insight_' || p_kind, 'fpl_player_id', p_pid, 'gw', p_gw), now(), p_key,
         p_expires - interval '24 hours', 'passed', '[]', 'pending', false
   where length(p_text) <= 280
     and not exists (select 1 from public.social_post_candidates x where x.dedupe_key = p_key);
$$;

revoke all on function private.social_gw_insights_tick() from public, anon, authenticated;
revoke all on function private.social_next_fixtures(bigint, integer, integer, integer) from public, anon, authenticated;
revoke all on function private.social_gw_insight_insert(text, text, text, timestamptz, integer, integer) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'social-gw-insights';
select cron.schedule('social-gw-insights', '35 7-21 * * *', 'select private.social_gw_insights_tick()');
