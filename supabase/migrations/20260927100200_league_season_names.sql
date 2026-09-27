-- ============================================================================
-- Division names by era
--
-- leagues.name is today's name. With seasons back to 1992/93 a historic
-- table would otherwise read "Championship 1998/99" for what was the First
-- Division. league_season_names records the name a division had over a
-- range of seasons (by start_year, inclusive; to = null means "still");
-- league_name_for_season() gives the name for (league_id, season_id),
-- falling back to leagues.name where no era row covers the season, so
-- every league without rows -- and every current season -- is unchanged.
--
-- English names:
--   Premier League from 1992/93 (the "FA Premier League" branding aside).
--   Tiers 2-4: First / Second / Third Division 1992/93 to 2003/04;
--   Championship / League One / League Two from 2004/05.
--   Tier 5: Football Conference 1986/87 to 2003/04; Conference National
--   2004/05 to 2014/15; National League from 2015/16.
--
-- league_season_display_names (league x season -> name) is what the site
-- reads; league_standings.league_name now uses the era name too, so team
-- histories read "3rd in the First Division" for 1998/99.
-- ============================================================================

create table public.league_season_names (
  league_id bigint not null references public.leagues (league_id),
  from_season_start_year integer not null,
  to_season_start_year integer,
  name text not null check (btrim(name) <> ''),
  primary key (league_id, from_season_start_year),
  constraint league_season_names_range_check
    check (to_season_start_year is null or to_season_start_year >= from_season_start_year)
);
comment on table public.league_season_names is
  'The name a division had over a range of seasons (by seasons.start_year, inclusive; to_season_start_year null = still in use). Read through league_name_for_season(); leagues.name is the fallback and the current name.';

alter table public.league_season_names enable row level security;
create policy "Public read access" on public.league_season_names
  for select to anon, authenticated using (true);
grant select on public.league_season_names to anon, authenticated;

insert into public.league_season_names (league_id, from_season_start_year, to_season_start_year, name)
select l.league_id, v.from_year, v.to_year, v.name
from (values
  ('E0', 1992, null::integer, 'Premier League'),
  ('E1', 1992, 2003, 'First Division'),
  ('E1', 2004, null, 'Championship'),
  ('E2', 1992, 2003, 'Second Division'),
  ('E2', 2004, null, 'League One'),
  ('E3', 1992, 2003, 'Third Division'),
  ('E3', 2004, null, 'League Two'),
  ('EC', 1986, 2003, 'Football Conference'),
  ('EC', 2004, 2014, 'Conference National'),
  ('EC', 2015, null, 'National League')
) v(code, from_year, to_year, name)
join public.leagues l on l.code = v.code and l.competition_type = 'league'
on conflict (league_id, from_season_start_year) do nothing;

-- Guards: all ten rows landed (one league per code), no two ranges for a
-- league overlap, and the open-ended (current) name matches leagues.name.
do $$
begin
  if (select count(*) from public.league_season_names) <> 10 then
    raise exception 'Expected 10 league_season_names rows';
  end if;
  if exists (
    select 1 from public.league_season_names a join public.league_season_names b
      on a.league_id = b.league_id and a.from_season_start_year < b.from_season_start_year
     where a.to_season_start_year is null or a.to_season_start_year >= b.from_season_start_year) then
    raise exception 'Overlapping league_season_names ranges';
  end if;
  if exists (
    select 1 from public.league_season_names n join public.leagues l using (league_id)
     where n.to_season_start_year is null and n.name <> l.name) then
    raise exception 'Current era name differs from leagues.name';
  end if;
end $$;

create or replace function public.league_name_for_season(p_league_id bigint, p_season_id bigint)
returns text language sql stable
set search_path to 'public', 'pg_temp'
as $$
  -- The division's name in that season; today's name where no era row applies.
  select coalesce(
    (select n.name
       from public.league_season_names n
       join public.seasons s on s.season_id = p_season_id
      where n.league_id = p_league_id
        and s.start_year >= n.from_season_start_year
        and (n.to_season_start_year is null or s.start_year <= n.to_season_start_year)
      order by n.from_season_start_year desc
      limit 1),
    (select l.name from public.leagues l where l.league_id = p_league_id))
$$;
comment on function public.league_name_for_season(bigint, bigint) is
  'Name of a division in a given season (e.g. E1 in 1998/99 = First Division), from league_season_names; falls back to leagues.name.';

create view public.league_season_display_names with (security_invoker = true) as
select l.league_id, s.season_id, public.league_name_for_season(l.league_id, s.season_id) as name
from public.leagues l cross join public.seasons s;
comment on view public.league_season_display_names is
  'Every league x season with the division''s name in that season (league_name_for_season). Read by the site to label historic tables and matches.';
grant select on public.league_season_display_names to anon, authenticated, service_role;

-- league_standings: era name in league_name (current seasons unchanged).
do $mig$
declare
  src text := pg_get_viewdef('public.league_standings'::regclass, true);
  anchor text := 'l.name AS league_name';
  n int;
begin
  n := (length(src) - length(replace(src, anchor, ''))) / length(anchor);
  if n <> 1 then
    raise exception 'league_standings anchor matched % times (expected 1)', n;
  end if;
  execute 'create or replace view public.league_standings as '
    || replace(src, anchor, 'public.league_name_for_season(r.league_id, r.season_id) AS league_name');
end
$mig$;
grant select on public.league_standings to anon, authenticated, service_role;
