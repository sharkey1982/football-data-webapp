-- Live definition exported from the database (function get_my_club_cards(p_team_ids bigint[])).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_my_club_cards(p_team_ids bigint[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(c.card order by u.ord), '[]')
    from unnest(p_team_ids[1:4]) with ordinality u(tid, ord)
    cross join lateral (select private.my_club_card(u.tid) card) c
   where c.card is not null
$function$
;
