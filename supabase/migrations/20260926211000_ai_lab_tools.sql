-- ============================================================================
-- AI LAB: the tools (toolset ai_tools_v1), one SQL function per tool.
--
-- Each tool is a fixed, parameterised query over catalogue objects marked
-- ai_relevant. The model never writes SQL: the ai-lab-run Edge Function maps
-- a tool call to ai_tool_<name>(args jsonb) and returns the JSON as-is.
--
-- Every result carries: tool, source (objects read), as_of, kind
-- (observed / model_estimate / mixed) and rows. Errors come back as
-- {"error": ...} with candidates where a name was ambiguous, so the model
-- has to ask or choose rather than guess.
--
-- Service role only: not callable by anon or signed-in users.
-- ============================================================================

-- ---------------------------------------------------------------- helpers
create or replace function public.ai_norm(p text)
returns text language sql immutable set search_path to 'public', 'pg_temp' as $$
  select lower(regexp_replace(public.unaccent(coalesce(p, '')), '[^a-zA-Z0-9]+', ' ', 'g'))
$$;

-- Team by name: exact display/canonical name, then alias, then prefix/contains.
create or replace function public.ai_resolve_team(p_name text)
returns jsonb language sql stable set search_path to 'public', 'pg_temp' as $$
  with q as (select trim(public.ai_norm(p_name)) n),
  cand as (
    select t.team_id, t.display_name, c.name country, 1 rank
      from teams t left join countries c using (country_id), q
     where trim(public.ai_norm(t.display_name)) = q.n or trim(public.ai_norm(t.canonical_name)) = q.n
    union
    select t.team_id, t.display_name, c.name, 2
      from team_aliases a join teams t using (team_id) left join countries c on c.country_id = t.country_id, q
     where trim(public.ai_norm(a.raw_name)) = q.n
    union
    select t.team_id, t.display_name, c.name, 3
      from teams t left join countries c using (country_id), q
     where length(q.n) >= 3 and (public.ai_norm(t.display_name) like q.n || '%' or public.ai_norm(t.canonical_name) like '%' || q.n || '%')
  ),
  best as (select * from cand where rank = (select min(rank) from cand)),
  dedup as (select distinct on (team_id) team_id, display_name, country from best order by team_id)
  select case
    when (select count(*) from dedup) = 1 then (select jsonb_build_object('team_id', team_id, 'team', display_name, 'country', country) from dedup)
    when (select count(*) from dedup) = 0 then jsonb_build_object('error', 'No team matches "' || p_name || '".')
    else jsonb_build_object('error', 'More than one team matches "' || p_name || '". Use find_entity and pick one.',
                            'candidates', (select jsonb_agg(jsonb_build_object('team_id', team_id, 'team', display_name, 'country', country)) from dedup))
  end
$$;

-- Competition by name or code: exact name/code/slug first, then contains.
create or replace function public.ai_resolve_competition(p_name text)
returns jsonb language sql stable set search_path to 'public', 'pg_temp' as $$
  with q as (select trim(public.ai_norm(p_name)) n),
  cand as (
    select l.league_id, l.name, l.code, c.name country, 1 rank
      from leagues l left join countries c using (country_id), q
     where trim(public.ai_norm(l.name)) = q.n or lower(l.code) = q.n or trim(public.ai_norm(l.slug)) = q.n
    union
    select l.league_id, l.name, l.code, c.name, 2
      from leagues l left join countries c using (country_id), q
     where length(q.n) >= 3 and public.ai_norm(l.name) like '%' || q.n || '%'
  ),
  best as (select * from cand where rank = (select min(rank) from cand))
  select case
    when (select count(*) from best) = 1 then (select jsonb_build_object('league_id', league_id, 'competition', name, 'code', code, 'country', country) from best)
    when (select count(*) from best) = 0 then jsonb_build_object('error', 'No competition matches "' || p_name || '".')
    else jsonb_build_object('error', 'More than one competition matches "' || p_name || '".',
                            'candidates', (select jsonb_agg(jsonb_build_object('competition', name, 'code', code, 'country', country)) from best))
  end
$$;

-- Current season for a competition: the latest season with fixtures or results.
create or replace function public.ai_current_season(p_league_id bigint)
returns bigint language sql stable set search_path to 'public', 'pg_temp' as $$
  select max(season_id) from (
    select season_id from fixtures where league_id = p_league_id
    union all select season_id from matches where league_id = p_league_id) s
