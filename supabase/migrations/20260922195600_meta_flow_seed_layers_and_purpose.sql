-- Layers for every object, and a starting description for the ones people ask
-- about. Written as updates that only fill blanks, so re-running never
-- overwrites commentary someone has added since.
update public.meta_flow_nodes set layer = case
  when kind='function' and obj_name like 'get\_%' then 'api'
  when kind='function' and (obj_name like 'import\_%' or obj_name like 'refresh\_%' or obj_name like 'backfill\_%' or obj_name like 'sync\_%') then 'pipeline'
  when kind='function' then 'helper'
  when kind in ('view','matview') then 'model'
  when obj_name like 'backup\_%' or obj_name like '%\_tmp' then 'scratch'
  when obj_name like 'finance\_%' then 'finance'
  when obj_name like 'fpl\_%' then 'fantasy'
  when obj_name in ('matches','fixtures','teams','leagues','seasons','players','match_odds') then 'source'
  else 'model' end
where layer is null;

update public.meta_flow_nodes n set purpose = coalesce(n.purpose, v.purpose), refresh_note = coalesce(n.refresh_note, v.refresh)
from (values
 ('object:matches','Every historical result: the archive the model is fitted on.','Daily Premier League Import (GitHub Actions)'),
 ('object:fixtures','Upcoming and played fixtures, with the model''s predicted goals.','backfill_fixture_predictions, nightly'),
 ('object:teams','Clubs, their slugs and display names.','With each import'),
 ('object:fpl_players','FPL player records for the season.','FPL pipeline, twice daily'),
 ('object:fpl_player_projections','Per-player, per-fixture projections shown across the Fantasy pages.','FPL projections pipeline'),
 ('object:finance_published_periods','Published club accounts by financial year: the finance pages read this.','Finance ingestion (ChatGPT-side), ad hoc'),
 ('object:fpl_fixture_bonus_montecarlo_v1','Simulated bonus points per player per fixture.','refresh_fpl_bonus_v3_for_fixture'),
 ('function:backfill_fixture_predictions()','Writes predicted goals onto every scheduled fixture. The nightly job calls this.','Nightly, after the results import'),
 ('function:get_season_player_projections_json(p_matchweek integer)','Season projections as JSON. Repointed 2026-09-22 at the montecarlo bonus table after the v3 view was dropped.','On demand')
) as v(node_key,purpose,refresh)
where n.node_key=v.node_key;
