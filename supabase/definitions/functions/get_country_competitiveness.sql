-- Live definition exported from the database (function get_country_competitiveness()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_country_competitiveness()
 RETURNS TABLE(league_code text, season_label text, clubs bigint, points_spread numeric, bottom_not_losing_pct numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with base as (
    select l.code, s.label, m.home_team_id h, m.away_team_id a, m.full_time_result r
    from public.matches m
    join public.leagues l on l.league_id = m.league_id
    join public.seasons s on s.season_id = m.season_id
    where l.competition_type = 'league' and (l.tier = 1 or l.code = 'E0')
      and m.full_time_result is not null
  ), pts as (
    select code, label, team, sum(p)::numeric / count(*) ppg from (
      select code, label, h team, case r when 'H' then 3 when 'D' then 1 else 0 end p from base
      union all
      select code, label, a, case r when 'A' then 3 when 'D' then 1 else 0 end from base
    ) x group by code, label, team
  ), halves as (
    select code, label, team, ppg,
      percent_rank() over (partition by code, label order by ppg desc) < 0.5 top_half
    from pts
  ), cross_half as (
    select b.code, b.label,
      count(*) games,
      count(*) filter (where (th.top_half and b.r <> 'H') or (ta.top_half and b.r <> 'A')) bottom_not_losing
    from base b
    join halves th on th.code = b.code and th.label = b.label and th.team = b.h
    join halves ta on ta.code = b.code and ta.label = b.label and ta.team = b.a
    where th.top_half <> ta.top_half
    group by b.code, b.label
  )
  select h.code, h.label, count(*)::bigint,
    round(stddev_pop(h.ppg), 3),
    round(100.0 * max(c.bottom_not_losing) / nullif(max(c.games), 0), 1)
  from halves h join cross_half c on c.code = h.code and c.label = h.label
  group by h.code, h.label
  order by h.code, h.label;
$function$
;
