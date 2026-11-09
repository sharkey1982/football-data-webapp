-- Live definition exported from the database (function tennis_set_people(rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.tennis_set_people(rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  delete from tennis.player_people where true;
  insert into tennis.player_people (player_id, wikidata_qid, full_name, country, all_countries, birth_date, hand, match_method)
  select r.player_id, r.wikidata_qid, r.full_name, r.country, r.all_countries, r.birth_date, r.hand, r.match_method
  from jsonb_to_recordset(rows) r(player_id bigint, wikidata_qid text, full_name text, country text, all_countries text[],
                                  birth_date date, hand text, match_method text)
  where exists (select 1 from tennis.players p where p.player_id = r.player_id);
  get diagnostics n = row_count;
  return n;
end $function$
;
