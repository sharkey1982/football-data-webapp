-- Live definition exported from the database (function set_player_identity_slug()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.set_player_identity_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_base text; v_candidate text; v_suffix int := 1;
begin
  if tg_op = 'UPDATE' and new.slug is not null and new.canonical_name is not distinct from old.canonical_name then
    return new;                              -- name unchanged: leave the slug alone
  end if;
  if new.slug is not null and new.slug <> '' then
    return new;                              -- caller supplied one
  end if;
  v_base := public.slugify_player_name(new.canonical_name);
  if v_base is null or v_base = '' then
    v_base := 'player-' || new.fpl_code::text;
  end if;
  v_candidate := v_base;
  while exists (select 1 from public.player_identity pi
                where pi.slug = v_candidate and pi.fpl_code <> new.fpl_code) loop
    v_suffix := v_suffix + 1;
    v_candidate := v_base || '-' || v_suffix::text;
  end loop;
  new.slug := v_candidate;
  return new;
end $function$
;