$$;

create or replace function public.ai_resolve_season(p_league_id bigint, p_season text)
returns bigint language sql stable set search_path to 'public', 'pg_temp' as $$
  select case
    when p_season is null or p_season in ('', 'current', 'this season') then public.ai_current_season(p_league_id)
    when p_season in ('last', 'last season', 'previous') then
      (select max(season_id) from seasons where season_id < public.ai_current_season(p_league_id))
    else (select season_id from seasons
           where label = regexp_replace(p_season, '[^0-9]', '', 'g')
              or slug = p_season
              or label = right(split_part(p_season, '/', 1), 2) || right(split_part(p_season, '/', 2), 2)
           limit 1)
  end
$$;

create or replace function public.ai_season_label(p_season_id bigint)
returns text language sql stable set search_path to 'public', 'pg_temp' as $$
  select start_year || '/' || right(end_year::text, 2) from seasons where season_id = p_season_id
$$;

-- FPL player by name in a season: web name, full name, surname.
create or replace function public.ai_resolve_fpl_player(p_name text, p_season_id bigint)
returns jsonb language sql stable set search_path to 'public', 'pg_temp' as $$
  with q as (select trim(public.ai_norm(p_name)) n),
  cand as (
    select p.fpl_player_id, p.web_name, p.first_name || ' ' || p.second_name full_name, t.display_name team, 1 rank
      from fpl_players p left join teams t on t.team_id = p.canonical_team_id, q
     where p.season_id = p_season_id
       and (trim(public.ai_norm(p.web_name)) = q.n or trim(public.ai_norm(p.first_name || ' ' || p.second_name)) = q.n)
    union
    select p.fpl_player_id, p.web_name, p.first_name || ' ' || p.second_name, t.display_name, 2
      from fpl_players p left join teams t on t.team_id = p.canonical_team_id, q
     where p.season_id = p_season_id and length(q.n) >= 3
       and (public.ai_norm(p.second_name) like '%' || q.n || '%' or public.ai_norm(p.web_name) like '%' || q.n || '%'
            or public.ai_norm(p.first_name || ' ' || p.second_name) like '%' || q.n || '%')
  ),
  best as (select distinct on (fpl_player_id) * from cand where rank = (select min(rank) from cand) order by fpl_player_id, rank)
  select case
    when (select count(*) from best) = 1 then (select jsonb_build_object('fpl_player_id', fpl_player_id, 'player', web_name, 'full_name', full_name, 'team', team) from best)
    when (select count(*) from best) = 0 then jsonb_build_object('error', 'No FPL player matches "' || p_name || '" in ' || coalesce(public.ai_season_label(p_season_id), 'that season') || '.')
    else jsonb_build_object('error', 'More than one FPL player matches "' || p_name || '".',
                            'candidates', (select jsonb_agg(jsonb_build_object('player', web_name, 'full_name', full_name, 'team', team)) from best))
  end
$$;

create or replace function public.ai_fpl_position(p int)
returns text language sql immutable as $$
  select case p when 1 then 'GK' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' end
$$;

-- ---------------------------------------------------------------- tools

-- find_entity: resolve a team, competition or FPL player name.
create or replace function public.ai_tool_find_entity(args jsonb)
returns jsonb language plpgsql stable set search_path to 'public', 'pg_temp' as $$
declare
  n text := args->>'name';
  k text := coalesce(args->>'kind', 'any');
  out jsonb := '[]'::jsonb;
  r jsonb;
begin
  if n is null then return jsonb_build_object('error', 'name is required'); end if;
  if k in ('any', 'team') then
    r := public.ai_resolve_team(n); out := out || jsonb_build_array(jsonb_build_object('kind', 'team') || r); end if;
  if k in ('any', 'competition') then
    r := public.ai_resolve_competition(n); out := out || jsonb_build_array(jsonb_build_object('kind', 'competition') || r); end if;
  if k in ('any', 'player') then
    r := public.ai_resolve_fpl_player(n, public.fpl_current_season_id());
    out := out || jsonb_build_array(jsonb_build_object('kind', 'fpl_player (current season)') || r); end if;
  return jsonb_build_object('tool', 'find_entity', 'source', jsonb_build_array('teams', 'team_aliases', 'leagues', 'fpl_players'),
    'as_of', now(), 'kind', 'observed', 'rows', out);
