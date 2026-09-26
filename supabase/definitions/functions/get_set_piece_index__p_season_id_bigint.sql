-- Live definition exported from the database (function get_set_piece_index(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_set_piece_index(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(team_id bigint, team_name text, player_name text, duties integer, index_score numeric, detail text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with weights as (
    -- Per-taker value, from opta_slot_breakdown. A share of goals is
    -- worth more than the same share of assists (6 points vs 3 for a
    -- midfielder), so goals carry double.
    select
      (select sum(goals_from_penalties)::numeric / nullif(sum(goals), 0) from public.opta_slot_breakdown) * 2 as w_pen,
      (select sum(goals_from_direct_fk)::numeric / nullif(sum(goals), 0) from public.opta_slot_breakdown) * 2
        + (select sum(assist_free_kick)::numeric / nullif(sum(assists), 0) from public.opta_slot_breakdown) as w_fk,
      (select sum(goals_from_corners)::numeric / nullif(sum(goals), 0) from public.opta_slot_breakdown) * 2
        + (select sum(assist_corner)::numeric / nullif(sum(assists), 0) from public.opta_slot_breakdown) as w_corner
  ),
  scored as (
    select h.team_id, h.player_name,
      case h.set_piece_type
        when 'penalty' then w.w_pen
        when 'direct_free_kick' then w.w_fk
        when 'corner_left' then w.w_corner / 2      -- one side only
        when 'corner_right' then w.w_corner / 2
        else 0
      end
      -- Rank decay: a second-choice taker only takes them when the
      -- first isn't on the pitch. Steeper than linear because a
      -- third-choice penalty taker almost never takes one.
      * (1.0 / h.rank)
      as value,
      h.set_piece_type, h.rank
    from public.set_piece_hierarchies h
    cross join weights w
    where h.season_id = p_season_id
      and (h.valid_to is null or h.valid_to > now())
      and h.set_piece_type <> 'indirect_free_kick'
  )
  select s.team_id, t.display_name, s.player_name,
    count(*)::integer,
    round(sum(s.value) * 100, 1),
    string_agg(
      replace(replace(s.set_piece_type, '_', ' '), 'direct free kick', 'free kicks') || ' #' || s.rank,
      ', ' order by s.value desc
    )
  from scored s
  join public.teams t on t.team_id = s.team_id
  group by s.team_id, t.display_name, s.player_name
  having sum(s.value) > 0
  order by sum(s.value) desc;
$function$
;
