-- Live definition exported from the database (function intlw_replace_projections(payload jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.intlw_replace_projections(payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into intlw.model_info (model, params, fitted_through, updated_at)
  select payload->'model'->>'model', payload->'model'->'params', (payload->'model'->>'fitted_through')::int, now()
  on conflict (model) do update set params = excluded.params, fitted_through = excluded.fitted_through, updated_at = now();

  delete from intlw.projections where true;
  insert into intlw.projections (fixture_key, model, elo_home, elo_away, p_home, p_draw, p_away, xg_home, xg_away, scores)
  select r->>'fixture_key', r->>'model', (r->>'elo_home')::numeric, (r->>'elo_away')::numeric,
         (r->>'p_home')::numeric, (r->>'p_draw')::numeric, (r->>'p_away')::numeric,
         (r->>'xg_home')::numeric, (r->>'xg_away')::numeric, r->'scores'
  from jsonb_array_elements(payload->'projections') r
  where exists (select 1 from intlw.fixtures f where f.fixture_key = r->>'fixture_key');

  delete from intlw.group_odds where true;
  insert into intlw.group_odds (edition_key, group_label, team, played, points, gd, gf, p_pos, exp_points, sims, zones)
  select r->>'edition_key', r->>'group_label', r->>'team', (r->>'played')::int, (r->>'points')::int,
         (r->>'gd')::int, (r->>'gf')::int, array(select jsonb_array_elements_text(r->'p_pos')::numeric),
         (r->>'exp_points')::numeric, (r->>'sims')::int, coalesce(r->'zones', '{}'::jsonb)
  from jsonb_array_elements(payload->'group_odds') r;
end $function$
;
