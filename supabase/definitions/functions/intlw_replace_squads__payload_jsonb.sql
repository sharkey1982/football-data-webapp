-- Live definition exported from the database (function intlw_replace_squads(payload jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.intlw_replace_squads(payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  delete from intlw.squads s
  where s.team in (select r->>'team' from jsonb_array_elements(payload->'squads') r);
  insert into intlw.squads (team, wiki_title, revision_at, intro, caps_as_of, players)
  select r->>'team', r->>'wiki_title', (r->>'revision_at')::timestamptz, r->>'intro', r->>'caps_as_of', (r->>'players')::int
  from jsonb_array_elements(payload->'squads') r;
  insert into intlw.squad_players (team, list, seq, number, position, player, wiki_title, birth_date, caps, goals,
                                  club, club_country, latest_date, latest_text, status,
                                  club_wiki, club_league_country, club_slug, clubelo_name, club_elo, club_elo_rank)
  select r->>'team', r->>'list', (r->>'seq')::int, (r->>'number')::int, r->>'position', r->>'player', r->>'wiki_title',
         (r->>'birth_date')::date, (r->>'caps')::int, (r->>'goals')::int, r->>'club', r->>'club_country',
         (r->>'latest_date')::date, r->>'latest_text', r->>'status',
         r->>'club_wiki', r->>'club_league_country', r->>'club_slug', r->>'clubelo_name',
         (r->>'club_elo')::numeric, (r->>'club_elo_rank')::int
  from jsonb_array_elements(payload->'players') r;
end $function$
;
