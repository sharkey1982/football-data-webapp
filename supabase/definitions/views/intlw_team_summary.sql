-- Live definition exported from the database (view intlw_team_summary).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intlw_team_summary with (security_invoker=true) as
 SELECT team,
    slug,
    confederation,
    played,
    won,
    drawn,
    lost,
    goals_for,
    goals_against,
    first_match,
    last_match,
    elo,
    elo_rank,
    elo_peak,
    elo_peak_date,
    wc_titles,
    euro_titles,
    unl_titles,
    titles
   FROM intlw.team_summary;