end $$;

-- get_fixtures: upcoming fixtures (not results) for a team and/or competition.
create or replace function public.ai_tool_get_fixtures(args jsonb)
returns jsonb language plpgsql stable set search_path to 'public', 'pg_temp' as $$
declare
  t jsonb; c jsonb; tid bigint; lid bigint;
  lim int := least(coalesce((args->>'limit')::int, 5), 20);
  d_from date := coalesce((args->>'from_date')::date, current_date);
  d_to date := (args->>'to_date')::date;
begin
  if args ? 'team' then t := public.ai_resolve_team(args->>'team'); if t ? 'error' then return t; end if; tid := (t->>'team_id')::bigint; end if;
  if args ? 'competition' then c := public.ai_resolve_competition(args->>'competition'); if c ? 'error' then return c; end if; lid := (c->>'league_id')::bigint; end if;
  if tid is null and lid is null then return jsonb_build_object('error', 'Give a team, a competition, or both.'); end if;
  return jsonb_build_object('tool', 'get_fixtures', 'source', jsonb_build_array('fixtures', 'teams', 'leagues'),
    'as_of', now(), 'kind', 'observed',
    'note', 'Scheduled fixtures from today. Kick-off times are UK local time. Results are in get_results.',
    'rows', coalesce((select jsonb_agg(r) from (
      select f.kickoff_date, to_char(f.kickoff_time, 'HH24:MI') kickoff_time_uk, l.name competition, f.round, f.matchweek,
             h.display_name home_team, a.display_name away_team, f.status
        from fixtures f join leagues l using (league_id)
        join teams h on h.team_id = f.home_team_id join teams a on a.team_id = f.away_team_id
       where f.status in ('scheduled', 'postponed') and f.kickoff_date >= d_from
         and (d_to is null or f.kickoff_date <= d_to)
         and (tid is null or tid in (f.home_team_id, f.away_team_id))
         and (lid is null or f.league_id = lid)
       order by f.kickoff_date, f.kickoff_time nulls last limit lim) r), '[]'::jsonb));
end $$;

-- get_results: completed matches with scores.
create or replace function public.ai_tool_get_results(args jsonb)
returns jsonb language plpgsql stable set search_path to 'public', 'pg_temp' as $$
declare
  t jsonb; o jsonb; c jsonb; tid bigint; oid_ bigint; lid bigint; sid bigint;
  lim int := least(coalesce((args->>'limit')::int, 10), 50);
  venue text := coalesce(args->>'venue', 'any');
begin
  if args ? 'team' then t := public.ai_resolve_team(args->>'team'); if t ? 'error' then return t; end if; tid := (t->>'team_id')::bigint; end if;
  if args ? 'opponent' then o := public.ai_resolve_team(args->>'opponent'); if o ? 'error' then return o; end if; oid_ := (o->>'team_id')::bigint; end if;
  if args ? 'competition' then c := public.ai_resolve_competition(args->>'competition'); if c ? 'error' then return c; end if; lid := (c->>'league_id')::bigint; end if;
  if tid is null and lid is null then return jsonb_build_object('error', 'Give a team, a competition, or both.'); end if;
  if args ? 'season' then
    if lid is null then return jsonb_build_object('error', 'season needs a competition'); end if;
    sid := public.ai_resolve_season(lid, args->>'season');
    if sid is null then return jsonb_build_object('error', 'Unknown season "' || (args->>'season') || '".'); end if;
  end if;
  return jsonb_build_object('tool', 'get_results', 'source', jsonb_build_array('matches', 'teams', 'leagues', 'seasons'),
    'as_of', now(), 'kind', 'observed', 'note', 'Most recent first. HT = half time.',
    'rows', coalesce((select jsonb_agg(r) from (
      select m.match_date, l.name competition, public.ai_season_label(m.season_id) season,
             h.display_name home_team, a.display_name away_team,
             m.full_time_home_goals home_goals, m.full_time_away_goals away_goals,
             m.half_time_home_goals ht_home, m.half_time_away_goals ht_away, m.decided_by
        from matches m join leagues l using (league_id)
        join teams h on h.team_id = m.home_team_id join teams a on a.team_id = m.away_team_id
       where m.full_time_home_goals is not null
         and (tid is null or (venue = 'home' and m.home_team_id = tid) or (venue = 'away' and m.away_team_id = tid)
              or (venue = 'any' and tid in (m.home_team_id, m.away_team_id)))
         and (oid_ is null or oid_ in (m.home_team_id, m.away_team_id))
         and (lid is null or m.league_id = lid)
         and (sid is null or m.season_id = sid)
       order by m.match_date desc limit lim) r), '[]'::jsonb));
