-- Live definition exported from the database (view intlw_group_odds).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intlw_group_odds with (security_invoker=true) as
 SELECT o.edition_key,
    o.group_label,
    o.team,
    t.slug,
    o.played,
    o.points,
    o.gd,
    o.gf,
    o.p_pos,
    o.exp_points,
    o.sims,
    o.updated_at,
    o.zones
   FROM (intlw.group_odds o
     JOIN intlw.teams t ON ((t.team = o.team)));
