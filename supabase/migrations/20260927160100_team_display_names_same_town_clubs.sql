-- ============================================================================
-- Display names for clubs that share a town name with an earlier club
--
-- The history backfill added clubs that were wound up or expelled and later
-- replaced by a new club of the same town (docs/history-backfill.md):
--   Halifax Town (team halifax-town, to 2007/08)  v  team halifax, "Halifax"
--   Chester City (team chester-city, to 2009/10)  v  team chester, "Chester"
-- The current clubs showed the short football-data.co.uk spelling, so team
-- search for "Halifax" listed "Halifax" and "Halifax Town", which reads as
-- the same club. They now show their own names: FC Halifax Town (founded
-- 2008) and Chester FC (founded 2010). Likewise team telford-united is AFC
-- Telford United (founded 2004); "Telford United" was the club that folded
-- in 2004.
--
-- Salisbury City, Farsley Celtic and Farnborough Town (the old clubs) have
-- no namesake team in the data, and their display names are already their
-- full old names.
--
-- Only display_name changes: canonical_name (used to match source rows),
-- aliases and slugs (URLs /teams/halifax, /teams/chester,
-- /teams/telford-united) are unchanged. No two teams share a display name
-- before or after (checked case-insensitively). resolve_broadcast_team()
-- also matches on display_name: "FC Halifax Town" and "Chester FC" now
-- resolve at level 2 to the current clubs, as they already did via aliases.
-- Idempotent.
-- ============================================================================

update public.teams t
set display_name = v.new_name
from (values
  ('halifax', 'Halifax', 'FC Halifax Town'),
  ('chester', 'Chester', 'Chester FC'),
  ('telford-united', 'Telford United', 'AFC Telford United')
) v(slug, old_name, new_name)
where t.slug = v.slug
  and t.display_name = v.old_name;

do $$
begin
  if exists (select 1 from public.teams group by lower(display_name) having count(*) > 1) then
    raise exception 'duplicate display_name after update';
  end if;
end $$;
