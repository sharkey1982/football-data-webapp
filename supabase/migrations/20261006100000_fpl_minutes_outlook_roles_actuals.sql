-- Minutes Outlook: each player's tactical role (6 Oct 2026). Chris: show the
-- playing position next to the name and sort by it within each group, so
-- players competing for the same spot sit together. The role is the one the
-- projection uses for that gameweek (most common if a double gameweek).
-- Return type changes, so the function is dropped and recreated. Also
-- get_fpl_minutes_actuals (below).

drop function if exists public.get_fpl_minutes_outlook(bigint);

create or replace function public.get_fpl_minutes_outlook(p_team_id bigint)
returns table(
  fpl_player_id bigint, web_name text, slug text, position_label text, status text, news text,
  fpl_event_id integer, fixtures integer, opponents text,
  start_probability numeric, expected_minutes numeric, availability numeric, availability_rule text,
  generated_at timestamptz, tactical_role text)
language sql stable
set search_path to 'public', 'pg_temp'
as $$
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
         mode() within group (order by v.tactical_role)
    from public.fpl_projection_frontend_feed_v6 v
    join public.fpl_players p on p.fpl_player_id = v.fpl_player_id and p.season_id = public.fpl_current_season_id()
    join public.fixtures f on f.fixture_id = v.fixture_id
    join public.fpl_fixtures ff on ff.canonical_fixture_id = v.fixture_id and ff.season_id = f.season_id
    join public.teams ot on ot.team_id = case when f.home_team_id = p_team_id then f.away_team_id else f.home_team_id end
    left join public.fpl_fixture_availability_store a on a.fixture_id = v.fixture_id and a.fpl_player_id = v.fpl_player_id
    cross join nxt
   where v.team_id = p_team_id
     and f.status <> 'played'
     and ff.fpl_event_id between nxt.ev and nxt.ev + 9
   group by v.fpl_player_id, p.web_name, p.slug, p.element_type, p.status, p.news, ff.fpl_event_id;
$$;

grant execute on function public.get_fpl_minutes_outlook(bigint) to anon, authenticated;

-- Actual minutes for the last five played gameweeks (Chris, 6 Oct 2026: see
-- how the projections compare, and show an injured player as "out" rather
-- than 0). available = he was not injured/suspended at the time: the daily
-- FPL snapshot on or before the match, or before the first snapshot that
-- snapshot's injury/suspension and its news date -- the same inference the
-- start record (refresh_fpl_start_record) uses.
create or replace function public.get_fpl_minutes_actuals(p_team_id bigint)
returns table(fpl_player_id bigint, fpl_event_id integer, minutes integer, started boolean, available boolean)
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  with cur as (select public.fpl_current_season_id() as s),
  pl as (select p.fpl_player_id from public.fpl_players p, cur where p.canonical_team_id = p_team_id and p.season_id = cur.s),
  g as (
    select pg.fpl_player_id, pg.fpl_event_id, pg.kickoff_time::date as d, pg.minutes,
           coalesce((pg.source_payload->'stats'->>'starts')::int, 0) = 1 as st
      from public.fpl_player_gameweeks pg join pl using (fpl_player_id), cur
     where pg.season_id = cur.s
  ),
  evs as (select distinct g.fpl_event_id from g order by g.fpl_event_id desc limit 5),
  first_snap as (
    select distinct on (s.fpl_player_id) s.fpl_player_id, s.snapshot_date as fd, s.status as fs,
           (s.source_payload->>'news_added')::timestamptz::date as na
      from public.fpl_player_snapshots s join pl using (fpl_player_id), cur
     where s.season_id = cur.s
     order by s.fpl_player_id, s.snapshot_date
  ),
  ga as (
    select g.*,
      case when g.d >= fs.fd then
             coalesce((select s.status from public.fpl_player_snapshots s, cur
                        where s.fpl_player_id = g.fpl_player_id and s.season_id = cur.s and s.snapshot_date <= g.d
                        order by s.snapshot_date desc limit 1), 'a') not in ('i','s','u','n')
           else not (coalesce(fs.fs, 'a') in ('i','s','u','n') and fs.na <= g.d)
      end as avail
      from g left join first_snap fs using (fpl_player_id)
  )
  select ga.fpl_player_id::bigint, ga.fpl_event_id, sum(ga.minutes)::integer, bool_or(ga.st), bool_or(ga.avail)
    from ga
   where ga.fpl_event_id in (select evs.fpl_event_id from evs)
   group by ga.fpl_player_id, ga.fpl_event_id;
$$;
grant execute on function public.get_fpl_minutes_actuals(bigint) to anon, authenticated;
