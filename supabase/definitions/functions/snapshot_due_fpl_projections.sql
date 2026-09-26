-- Live definition exported from the database (function snapshot_due_fpl_projections()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.snapshot_due_fpl_projections()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare g record; v_out jsonb := '[]';
begin
  for g in
    select gw.season_id, gw.fpl_event_id, gw.deadline_time,
      exists (select 1 from public.fpl_projection_snapshots s where s.season_id = gw.season_id and s.fpl_event_id = gw.fpl_event_id
              and s.snapshot_kind in ('pre_deadline','late')) already,
      (select min(kickoff_time) from public.fpl_fixtures ff where ff.season_id = gw.season_id and ff.fpl_event_id = gw.fpl_event_id) first_kickoff
    from public.fpl_gameweeks gw
    where gw.deadline_time between now() - interval '2 days' and now() + interval '60 minutes'
  loop
    continue when g.already;
    if now() <= g.deadline_time then
      v_out := v_out || public.snapshot_fpl_projections(g.season_id, g.fpl_event_id, 'pre_deadline');
    elsif g.first_kickoff is null or now() < g.first_kickoff then
      v_out := v_out || public.snapshot_fpl_projections(g.season_id, g.fpl_event_id, 'late');
    end if;
  end loop;
  return v_out;
end;
$function$
;
