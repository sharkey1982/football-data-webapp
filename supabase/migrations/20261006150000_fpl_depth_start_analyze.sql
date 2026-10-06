-- FPL pecking-order store: refresh planner statistics after each rewrite
-- (6 Oct 2026). The store is emptied and refilled twice a run (~19k rows);
-- fpl_fallback_start_probability_v6 joins it for every projection read, so
-- stale statistics on a freshly filled table risk a poor plan.

create or replace function public.fpl_replace_depth_start(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare n integer;
begin
  delete from public.fpl_depth_start_store where true;
  insert into public.fpl_depth_start_store (fixture_id, fpl_player_id, team_id, start_probability, depth_group, depth_rank)
  select r.fixture_id, r.fpl_player_id, r.team_id, round(least(0.98, greatest(0, r.start_probability)), 4), r.depth_group, r.depth_rank
    from jsonb_to_recordset(p_rows) as r(fixture_id bigint, fpl_player_id bigint, team_id bigint,
                                         start_probability numeric, depth_group text, depth_rank integer);
  get diagnostics n = row_count;
  analyze public.fpl_depth_start_store;
  return n;
end $$;
revoke all on function public.fpl_replace_depth_start(jsonb) from public, anon, authenticated;
grant execute on function public.fpl_replace_depth_start(jsonb) to service_role;

analyze public.fpl_depth_start_store;
