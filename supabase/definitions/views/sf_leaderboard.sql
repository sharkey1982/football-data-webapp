-- Live definition exported from the database (view sf_leaderboard).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.sf_leaderboard with (security_invoker=true) as
 SELECT e.season_id,
    e.id AS entry_id,
    e.team_name,
    m.display_name,
    m.is_bot,
    m.bot_kind,
    e.joined_round,
    (COALESCE(sum(sc.total), (0)::bigint))::integer AS total,
    (COALESCE(sum(sc.hits), (0)::bigint))::integer AS hits,
    ( SELECT x.total
           FROM (sf.entry_round_scores x
             JOIN sf.rounds r2 ON (((r2.season_id = e.season_id) AND (r2.number = x.round))))
          WHERE ((x.entry_id = e.id) AND (now() >= sf.reveal_at(r2.kickoff_at, 90)))
          ORDER BY x.round DESC
         LIMIT 1) AS last_round
   FROM ((sf.entries e
     JOIN sf.fantasy_managers m ON ((m.id = e.manager_id)))
     LEFT JOIN sf.entry_round_scores sc ON (((sc.entry_id = e.id) AND (EXISTS ( SELECT 1
           FROM sf.rounds r
          WHERE ((r.season_id = e.season_id) AND (r.number = sc.round) AND (now() >= sf.reveal_at(r.kickoff_at, 90))))))))
  GROUP BY e.season_id, e.id, e.team_name, m.display_name, m.is_bot, m.bot_kind, e.joined_round;