end $$;

-- get_league_table: standings including point deductions.
create or replace function public.ai_tool_get_league_table(args jsonb)
returns jsonb language plpgsql stable set search_path to 'public', 'pg_temp' as $$
declare c jsonb; lid bigint; sid bigint;
begin
  if not args ? 'competition' then return jsonb_build_object('error', 'competition is required'); end if;
  c := public.ai_resolve_competition(args->>'competition'); if c ? 'error' then return c; end if;
  lid := (c->>'league_id')::bigint;
  sid := public.ai_resolve_season(lid, args->>'season');
  if sid is null then return jsonb_build_object('error', 'Unknown season.'); end if;
  return jsonb_build_object('tool', 'get_league_table', 'source', jsonb_build_array('league_standings', 'point_deductions'),
    'as_of', now(), 'kind', 'observed', 'competition', c->>'competition', 'season', public.ai_season_label(sid),
    'note', 'points already include any deduction (shown in deduction). Sorted by position.',
    'rows', coalesce((select jsonb_agg(r) from (
      select s.position, t.display_name team, s.played, s.won, s.drawn, s.lost, s.goals_for, s.goals_against,
             s.goals_for - s.goals_against goal_difference, s.deduction, s.points,
             s.home_won || '-' || s.home_drawn || '-' || s.home_lost home_wdl,
             s.away_won || '-' || s.away_drawn || '-' || s.away_lost away_wdl
        from league_standings s join teams t using (team_id)
       where s.league_id = lid and s.season_id = sid
       order by s.position) r), '[]'::jsonb));
end $$;

-- get_competition_summary: season totals and averages for a competition.
create or replace function public.ai_tool_get_competition_summary(args jsonb)
returns jsonb language plpgsql stable set search_path to 'public', 'pg_temp' as $$
declare c jsonb; lid bigint; sid bigint;
begin
  if not args ? 'competition' then return jsonb_build_object('error', 'competition is required'); end if;
  c := public.ai_resolve_competition(args->>'competition'); if c ? 'error' then return c; end if;
  lid := (c->>'league_id')::bigint;
  sid := public.ai_resolve_season(lid, args->>'season');
  return jsonb_build_object('tool', 'get_competition_summary', 'source', jsonb_build_array('matches'),
    'as_of', now(), 'kind', 'observed',
    'rows', (select jsonb_agg(r) from (
      select c->>'competition' competition, public.ai_season_label(sid) season, count(*) matches_played,
             sum(full_time_home_goals + full_time_away_goals) total_goals,
             round(avg(full_time_home_goals + full_time_away_goals), 2) goals_per_game,
             round(avg(full_time_home_goals), 2) home_goals_per_game, round(avg(full_time_away_goals), 2) away_goals_per_game,
             count(*) filter (where full_time_result = 'H') home_wins, count(*) filter (where full_time_result = 'D') draws,
             count(*) filter (where full_time_result = 'A') away_wins,
             min(match_date) first_match, max(match_date) latest_match
        from matches where league_id = lid and season_id = sid and full_time_home_goals is not null) r));
end $$;

-- get_fpl_players: FPL facts for players (this season from the live FPL
-- feed; past seasons from season totals).
create or replace function public.ai_tool_get_fpl_players(args jsonb)
returns jsonb language plpgsql stable set search_path to 'public', 'pg_temp' as $$
declare
  cur bigint := public.fpl_current_season_id();
  sid bigint; pl jsonb; t jsonb; tid bigint; pid int;
  pos int := case upper(args->>'position') when 'GK' then 1 when 'DEF' then 2 when 'MID' then 3 when 'FWD' then 4 end;
  sort text := coalesce(args->>'sort_by', 'total_points');
  lim int := least(coalesce((args->>'limit')::int, 10), 30);
  avail text := coalesce(args->>'availability', 'any');
