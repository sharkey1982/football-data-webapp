-- ============================================================================
-- Model Lab foundations (modelling programme B1 + B4, decisions 28 Sep 2026).
--
-- Every model test is registered BEFORE it runs, with its question, metric
-- and pass rule; every scoring is kept, failures included; the sealed
-- holdout (2025/26 and 2026/27) is opened at most once per experiment.
--
-- * lab_sealed_seasons: seasons no model may be tuned on.
-- * lab_experiments: the registry (question, benchmark, metric, decision
--   rule, splits, status, conclusion). Decision rule required up front.
-- * lab_scorings: append-only results per experiment x split x variant.
--   A trigger refuses a second holdout scoring for an experiment, and a
--   holdout scoring for an experiment still missing its decision rule.
-- * model_experiment_predictions becomes append-only: re-running an
--   experiment needs a new experiment name, so a result cannot be quietly
--   overwritten.
-- * lab_market_probs (materialised): de-vigged 1X2 probabilities per match,
--   bookmaker and opening/closing, by three methods -- basic (proportional),
--   power and Shin. 'Avg' (market average) is the continuous benchmark from
--   2019/20; Pinnacle ('PS') ends 8 Jan 2026 and Betfair exchange ('BFE')
--   starts 2024/25.
-- All private: RLS on, no anon/authenticated grants (service role and
-- postgres only). Nothing on the public site reads these.
-- ============================================================================

-- The market-probability view solves two bisections per price row (~170k
-- rows): allow it time.
set local statement_timeout = '15min';

create table public.lab_sealed_seasons (
  season_id bigint primary key references public.seasons (season_id),
  sealed_at timestamptz not null default now(),
  note text
);
alter table public.lab_sealed_seasons enable row level security;

insert into public.lab_sealed_seasons (season_id, note)
select season_id, 'Sealed holdout (decision 28 Sep 2026): no tuning; each experiment opens it once, after registering its decision rule.'
from public.seasons where start_year in (2025, 2026);

create table public.lab_experiments (
  experiment_id text primary key,
  title text not null,
  question text not null,
  benchmark text not null,
  primary_metric text not null default 'mean log loss, paired per-match difference vs benchmark, matchday-clustered SE',
  decision_rule text not null,
  tuning_seasons int[] not null,      -- start years
  validation_seasons int[] not null,
  holdout_seasons int[] not null,
  data_notes text,
  status text not null default 'registered'
    check (status in ('registered', 'tuned', 'validated', 'holdout_opened', 'passed', 'failed', 'null_result', 'abandoned')),
  variants_tried int not null default 0,
  registered_at timestamptz not null default now(),
  holdout_opened_at timestamptz,
  concluded_at timestamptz,
  conclusion text
);
alter table public.lab_experiments enable row level security;

create table public.lab_scorings (
  scoring_id bigint generated always as identity primary key,
  experiment_id text not null references public.lab_experiments (experiment_id),
  split text not null check (split in ('tuning', 'validation', 'holdout')),
  variant text not null,
  n_matches int not null,
  metrics jsonb not null,             -- log loss, RPS, Brier, paired diff, t, weights...
  code_ref text,                      -- git commit of the scorer
  scored_at timestamptz not null default now()
);
alter table public.lab_scorings enable row level security;
create index lab_scorings_experiment on public.lab_scorings (experiment_id, split);

create or replace function public.lab_guard_holdout()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_rule text;
  v_opened timestamptz;
begin
  if tg_op <> 'INSERT' then
    raise exception 'lab_scorings is append-only: % refused', tg_op;
  end if;
  if new.split = 'holdout' then
    select decision_rule, holdout_opened_at into v_rule, v_opened from public.lab_experiments where experiment_id = new.experiment_id;
    if v_rule is null or length(trim(v_rule)) = 0 then
      raise exception 'Experiment % has no registered decision rule: holdout refused', new.experiment_id;
    end if;
    if v_opened is not null and v_opened < now() - interval '1 hour' then
      raise exception 'Holdout for % was opened at %; it can only be scored once', new.experiment_id, v_opened;
    end if;
    update public.lab_experiments
      set holdout_opened_at = coalesce(holdout_opened_at, now()), status = 'holdout_opened'
      where experiment_id = new.experiment_id;
  end if;
  return new;
