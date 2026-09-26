-- Live definition exported from the database (function get_fpl_fixture_bonus_v4(p_fixture_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_fpl_fixture_bonus_v4(p_fixture_id bigint)
 RETURNS TABLE(fpl_player_id bigint, expected_bonus_points numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with b as (
    select fpl_player_id,
      expected_bps_score::float8 as bps,
      greatest(5.0::float8, (7.0::float8 + (0.10::float8 * expected_bps_score::float8))) as bps_sd
    from public.fpl_fixture_bps_projection_v1
    where fixture_id = p_fixture_id
  ),
  pairwise as (
    select a.fpl_player_id,
      sum(case when o.fpl_player_id <> a.fpl_player_id
          then 1.0::float8/(1.0::float8+exp((a.bps-o.bps)/sqrt(a.bps_sd*a.bps_sd + o.bps_sd*o.bps_sd)))
          else 0::float8 end) as expected_players_ahead
    from b a join b o on true
    group by a.fpl_player_id
  ),
  strength as (
    select fpl_player_id, exp(-0.50::float8 * expected_players_ahead) as w
    from pairwise
  ),
  total as (
    select sum(w) as s from strength
  ),
  p1 as (
    select st.fpl_player_id, st.w, t.s, (st.w / nullif(t.s, 0::float8)) as p_rank1
    from strength st cross join total t
  ),
  p2 as (
    select i.fpl_player_id,
      sum(case when k.fpl_player_id <> i.fpl_player_id
          then (k.w / nullif(i.s, 0::float8)) * (i.w / nullif(i.s - k.w, 0::float8))
          else 0::float8 end) as p_rank2
    from p1 i join strength k on true
    group by i.fpl_player_id
  ),
  p3 as (
    select i.fpl_player_id,
      sum(case when k.fpl_player_id <> i.fpl_player_id and l.fpl_player_id <> i.fpl_player_id and k.fpl_player_id <> l.fpl_player_id
          then (k.w / nullif(i.s, 0::float8)) * (l.w / nullif(i.s - k.w, 0::float8)) * (i.w / nullif(i.s - k.w - l.w, 0::float8))
          else 0::float8 end) as p_rank3
    from p1 i join strength k on true join strength l on true
    group by i.fpl_player_id
  )
  select p1.fpl_player_id, (((3::float8 * p1.p_rank1) + (2::float8 * p2.p_rank2) + p3.p_rank3))::numeric as expected_bonus_points
  from p1
  join p2 on p2.fpl_player_id = p1.fpl_player_id
  join p3 on p3.fpl_player_id = p1.fpl_player_id;
$function$
;
