-- Live definition exported from the database (function email_alert_batch()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.email_alert_batch()
 RETURNS TABLE(send_id bigint, gw integer, deadline timestamp with time zone, subscriber_id bigint, email text, token text, changes jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- Net change in status or chance only: a flag added and lifted again since
  -- the weekly email is no news, and nor is FPL rewording the same flag
  -- ("Unspecified injury - 75%" to "Calf injury - 75%"; Chris, 22 Nov 2026).
  delete from _late l where l.old_status is not distinct from l.new_status and l.old_chance is not distinct from l.new_chance;

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
$function$
;
