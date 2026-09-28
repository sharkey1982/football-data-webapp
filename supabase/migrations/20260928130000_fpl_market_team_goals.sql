-- ============================================================================
-- FPL team goals and clean sheets from market ratings (Model Lab P5 passed,
-- 28 Sep 2026: team-goals log loss better than Dixon-Coles on the holdout,
-- t 6.8; Premier League alone t 3.6; clean-sheet Brier better too).
--
-- fixtures gains market_home_goals / market_away_goals / market_rated_at:
-- each scheduled English league fixture's expected goals from market ratings
-- (scripts/market_ratings.py), written by scripts/refresh_market_goals.py
-- through set_fixture_market_goals() before each FPL projection run. Left
-- null for a league until every team has 3 priced matches that season.
--
-- The FPL projection views use them where present, the Dixon-Coles
-- prediction otherwise:
--   fpl_projection_leaguewide_allocation_v2  team xG allocated to players
--   fpl_projection_leaguewide_points         clean-sheet probability
--   fpl_fixture_bps_projection_v1            bonus inputs
--   fpl_projection_secondary_scoring         saves / goals conceded
-- Match pages, the scorecard, broadcast guides and fixture readiness checks
-- keep reading predicted_*_goals (the model).
-- ============================================================================

alter table public.fixtures
  add column market_home_goals double precision,
  add column market_away_goals double precision,
  add column market_rated_at timestamptz;

comment on column public.fixtures.market_home_goals is 'Expected home goals from market ratings (Model Lab F4/P5). Used by the FPL projection in place of predicted_home_goals where present. Written by refresh_market_goals.py via set_fixture_market_goals().';
comment on column public.fixtures.market_away_goals is 'Expected away goals from market ratings. See market_home_goals.';
comment on column public.fixtures.market_rated_at is 'When market_home_goals / market_away_goals were last written.';

-- One call per league: every scheduled fixture in the league gets the values
-- in p_rows, or null if it is not there (so a league that loses coverage
-- falls back to the model rather than keeping stale values).
create or replace function public.set_fixture_market_goals(p_league_id bigint, p_rows jsonb)
returns integer
language sql
set search_path = public
as $$
  with x as (
    select f.fixture_id, r.home, r.away
    from public.fixtures f
    left join jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(fixture_id bigint, home double precision, away double precision)
      on r.fixture_id = f.fixture_id
    where f.league_id = p_league_id and f.status = 'scheduled'
  ), u as (
    update public.fixtures f
    set market_home_goals = x.home, market_away_goals = x.away,
        market_rated_at = case when x.home is null then null else now() end
    from x where f.fixture_id = x.fixture_id
    returning (x.home is not null) as rated
  )
  select count(*) filter (where rated)::int from u
$$;

revoke all on function public.set_fixture_market_goals(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.set_fixture_market_goals(bigint, jsonb) to service_role;

-- Point the FPL projection views at market goals where present. Each
-- replacement must match an exact number of times, or the migration stops.
do $$
declare
  v record;
  def text;
  opts text;
  n int;
begin
  for v in select * from (values
    ('fpl_projection_leaguewide_allocation_v2', 'THEN f.predicted_home_goals', 'THEN COALESCE(f.market_home_goals, f.predicted_home_goals)', 1),
    ('fpl_projection_leaguewide_allocation_v2', 'ELSE f.predicted_away_goals', 'ELSE COALESCE(f.market_away_goals, f.predicted_away_goals)', 1),
    ('fpl_projection_leaguewide_points', 'exp((- f.predicted_away_goals))', 'exp((- COALESCE(f.market_away_goals, f.predicted_away_goals)))', 2),
    ('fpl_projection_leaguewide_points', 'exp((- f.predicted_home_goals))', 'exp((- COALESCE(f.market_home_goals, f.predicted_home_goals)))', 2),
    ('fpl_fixture_bps_projection_v1', 'THEN f.predicted_away_goals', 'THEN COALESCE(f.market_away_goals, f.predicted_away_goals)', 1),
    ('fpl_fixture_bps_projection_v1', 'ELSE f.predicted_home_goals', 'ELSE COALESCE(f.market_home_goals, f.predicted_home_goals)', 1),
    ('fpl_projection_secondary_scoring', 'f.predicted_home_goals,', 'COALESCE(f.market_home_goals, f.predicted_home_goals) AS predicted_home_goals,', 1),
    ('fpl_projection_secondary_scoring', 'f.predicted_away_goals,', 'COALESCE(f.market_away_goals, f.predicted_away_goals) AS predicted_away_goals,', 1)
  ) as t(view_name, find, repl, expected)
  loop
    def := pg_get_viewdef(('public.' || v.view_name)::regclass);
    n := (length(def) - length(replace(def, v.find, ''))) / length(v.find);
    if n <> v.expected then
      raise exception '%: "%" found % times, expected %', v.view_name, v.find, n, v.expected;
    end if;
    -- Keep the view's options (e.g. security_invoker) and grants.
    select case when c.reloptions is null then '' else ' with (' || array_to_string(c.reloptions, ', ') || ')' end
      into opts from pg_class c where c.oid = ('public.' || v.view_name)::regclass;
    execute format('create or replace view public.%I%s as %s', v.view_name, opts, replace(def, v.find, v.repl));
  end loop;
end $$;

-- Integrity: while Premier League fixtures are scheduled in the next
-- fortnight, their market goals should have been written in the last two
-- days (warning: the FPL projection silently falls back to the model).
do $$
declare
  def text := pg_get_functiondef('public.check_model_integrity'::regproc);
  anchor text := '  -- Catalogue (2026-09-26)';
  addition text := $add$  -- FPL market goals (2026-09-28): Premier League fixtures in the next
  -- fortnight should carry market expected goals written in the last 2 days.
  select 'fpl_market_goals_fresh',
    case when count(*) filter (where market_rated_at is null or market_rated_at < now() - interval '2 days') = 0
         then 'ok' else 'warning' end,
    count(*) filter (where market_rated_at is null or market_rated_at < now() - interval '2 days'),
    'Premier League fixtures in the next 14 days without market expected goals from the last 2 days (refresh_market_goals.py; FPL projection falls back to the model)'
  from public.fixtures
  where league_id = 1 and status = 'scheduled' and kickoff_date between current_date and current_date + 14
  union all
$add$;
begin
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'check_model_integrity anchor not found exactly once';
  end if;
  execute replace(def, anchor, addition || anchor);
end $$;

select public.meta_refresh_flow();

update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Writes market expected goals onto every scheduled fixture of one league (nulls for fixtures not supplied, so a league without market coverage falls back to the model). Called by scripts/refresh_market_goals.py.',
  refresh_note = 'Function.', purpose_reviewed_at = now()
where node_key like 'function:set_fixture_market_goals(%';

update public.meta_flow_nodes set purpose_reviewed_at = now()
where node_key in ('object:fixtures', 'object:fpl_projection_leaguewide_allocation_v2', 'object:fpl_projection_leaguewide_points',
  'object:fpl_fixture_bps_projection_v1', 'object:fpl_projection_secondary_scoring', 'function:check_model_integrity()');
