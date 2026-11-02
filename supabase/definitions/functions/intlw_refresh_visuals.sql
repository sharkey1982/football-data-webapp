-- Live definition exported from the database (function intlw_refresh_visuals()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.intlw_refresh_visuals()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  delete from intlw.team_year_elo where true;
  insert into intlw.team_year_elo (team, year, elo, rank, played)
  with sides as (
    select home_team team, match_date d, match_key k, elo_home_pre + elo_change after from intlw.matches
    union all
    select away_team, match_date, match_key, elo_away_pre - elo_change from intlw.matches
  ),
  year_end as (   -- last rating in each year a team played
    select distinct on (team, y) team, extract(year from d)::int y, after,
           count(*) over (partition by team, extract(year from d)::int) n
    from sides order by team, y, d desc, k desc
  ),
  span as (       -- every year from a team's first game to its last
    select t.team, y
    from intlw.teams t
    cross join lateral generate_series(extract(year from t.first_match)::int, extract(year from t.last_match)::int) y
    where t.confederation is not null
  ),
  filled as (
    select s.team, s.y, ye.after, coalesce(ye.n, 0) n,
           count(ye.after) over (partition by s.team order by s.y) grp,
           max(case when ye.after is not null then s.y end) over (partition by s.team order by s.y) last_played
    from span s left join year_end ye on ye.team = s.team and ye.y = s.y
  ),
  carried as (
    select team, y, n, last_played,
           first_value(after) over (partition by team, grp order by y) elo
    from filled
  )
  select team, y, round(elo, 1), rank() over (partition by y order by elo desc), n
  from carried
  where elo is not null and last_played >= y - 3;

  delete from intlw.upsets where true;
  insert into intlw.upsets (match_key, winner, loser, expectation, kind)
  select match_key,
         case when home_score > away_score then home_team else away_team end,
         case when home_score > away_score then away_team else home_team end,
         round(case when home_score > away_score then e else 1 - e end, 4),
         kind
  from (
    select m.*, c.kind,
           1 / (power(10, -(m.elo_home_pre - m.elo_away_pre + case when m.neutral then 0 else 100 end) / 400) + 1) e
    from intlw.matches m join intlw.competitions c on c.name = m.competition
    where c.kind <> 'friendly' and m.home_score <> m.away_score
      and m.elo_home_pre is not null and m.elo_away_pre is not null
  ) s
  where case when home_score > away_score then e else 1 - e end < 0.25;
end $function$
;