begin
  sid := case when args->>'season' in ('last', 'last season', 'previous') then (select max(season_id) from seasons where season_id < cur)
              when args ? 'season' and args->>'season' not in ('current', 'this season', '') then
                (select season_id from seasons where label = regexp_replace(args->>'season', '[^0-9]', '', 'g')
                   or label = right(split_part(args->>'season', '/', 1), 2) || right(split_part(args->>'season', '/', 2), 2) limit 1)
              else cur end;
  if sid is null then return jsonb_build_object('error', 'Unknown season.'); end if;
  if sort not in ('total_points', 'price', 'minutes', 'goals', 'assists', 'expected_goals', 'goals_minus_xg',
                  'defensive_contribution_points', 'selected_by_percent') then
    return jsonb_build_object('error', 'Unknown sort_by.'); end if;

  if sid <> cur then
    -- Past season: final totals.
    return jsonb_build_object('tool', 'get_fpl_players', 'source', jsonb_build_array('fpl_player_season_totals'),
      'as_of', now(), 'kind', 'observed', 'season', public.ai_season_label(sid),
      'note', 'Final FPL season totals. Prices in £m.',
      'rows', coalesce((select jsonb_agg(r) from (
        select web_name player, full_name, team_name team, public.ai_fpl_position(element_type) position,
               round(start_cost / 10.0, 1) start_price, round(end_cost / 10.0, 1) end_price, total_points, minutes,
               goals_scored goals, assists, clean_sheets, bonus, selected_by_percent
          from fpl_player_season_totals
         where season_id = sid
           and (pos is null or element_type = pos)
           and (not args ? 'player' or public.ai_norm(web_name) like '%' || trim(public.ai_norm(args->>'player')) || '%'
                or public.ai_norm(full_name) like '%' || trim(public.ai_norm(args->>'player')) || '%')
           and (not args ? 'team' or public.ai_norm(team_name) like '%' || trim(public.ai_norm(args->>'team')) || '%')
         order by case sort when 'price' then end_cost when 'minutes' then minutes when 'goals' then goals_scored
                            when 'assists' then assists else total_points end desc nulls last
         limit lim) r), '[]'::jsonb));
  end if;

  if args ? 'player' then
    pl := public.ai_resolve_fpl_player(args->>'player', cur); if pl ? 'error' then return pl; end if;
    pid := (pl->>'fpl_player_id')::int;
  end if;
  if args ? 'team' then t := public.ai_resolve_team(args->>'team'); if t ? 'error' then return t; end if; tid := (t->>'team_id')::bigint; end if;

  return jsonb_build_object('tool', 'get_fpl_players',
    'source', jsonb_build_array('fpl_players', 'fpl_player_gameweeks'), 'as_of', now(), 'kind', 'observed',
    'season', public.ai_season_label(cur),
    'note', 'Official FPL data this season. Price in £m. status: a = available, d = doubtful, i = injured, s = suspended, u = unavailable, n = not in squad. chance_of_playing is FPL''s own %. defensive_contribution_points = FPL points from the defensive contribution rule this season.',
    'rows', coalesce((select jsonb_agg(r) from (
      with dc as (
        select g.fpl_player_id, sum((s->>'points')::int) pts
          from fpl_player_gameweeks g
          cross join lateral jsonb_array_elements(g.source_payload->'explain') e
          cross join lateral jsonb_array_elements(e->'stats') s
         where g.season_id = cur and s->>'identifier' = 'defensive_contribution'
         group by g.fpl_player_id)
      select p.web_name player, p.first_name || ' ' || p.second_name full_name, tm.display_name team,
             public.ai_fpl_position(p.element_type) position, round(p.now_cost / 10.0, 1) price,
             p.total_points, p.event_points last_gameweek_points, p.minutes, p.goals_scored goals, p.assists,
             p.clean_sheets, p.bonus, round(p.expected_goals, 2) expected_goals, round(p.expected_assists, 2) expected_assists,
             round(p.goals_scored - p.expected_goals, 2) goals_minus_xg, coalesce(dc.pts, 0) defensive_contribution_points,
             p.selected_by_percent, p.status, p.chance_of_playing_next_round, nullif(p.news, '') news
        from fpl_players p
        left join teams tm on tm.team_id = p.canonical_team_id
        left join dc on dc.fpl_player_id = p.fpl_player_id
       where p.season_id = cur
         and (pid is null or p.fpl_player_id = pid)
         and (tid is null or p.canonical_team_id = tid)
         and (pos is null or p.element_type = pos)
         and (avail = 'any' or (avail = 'unavailable_or_doubtful' and p.status <> 'a'))
       order by case sort when 'price' then p.now_cost::numeric when 'minutes' then p.minutes when 'goals' then p.goals_scored
                          when 'assists' then p.assists when 'expected_goals' then p.expected_goals
                          when 'goals_minus_xg' then p.goals_scored - p.expected_goals
                          when 'defensive_contribution_points' then coalesce(dc.pts, 0)
                          when 'selected_by_percent' then p.selected_by_percent
                          else p.total_points end desc nulls last, p.total_points desc
       limit lim) r), '[]'::jsonb));
