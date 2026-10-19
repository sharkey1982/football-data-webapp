-- Live definition exported from the database (function sf_test_rpc(p_fn text, p_args jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.sf_test_rpc(p_fn text, p_args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u text; t boolean; pub boolean; out jsonb;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  u := case p_fn
    when 'sf_create_season' then p_args->'p'->'universe'->>'id'
    when 'sf_runner_state' then p_args->>'p_universe'
    when 'sf_ensure_bot' then sf.season_universe((p_args->>'p_season')::bigint)
    when 'sf_lock_round' then sf.season_universe((p_args->>'p_season')::bigint)
    when 'sf_commit_round' then sf.season_universe((p_args->'p'->>'season_id')::bigint)
    when 'sf_bot_save_team' then (select s.universe_id from sf.entries e join sf.seasons s on s.id = e.season_id where e.id = (p_args->>'p_entry')::bigint)
    else null end;
  if u is null then raise exception 'not allowed: %', p_fn; end if;
  select is_test, is_public into t, pub from sf.universes where id = u;
  if p_fn = 'sf_create_season' then
    if found and not t then raise exception 'universe % is not a test league', u; end if;
    if not found and u !~ '^t-[a-z0-9-]{1,40}$' then raise exception 'a new test league id starts t-'; end if;
  elsif not found or not t or pub then
    raise exception 'universe % is not a test league', u;
  end if;

  case p_fn
    when 'sf_create_season' then
      out := to_jsonb(public.sf_create_season(p_args->'p'));
      update sf.universes set is_test = true where id = u and not is_test;
    when 'sf_runner_state' then out := public.sf_runner_state(u);
    when 'sf_ensure_bot' then out := to_jsonb(public.sf_ensure_bot((p_args->>'p_season')::bigint, p_args->>'p_kind', p_args->>'p_key', p_args->>'p_name'));
    when 'sf_lock_round' then out := to_jsonb(public.sf_lock_round((p_args->>'p_season')::bigint, (p_args->>'p_round')::int, coalesce((p_args->>'p_force')::boolean, false)));
    when 'sf_commit_round' then out := to_jsonb(public.sf_commit_round(p_args->'p'));
    when 'sf_bot_save_team' then out := public.sf_bot_save_team((p_args->>'p_entry')::bigint, p_args->'p');
  end case;
  return out;
end $function$
;
