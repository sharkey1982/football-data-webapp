-- Cuts the manual cross-referencing step when importing a new season/league:
-- pass the source and the distinct HomeTeam/AwayTeam names straight from a
-- fetched CSV, get back only the ones with no team_aliases row yet. Used
-- before creating any new teams/aliases for a season, so the only names
-- worked through by hand are the ones that are actually new -- turnover
-- within an existing league (promoted/relegated clubs year to year) is
-- exactly what this is for.
create or replace function public.get_unmapped_alias_names(p_source text, p_raw_names text[])
returns table(raw_name text)
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  select rn from unnest(p_raw_names) as rn
  where not exists (
    select 1 from team_aliases ta where ta.source_name = p_source and ta.raw_name = rn
  )
  order by rn;
$$;
grant execute on function public.get_unmapped_alias_names(text, text[]) to service_role, authenticated;
