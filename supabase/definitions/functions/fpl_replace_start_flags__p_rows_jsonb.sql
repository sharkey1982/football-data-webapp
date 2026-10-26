-- Live definition exported from the database (function fpl_replace_start_flags(p_rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_replace_start_flags(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n integer;
begin
  delete from public.fpl_start_flags;
  insert into public.fpl_start_flags (fixture_id, team_id, fpl_player_id, raw_probability, probability, capped,
                                      starts_last, avail_last, depth_rank, tactical_role, role_source)
  select (r->>'fixture_id')::bigint, (r->>'team_id')::bigint, (r->>'fpl_player_id')::int,
         (r->>'raw_probability')::numeric, (r->>'probability')::numeric, coalesce((r->>'capped')::boolean, false),
         (r->>'starts_last')::numeric, (r->>'avail_last')::numeric, (r->>'depth_rank')::int, r->>'role', r->>'role_source'
    from jsonb_array_elements(coalesce(p_rows, '[]')) r
  on conflict (fixture_id, fpl_player_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$function$
;
