-- ============================================================================
-- Ownership at the last FPL deadline, readable by the site (1 Nov 2026).
--
-- For the new most-owned squad page (/fpl/most-owned): "how ownership changed
-- since the last deadline". fpl_deadline_player_state holds each player's
-- selected_by_percent at every deadline, but it is not public (it also
-- carries raw source payloads), so the page reads only what it needs through
-- this function: one row per player, from the latest deadline that has
-- passed, preferring the final_call snapshot (taken in the last minutes
-- before the deadline) over pre_deadline (up to an hour before).
-- Read only. Merged before the page so its preview has the function.
-- ============================================================================

create or replace function public.get_deadline_ownership(p_season_id bigint default public.fpl_current_season_id())
returns table (fpl_player_id integer, fpl_event_id integer, deadline_time timestamptz, snapshot_at timestamptz, snapshot_kind text, selected_by_percent numeric)
language sql stable security definer set search_path = '' as $$
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
$$;

revoke all on function public.get_deadline_ownership(bigint) from public;
grant execute on function public.get_deadline_ownership(bigint) to anon, authenticated, service_role;
