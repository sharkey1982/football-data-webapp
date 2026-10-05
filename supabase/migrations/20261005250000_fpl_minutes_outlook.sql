-- FPL minutes outlook (5 Oct 2026): per club, every player's start chance and
-- expected minutes for each of the next 10 gameweeks, with the availability
-- rule behind it -- so a returning first-choice player can be seen taking
-- minutes back from the stand-in over time. Read by /fpl/minutes.
--
-- get_fpl_minutes_teams(): the 20 clubs, for the picker.
-- get_fpl_minutes_outlook(p_team_id): one row per player and gameweek (a
-- double gameweek sums its fixtures). The window matches the projection
-- pipeline's 10 gameweeks, so nothing older than the latest run is shown.

create or replace function public.get_fpl_minutes_teams()
returns table(team_id bigint, team_name text, slug text)
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  select distinct t.team_id, t.display_name, t.slug
    from public.fpl_players p
    join public.teams t on t.team_id = p.canonical_team_id
   where p.season_id = public.fpl_current_season_id()
   order by t.display_name;
$$;

create or replace function public.get_fpl_minutes_outlook(p_team_id bigint)
returns table(
  fpl_player_id bigint, web_name text, slug text, position_label text, status text, news text,
  fpl_event_id integer, fixtures integer, opponents text,
  start_probability numeric, expected_minutes numeric, availability numeric, availability_rule text,
  generated_at timestamptz)
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
         round(min(a.availability), 3), min(a.rule), max(v.generated_at)
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

grant execute on function public.get_fpl_minutes_teams() to anon, authenticated;
grant execute on function public.get_fpl_minutes_outlook(bigint) to anon, authenticated;

select public.meta_refresh_flow();
update public.meta_flow_nodes set layer = 'api', status = 'current', is_public = true, ai_relevant = false,
  purpose = 'Per club, each player''s start chance and expected minutes for the next 10 gameweeks with the availability rule behind it (/fpl/minutes).',
  refresh_note = 'Live read of the projection feed and fpl_fixture_availability_store.', purpose_reviewed_at = now()
where node_key in ('function:get_fpl_minutes_outlook(p_team_id bigint)', 'function:get_fpl_minutes_teams()');
