-- Live definition exported from the database (function get_deadline_ownership(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_deadline_ownership(p_season_id bigint DEFAULT fpl_current_season_id())
 RETURNS TABLE(fpl_player_id integer, fpl_event_id integer, deadline_time timestamp with time zone, snapshot_at timestamp with time zone, snapshot_kind text, selected_by_percent numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with last_deadline as (
    select s.fpl_event_id
      from public.fpl_deadline_player_state s
     where s.season_id = p_season_id
       and s.snapshot_kind in ('final_call', 'pre_deadline')
       and s.deadline_time <= now()
     order by s.deadline_time desc
     limit 1)
  select distinct on (s.fpl_player_id)
         s.fpl_player_id, s.fpl_event_id, s.deadline_time, s.snapshot_at, s.snapshot_kind, s.selected_by_percent
    from public.fpl_deadline_player_state s
    join last_deadline l on l.fpl_event_id = s.fpl_event_id
   where s.season_id = p_season_id
     and s.snapshot_kind in ('final_call', 'pre_deadline')
   order by s.fpl_player_id, (s.snapshot_kind = 'final_call') desc, s.snapshot_at desc;
$function$
;
