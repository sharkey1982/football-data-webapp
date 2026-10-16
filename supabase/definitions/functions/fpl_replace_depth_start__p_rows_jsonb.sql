-- Live definition exported from the database (function fpl_replace_depth_start(p_rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_replace_depth_start(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n integer;
begin
  delete from public.fpl_depth_start_store where true;
  insert into public.fpl_depth_start_store (fixture_id, fpl_player_id, team_id, start_probability, depth_group, depth_rank, group_shares)
  select r.fixture_id, r.fpl_player_id, r.team_id, round(least(0.98, greatest(0, r.start_probability)), 4), r.depth_group, r.depth_rank, r.group_shares
    from jsonb_to_recordset(p_rows) as r(fixture_id bigint, fpl_player_id bigint, team_id bigint,
                                         start_probability numeric, depth_group text, depth_rank integer, group_shares jsonb);
  get diagnostics n = row_count;
  analyze public.fpl_depth_start_store;
  return n;
end $function$
;
