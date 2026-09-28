-- ============================================================================
-- Model Lab: the F1 dataset and the service-role grants the lab scorer needs.
--
-- lab_f1_dataset: one row per English league match (E0-E3, 2019/20 on) with
-- the result, the walk-forward Dixon-Coles forecast made before the match
-- (experiment dc_walkforward_v1, dc_v1_1 settings) and the Avg opening and
-- closing lines de-vigged by the F0 benchmark method (basic). Rows without a
-- DC forecast or either price are left out. Private (service role only).
-- ============================================================================

create view public.lab_f1_dataset with (security_invoker = true) as
select m.match_id, m.league_id, s.start_year, m.match_date,
  case when m.full_time_home_goals > m.full_time_away_goals then 'H'
       when m.full_time_home_goals = m.full_time_away_goals then 'D' else 'A' end as result,
  e.p_home as dc_home, e.p_draw as dc_draw, e.p_away as dc_away, e.as_of_date as dc_as_of,
  c.basic_home as close_home, c.basic_draw as close_draw, c.basic_away as close_away,
  o.basic_home as open_home, o.basic_draw as open_draw, o.basic_away as open_away
from public.matches m
join public.seasons s using (season_id)
join public.model_experiment_predictions e
  on e.match_id = m.match_id and e.experiment = 'dc_walkforward_v1' and e.variant = 'hl180_s0' and e.as_of_date < m.match_date
join public.lab_market_probs c on c.match_id = m.match_id and c.bookmaker = 'Avg' and c.is_closing
join public.lab_market_probs o on o.match_id = m.match_id and o.bookmaker = 'Avg' and not o.is_closing
where m.league_id between 1 and 4 and s.start_year >= 2019 and m.full_time_home_goals is not null;

revoke all on public.lab_f1_dataset from anon, authenticated;
grant select on public.lab_f1_dataset, public.lab_market_probs to service_role;
grant insert on public.lab_scorings to service_role;
grant update (status, variants_tried, concluded_at, conclusion, holdout_opened_at) on public.lab_experiments to service_role;

select public.meta_refresh_flow();

update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Experiment F1 input: E0-E3 league matches from 2019/20 with result, the walk-forward Dixon-Coles forecast made before kick-off (dc_walkforward_v1, dc_v1_1 settings) and the Avg opening and closing lines de-vigged (basic, the F0 benchmark method). Private; read by scripts/lab_f1.py.',
  refresh_note = 'View over model_experiment_predictions and lab_market_probs.', purpose_reviewed_at = now()
where node_key = 'object:lab_f1_dataset';
