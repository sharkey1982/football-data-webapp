-- Live definition exported from the database (function log_tactical_defaults_change()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.log_tactical_defaults_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'INSERT'
     or new.tactical_role is distinct from old.tactical_role
     or new.depth_rank is distinct from old.depth_rank then
    insert into public.team_player_tactical_defaults_log
      (changed_by, season_id, team_id, fpl_player_id, old_role, new_role, old_rank, new_rank, old_source, new_source, new_rank_source)
    values (auth.uid(), new.season_id, new.team_id, new.fpl_player_id,
            case when tg_op = 'UPDATE' then old.tactical_role end, new.tactical_role,
            case when tg_op = 'UPDATE' then old.depth_rank end, new.depth_rank,
            case when tg_op = 'UPDATE' then old.source_name end, new.source_name, new.depth_rank_source);
  end if;
  return new;
end $function$
;
