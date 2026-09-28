-- ============================================================================
-- FPL goals-conceded points over the minutes on the pitch.
--
-- FPL deducts 1 point per 2 goals conceded WHILE THE PLAYER IS ON THE PITCH
-- (goalkeepers and defenders). The projection used the full-match
-- expectation scaled by min(1, expected minutes / 60): a defender expected
-- to play 75 minutes was charged the whole match.
--
-- Now, per scenario (the exit bands, Model Lab P2), with G the opponent's
-- expected goals (market ratings, P5) and E[floor(Poisson(x)/2)] =
-- x/2 - (1 - exp(-2x))/4:
--   P(start) x [ P(85+) g(G) + P(60-84) g(G x 72.7/90) + P(off before 60) g(G x 47.0/90) ]
--   + P(sub) g(G x 18.2/90)
-- Average minutes per scenario: starts 2023/24-2025/26 (72.7 for 60-84,
-- 47.0 before 60), substitute appearances 18.2.
--
-- Check (28 Sep 2026, 2026/27 goalkeeper and defender appearances, actual
-- minutes, pre-match expected goals, 633 appearances): mean deduction
-- actual 0.416, new scaling 0.406, old 0.444; for appearances under 85
-- minutes actual 0.192, new 0.183, old 0.303. Descriptive, not a registered
-- experiment: the parts (bands, expected goals) are each tested.
-- ============================================================================

do $$
declare
  def text := pg_get_viewdef('public.fpl_projection_secondary_scoring'::regclass);
  opts text;
  cols_old text := 'COALESCE(f.market_away_goals, f.predicted_away_goals) AS predicted_away_goals,';
  cols_new text := 'COALESCE(f.market_away_goals, f.predicted_away_goals) AS predicted_away_goals,
            a.prob_starting_xi,
            a.prob_sub_appearance,
            COALESCE(eb.p_full, (1)::numeric) AS eb_full,
            COALESCE(eb.p_off_60_84, (0)::numeric) AS eb_mid,
            COALESCE(eb.p_off_before_60, (0)::numeric) AS eb_early,';
  join_old text := 'JOIN h ON ((h.fpl_player_id = a.fpl_player_id)))';
  join_new text := 'JOIN h ON ((h.fpl_player_id = a.fpl_player_id)))
             LEFT JOIN fpl_player_exit_bands eb ON (((eb.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (eb.fpl_player_id = a.fpl_player_id)))';
  gc_start text := 'END AS xpts_saves,';
  gc_end text := ' AS xpts_goals_conceded';
  l text := '(CASE WHEN (team_id = home_team_id) THEN predicted_away_goals ELSE predicted_home_goals END)';
  gc_new text;
  i int; j int; n int;
begin
  foreach n in array array[
    (length(def) - length(replace(def, cols_old, ''))) / length(cols_old),
    (length(def) - length(replace(def, join_old, ''))) / length(join_old),
    (length(def) - length(replace(def, gc_start, ''))) / length(gc_start),
    (length(def) - length(replace(def, gc_end, ''))) / length(gc_end)
  ] loop
    if n <> 1 then raise exception 'fpl_projection_secondary_scoring: an anchor did not match exactly once (%)', n; end if;
  end loop;

  -- g(x) = x/2 - (1 - exp(-2x))/4, with x = expected goals x share of the match on the pitch.
  gc_new := format($f$
        CASE
            WHEN (element_type = ANY (ARRAY[1, 2])) THEN (- (
                ((prob_starting_xi)::double precision * (
                      ((eb_full)::double precision * ((%1$s / 2.0) - ((1.0 - exp(-2.0 * %1$s)) / 4.0)))
                    + ((eb_mid)::double precision * (((%1$s * (72.7 / 90.0)) / 2.0) - ((1.0 - exp(-2.0 * %1$s * (72.7 / 90.0))) / 4.0)))
                    + ((eb_early)::double precision * (((%1$s * (47.0 / 90.0)) / 2.0) - ((1.0 - exp(-2.0 * %1$s * (47.0 / 90.0))) / 4.0)))))
              + ((prob_sub_appearance)::double precision * (((%1$s * (18.2 / 90.0)) / 2.0) - ((1.0 - exp(-2.0 * %1$s * (18.2 / 90.0))) / 4.0)))))
            ELSE (0)::double precision
        END$f$, l);

  def := replace(def, cols_old, cols_new);
  def := replace(def, join_old, join_new);
  i := strpos(def, gc_start) + length(gc_start);
  j := strpos(def, gc_end);
  def := substr(def, 1, i - 1) || gc_new || substr(def, j);

  select case when c.reloptions is null then '' else ' with (' || array_to_string(c.reloptions, ', ') || ')' end
    into opts from pg_class c where c.oid = 'public.fpl_projection_secondary_scoring'::regclass;
  execute format('create or replace view public.fpl_projection_secondary_scoring%s as %s', opts, def);
end $$;

select public.meta_refresh_flow();

update public.meta_flow_nodes set purpose_reviewed_at = now()
where node_key = 'object:fpl_projection_secondary_scoring';
