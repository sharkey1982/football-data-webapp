-- ============================================================================
-- FPL start chance: a first choice's 85% floor wears down with evidence;
-- pecking-order labels say what they are (9 Oct 2026).
--
-- Found 8 Oct (captaincy article checks): 20 outfield players with under
-- 200 minutes had start chances of 0.68-0.90, mostly a flat 0.85, labelled
-- 'nailed_history'. Cause: the club pecking orders were seeded on 14 Sep
-- from Fantasy Football Scout's pre-season line-ups, and every first choice
-- gets max(start rate, 0.85) however many matches he has been fit and not
-- picked (Doku 0 starts, Sakamoto 0 from 5, Flemming 0 from 3). And any
-- pecking-order chance of 0.80+ was labelled 'nailed_history'.
--
-- 1. scripts/fpl_depth_chart.py: first choice = min(0.97, max(start rate,
--    (starts + 0.85 x 3) / (available matches + 3))). With no available
--    matches (a regular back from injury) he keeps the floor. Rule and
--    decision fixed before scoring; backtest on GW3-5 (1,761 player-matches,
--    scripts/backtest_depth_floor.py, analysis_results depth_floor_backtest):
--    Brier 0.0841 -> 0.0784, log loss 0.2853 -> 0.2705, better in each of
--    GW3, 4 and 5; paired Brier difference -0.0058 (SE 0.0022).
--    get_fpl_depth_inputs() now also returns starts and available matches.
-- 2. Labels: pecking-order chances are 'depth_chart_firm' (0.80+),
--    'depth_chart_likely' (0.55+) or 'depth_chart_backup', carried through
--    as '<label>_v6' with the same line-up confidence as before (0.80 /
--    0.70 / 0.55). Nothing on the site reads the labels.
-- Definitions are edited by exact string replacement on the live text,
-- each anchor asserted (docs: refresh_fpl, "never retype the body").
-- ============================================================================

-- 1. Depth inputs: + starts, available matches (return type changes, so drop first).
drop function if exists public.get_fpl_depth_inputs();
create function public.get_fpl_depth_inputs()
 returns table(fixture_id bigint, team_id bigint, formation text, fpl_player_id bigint, element_type integer, tactical_role text,
               depth_rank integer, availability double precision, rate double precision, start_if_fit double precision,
               starts double precision, available double precision)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select a.fixture_id::bigint, a.team_id::bigint, coalesce(c.formation, ''),
         d.fpl_player_id::bigint, p.element_type::integer, d.tactical_role, d.depth_rank::integer,
         a.availability::float8,
         case when p.element_type = 1 then null
              else least(0.97, (coalesce(sr.starts, 0) + coalesce(sr.prior_rate, 0.20)) / (coalesce(sr.available_matches, 0) + 1.0)) end::float8,
         fc.start_if_fit::float8,
         case when p.element_type = 1 then null else coalesce(sr.starts, 0) end::float8,
         case when p.element_type = 1 then null else coalesce(sr.available_matches, 0) end::float8
    from public.fpl_fixture_availability_store a
    join public.team_player_tactical_defaults d
      on d.fpl_player_id = a.fpl_player_id and d.team_id = a.team_id and d.season_id = public.fpl_current_season_id()
    join public.fpl_players p on p.fpl_player_id = a.fpl_player_id and p.season_id = public.fpl_current_season_id()
    left join public.fixture_team_tactical_consensus c on c.fixture_id = a.fixture_id and c.team_id = a.team_id
    left join public.fpl_player_start_record sr on sr.fpl_player_id = a.fpl_player_id
    left join lateral (
      select x.start_if_fit from public.fpl_player_first_choice x
       where x.fpl_player_id = a.fpl_player_id and x.removed_at is null
         and a.kickoff_date between x.effective_from and coalesce(x.effective_to, '9999-12-31'::date)
       order by x.set_at desc limit 1) fc on true;
$function$;
revoke all on function public.get_fpl_depth_inputs() from public, anon, authenticated;
grant execute on function public.get_fpl_depth_inputs() to service_role;

-- 2. Labels.
do $$
declare
  v text; n int; opts text;
  a text; b text;