end $$;

-- get_fpl_projections: FixtureShark's projected FPL points (model estimates).
create or replace function public.ai_tool_get_fpl_projections(args jsonb)
returns jsonb language plpgsql stable set search_path to 'public', 'pg_temp' as $$
declare
  cur bigint := public.fpl_current_season_id();
  gw int := coalesce((args->>'gameweek')::int,
                     (select min(fpl_event_id) from fpl_gameweeks where season_id = cur and not finished));
  n_gw int := least(coalesce((args->>'gameweeks')::int, 1), 6);
  pos int := case upper(args->>'position') when 'GK' then 1 when 'DEF' then 2 when 'MID' then 3 when 'FWD' then 4 end;
  maxp numeric := (args->>'max_price')::numeric;
  lim int := least(coalesce((args->>'limit')::int, 10), 30);
  pl jsonb; t jsonb; pid int; tid bigint;
begin
  if args ? 'player' then pl := public.ai_resolve_fpl_player(args->>'player', cur); if pl ? 'error' then return pl; end if; pid := (pl->>'fpl_player_id')::int; end if;
  if args ? 'team' then t := public.ai_resolve_team(args->>'team'); if t ? 'error' then return t; end if; tid := (t->>'team_id')::bigint; end if;
  return jsonb_build_object('tool', 'get_fpl_projections',
    'source', jsonb_build_array('fpl_projection_frontend_feed_v6', 'fixtures', 'fpl_players'), 'as_of', now(),
    'kind', 'model_estimate', 'model_version', 'leaguewide_v6',
    'gameweeks', case when n_gw = 1 then gw::text else gw || '-' || (gw + n_gw - 1) end,
    'note', 'FixtureShark projections: expected FPL points and components summed over the gameweeks requested (double gameweeks count both fixtures). These are model estimates, not FPL data. Price in £m.',
    'rows', coalesce((select jsonb_agg(r) from (
      select p.web_name player, tm.display_name team, public.ai_fpl_position(p.element_type) position,
             round(p.now_cost / 10.0, 1) price, count(*) fixtures,
             round(sum(v.expected_fpl_points), 2) expected_points, round(sum(v.expected_minutes)) expected_minutes,
             round(avg(v.start_probability), 2) avg_start_probability,
             round(sum(v.expected_goals), 2) expected_goals, round(sum(v.expected_assists), 2) expected_assists,
             round(avg(v.clean_sheet_probability), 2) avg_clean_sheet_probability, round(sum(v.expected_bonus), 2) expected_bonus
        from fpl_projection_frontend_feed_v6 v
        join fixtures f on f.fixture_id = v.fixture_id
        join fpl_players p on p.fpl_player_id = v.fpl_player_id and p.season_id = cur
        left join teams tm on tm.team_id = p.canonical_team_id
       where f.league_id = 1 and f.season_id = cur and f.matchweek between gw and gw + n_gw - 1
         and (pid is null or v.fpl_player_id = pid)
         and (tid is null or p.canonical_team_id = tid)
         and (pos is null or p.element_type = pos)
         and (maxp is null or p.now_cost <= maxp * 10)
       group by p.web_name, tm.display_name, p.element_type, p.now_cost
       order by sum(v.expected_fpl_points) desc
       limit lim) r), '[]'::jsonb));
end $$;

