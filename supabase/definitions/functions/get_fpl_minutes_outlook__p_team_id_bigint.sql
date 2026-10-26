-- Live definition exported from the database (function get_fpl_minutes_outlook(p_team_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_fpl_minutes_outlook(p_team_id bigint)
 RETURNS TABLE(fpl_player_id bigint, web_name text, slug text, position_label text, status text, news text, fpl_event_id integer, fixtures integer, opponents text, start_probability numeric, expected_minutes numeric, availability numeric, availability_rule text, generated_at timestamp with time zone, tactical_role text, first_choice boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with nxt as (
    select min(g.fpl_event_id) as ev
      from public.fpl_gameweeks g
     where g.season_id = public.fpl_current_season_id() and g.deadline_time > now()
  )
  select v.fpl_player_id::bigint, p.web_name, p.slug,
         case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end,
         p.status, nullif(p.news, ''),
         ff.fpl_event_id, count(*)::integer,
         string_agg(case when f.home_team_id = p_team_id then ot.display_name || ' (H)' else ot.display_name || ' (A)' end, ', ' order by f.kickoff_date),
         round(sum(v.start_probability), 3), round(sum(v.expected_minutes), 1),
         round(min(a.availability), 3), min(a.rule), max(v.generated_at),
         mode() within group (order by v.tactical_role),
         bool_or(exists (select 1 from public.fpl_player_first_choice c
                          where c.fpl_player_id = v.fpl_player_id and c.removed_at is null
                            and f.kickoff_date between c.effective_from and coalesce(c.effective_to, '9999-12-31'::date)))
    from public.fpl_projection_frontend_feed_v6 v
    join public.fpl_players p on p.fpl_player_id = v.fpl_player_id and p.season_id = public.fpl_current_season_id()
    join public.fixtures f on f.fixture_id = v.fixture_id
    join public.fpl_fixtures ff on ff.canonical_fixture_id = v.fixture_id and ff.season_id = f.season_id
    join public.teams ot on ot.team_id = case when f.home_team_id = p_team_id then f.away_team_id else f.home_team_id end
    left join public.fpl_fixture_availability_store a on a.fixture_id = v.fixture_id and a.fpl_player_id = v.fpl_player_id
    cross join nxt
   where v.team_id = p_team_id
     and f.status not in ('played', 'awaiting_result')
     and ff.fpl_event_id between nxt.ev and nxt.ev + 9
   group by v.fpl_player_id, p.web_name, p.slug, p.element_type, p.status, p.news, ff.fpl_event_id;
$function$
;
