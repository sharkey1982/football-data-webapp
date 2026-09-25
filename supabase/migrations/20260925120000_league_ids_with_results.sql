-- Competitions that have at least one result in matches. Drives filters that
-- should only offer data-backed options (League Table country/division).
create or replace function public.get_league_ids_with_results()
returns setof integer
language sql stable security invoker set search_path = public
as $$
  select l.league_id from leagues l
  where exists (select 1 from matches m where m.league_id = l.league_id)
$$;
comment on function public.get_league_ids_with_results() is
  'Competitions that have at least one result in matches -- drives filters that should only offer data-backed options (e.g. League Table country/division).';
grant execute on function public.get_league_ids_with_results() to anon, authenticated;
