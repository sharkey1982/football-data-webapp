-- Live definition exported from the database (view sf_player_rounds).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.sf_player_rounds with (security_invoker=true) as
 SELECT f.season_id,
    f.round,
    x.player_id,
    x.minutes,
    x.started,
    x.goals,
    x.assists,
    x.clean_sheet,
    x.saves,
    x.yellow,
    x.red,
    x.bonus,
    x.points
   FROM ((sf.player_match_stats x
     JOIN sf.fixtures f ON ((f.id = x.fixture_id)))
     JOIN sf.rounds r ON (((r.season_id = f.season_id) AND (r.number = f.round))))
  WHERE (now() >= sf.reveal_at(r.kickoff_at, 90));
