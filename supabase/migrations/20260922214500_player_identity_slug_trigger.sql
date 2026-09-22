-- import_fpl_season(8, '2021-22') failed outright with "null value in column
-- slug of relation player_identity": slug was added to that table as NOT NULL
-- with no default and no trigger, and the import's insert doesn't supply one.
-- Every past-season import has been blocked by this since.
--
-- Rather than change the import (and every other writer), the table fills its
-- own slug the way fpl_players already does: slugify the canonical name, and
-- add a numeric suffix if that slug is taken (the column is unique). An
-- existing slug is kept on update so public URLs stay stable.
--
-- Verified after: 2021/22 imported 537 players and 19,531 weekly rows, the
-- first season added since the column was introduced.
create or replace function public.set_player_identity_slug()
returns trigger language plpgsql set search_path to 'public','pg_temp' as $$
declare v_base text; v_candidate text; v_suffix int := 1;
begin
  if tg_op = 'UPDATE' and new.slug is not null and new.canonical_name is not distinct from old.canonical_name then
    return new;
  end if;
  if new.slug is not null and new.slug <> '' then
    return new;
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
end $$;

drop trigger if exists player_identity_slug on public.player_identity;
create trigger player_identity_slug before insert or update on public.player_identity
  for each row execute function public.set_player_identity_slug();
