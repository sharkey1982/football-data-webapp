-- Live definition exported from the database (function get_price_change_risk(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_price_change_risk(p_season_id bigint DEFAULT fpl_current_season_id())
 RETURNS TABLE(fpl_player_id bigint, web_name text, slug text, team_name text, position_label text, price numeric, ownership numeric, transfers_in integer, transfers_out integer, net_transfers integer, pressure numeric, direction text, progress numeric, projected_next numeric, likelihood integer, hourly_rate numeric, locked_until timestamp with time zone, calibrating boolean, outlook text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with c as (
    select p.*, sp,
           nullif(sp->>'price_change_percent', '')::numeric pct,
           nullif(sp->'price_change_projections'->0->>'projected_percent', '')::numeric p0,
           nullif(sp->'price_change_projections'->0->>'likelihood', '')::int lk,
           case when sp->>'price_change_locked_until' ~ '^\d{4}-\d{2}-\d{2}' then (sp->>'price_change_locked_until')::timestamptz end lck,
           coalesce((sp->>'price_change_calibrating')::boolean, false) cal,
           coalesce(nullif(sp->>'transfers_in_event', '')::int, 0) t_in,
           coalesce(nullif(sp->>'transfers_out_event', '')::int, 0) t_out
      from public.fpl_players p
      cross join lateral (select p.source_payload sp) x
     where p.season_id = p_season_id and p.web_name is not null)
  select c.fpl_player_id::bigint, c.web_name, c.slug, t.display_name,
         case c.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end,
         round(c.now_cost / 10.0, 1), round(c.selected_by_percent::numeric, 1),
         c.t_in, c.t_out, c.t_in - c.t_out,
         round(c.pct, 1),
         case when coalesce(nullif(c.pct, 0), c.p0) > 0 then 'rise' else 'fall' end,
         round(c.pct, 1), round(c.p0, 1), c.lk, nullif(c.sp->>'price_change_hourly_rate', '')::numeric,
         c.lck, c.cal,
         case when c.cal then 'calibrating'
              when abs(c.pct) >= 100 then 'expected'
              when abs(coalesce(c.p0, 0)) >= 100 then 'possible'
              when abs(c.pct) >= 90 then 'close'
              else 'building' end,
         c.updated_at
    from c
    left join public.teams t on t.team_id = c.canonical_team_id
   where c.pct is not null
     and (abs(c.pct) >= 50 or abs(coalesce(c.p0, 0)) >= 100)
     and (c.lck is null or c.lck <= now())
   order by abs(c.pct) desc, c.fpl_player_id;
$function$
;
