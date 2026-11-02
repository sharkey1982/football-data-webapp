-- Live definition exported from the database (view nfl_players).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.nfl_players with (security_invoker=true) as
 SELECT p.player_id,
    p.slug,
    p.name,
    p."position",
    p.position_group,
    f.franchise AS team,
    f.slug AS team_slug,
    f.name AS team_name,
    p.birth_date,
    p.height_in,
    p.weight_lb,
    p.college,
    p.rookie_season,
    p.draft_year,
    p.draft_round,
    p.draft_pick,
    p.jersey_number,
    p.status,
    p.years_exp
   FROM ((nfl.players p
     LEFT JOIN nfl.team_codes tc ON ((tc.code = p.latest_team)))
     LEFT JOIN nfl.franchises f ON ((f.franchise = tc.franchise)));
