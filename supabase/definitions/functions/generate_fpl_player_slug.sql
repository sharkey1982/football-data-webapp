-- Live definition exported from the database (function generate_fpl_player_slug()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.generate_fpl_player_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_base text;
  v_candidate text;
  v_suffix int := 1;
begin
  v_base := public.slugify(coalesce(nullif(trim(coalesce(new.first_name,'') || ' ' || coalesce(new.second_name,'')), ''), new.web_name));
  if v_base is null then
    new.slug := null;
    return new;
  end if;

  -- Unchanged name on an update: keep the existing slug so a public URL
  -- stays stable rather than churning on every ingestion pass.
  if tg_op = 'UPDATE' and new.slug is not null
     and public.slugify(coalesce(nullif(trim(coalesce(old.first_name,'') || ' ' || coalesce(old.second_name,'')), ''), old.web_name)) is not distinct from v_base then
    return new;
  end if;

  v_candidate := v_base;
  while exists (
    select 1 from public.fpl_players
    where season_id = new.season_id and slug = v_candidate
      and fpl_player_id is distinct from new.fpl_player_id
  ) loop
    v_suffix := v_suffix + 1;
    v_candidate := v_base || '-' || v_suffix;
  end loop;

  new.slug := v_candidate;
  return new;
end;
$function$
;