end;
$$;

create trigger lab_scorings_guard before insert or update or delete on public.lab_scorings
for each row execute function public.lab_guard_holdout();

-- Experiment predictions: append-only from now on.
create trigger model_experiment_predictions_append_only before update or delete on public.model_experiment_predictions
for each row execute function public.refuse_snapshot_changes();

-- De-vig helpers ----------------------------------------------------------------
-- Power method: p_i = r_i^k with k chosen so the probabilities sum to 1
-- (r_i = 1/odds_i). Bisection; k >= 1 whenever the book has a margin.
create or replace function public.lab_devig_power(p_h numeric, p_d numeric, p_a numeric)
returns double precision[]
language plpgsql immutable
set search_path to 'pg_catalog'
as $$
declare
  rh double precision := 1 / p_h; rd double precision := 1 / p_d; ra double precision := 1 / p_a;
  lo double precision := 0.5; hi double precision := 3; k double precision; s double precision;
begin
  for i in 1..60 loop
    k := (lo + hi) / 2;
    s := power(rh, k) + power(rd, k) + power(ra, k);
    if s > 1 then lo := k; else hi := k; end if;
  end loop;
  return array[power(rh, k), power(rd, k), power(ra, k)];
end;
$$;

-- Shin's method: insider share z solved so the implied probabilities sum to 1.
create or replace function public.lab_devig_shin(p_h numeric, p_d numeric, p_a numeric)
returns double precision[]
language plpgsql immutable
set search_path to 'pg_catalog'
as $$
declare
  r double precision[] := array[1 / p_h::double precision, 1 / p_d::double precision, 1 / p_a::double precision];
  b double precision := r[1] + r[2] + r[3];
  lo double precision := 0; hi double precision := 0.4; z double precision; s double precision;
  p double precision[] := array[0, 0, 0]::double precision[];
begin
  if b <= 1 then
    return array[r[1] / b, r[2] / b, r[3] / b];
  end if;
  for i in 1..60 loop
    z := (lo + hi) / 2;
    s := 0;
    for j in 1..3 loop
      p[j] := (sqrt(z * z + 4 * (1 - z) * r[j] * r[j] / b) - z) / (2 * (1 - z));
      s := s + p[j];
    end loop;
    if s > 1 then lo := z; else hi := z; end if;
  end loop;
  return p;
end;
$$;

create materialized view public.lab_market_probs as
select o.match_id, o.bookmaker, o.is_closing,
  1 / o.price_home + 1 / o.price_draw + 1 / o.price_away as overround,
  (1 / o.price_home) / (1 / o.price_home + 1 / o.price_draw + 1 / o.price_away) as basic_home,
  (1 / o.price_draw) / (1 / o.price_home + 1 / o.price_draw + 1 / o.price_away) as basic_draw,
  (1 / o.price_away) / (1 / o.price_home + 1 / o.price_draw + 1 / o.price_away) as basic_away,
  pw[1] as power_home, pw[2] as power_draw, pw[3] as power_away,
  sh[1] as shin_home, sh[2] as shin_draw, sh[3] as shin_away
from public.match_odds o
cross join lateral (select public.lab_devig_power(o.price_home, o.price_draw, o.price_away) pw,
                           public.lab_devig_shin(o.price_home, o.price_draw, o.price_away) sh) x
where o.market = '1x2' and o.bookmaker in ('Avg', 'PS', 'BFE', 'B365', 'Max')
  and o.price_home > 1 and o.price_draw > 1 and o.price_away > 1
  and exists (select 1 from public.matches m where m.match_id = o.match_id and m.match_date >= '2016-07-01');

create unique index lab_market_probs_pk on public.lab_market_probs (match_id, bookmaker, is_closing);

revoke all on public.lab_market_probs from anon, authenticated;
revoke all on public.lab_sealed_seasons, public.lab_experiments, public.lab_scorings from anon, authenticated;

