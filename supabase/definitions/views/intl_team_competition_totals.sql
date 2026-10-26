-- Live definition exported from the database (view intl_team_competition_totals).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intl_team_competition_totals with (security_invoker=true) as
 SELECT t.team,
    t.competition,
    c.kind AS competition_kind,
    t.played,
    t.won,
    t.drawn,
    t.lost,
    t.goals_for,
    t.goals_against,
    t.first_match,
    t.last_match
   FROM (intl.team_competition_totals t
     JOIN intl.competitions c ON ((c.name = t.competition)));
