-- NFL standings: the real division winner of each completed season, from
-- the play-off bracket, ranks first in its division. Before this the
-- ordering (win %, division win %, points difference) put the wrong team
-- first in 6 division-seasons since 2002 where teams tied at the top.
-- Adds won_division (null while a season is in progress) as the last
-- column, so CREATE OR REPLACE keeps the view and its grants.
create or replace view public.nfl_standings with (security_invoker = true) as
with sides as (
  select g.season, g.game_type, tc.franchise, g.home_code as code, g.home_score as pf, g.away_score as pa,
         true as is_home, g.div_game, ha.franchise as me, aa.franchise as opp
  from nfl.games g join nfl.team_codes tc on tc.code = g.home_code
  join nfl.team_codes ha on ha.code = g.home_code join nfl.team_codes aa on aa.code = g.away_code
  where g.home_score is not null
  union all
  select g.season, g.game_type, tc.franchise, g.away_code, g.away_score, g.home_score,
         false, g.div_game, aa.franchise, ha.franchise
  from nfl.games g join nfl.team_codes tc on tc.code = g.away_code
  join nfl.team_codes ha on ha.code = g.home_code join nfl.team_codes aa on aa.code = g.away_code
  where g.home_score is not null
),
reg as (
  select s.season, s.franchise, max(s.code) as code,
    count(*) as played,
    count(*) filter (where s.pf > s.pa) as won,
    count(*) filter (where s.pf < s.pa) as lost,
    count(*) filter (where s.pf = s.pa) as tied,
    sum(s.pf) as points_for, sum(s.pa) as points_against,
    count(*) filter (where s.is_home and s.pf > s.pa) as home_won,
    count(*) filter (where s.is_home and s.pf < s.pa) as home_lost,
    count(*) filter (where not s.is_home and s.pf > s.pa) as away_won,
    count(*) filter (where not s.is_home and s.pf < s.pa) as away_lost,
    count(*) filter (where s.div_game and s.pf > s.pa) as div_won,
    count(*) filter (where s.div_game and s.pf < s.pa) as div_lost,
    count(*) filter (where s.div_game and s.pf = s.pa) as div_tied,
    count(*) filter (where fo.conference = fm.conference and s.pf > s.pa) as conf_won,
    count(*) filter (where fo.conference = fm.conference and s.pf < s.pa) as conf_lost
  from sides s
  join nfl.franchises fm on fm.franchise = s.me
  join nfl.franchises fo on fo.franchise = s.opp
  where s.game_type = 'REG'
  group by s.season, s.franchise
),
post as (
  select season, franchise,
    max(case game_type when 'WC' then 1 when 'DIV' then 2 when 'CON' then 3 when 'SB' then 4 end) as round_reached,
    bool_or(game_type = 'SB' and pf > pa) as won_title
  from sides where game_type <> 'REG'
  group by season, franchise
),
-- Division winners, from the play-offs: since 2002 every division winner is
-- seeded above every wild card, so it either hosts its wild-card game or has
-- a bye (no wild-card game, then a divisional game); a wild card never does
-- either. Checked: exactly one per division in every completed season. This
-- settles the real champion where the simple ordering below gets a tie
-- wrong (2008 AFC East, 2011 AFC West, ...).
div_winners as (
  select season, franchise from sides where game_type <> 'REG'
  group by season, franchise
  having bool_or(game_type = 'WC' and is_home) or (not bool_or(game_type = 'WC') and bool_or(game_type = 'DIV'))
),
seasons_done as (
  select season, bool_or(game_type = 'SB' and home_score is not null) as complete from nfl.games group by season
)
select r.season, f.franchise, f.slug, coalesce(ts.full_name, f.name) as team_name, f.short_name,
  f.conference, f.division,
  r.played, r.won, r.lost, r.tied,
  round((r.won + 0.5 * r.tied)::numeric / nullif(r.played, 0), 3) as win_pct,
  r.points_for, r.points_against, r.points_for - r.points_against as point_diff,
  r.home_won, r.home_lost, r.away_won, r.away_lost,
  r.div_won, r.div_lost, r.div_tied, r.conf_won, r.conf_lost,
  case when p.won_title then 'Won Super Bowl'
       when p.round_reached = 4 then 'Lost Super Bowl'
       when p.round_reached = 3 then 'Lost conference championship'
       when p.round_reached = 2 then 'Lost divisional round'
       when p.round_reached = 1 then 'Lost wild card round' end as playoff_result,
  coalesce(p.round_reached, 0) as playoff_round,
  coalesce(sd.complete, false) as season_complete,
  rank() over (partition by r.season, f.conference, f.division
               order by (dw.franchise is not null) desc,
                        (r.won + 0.5 * r.tied)::numeric / nullif(r.played, 0) desc,
                        (r.div_won + 0.5 * r.div_tied)::numeric / nullif(r.div_won + r.div_lost + r.div_tied, 0) desc nulls last,
                        r.points_for - r.points_against desc) as division_rank,
  case when coalesce(sd.complete, false) then dw.franchise is not null end as won_division
from reg r
join nfl.franchises f on f.franchise = r.franchise
left join nfl.team_seasons ts on ts.season = r.season and ts.code = r.code
left join post p on p.season = r.season and p.franchise = r.franchise
left join seasons_done sd on sd.season = r.season
left join div_winners dw on dw.season = r.season and dw.franchise = r.franchise;


comment on view public.nfl_standings is 'NFL regular-season records per franchise-season with play-off result. won_division is from the play-off bracket (complete seasons only). division_rank puts the division winner first, then orders by win %, division win %, points difference -- NOT the NFL tiebreak procedure.';

-- Guard the bracket rule: exactly one division winner per division in every
-- completed season. If a play-off format change ever breaks the rule, this
-- fails rather than the pages quietly naming the wrong champions.
create or replace function public.check_nfl_integrity()
returns table(check_name text, status text, found bigint, detail text)
language sql stable security definer set search_path = '' as $$
  select 'nfl_results_fresh', case when n = 0 then 'ok' else 'failed' end, n,
    'NFL games kicked off more than 2 days ago still without a score'
  from (select count(*) n from nfl.games where kickoff_at < now() - interval '2 days' and home_score is null) x
  union all
  select 'nfl_standings_complete', case when n = 0 then 'ok' else 'failed' end, n,
    'Complete NFL seasons whose standings do not have 32 teams each with the full regular-season schedule'
  from (select count(*) n from (
          select s.season from public.nfl_standings s where s.season_complete
          group by s.season
          having count(*) <> 32
              or count(*) filter (where s.played + case when s.season = 2022 and s.franchise in ('BUF', 'CIN') then 1 else 0 end
                                    <> case when s.season >= 2021 then 17 else 16 end) > 0) y) x
  union all
  select 'nfl_games_mapped', case when n = 0 then 'ok' else 'failed' end, n,
    'NFL games missing from public.nfl_games (unmapped team code)'
  from (select (select count(*) from nfl.games) - (select count(*) from public.nfl_games) n) x
  union all
  select 'nfl_division_winners', case when n = 0 then 'ok' else 'failed' end, n,
    'Completed NFL division-seasons without exactly one division winner from the play-off bracket'
  from (select count(*) n from (
          select s.season, s.conference, s.division from public.nfl_standings s where s.season_complete
          group by 1, 2, 3 having count(*) filter (where s.won_division) <> 1) y) x
$$;
revoke all on function public.check_nfl_integrity() from public, anon, authenticated;
grant execute on function public.check_nfl_integrity() to service_role;