-- get_club_accounts: published statutory accounts, with sources on request.
create or replace function public.ai_tool_get_club_accounts(args jsonb)
returns jsonb language plpgsql stable set search_path to 'public', 'pg_temp' as $$
declare t jsonb; tid bigint; yrs int := least(coalesce((args->>'years')::int, 1), 10);
begin
  if not args ? 'team' then return jsonb_build_object('error', 'team is required'); end if;
  t := public.ai_resolve_team(args->>'team'); if t ? 'error' then return t; end if;
  tid := (t->>'team_id')::bigint;
  return jsonb_build_object('tool', 'get_club_accounts',
    'source', jsonb_build_array('finance_published_periods', 'finance_published_provenance'), 'as_of', now(), 'kind', 'observed',
    'note', 'Published statutory accounts from Companies House filings, most recent first. Values are in the stated currency; multiply by unit_scale (e.g. 1 = units). NULL = not disclosed, not zero. Financial years do not align with football seasons.',
    'club', t->>'team',
    'rows', coalesce((select jsonb_agg(r) from (
      select v.period_start, v.period_end, v.period_months, v.reporting_entity, v.company_number, v.is_consolidated,
             v.currency, v.unit_scale, v.revenue_total, v.revenue_matchday, v.revenue_broadcast, v.revenue_commercial,
             v.revenue_other, v.staff_costs, v.player_amortisation, v.operating_profit, v.profit_before_tax,
             v.profit_after_tax, v.cash, v.borrowings, v.net_assets, v.average_employees, v.filing_date, v.source_url,
             case when coalesce((args->>'include_sources')::boolean, false) then
               (select jsonb_agg(jsonb_build_object('metric', pv.metric_key, 'xbrl_concept', pv.original_xbrl_concept,
                        'value_in_filing', pv.original_value, 'filing_reference', pv.filing_reference, 'source_url', pv.source_url))
                  from finance_published_provenance pv where pv.team_id = v.team_id and pv.period_end = v.period_end) end sources
        from finance_published_periods v
        join finance_periods fp on fp.team_id = v.team_id and fp.period_end = v.period_end
                               and fp.is_current_version and fp.validation_status = 'published'
       where v.team_id = tid and v.validation_status = 'published'
       order by v.period_end desc limit yrs) r), '[]'::jsonb));
end $$;

-- get_tv_listings: UK TV/streaming for upcoming fixtures.
create or replace function public.ai_tool_get_tv_listings(args jsonb)
returns jsonb language plpgsql stable set search_path to 'public', 'pg_temp' as $$
declare t jsonb; tid bigint; lim int := least(coalesce((args->>'limit')::int, 5), 20);
begin
  if args ? 'team' then t := public.ai_resolve_team(args->>'team'); if t ? 'error' then return t; end if; tid := (t->>'team_id')::bigint; end if;
  return jsonb_build_object('tool', 'get_tv_listings', 'source', jsonb_build_array('upcoming_watch_guide'), 'as_of', now(),
    'kind', 'observed',
    'note', 'UK listings for upcoming fixtures. status not_televised = confirmed not shown live in the UK (includes the Saturday 3pm blackout rule). A fixture with no rows here has no UK listing yet (unknown, not the same as not televised).',
    'rows', coalesce((select jsonb_agg(r) from (
      select g.kickoff_date, to_char(g.kickoff_time, 'HH24:MI') kickoff_time_uk, g.league_name competition,
             g.home_team_name home_team, g.away_team_name away_team, g.status, g.broadcaster, g.channel,
             g.streaming_service, g.service_product, g.access_type, g.is_free_to_air, g.is_subscription, g.is_ppv,
             g.confidence, g.availability_notes, g.source, g.verified_at::date verified
        from upcoming_watch_guide g
       where (tid is null or tid in (g.home_team_id, g.away_team_id))
         and (not args ? 'from_date' or g.kickoff_date >= (args->>'from_date')::date)
         and (not args ? 'to_date' or g.kickoff_date <= (args->>'to_date')::date)
       order by g.kickoff_date, g.kickoff_time limit lim) r), '[]'::jsonb));
end $$;

