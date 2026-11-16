-- Live definition exported from the database (view sf_entry_rounds).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.sf_entry_rounds with (security_invoker=true) as
 SELECT sn.entry_id,
    sn.round,
    sn.picks,
    sn.bank,
    sn.transfers,
    sn.hits,
    sn.wildcard,
    sc.points,
    sc.total,
    sc.captain_used,
    sc.subs
   FROM (((sf.entry_round_snapshots sn
     JOIN sf.entries e ON ((e.id = sn.entry_id)))
     JOIN sf.rounds r ON (((r.season_id = e.season_id) AND (r.number = sn.round))))
     LEFT JOIN sf.entry_round_scores sc ON (((sc.entry_id = sn.entry_id) AND (sc.round = sn.round) AND (now() >= sf.reveal_at(r.kickoff_at, 90)))));
