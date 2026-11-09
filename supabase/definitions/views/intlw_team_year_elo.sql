-- Live definition exported from the database (view intlw_team_year_elo).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intlw_team_year_elo with (security_invoker=true) as
 SELECT y.team,
    t.slug,
    intlw.name_at(y.team, make_date(y.year, 12, 31)) AS name,
    t.confederation,
    y.year,
    y.elo,
    y.rank,
    y.played
   FROM (intlw.team_year_elo y
     JOIN intlw.teams t ON ((t.team = y.team)));