-- get_data_status: coverage and freshness.
create or replace function public.ai_tool_get_data_status(args jsonb)
returns jsonb language sql stable set search_path to 'public', 'pg_temp' as $$
  select jsonb_build_object('tool', 'get_data_status',
    'source', jsonb_build_array('matches', 'fixtures', 'leagues', 'seasons', 'model_fit_runs', 'fpl_players', 'fpl_player_projections', 'fixture_broadcasts'),
    'as_of', now(), 'kind', 'observed',
    'freshness', jsonb_build_object(
      'results_last_loaded', (select max(updated_at) from matches),
      'latest_result_date', (select max(match_date) from matches),
      'fixtures_last_changed', (select max(updated_at) from fixtures),
      'latest_accepted_model_fit', (select max(fitted_at) from model_fit_runs where status = 'accepted'),
      'fpl_data_last_loaded', (select max(updated_at) from fpl_players where season_id = public.fpl_current_season_id()),
      'fpl_projections_generated', (select max(generated_at) from fpl_player_projections where model_version = 'leaguewide_v6'),
      'tv_listings_last_synced', (select max(last_synced_at) from fixture_broadcasts)),
    'coverage', (select jsonb_agg(r order by r.competition_type, r.country, r.competition) from (
      select l.name competition, l.code, c.name country, l.competition_type,
             public.ai_season_label(min(m.season_id)) first_season, public.ai_season_label(max(m.season_id)) latest_season,
             count(distinct m.season_id) seasons, count(*) results
        from matches m join leagues l using (league_id) left join countries c on c.country_id = l.country_id
       group by l.name, l.code, c.name, l.competition_type) r),
    'fpl_seasons', (select jsonb_agg(distinct public.ai_season_label(season_id)) from fpl_player_season_totals))
$$;

-- ---------------------------------------------------------------- access
do $$
declare f text;
begin
  foreach f in array array[
    'ai_norm(text)', 'ai_resolve_team(text)', 'ai_resolve_competition(text)', 'ai_current_season(bigint)',
    'ai_resolve_season(bigint, text)', 'ai_season_label(bigint)', 'ai_resolve_fpl_player(text, bigint)', 'ai_fpl_position(integer)',
    'ai_tool_find_entity(jsonb)', 'ai_tool_get_fixtures(jsonb)', 'ai_tool_get_results(jsonb)', 'ai_tool_get_league_table(jsonb)',
    'ai_tool_get_competition_summary(jsonb)', 'ai_tool_get_fpl_players(jsonb)', 'ai_tool_get_fpl_projections(jsonb)',
    'ai_tool_get_club_accounts(jsonb)', 'ai_tool_get_tv_listings(jsonb)', 'ai_tool_get_data_status(jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- patches
-- Applied after testing against the Experiment 001 ground truth:
-- get_fpl_players' availability filter now separates injured/doubtful/
-- suspended (d, i, s) from 'not available' (anything but a, which also
-- includes loans and departures); get_tv_listings adds is_live and watch_url.
do $$
declare d text := pg_get_functiondef('public.ai_tool_get_fpl_players(jsonb)'::regprocedure);
  old text := $o$and (avail = 'any' or (avail = 'unavailable_or_doubtful' and p.status <> 'a'))$o$;
  new text := $n$and (avail = 'any' or (avail = 'injured_doubtful_or_suspended' and p.status in ('d', 'i', 's'))
              or (avail = 'not_available' and p.status <> 'a'))$n$;
  old2 text := $o$status: a = available, d = doubtful$o$;
  new2 text := $n$availability filter: injured_doubtful_or_suspended = status d/i/s; not_available = anything but a (also includes loans and departures). status: a = available, d = doubtful$n$;
begin
  if position('injured_doubtful_or_suspended' in d) > 0 then return; end if;
  if (length(d)-length(replace(d,old,'')))/length(old) <> 1 or (length(d)-length(replace(d,old2,'')))/length(old2) <> 1 then raise exception 'anchor'; end if;
  execute replace(replace(d, old, new), old2, new2);
end $$;
do $$
declare d text := pg_get_functiondef('public.ai_tool_get_tv_listings(jsonb)'::regprocedure);
  old text := $o$g.status, g.broadcaster,$o$;
  new text := $n$g.status, g.is_live, g.broadcaster,$n$;
  old2 text := $o$g.source, g.verified_at::date verified$o$;
  new2 text := $n$g.watch_url, g.source, g.verified_at::date verified$n$;
begin
  if position('g.is_live' in d) > 0 then return; end if;
  if (length(d)-length(replace(d,old,'')))/length(old) <> 1 or (length(d)-length(replace(d,old2,'')))/length(old2) <> 1 then raise exception 'anchor'; end if;
  execute replace(replace(d, old, new), old2, new2);
end $$;