begin
  -- 2a. fpl_fallback_start_probability_v6: pecking-order labels.
  v := pg_get_viewdef('public.fpl_fallback_start_probability_v6'::regclass);
  foreach a in array array[
    $a$WHEN (depth_start >= 0.80) THEN 'nailed_history'::text$a$,
    $a$WHEN (depth_start >= 0.55) THEN 'strong_history'::text
                ELSE 'history_hierarchy'::text
            END
            WHEN (start_if_fit IS NOT NULL$a$]
  loop
    n := (length(v) - length(replace(v, a, ''))) / length(a);
    if n <> 1 then raise exception 'fallback view anchor matched % times: %', n, left(a, 60); end if;
  end loop;
  v := replace(v, $a$WHEN (depth_start >= 0.80) THEN 'nailed_history'::text$a$, $a$WHEN (depth_start >= 0.80) THEN 'depth_chart_firm'::text$a$);
  v := replace(v, $a$WHEN (depth_start >= 0.55) THEN 'strong_history'::text
                ELSE 'history_hierarchy'::text
            END
            WHEN (start_if_fit IS NOT NULL$a$, $a$WHEN (depth_start >= 0.55) THEN 'depth_chart_likely'::text
                ELSE 'depth_chart_backup'::text
            END
            WHEN (start_if_fit IS NOT NULL$a$);
  select coalesce(' with (' || array_to_string(reloptions, ', ') || ')', '') into opts
    from pg_class where oid = 'public.fpl_fallback_start_probability_v6'::regclass;
  execute 'create or replace view public.fpl_fallback_start_probability_v6' || opts || ' as ' || rtrim(v, E'; \n');

  -- 2b. Resolved minutes: carry the pecking-order labels through as '<label>_v6'.
  v := pg_get_viewdef('public.fixture_player_expected_minutes_resolved_v3_raw'::regclass);
  a := $a$WHEN (p.probability_source = 'strong_history'::text) THEN 'strong_history_v6'::text$a$;
  n := (length(v) - length(replace(v, a, ''))) / length(a);
  if n <> 1 then raise exception 'resolved view anchor matched % times', n; end if;
  v := replace(v, a, a || $a$
            WHEN (p.probability_source ~~ 'depth_chart%'::text) THEN (p.probability_source || '_v6'::text)$a$);
  select coalesce(' with (' || array_to_string(reloptions, ', ') || ')', '') into opts
    from pg_class where oid = 'public.fixture_player_expected_minutes_resolved_v3_raw'::regclass;
  execute 'create or replace view public.fixture_player_expected_minutes_resolved_v3_raw' || opts || ' as ' || rtrim(v, E'; \n');

  -- 2c. Projection refresh: same line-up confidence for the new labels.
  v := pg_get_functiondef('public.refresh_fpl_projection_fixture_v6_impl'::regproc);
  a := $a$when 'strong_history_v6' then .70$a$;
  b := $a$when 'strong_history_v6' then .70 when 'depth_chart_firm_v6' then .80 when 'depth_chart_likely_v6' then .70$a$;
  n := (length(v) - length(replace(v, a, ''))) / length(a);
  if n <> 2 then raise exception 'refresh impl anchor matched % times (expected 2)', n; end if;
  execute replace(v, a, b);
end $$;

-- 3. Change log.
insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
values ('2026-10-09', 'prediction',
  'FPL: a first choice''s 85% start floor wears down when he is fit and not picked',
  'Found checking the captaincy article (8 Oct): 20 outfield players with under 200 minutes had start chances of 0.68-0.90, mostly a flat 0.85 (Doku 0 starts, Sakamoto 0 from 5 available, Flemming 0 from 3). The pecking orders were seeded on 14 Sep from pre-season line-ups, and every first choice got max(start rate, 0.85) regardless of evidence. Such chances were also labelled nailed_history.',
  'First choice = min(0.97, max(start rate, (starts + 0.85 x 3) / (available matches + 3))); a regular back from injury (no available matches) keeps 0.85. Rule fixed before scoring. Backtest GW3-5 (1,761 player-matches): Brier 0.0841 -> 0.0784, log loss 0.2853 -> 0.2705, better in each gameweek; paired Brier -0.0058 (SE 0.0022). K = 5 scored marginally better (0.0783) but was not chosen (no tuning on the holdout season). Pecking-order labels renamed depth_chart_firm / likely / backup (same line-up confidence).',
  'leaguewide_v6', 'leaguewide_v6',
  'migration 20261009030000; scripts/backtest_depth_floor.py; docs/incidents.md 2026-10-09');
