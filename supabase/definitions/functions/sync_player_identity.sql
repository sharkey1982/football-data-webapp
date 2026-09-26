-- Live definition exported from the database (function sync_player_identity()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.sync_player_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_name text;
  v_slug text;
begin
  if new.fpl_code is null then
    return new;
  end if;

  v_name := trim(coalesce(new.first_name,'') || ' ' || coalesce(new.second_name,''));
  v_slug := coalesce(public.slugify_player_name(v_name), 'player-' || new.fpl_code);

  -- Deterministic collision handling: append the code, never a counter,
  -- so two players can't swap slugs on a reimport.
  if exists (select 1 from public.player_identity i where i.slug = v_slug and i.fpl_code <> new.fpl_code) then
    v_slug := v_slug || '-' || new.fpl_code;
  end if;

  insert into public.player_identity (fpl_code, canonical_name, slug, first_seen_season_id, last_seen_season_id)
  values (new.fpl_code, v_name, v_slug, new.season_id, new.season_id)
  on conflict (fpl_code) do update set
    -- Widen the seen-range; never narrow it. Slug and name are left
    -- alone on conflict: an existing URL must keep working.
    first_seen_season_id = least(public.player_identity.first_seen_season_id, excluded.first_seen_season_id),
    last_seen_season_id  = greatest(public.player_identity.last_seen_season_id, excluded.last_seen_season_id),
    updated_at = now();
  return new;
end;
$function$
;