-- Register the first two experiments (before any scoring) ------------------------
insert into public.lab_experiments (experiment_id, title, question, benchmark, decision_rule, tuning_seasons, validation_seasons, holdout_seasons, data_notes)
values
('F0_market_benchmark',
 'Market benchmark and de-vig method',
 'How accurate is each market source (Avg, PS, BFE, B365; opening and closing) under each de-vig method (basic, power, Shin)? Fixes the benchmark for every later football experiment.',
 'none (descriptive)',
 'Descriptive. The benchmark for later experiments is the Avg closing line with the de-vig method of lowest mean log loss on the tuning seasons; ties (difference under 0.001 nats) go to basic. Avg is chosen because it is the only source continuous from 2019/20 to date.',
 array[2019, 2020, 2021, 2022, 2023], array[2024], array[2025, 2026],
 'English leagues E0-E3; matches with both an Avg closing and opening price.'),
('F1_market_dc_pool',
 'Market + Dixon-Coles log-linear pool',
 'Does Dixon-Coles add information to the market? Log-linear pool p ~ q_market^a * p_DC^b (renormalised), a and b fitted on tuning seasons; run against the Avg opening line and against the Avg closing line.',
 'Avg closing (and, separately, Avg opening) de-vigged by the F0 method',
 'Pass if the DC weight b > 0 with t > 2 on the holdout (paired per-match log-loss gain of pool over market, matchday-clustered SE) and the gain has the same sign on validation. Anything else is recorded as a null result. Two variants (opening, closing); best result Holm-adjusted for 2 trials.',
 array[2019, 2020, 2021, 2022, 2023], array[2024], array[2025, 2026],
 'DC predictions: walk-forward weekly fits, dc_v1_1 settings (half-life 180, no shrinkage), experiment dc_walkforward_v1 in model_experiment_predictions; matches where DC has a prediction (newly promoted clubs with too few matches in the window are skipped).');

-- Catalogue ---------------------------------------------------------------------
select public.meta_refresh_flow();

update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Model Lab: seasons sealed as holdout (2025/26, 2026/27 from 28 Sep 2026). No model may be tuned on them; each experiment scores them once, after registering its decision rule (enforced by lab_scorings trigger).',
  refresh_note = 'Static; changed only by migration.', purpose_reviewed_at = now()
where node_key = 'object:lab_sealed_seasons';

update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Model Lab experiment registry: question, benchmark, primary metric, decision rule (required), tuning/validation/holdout seasons, status, variants tried, holdout_opened_at and conclusion. Every experiment is registered before it runs; failures are kept.',
  refresh_note = 'Rows added by migration or the lab scorer.', purpose_reviewed_at = now()
where node_key = 'object:lab_experiments';

update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Model Lab results: one row per experiment x split x variant with metrics (log loss, RPS, Brier, paired difference, t, fitted weights) and the scorer''s git commit. Append-only; a second holdout scoring, or one without a decision rule, is refused (lab_guard_holdout).',
  refresh_note = 'Written by scripts/lab_f1.py (workflow lab-experiment).', purpose_reviewed_at = now()
where node_key = 'object:lab_scorings';

update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'De-vigged 1X2 probabilities per match x bookmaker (Avg, PS, BFE, B365, Max) x opening/closing, by basic (proportional), power and Shin methods, plus the overround. Avg is continuous from 2019/20; PS ends 8 Jan 2026; BFE from 2024/25. Research only.',
  refresh_note = 'Materialised; refresh after odds imports when running experiments (refresh materialized view concurrently public.lab_market_probs).', purpose_reviewed_at = now()
where node_key = 'object:lab_market_probs';

update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Refuses a second holdout scoring per experiment (after a one-hour window for the same run) and any holdout scoring without a decision rule; marks the experiment holdout_opened. Keeps lab_scorings append-only.',
  refresh_note = 'Trigger function.', purpose_reviewed_at = now()
where node_key = 'function:lab_guard_holdout()';

update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Power de-vig: probabilities (1/odds)^k with k solved by bisection so they sum to 1.',
  refresh_note = 'Pure function.', purpose_reviewed_at = now()
where node_key = 'function:lab_devig_power(p_h numeric, p_d numeric, p_a numeric)';

update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Shin de-vig: implied probabilities under Shin''s insider-trading model, insider share z solved by bisection so they sum to 1.',
  refresh_note = 'Pure function.', purpose_reviewed_at = now()
where node_key = 'function:lab_devig_shin(p_h numeric, p_d numeric, p_a numeric)';

update public.meta_flow_nodes set purpose_reviewed_at = now()
where node_key = 'object:model_experiment_predictions';
