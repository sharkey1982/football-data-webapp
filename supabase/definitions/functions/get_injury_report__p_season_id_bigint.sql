-- Live definition exported from the database (function get_injury_report(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_injury_report(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(fpl_player_id bigint, web_name text, slug text, team_id bigint, team_name text, position_label text, price numeric, ownership numeric, total_points integer, status text, chance_next_round integer, news text, return_date date, fixtures_missed integer, next_fixture_date date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with latest as (
    select max(snapshot_date) as d from public.fpl_player_snapshots
  ),
  snap as (
    select s.* from public.fpl_player_snapshots s, latest l
    where s.snapshot_date = l.d and s.status is not null and s.status <> 'a'
  ),
  parsed as (
    select sn.*,
      case
        when sn.news ~* 'unknown return' then null
        else (
          select to_date(
            m[1] || ' ' || m[2] || ' ' ||
            case
              when to_number(to_char(to_date(m[2], 'Mon'), 'MM'), '99') < extract(month from current_date)
                then extract(year from current_date) + 1
              else extract(year from current_date)
            end::text,
            'DD Mon YYYY'
          )
          from regexp_match(sn.news, '(\d{1,2})\s+(\w{3})', 'i') as m
        )
      end as ret
    from snap sn
  )
  select
    p.fpl_player_id, p.web_name, p.slug, t.team_id, t.display_name,
    case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end,
    round(pa.now_cost / 10.0, 1),
    round(pa.selected_by_percent::numeric, 1),
    coalesce(pa.total_points, 0),
    pa.status,
    pa.chance_of_playing_next_round,
    nullif(pa.news, ''),
    pa.ret,
    case when pa.ret is null then null else (
      select count(*)::integer from public.fixtures f
      where f.season_id = p_season_id
        and (f.home_team_id = t.team_id or f.away_team_id = t.team_id)
        and f.status = 'scheduled'
        and f.kickoff_date >= current_date
        and f.kickoff_date < pa.ret
    ) end,
    (
      select min(f.kickoff_date) from public.fixtures f
      where f.season_id = p_season_id
        and (f.home_team_id = t.team_id or f.away_team_id = t.team_id)
        and f.status = 'scheduled'
        and f.kickoff_date >= current_date
    )
  from parsed pa
  join public.fpl_players p on p.fpl_player_id = pa.fpl_player_id
  left join public.teams t on t.team_id = p.canonical_team_id
  where p.web_name is not null
  order by coalesce(pa.total_points, 0) desc;
$function$
;
