-- Live definition exported from the database (function intlw_replace_club_elo(payload jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.intlw_replace_club_elo(payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if jsonb_array_length(payload) < 100 then
    raise exception 'ClubElo table too short (% rows) -- keeping the stored one', jsonb_array_length(payload);
  end if;
  delete from intlw.club_elo where true;
  insert into intlw.club_elo (club, country, level, elo, rank, club_slug, fetched_on)
  select r->>'club', r->>'country', (r->>'level')::int, (r->>'elo')::numeric, (r->>'rank')::int, r->>'club_slug',
         (r->>'fetched_on')::date
  from jsonb_array_elements(payload) r
  on conflict (club) do nothing;
end $function$
;
