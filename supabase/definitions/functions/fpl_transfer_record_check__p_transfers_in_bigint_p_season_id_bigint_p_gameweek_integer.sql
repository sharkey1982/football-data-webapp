-- Live definition exported from the database (function fpl_transfer_record_check(p_transfers_in bigint, p_season_id bigint, p_gameweek integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_transfer_record_check(p_transfers_in bigint, p_season_id bigint DEFAULT fpl_current_season_id(), p_gameweek integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_start integer; v_since text; v_hist jsonb; v_season jsonb; v_hist_tin bigint; v_season_tin bigint;
begin
  select start_year into v_start from public.seasons where season_id = p_season_id;

  -- One row per fixture in the history table: max per player-gameweek, never sum.
  select jsonb_build_object('web_name', coalesce(t.web_name, 'code ' || g.fpl_code), 'fpl_code', g.fpl_code,
                            'season', se.start_year || '/' || lpad((se.end_year % 100)::text, 2, '0'),
                            'season_id', g.season_id, 'gameweek', g.gameweek, 'transfers_in', g.tin),
         g.tin
    into v_hist, v_hist_tin
    from (select season_id, fpl_code, gameweek, max(transfers_in) tin
            from public.fpl_player_gameweek_history where transfers_in is not null group by 1, 2, 3) g
    join public.seasons se on se.season_id = g.season_id
    left join lateral (select web_name from public.fpl_player_season_totals t
                        where t.season_id = g.season_id and t.fpl_code = g.fpl_code limit 1) t on true
   where v_start is null or se.start_year < v_start
   order by g.tin desc, g.season_id, g.gameweek
   limit 1;

  select min(se.start_year) || '/' || lpad((min(se.end_year) % 100)::text, 2, '0') into v_since
    from public.seasons se
   where exists (select 1 from public.fpl_player_gameweek_history h where h.season_id = se.season_id)
     and (v_start is null or se.start_year < v_start);

  -- This season so far, from our deadline snapshots (any kind; earlier
  -- gameweeks only). Snapshots before the deadline understate the final figure.
  select jsonb_build_object('web_name', pl.web_name, 'fpl_player_id', x.fpl_player_id, 'gameweek', x.fpl_event_id,
                            'transfers_in', x.tin, 'source', 'deadline snapshots'),
         x.tin
    into v_season, v_season_tin
    from (select fpl_event_id, fpl_player_id, max(transfers_in_event) tin
            from public.fpl_deadline_player_state
           where season_id = p_season_id and (p_gameweek is null or fpl_event_id < p_gameweek)
             and transfers_in_event is not null
           group by 1, 2) x
    left join public.fpl_players pl on pl.season_id = p_season_id and pl.fpl_player_id = x.fpl_player_id
   order by x.tin desc, x.fpl_event_id
   limit 1;

  return jsonb_build_object(
    'transfers_in', p_transfers_in,
    'since', v_since,
    'history', v_hist,
    'beats_history', v_hist_tin is not null and p_transfers_in > v_hist_tin,
    'share_of_history', case when v_hist_tin > 0 then round(p_transfers_in::numeric / v_hist_tin, 3) end,
    'season_high', v_season,
    'beats_season_high', v_season_tin is null or p_transfers_in > v_season_tin);
end;
$function$
;
